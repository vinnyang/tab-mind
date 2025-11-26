// Mock async_hooks for browser environment
export const AsyncLocalStorage = class {
  constructor() {
    this.store = null;
  }

  run(store, callback, ...args) {
    this.store = store;
    try {
      return callback(...args);
    } finally {
      // In a real async environment, this would be more complex.
      // For browser mock, we can't easily track async context.
      // We reset it, but this means async callbacks lose context.
      this.store = null;
    }
  }

  getStore() {
    // Return empty object if null to prevent property access crashes
    // in libraries that expect a store object if ALS is present.
    return this.store || {};
  }

  // Add enterWith/disable if needed by libraries, though run/getStore are main ones
  enterWith(store) {
    this.store = store;
  }

  disable() {
    this.store = null;
  }
};
