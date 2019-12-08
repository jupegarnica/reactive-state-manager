// import './blob.polyfill';
import { Observable } from './vendor/object-observer.js';

const log = console.log;
const ownKeys = obj => JSON.parse(JSON.stringify(obj));
let order = {
    type: 'book',
    pid: 102,
    ammount: 5,
    remark: 'remove me',
    products: [1,2,3,4]
  },
  observableOrder = Observable.from(order);

observableOrder.observe(changes => {
  changes.forEach(({ type, path, oldValue, value }) => {
    log('-----------');
    log('type:', type);
    log('path:',path);
    log('oldValue:',oldValue);
    log('value:',ownKeys(value));
  });
});





// observableOrder.ammount = 7;
//  { type: 'update', path: ['ammount'], value: 7, oldValue: 5, object: observableOrder }

// observableOrder.address = {
//   street: 'Str 75',
//   apt: 29,
//   arr: [1,2,3]
// };
// // //  { type: "insert", path: ['address'], value: { ... }, object: observableOrder }

// observableOrder.address.arr[1] += 1;


// observableOrder.address.apt = 30;
// //  { type: "update", path: ['address','apt'], value: 30, oldValue: 29, object: observableOrder.address }

// delete observableOrder.remark;
let a = [ 1, 2, 3, 4, 5 ],
    observableA = Observable.from(a);

observableA.observe(changes => {
    changes.forEach(({ type, path, oldValue, value }) => {
      log('-----------');
      log('type:', type);
      log('path:', path);
      log('oldValue:', oldValue);
      log('value:', ownKeys({value}).value);
    });
});

//  observableA = [ 1, 2, 3, 4, 5 ]
observableA.pop();
//  { type: 'delete', path: [4], oldValue: 5, object: observableA }


//  now observableA = [ 1, 2, 3, 4 ]
//  following operation will cause a single callback to the observer with an array of 2 changes in it)
observableA.push('a', 'b');
//  { type: 'insert', path: [4], value: 'a', object: observableA }
//  { type: 'insert', path: [5], value: 'b', object: observableA }


//  now observableA = [1, 2, 3, 4, 'a', 'b']
observableA.shift();
//  { type: 'delete', path: [0], oldValue: 1, object: observableA }


//  now observableA = [ 2, 3, 4, 'a', 'b' ]
//  following operation will cause a single callback to the observer with an array of 2 changes in it)
observableA.unshift('x', 'y');
//  { type: 'insert', path: [0], value: 'x', object: observableA }
//  { type: 'insert', path: [1], value: 'y', object: observableA }


//  now observableA = [ 2, 3, 4, 'a', 'b' ]
observableA.reverse();
//  { type: 'reverse', path: [], object: observableA } (see below and exampe of this event for nested array)


//  now observableA = [ 'b', 'a', 4, 3, 2 ]
observableA.sort();
//  { type: 'shuffle', path: [], object: observableA } (see below and exampe of this event for nested array)


//  observableA = [ 2, 3, 4, 'a', 'b' ]
observableA.fill(0, 0, 1);
//  { type: 'update', path: [0], value: 0, oldValue: 2, object: observableA }


//  observableA = [ 0, 3, 4, 'a', 'b' ]
//  the following operation will cause a single callback to the observer with an array of 2 changes in it)
observableA.splice(0, 1, 'x', 'y');
//  { type: 'update', path: [0], value: 'x', oldValue: 0, object: observableA }
//  { type: 'insert', path: [1], value: 'y', object: observableA }
