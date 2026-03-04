/**
 * Simple async mutex for serialising game state mutations.
 */

const MAX_WAITERS = 10;
const LOCK_TIMEOUT_MS = 5000;

/**
 * Create an async mutex instance.
 * @returns {object} Mutex with lock, unlock, withLock
 */
export function createMutex() {
  let locked = false;
  /** @type {Array<{resolve: function, reject: function, timer: *}>} */
  const waiters = [];

  const mutex = {
    /**
     * Acquire the lock. Resolves immediately if free, otherwise queues.
     * Rejects after 5 s or if more than 10 waiters are already queued.
     * @returns {Promise<void>}
     */
    lock() {
      if (!locked) {
        locked = true;
        return Promise.resolve();
      }

      if (waiters.length >= MAX_WAITERS) {
        return Promise.reject(new Error(`Mutex queue full (max ${MAX_WAITERS} waiters)`));
      }

      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const idx = waiters.findIndex((w) => w.resolve === resolve);
          if (idx !== -1) waiters.splice(idx, 1);
          reject(new Error('Mutex lock timeout after 5 s'));
        }, LOCK_TIMEOUT_MS);

        waiters.push({ resolve, reject, timer });
      });
    },

    /** Release the lock and hand it to the next waiter (if any). */
    unlock() {
      if (waiters.length > 0) {
        const next = waiters.shift();
        clearTimeout(next.timer);
        next.resolve();
      } else {
        locked = false;
      }
    },

    /**
     * Acquire lock, run fn, then release — even if fn throws.
     * @template T
     * @param {() => T | Promise<T>} fn
     * @returns {Promise<T>}
     */
    async withLock(fn) {
      await mutex.lock();
      try {
        return await fn();
      } finally {
        mutex.unlock();
      }
    },

    /** @returns {boolean} Whether the mutex is currently held */
    get isLocked() {
      return locked;
    },
  };

  return mutex;
}
