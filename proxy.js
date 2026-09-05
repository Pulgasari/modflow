// proxy.js

const isFn = sth => typeof sth === 'function';

export function createModuleProxy (modflow) {

  return new Proxy (modflow, {

    get (target, property, receiver) {
      // case 1: symbols / inspect / native internals
      // case 2: public Modflow API
      // case 3: unknown module
      return (typeof property === 'symbol') ? Reflect.get(target, property, receiver)    
           : (property in target)           ? Reflect.get(target, property, receiver)
           : !target.has(property)          ? undefined;
           : createModuleStub(target, property);
    }
  });
}


function createModuleStub (modflow, name) {

  const load = () => modflow.load(name);

  return new Proxy (function(){}, {

    get (_, property) {

      // promise assimilation
      if (property === 'then') {
        return (resolve, reject) => load().then(resolve, reject);
      }

      // useful debugging.
      if (property === 'toString') {
        return () => `[Modflow module: ${name}]`;
      }

      // direct properties
      return (...args) =>
        load().then(module => {

          const value =
            module?.[property] ??
            module?.default ??
            module;

          if (typeof value !== 'function') {
            return value;
          }

          return value.apply(module, args);
        });
    },

    apply(_, __, args) {

      /*
       * mod.foo(...)
       */
      return load().then(module => {

        const callable =
          typeof module === 'function'
            ? module
            : module?.default;

        if (typeof callable !== 'function') {
          throw new TypeError(
            `Module "${name}" is not callable.`
          );
        }

        return callable(...args);
      });
    }
  });
          }
