// normalize.js

import { ModflowDefinitionError } from './errors.js';

const FLOWS = new Set([ 'eager', 'idle', 'interaction','lazy' ]);

const isArray     = sth => Array.isArray(sth);
const isFn        = sth => typeof sth === 'function';
const isNumber    = sth => typeof sth === 'number';
const isObject    = sth => sth !== null && typeof sth === 'object' && !Array.isArray(sth);
const isString    = sth => typeof sth === 'string';
const isSymbol    = sth => typeof sth === 'symbol';
const isValidFlow = sth => isNumber(sth) || FLOWS.has(sth);

function normalizeDefinition (name, input) {
  const options = isString(input) ? { url: input } : input;

  if (!isObject(options)) throw new ModflowDefinitionError (`Invalid definition for module "${name}".`);

  const deps = options.deps ?? [];
  const flow = options.flow ?? 'lazy';
  const url  = options.url  || null;
  
  if (!isString     (url)) throw new ModflowDefinitionError (`Module "${name}" requires a string "url".`);
  if (!isValidFlow (flow)) throw new ModflowDefinitionError (`Invalid flow "${String(flow)}" for module "${name}".`);      
  if (!isArray     (deps)) throw new ModflowDefinitionError (`Dependencies for module "${name}" must be an array.`);

  return {
    deps, flow, name, url,
    metadata   : options.metadata   ?? null, // useful for diagnostics
    preload    : options.preload    ?? false,
    prefetch   : options.prefetch   ?? false,
    retry      : options.retry      ?? 0,
    retryDelay : options.retryDelay ?? 250,
    timeout    : options.timeout    ?? 0,
  };
}

export { normalizeDefinition };
