// normalize.js

import { ModflowDefinitionError } from './errors.js';

const FLOWS = new Set([
  'eager',
  'idle',
  'lazy',
  'interaction',
]);

const isArray  = sth => Array.isArray(sth);
const isFn     = sth => typeof sth === 'function';
const isNumber = sth => typeof sth === 'number';
const isObject = sth => sth !== null && typeof sth === 'object' && !Array.isArray(sth);
const isString = sth => typeof sth === 'string';
const isSymbol = sth => typeof sth === 'symbol';

function normalizeDefinition (name, input) {

  const options = isString(input) ? { url: input } : input;

  if (!isObject(options)) {
    throw new ModflowDefinitionError (`Invalid definition for module "${name}".`);
  }

  if (!options.url || !isString(options.url)) {
    throw new ModflowDefinitionError(`Module "${name}" requires a string "url".`);
  }

  const flow      = options.flow ?? 'lazy';
  const validFlow = isNumber(flow) || FLOWS.has(flow);

  if (!validFlow) {
    throw new ModflowDefinitionError (`Invalid flow "${String(flow)}" for module "${name}".`);
  }

  const deps = options.deps ?? [];

  if (!isArray(deps)) {
    throw new ModflowDefinitionError (`Dependencies for module "${name}" must be an array.`);
  }

  return {
    name,

    url         : options.url,
    flow,

    deps,
    preload    : options.preload  ?? false,
    prefetch   : options.prefetch ?? false,

    retry      : options.retry      ?? 0,
    retryDelay : options.retryDelay ?? 250,

    timeout    : options.timeout ?? 0,

    // useful for diagnostics
    metadata   : options.metadata ?? null,
  };
}

export { normalizeDefinition };
