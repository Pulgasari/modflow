// proxy.js

const isFn     = sth => typeof sth === 'function';
const isSymbol = sth => typeof sth === 'symbol';

function createModuleProxy (modflow) {
  return new Proxy (modflow, {
    get (target, property, receiver) {
      // case 1: symbols / inspect / native internals
      // case 2: public Modflow API
      // case 3: unknown module
      return (isSymbol(property))  ? Reflect.get(target, property, receiver)    
           : (property in target)  ? Reflect.get(target, property, receiver)
           : !target.has(property) ? undefined;
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

      // useful debugging
      if (property === 'toString') {
        return () => `[Modflow module: ${name}]`;
      }

      // direct properties
      return (...args) =>
        load().then(module => {
          const value = module?.[property] ?? module?.default ?? module;
          return !isFn(value) ? value : value.apply(module, args);
        });
    },

    apply (_, __, args) {
      return load().then(module => {
        const callable = isFn(module) ? module : module?.default;
        if (!isFn(callable)) throw new TypeError(`Module "${name}" is not callable.`);      
        return callable(...args);
      });
    }
  });
}

// :::::: EXPORT

export { createModuleProxy };
