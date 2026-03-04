/**
 * Seeded PRNG using the mulberry32 algorithm.
 * Provides deterministic random number generation for reproducible game runs.
 */

/**
 * Mulberry32 core — returns a function that produces 0-1 floats.
 * @param {number} seed
 */
function mulberry32(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Create a seeded RNG instance.
 * @param {number} seed - Numeric seed value
 * @returns {object} RNG instance with random, int, roll, weightedPick, shuffle, chance
 */
export function createRNG(seed) {
  const next = mulberry32(seed);

  const rng = {
    /** @returns {number} Float in [0, 1) */
    random() {
      return next();
    },

    /**
     * Random integer in [min, max] inclusive.
     * @param {number} min
     * @param {number} max
     * @returns {number}
     */
    int(min, max) {
      return Math.floor(next() * (max - min + 1)) + min;
    },

    /**
     * Roll a die with the given number of sides.
     * @param {number} [sides=20]
     * @returns {number} 1-based result
     */
    roll(sides = 20) {
      return rng.int(1, sides);
    },

    /**
     * Pick from a weighted probability table.
     * @param {Array<{item: *, weight: number}>} table
     * @returns {*} Selected item
     */
    weightedPick(table) {
      if (!table.length) return undefined;
      const total = table.reduce((sum, entry) => sum + entry.weight, 0);
      let roll = next() * total;
      for (const entry of table) {
        roll -= entry.weight;
        if (roll <= 0) return entry.item;
      }
      return table[table.length - 1].item;
    },

    /**
     * Fisher-Yates shuffle (returns a new array).
     * @param {Array} array
     * @returns {Array} Shuffled copy
     */
    shuffle(array) {
      const a = [...array];
      for (let i = a.length - 1; i > 0; i--) {
        const j = rng.int(0, i);
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },

    /**
     * Returns true with the given probability.
     * @param {number} probability - 0 to 1
     * @returns {boolean}
     */
    chance(probability) {
      return next() < probability;
    },
  };

  return rng;
}

/**
 * Generate a non-deterministic seed from the current time and Math.random.
 * @returns {number}
 */
export function generateSeed() {
  return (Date.now() ^ (Math.random() * 0x100000000)) >>> 0;
}
