var handler = {
  get:function onGet(obj,prop) {
      return obj[prop];
  },
  set:  function onSet(obj,prop,value) {
      const oldValue = obj[prop];
      console.log(oldValue, value);
      return 99
    }
}
const INITIAL_STATE = {
    a: 0,
    b: ['a','b']

}
var p = new Proxy(INITIAL_STATE, handler);
p.a = 1;
p.b = 0;

const a = p.a;
console.log(a);
console.log(p.a, p.b); // 1, 0
console.log('c' in p, p.c); // false, 37


// console.log(p.a, p.b); // 1, undefined
// console.log('c' in p, p.c); // false, 37
