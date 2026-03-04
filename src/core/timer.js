/**
 * Real-time event scheduler for timed game events.
 */

const MIN_INTERVAL_MS = 5000;
const MAX_QUEUED = 20;

let nextEventId = 1;

/**
 * Create a scheduler bound to a game state object.
 * @param {object} gameState - Mutable game state reference
 * @returns {object} Scheduler instance
 */
export function createScheduler(gameState) {
  const queue = [];
  let paused = false;

  const scheduler = {
    /**
     * Schedule an event to fire after a random delay in [minDelayMs, maxDelayMs].
     * @param {{ type: string, callback: function, dangerous?: boolean }} event
     * @param {number} minDelayMs
     * @param {number} maxDelayMs
     * @returns {number} Event id
     */
    schedule(event, minDelayMs, maxDelayMs) {
      if (queue.length >= MAX_QUEUED) {
        throw new Error(`Event queue full (max ${MAX_QUEUED})`);
      }

      const delay = minDelayMs + Math.random() * (maxDelayMs - minDelayMs);
      const fireAt = Date.now() + Math.max(delay, MIN_INTERVAL_MS);
      const id = nextEventId++;

      queue.push({
        id,
        type: event.type,
        callback: event.callback,
        dangerous: event.dangerous ?? false,
        fireAt,
      });

      queue.sort((a, b) => a.fireAt - b.fireAt);
      return id;
    },

    /** Pause event processing. Events accumulate but do not fire. */
    pause() {
      paused = true;
    },

    /** Resume event processing. */
    resume() {
      paused = false;
    },

    /** Remove all queued events. */
    clear() {
      queue.length = 0;
    },

    /**
     * Process all pending events whose fire time has passed.
     * Does nothing while paused.
     * @returns {number} Number of events fired
     */
    tick() {
      if (paused) return 0;

      const now = Date.now();
      let fired = 0;

      while (queue.length > 0 && queue[0].fireAt <= now) {
        const event = queue.shift();
        try {
          event.callback(gameState, event);
        } catch (err) {
          // Swallow individual event errors so the scheduler keeps running.
          if (typeof process !== 'undefined' && process.stderr) {
            process.stderr.write(`[scheduler] event ${event.type} error: ${err.message}\n`);
          }
        }
        fired++;
      }

      return fired;
    },

    /** @returns {number} Number of events currently queued */
    get pending() {
      return queue.length;
    },

    /** @returns {boolean} Whether the scheduler is paused */
    get isPaused() {
      return paused;
    },
  };

  return scheduler;
}
