export const AsyncLocalStorage = class {
  constructor() {
    this.store = null;
  }

  run(store, callback, ...args) {
    this.store = store;
    try {
      return callback(...args);
    } finally {
      this.store = null;
    }
  }

  getStore() {
    return this.store || {};
  }

  enterWith(store) {
    this.store = store;
  }

  disable() {
    this.store = null;
  }
};
