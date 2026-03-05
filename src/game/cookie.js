/**
 * Cookie click handler — tracks crumbs and applies rate modifiers.
 */

const BASE_RATE = 3;
const INFLATION_PER_DUNGEON = 0.1;
const DIMINISHING_THRESHOLD = 1000;

/**
 * Create a cookie clicker session tracker.
 * @param {object} gameState - Central game state (mutated in place)
 * @returns {object} Cookie handler instance
 */
export function createCookieHandler(gameState) {
  let sessionClicks = 0;

  const cookie = {
    /**
     * Perform a cookie click. Awards crumbs based on current rate.
     * @returns {number} Crumbs awarded this click
     */
    click() {
      const rate = cookie.currentRate();
      const earned = Math.floor(rate);
      gameState.crumbs += earned;
      gameState.stats.crumbsEarned = (gameState.stats.crumbsEarned ?? 0) + earned;
      sessionClicks++;
      return earned;
    },

    /**
     * Calculate the current crumb-per-click rate.
     * Base 1 + inflation from dungeons cleared, halved after 1000 session clicks.
     * @returns {number}
     */
    currentRate() {
      const dungeonsCleared = gameState.stats.dungeonsCleared ?? 0;
      let rate = BASE_RATE + dungeonsCleared * INFLATION_PER_DUNGEON;
      if (sessionClicks >= DIMINISHING_THRESHOLD) {
        rate *= 0.5;
      }
      return rate;
    },

    /** Reset session click counter (call on new session or dungeon enter). */
    resetSession() {
      sessionClicks = 0;
    },

    /** @returns {number} Total clicks this session */
    get sessionClicks() {
      return sessionClicks;
    },

    /** @returns {number} Current crumb balance */
    get crumbs() {
      return gameState.crumbs;
    },
  };

  return cookie;
}
