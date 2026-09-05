// Modflow.js

import { createModuleProxy as createProxy } from './proxy.js';
import { ModflowUnknownModuleError }        from './errors.js';
import { normalizeDefinition }              from './normalize.js';
import { Scheduler }                        from './Scheduler.js';

// :::::: DOM & BROWSER HELPERS

const hasDoc    = () => typeof document !== 'undefined';
const hasDom    = () => typeof window !== 'undefined' && typeof document !== 'undefined';
const isBrowser = () => typeof window !== 'undefined';

const mapKeysToObject = (iterable, getValue) =>
  Object.fromEntries(
    Array.from(iterable, key => [key, getValue(key)])
  );


const createElement = (tag, props) => Object.assign(document.createElement(tag), props);

function normalizeModule(module) {
  if (module && typeof module === 'object' && 'default' in module && Object.keys(module).length === 1) {
    return module.default;
  }
  return module;
}

function withTimeout(promise, timeout, name) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Module "${name}" exceeded load timeout of ${timeout}ms.`));
      }, timeout);
    })
  ]);
}

// :::::: STATE MODEL

class ModuleEntry {
  error     = null;
  state     = 'defined';
  value     = undefined;
  promise   = null;
  startedAt = null;
  loadedAt  = null;
  duration  = null;

  startLoading () {
    this.state     = 'loading';
    this.startedAt = performance.now();
  }

  completeLoad (value) {
    this.value    = value;
    this.state    = 'loaded';
    this.loadedAt = performance.now();
    this.duration = this.loadedAt - this.startedAt;
  }

  failLoad (error) {
    this.state    = 'failed';
    this.error    = error;
    this.duration = performance.now() - (this.startedAt ?? performance.now());
    this.promise  = null;
  }

  reset () {
    this.state     = 'defined';
    this.value     = undefined;
    this.promise   = null;
    this.error     = null;
    this.startedAt = null;
    this.loadedAt  = null;
    this.duration  = null;
  }

  toSnapshot (name) {
    return {
      name,
      state      : this.state,
      startedAt  : this.startedAt,
      loadedAt   : this.loadedAt,
      duration   : this.duration,
      hasValue   : this.value !== undefined,
      hasPromise : !!this.promise,
      error      : this.error ?? null,
    };
  }
}

// :::::: MAIN CLASS

export class Modflow {

  definitions = new Map();
  entries     = new Map();
  scheduler   = new Scheduler();

  constructor(options = {}) {
    this.config = {
      preloadStrategy : options.preloadStrategy ?? 'modulepreload',
      debug           : options.debug           ?? false,
      onError         : options.onError         ?? null,
      onEvent         : options.onEvent         ?? null,
    };
  }

  //////////// DEFINE & HAS ////////////
  
  define (config = {}) {
    if (config === null || typeof config !== 'object') {
      throw new TypeError('mod.define() requires an object.');
    }

    for (const [name, input] of Object.entries(config)) {
      const definition = normalizeDefinition(name, input);

      this.definitions.set(name, definition);
      this.#ensureEntry(name);
      this.#emit('defined', { name, definition });

      if (definition.flow !== 'lazy') {
        this.#schedule(name);
      }

      if (definition.preload) {
        this.preload(name);
      }
    }

    return this;
  }

  has (name) { return this.definitions.has(name); }
  
  //////////// LOAD ////////////

  load (name) {
    return this.#withDefinitionAsync(name, (definition) => {
      const entry = this.#ensureEntry(name);

      if (entry.state === 'loaded')  return Promise.resolve(entry.value);
      if (entry.promise)             return entry.promise;

      entry.startLoading();
      this.#emit('loading', { name, definition });

      entry.promise = this.#loadWithDependencies(definition)
        .then(module => {
          const resolved = normalizeModule(module);
          entry.completeLoad(resolved);

          this.#emit('loaded', {
            name,
            definition,
            value: resolved,
            duration: entry.duration,
          });

          return resolved;
        })
        .catch(error => {
          entry.failLoad(error);
          this.#emit('failed', { name, definition, error });
          throw error;
        });

      return entry.promise;
    });
  }

  //////////// PRELOAD & PREFETCH ////////////

  preload (name) {
    if (this.config.preloadStrategy !== 'modulepreload') return this;
    return this.#injectResourceHint(name, 'modulepreload', {}, 'preloaded');
  }

  prefetch (name) {
    return this.#injectResourceHint(name, 'prefetch', { as: 'script' }, 'prefetched');
  }
  
  //////////// STATE MANAGEMENT ////////////
  
  invalidate (name) { this.entries.get(name)?.reset(); }
  retry      (name) { this.invalidate(name); return this.load(name); }
  state      (name) { return this.entries.get(name)?.toSnapshot(name) ?? null; }
  
  stats () { return mapKeysToObject(this.definitions.keys(), name => this.state(name)); }
  
  //////////// PRIVATE HELPERS ////////////

  #getDefinitionOrThrow (name) {
    const definition = this.definitions.get(name);
    if (!definition) throw new ModflowUnknownModuleError(name);
    return definition;
  }

  #withDefinitionAsync (name, callback) {
    try {
      const definition = this.#getDefinitionOrThrow(name);
      return callback(definition);
    } catch (error) { return Promise.reject(error); }
  }

  #injectResourceHint (name, rel, extraProps = {}, eventName = `${rel}ed`) {
    try {
      const definition = this.#getDefinitionOrThrow(name); if (!hasDom()) return this;
      const href       = this.#resolveURL(definition.url);

      if (!this.#hasPreload(href, rel)) {
        const link = createElement('link', { href, rel, ...extraProps });
        document.head.appendChild(link);
        this.#emit(eventName, { name, href });
      }
    }
    catch {} // ignored if module is unknown during optional hints

    return this;
  }

  #schedule (name) {
    const definition = this.definitions.get(name);
    if (!definition) return;

    this.scheduler.schedule(
      definition.flow,
      () => this.load(name).catch(error => {
        if (this.config.debug) console.warn(`[modflow] failed to load "${name}"`, error);
        this.config.onError?.(error, definition);
      })
    );
  }

  async #loadWithDependencies (definition) {
    if (definition.deps?.length) await Promise.all(definition.deps.map(dep => this.load(dep)));
    return this.#import(definition);
  }

  #import (definition) {
    let promise = import(/* @vite-ignore */ definition.url);
    if (definition.timeout > 0) promise = withTimeout(promise, definition.timeout, definition.name);    
    return promise;
  }

  #ensureEntry (name) {
    return this.entries.getOrInsertComputed(name, () => new ModuleEntry());
  }

  #resolveURL (url) {
    return !isBrowser() ? url : new URL(url, document.baseURI).href;
  }

  #hasPreload (href, rel = 'modulepreload') {
    return !hasDoc() ? false : !!document.querySelector(`link[rel="${rel}"][href="${CSS.escape(href)}"]`);      
  }

  #emit (type, data) {
    this.config.onEvent?.({ type, time: performance.now(), ...data });
  }

  proxy () { 
    return createProxy(this);
  }
}
