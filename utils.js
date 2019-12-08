const keys = ks => (Array.isArray(ks) ? ks : ks.split('.'));

// const deepFreeze = obj =>
//   Object.keys(obj).forEach(prop =>
//     !(obj[prop] instanceof Object) || Object.isFrozen(obj[prop])
//       ? null
//       : deepFreeze(obj[prop]),
//   ) || Object.freeze(obj);
// ('use strict');

function deepFreeze(obj) {
  if (typeof obj !== 'object') return;

  Object.values(obj).forEach(deepFreeze);

  Object.freeze(obj);
}

const deepClone = obj => {
  let clone = Object.assign({}, obj);
  Object.keys(clone).forEach(
    key =>
      (clone[key] =
        typeof obj[key] === 'object' ? deepClone(obj[key]) : obj[key]),
  );
  return Array.isArray(obj) && obj.length
    ? (clone.length = obj.length) && Array.from(clone)
    : Array.isArray(obj)
    ? Array.from(obj)
    : clone;
};


// traverse the set of keys left to right,
// returning the current value in each iteration.
// if at any point the value for the current key does not exist,
// return the default value
const deepGet = (o, kp, d) => keys(kp).reduce((o, k) => o && o[k] || d, o)

// traverse the set of keys right to left,
// returning a new object containing both properties from the object
// we were originally passed and our new property.
//
// Example:
// If o = { a: { b: { c: 1 } } }
//
// deepSet(o, ['a', 'b', 'c'], 2) will progress thus:
// 1. c = Object.assign({}, {c: 1}, { c: 2 })
// 2. b = Object.assign({}, { b: { c: 1 } }, { b: c })
// 3. returned = Object.assign({}, { a: { b: { c: 1 } } }, { a: b })
function deepSet(obj, path, value, create) {
  var properties = path.split('.');
  var currentObject = obj;
  var property;

  create = create === undefined ? true : create;

  while (properties.length) {
    property = properties.shift();

    if (!currentObject) break;

    if (!isObject(currentObject[property]) && create) {
      currentObject[property] = {};
    }

    if (!properties.length) {
      currentObject[property] = value;
    }
    currentObject = currentObject[property];
  }

  return obj;
}

function isObject(obj) {
  return typeof obj === 'object' && obj !== null;
}
const data = {
  a: {
    b: {
      c: 123,
      d: {
        e: Symbol('foo')
      }
    }
  }
}

const newData = deepSet(data, 'a.b.c', 456)
console.log(data);
console.log(newData); //?


module.exports = { deepClone, deepFreeze };
