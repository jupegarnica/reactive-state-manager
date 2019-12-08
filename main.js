const { deepClone } = require('./utils');

class Store {
  #state;
  constructor(initialState = {}) {
    this.#state = initialState;
  }
  getState() {
    return deepClone(this.#state);
  }
  path(path) {
    return this.get(path)
  }
  get = path => obj => {
    if (typeof path === 'string') {
      path = path.split(/[\\\\/\.]/); // match "\" "/" o "."
    }
    return path.reduce(
      (xs, x) => (xs && xs[x] !== undefined ? xs[x] : undefined),
      obj,
    );
  }
  set = path => obj => {

  }
}

// deep set
// https://gist.github.com/LukeChannings/15c92cef5a016a8b21a0


const storage = new Store({ a: 1 });

const state = storage.getState();

state.a = 2;

console.log(state);
console.log(storage.getState());
