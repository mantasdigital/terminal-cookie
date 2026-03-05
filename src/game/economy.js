/**
 * Economy system — crumb pacing, loot selling, post-wipe discounts.
 */

const BASE_RECRUIT_COST_SCALE = 1.0;
const POST_WIPE_DISCOUNT = 0.5;
const POST_WIPE_DISCOUNT_RECRUITS = 10;

/**
 * Create an economy manager bound to game state.
 * @param {object} gameState
 * @returns {object} Economy instance
 */
export function createEconomy(gameState) {
  let discountRecruitsRemaining = 0;

  // Restore discount state if present
  if (gameState.economy?.discountRecruitsRemaining) {
    discountRecruitsRemaining = gameState.economy.discountRecruitsRemaining;
  }

  const economy = {
    /**
     * Get the effective cost for a recruit.
     * First recruit ~30 crumbs base, scaled by stat total.
     * @param {object} member - Generated team member
     * @returns {number} Effective cost in crumbs
     */
    recruitCost(member) {
      let cost = member.cost * BASE_RECRUIT_COST_SCALE;
      if (discountRecruitsRemaining > 0) {
        cost = Math.floor(cost * POST_WIPE_DISCOUNT);
      }
      return Math.max(5, Math.floor(cost));
    },

    /**
     * Attempt to recruit a member. Deducts crumbs if affordable.
     * @param {object} member
     * @returns {boolean} Whether recruitment succeeded
     */
    tryRecruit(member) {
      const cost = economy.recruitCost(member);
      if (gameState.crumbs < cost) return false;
      gameState.crumbs -= cost;
      gameState._lastCrumbSpend = Date.now();
      if (discountRecruitsRemaining > 0) {
        discountRecruitsRemaining--;
      }
      return true;
    },

    /**
     * Sell a loot item for crumbs.
     * @param {object} item - Loot item with a value property
     * @returns {number} Crumbs received
     */
    sellItem(item) {
      const value = item.value ?? 1;
      // Diminishing returns: each item after 50 in inventory sells for less
      const inventorySize = gameState.inventory?.length ?? 0;
      const diminish = inventorySize > 50 ? Math.max(0.2, 1 - (inventorySize - 50) * 0.01) : 1;
      const earned = Math.max(1, Math.floor(value * diminish));
      gameState.crumbs += earned;
      gameState.stats.crumbsEarned = (gameState.stats.crumbsEarned ?? 0) + earned;
      return earned;
    },

    /**
     * Activate post-wipe catch-up discount.
     * Gives 50% off the next 10 recruits.
     */
    activateWipeDiscount() {
      discountRecruitsRemaining = POST_WIPE_DISCOUNT_RECRUITS;
    },

    /** @returns {number} Remaining discounted recruits */
    get discountRemaining() {
      return discountRecruitsRemaining;
    },

    /** Serialize economy state for saving. */
    serialize() {
      return { discountRecruitsRemaining };
    },
  };

  return economy;
}
