// Scheduler.js

const isArray  = sth => Array.isArray(sth);
const isFn     = sth => typeof sth === 'function';
const isNumber = sth => typeof sth === 'number';
const isObject = sth => sth !== null && typeof sth === 'object' && !Array.isArray(sth);
const isString = sth => typeof sth === 'string';
const isSymbol = sth => typeof sth === 'symbol';

const
onEvent   = (...args) => window.   addEventListener(...args),
offEvent  = (...args) => window.removeEventListener(...args),     
onEvents  = (events, ...rest) => events.forEach(event => onEvent  (event, ...rest)),        
offEvents = (events, ...rest) => events.forEach(event => offEvent (event, ...rest));

class Scheduler {

  #timers = new Set;

  schedule (flow, callback) {

    if (!isFn(callback))
    throw new TypeError('Scheduler callback must be a function.');

    if (flow === 'eager')
    return callback();

    if (flow === 'idle')
    return this.#idle(callback);

    if (flow === 'interaction')
    return this.#interaction(callback);

    if (isNumber(flow))
    return this.#timeout(callback, flow);

    // lazy should never be scheduled automatically
    if (flow === 'lazy')
    return null;

    return null;
  }

  schedule (flow, callback) {
    if (!isFn(callback)) throw new TypeError('Scheduler callback must be a function.');
  
    switch (flow) {
      case 'eager'       : return callback();
      case 'idle'        : return this.#idle(callback);
      case 'interaction' : return this.#interaction(callback);
      case 'lazy'        : return null; // Lazy should never be scheduled automatically
      default            : return isNumber(flow) ? this.#timeout(callback, flow) : null;
    }
  }


  #idle (callback) {

    if (
      typeof window !== 'undefined' &&
      typeof window.requestIdleCallback === 'function'
    ) {
      return window.requestIdleCallback(
        () => callback(),
        { timeout: 2000 }
      );
    }

    return this.#timeout(callback, 200);
  }

  #interaction (callback) {

    if (typeof window === 'undefined') {
      return this.#timeout(callback, 0);
    }

    // "interaction" means the first meaningful user interaction.
    const events = [
      'pointerdown',
      'keydown',
      'touchstart'
    ];

    let fired = false;

    const run = () => {
      if (fired) return;
      fired = true;
      offEvents(events, run, { capture: true });
      callback();
    };
    
    onEvents(events, run, { once: true, capture: true, passive: true });

    return () => {
      if (fired) return;
      fired = true;
      offEvents(events, run, { capture: true });
    };
  }

  #timeout (callback, delay) {

    const id = setTimeout(() => {
      this.#timers.delete(id);
      callback();
    }, Math.max(0, delay));

    this.#timers.add(id);

    return () => {
      clearTimeout(id);
      this.#timers.delete(id);
    };
  }

  clear () {
    for (const id of this.#timers) clearTimeout(id);
    this.#timers.clear();
  }

}

export { Scheduler };
