var handler = {
  get: function onGet(target, prop) {
    console.log('get:', prop, target[prop]);

    return target[prop];
  },
  set: function onSet(target, prop, value) {
    const oldValue = target[prop];
    target[prop] = value;

    console.log('set:', oldValue, value);
    return true;
  },
  deleteProperty: function onDelete(target, prop) {
    const oldValue = target[prop];

    console.log('delete:', prop, oldValue);
    return true;
  },
  has: function onIn(target, prop) {
    const oldValue = target[prop];

    console.log('has:', prop, oldValue);
    return true;
  },
};
const INITIAL_STATE = {
  a: 0,
  b: ['a', 'b'],
};
var p = new Proxy(INITIAL_STATE, handler);

p.a = 1;
p.b = undefined;


delete p.b;
const a = p.a;
console.log(a);
console.log(p.a, p.b);
console.log('c' in p, p.c);
console.log('a' in p, p.a);

// console.log(p.a, p.b); // 1, undefined
// console.log('c' in p, p.c); // false, 37
