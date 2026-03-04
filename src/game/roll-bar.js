/**
 * ASCII rolling bar — a bouncing indicator across a 1-20 scale.
 * Player presses a key to stop; result is their roll.
 */

const MIN_ROLL = 1;
const MAX_ROLL = 20;
const WINDOW_MS = 2000;
const BOUNCE_SPEED_MS = 50; // Time per position step

/**
 * Create a roll bar instance.
 * @param {object} [options]
 * @param {number} [options.windowMs=2000] - Total time window before auto-stop
 * @returns {object} Roll bar instance
 */
export function createRollBar(options = {}) {
  const windowMs = options.windowMs ?? WINDOW_MS;

  let position = MIN_ROLL;
  let direction = 1; // 1 = right, -1 = left
  let startTime = 0;
  let stopped = false;
  let finalValue = 0;

  const bar = {
    /** Start the roll bar bouncing. */
    start() {
      position = MIN_ROLL;
      direction = 1;
      startTime = Date.now();
      stopped = false;
      finalValue = 0;
    },

    /**
     * Advance the bar position based on elapsed time.
     * Call this on each frame/tick.
     * @returns {{ position: number, expired: boolean }}
     */
    tick() {
      if (stopped) return { position: finalValue, expired: false };

      const elapsed = Date.now() - startTime;
      if (elapsed >= windowMs) {
        // Time expired — auto-stop at current position
        stopped = true;
        finalValue = position;
        return { position: finalValue, expired: true };
      }

      // Bounce position
      const steps = Math.floor(elapsed / BOUNCE_SPEED_MS);
      // Simulate position from steps
      let pos = MIN_ROLL;
      let dir = 1;
      for (let i = 0; i < steps; i++) {
        pos += dir;
        if (pos >= MAX_ROLL) { pos = MAX_ROLL; dir = -1; }
        if (pos <= MIN_ROLL) { pos = MIN_ROLL; dir = 1; }
      }
      position = pos;
      direction = dir;

      return { position, expired: false };
    },

    /**
     * Player stops the bar — lock in the current value.
     * @returns {number} The locked-in roll value
     */
    stop() {
      if (stopped) return finalValue;
      bar.tick(); // Update position first
      stopped = true;
      finalValue = position;
      return finalValue;
    },

    /**
     * AFK auto-roll: random(1,20) + floor(stat/4), capped at 20.
     * @param {object} rng
     * @param {number} stat - Relevant stat for modifier
     * @returns {number} Final roll value
     */
    autoRoll(rng, stat) {
      const raw = rng.roll();
      return Math.min(raw + Math.floor(stat / 4), MAX_ROLL);
    },

    /**
     * Render the roll bar as an ASCII string.
     * @returns {string} ASCII representation
     */
    render() {
      const width = MAX_ROLL - MIN_ROLL + 1;
      const pos = (stopped ? finalValue : position) - MIN_ROLL;
      const chars = [];
      for (let i = 0; i < width; i++) {
        if (i === pos) {
          chars.push(stopped ? '#' : '|');
        } else {
          chars.push('-');
        }
      }
      const barStr = `[${chars.join('')}]`;
      const label = stopped ? ` = ${finalValue}` : '';
      return `${barStr}${label}  1${''.padEnd(width - 4)}20`;
    },

    /** @returns {boolean} Whether the bar has stopped */
    get isStopped() { return stopped; },
    /** @returns {number} Current or final position */
    get value() { return stopped ? finalValue : position; },
  };

  return bar;
}
