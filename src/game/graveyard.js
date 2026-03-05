/**
 * Death recovery system — graveyard runs, loot recovery, post-wipe catch-up.
 */

const RECOVERY_CHANCE = 0.5;
const GRAVEYARD_RUN_WINDOW = 3;

/**
 * Create a graveyard manager.
 * @param {object} gameState
 * @returns {object} Graveyard instance
 */
export function createGraveyard(gameState) {
  function ensureState() {
    if (!gameState.graveyard) {
      gameState.graveyard = { graves: [] };
    }
  }
  ensureState();

  const graveyard = {
    /**
     * Record a team wipe. Stores equipped loot for potential recovery.
     * @param {object[]} deadTeam - The wiped team members
     * @param {number} dungeonSeed - Seed of the dungeon where they died
     */
    recordWipe(deadTeam, dungeonSeed) {
      ensureState();
      const equipment = [];
      for (const member of deadTeam) {
        const eq = member.equipment ?? {};
        for (const slot of ['weapon', 'armor', 'accessory']) {
          if (eq[slot]) equipment.push({ ...eq[slot], owner: member.name });
        }
      }

      if (equipment.length > 0) {
        gameState.graveyard.graves.push({
          seed: dungeonSeed,
          equipment,
          runsRemaining: GRAVEYARD_RUN_WINDOW,
        });
      }

      // Age out old graves
      gameState.graveyard.graves = gameState.graveyard.graves.filter(
        (g) => g.runsRemaining > 0
      );
    },

    /**
     * Attempt to recover equipment from a grave by re-entering the same dungeon seed.
     * Each item has a 50% chance (modified by Luck).
     * @param {number} dungeonSeed
     * @param {object} rng
     * @param {number} [luckStat=5] - Team's best Luck stat
     * @returns {object[]} Recovered items
     */
    attemptRecovery(dungeonSeed, rng, luckStat = 5) {
      ensureState();
      const graveIdx = gameState.graveyard.graves.findIndex(
        (g) => g.seed === dungeonSeed && g.runsRemaining > 0
      );
      if (graveIdx === -1) return [];

      const grave = gameState.graveyard.graves[graveIdx];
      const recovered = [];
      const luckBonus = Math.floor(luckStat / 10) * 0.05;

      for (const item of grave.equipment) {
        if (rng.chance(RECOVERY_CHANCE + luckBonus)) {
          recovered.push(item);
        }
      }

      // Remove the grave after attempt
      gameState.graveyard.graves.splice(graveIdx, 1);
      return recovered;
    },

    /**
     * Decrement run counters on all graves. Call after each dungeon run.
     */
    ageGraves() {
      ensureState();
      for (const grave of gameState.graveyard.graves) {
        grave.runsRemaining--;
      }
      gameState.graveyard.graves = gameState.graveyard.graves.filter(
        (g) => g.runsRemaining > 0
      );
    },

    /**
     * Check if a graveyard run is available for a given dungeon seed.
     * @param {number} dungeonSeed
     * @returns {boolean}
     */
    hasGrave(dungeonSeed) {
      ensureState();
      return gameState.graveyard.graves.some(
        (g) => g.seed === dungeonSeed && g.runsRemaining > 0
      );
    },

    /** @returns {number} Number of active graves */
    get activeGraves() {
      ensureState();
      return gameState.graveyard.graves.length;
    },
  };

  return graveyard;
}
