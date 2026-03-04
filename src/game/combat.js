/**
 * Cookie roll combat system — turn-based with stat-modified rolls.
 */

const MAX_ROLL = 20;
const CRIT_RAW = 20;
const FUMBLE_RAW = 1;

/**
 * Calculate a combat roll with stat modifier.
 * @param {number} rawRoll - Raw d20 result (1-20)
 * @param {number} stat - Relevant stat value
 * @returns {{ raw: number, modified: number, crit: boolean, fumble: boolean }}
 */
export function resolveRoll(rawRoll, stat) {
  const modifier = Math.floor(stat / 4);
  const modified = Math.min(rawRoll + modifier, MAX_ROLL);
  return {
    raw: rawRoll,
    modified,
    crit: rawRoll === CRIT_RAW,
    fumble: rawRoll === FUMBLE_RAW,
  };
}

/**
 * Calculate damage dealt.
 * @param {number} attackerAtk
 * @param {number} roll - Modified roll result
 * @param {number} defenderDef
 * @param {boolean} isCrit
 * @returns {number} Damage (minimum 0)
 */
export function calcDamage(attackerAtk, roll, defenderDef, isCrit) {
  let dmg = attackerAtk + roll - defenderDef;
  if (isCrit) dmg *= 2;
  return Math.max(0, Math.floor(dmg));
}

/**
 * Sort combatants by speed/initiative for turn order.
 * @param {object[]} combatants - Array of { id, stats: { spd }, ... }
 * @param {object} rng
 * @returns {object[]} Sorted by initiative (descending)
 */
export function rollInitiative(combatants, rng) {
  return combatants
    .map((c) => ({
      combatant: c,
      initiative: rng.roll() + Math.floor((c.stats?.spd ?? 5) / 4),
    }))
    .sort((a, b) => b.initiative - a.initiative)
    .map((e) => e.combatant);
}

/**
 * Create a combat encounter.
 * @param {object} options
 * @param {object[]} options.team - Player team members
 * @param {object[]} options.enemies - Enemy combatants
 * @param {object} options.rng - RNG instance
 * @returns {object} Combat instance
 */
export function createCombat({ team, enemies, rng }) {
  const allCombatants = [
    ...team.map((m) => ({ ...m, side: 'team' })),
    ...enemies.map((e) => ({ ...e, side: 'enemy' })),
  ];

  let turnOrder = rollInitiative(allCombatants, rng);
  let turnIndex = 0;
  let round = 1;
  let finished = false;
  const log = [];

  const combat = {
    /**
     * Get the current combatant whose turn it is.
     * @returns {object|null}
     */
    currentTurn() {
      if (finished) return null;
      // Skip dead combatants
      while (turnIndex < turnOrder.length && turnOrder[turnIndex].currentHp <= 0) {
        turnIndex++;
      }
      if (turnIndex >= turnOrder.length) return null;
      return turnOrder[turnIndex];
    },

    /**
     * Execute an attack action with a given raw roll.
     * @param {number} rawRoll - The raw d20 roll (1-20)
     * @param {object} [target] - Target combatant (auto-pick if omitted)
     * @returns {object} Action result
     */
    attack(rawRoll, target) {
      const attacker = combat.currentTurn();
      if (!attacker || finished) return { error: 'Combat is over' };

      // Auto-target: pick first living enemy on the opposite side
      if (!target) {
        const oppositeSide = attacker.side === 'team' ? 'enemy' : 'team';
        target = turnOrder.find((c) => c.side === oppositeSide && c.currentHp > 0);
      }
      if (!target || target.currentHp <= 0) {
        return { error: 'No valid target' };
      }

      const roll = resolveRoll(rawRoll, attacker.stats.atk);
      let result;

      if (roll.fumble) {
        // Fumble: miss + self damage
        const selfDmg = Math.max(1, Math.floor(attacker.stats.atk / 4));
        attacker.currentHp = Math.max(0, attacker.currentHp - selfDmg);
        result = {
          type: 'fumble',
          attacker: attacker.name,
          target: target.name,
          selfDamage: selfDmg,
          roll,
        };
        log.push(`${attacker.name} fumbles! Takes ${selfDmg} self-damage.`);
      } else {
        const dmg = calcDamage(attacker.stats.atk, roll.modified, target.stats.def, roll.crit);
        target.currentHp = Math.max(0, target.currentHp - dmg);
        result = {
          type: roll.crit ? 'crit' : 'hit',
          attacker: attacker.name,
          target: target.name,
          damage: dmg,
          roll,
        };
        const tag = roll.crit ? 'CRIT! ' : '';
        log.push(`${attacker.name} hits ${target.name} for ${tag}${dmg} damage.`);

        if (target.currentHp <= 0) {
          log.push(`${target.name} is defeated!`);
        }
      }

      // Advance turn
      turnIndex++;
      if (turnIndex >= turnOrder.length) {
        // New round
        round++;
        turnOrder = turnOrder.filter((c) => c.currentHp > 0);
        turnOrder = rollInitiative(turnOrder, rng);
        turnIndex = 0;
      }

      // Check win/loss
      const teamAlive = turnOrder.some((c) => c.side === 'team' && c.currentHp > 0);
      const enemyAlive = turnOrder.some((c) => c.side === 'enemy' && c.currentHp > 0);

      if (!enemyAlive) {
        finished = true;
        result.outcome = 'victory';
        log.push('Victory!');
      } else if (!teamAlive) {
        finished = true;
        result.outcome = 'defeat';
        log.push('Defeat...');
      }

      return result;
    },

    /**
     * Auto-resolve an attack for AI/AFK — uses rng.roll().
     * @param {object} [target]
     * @returns {object} Action result
     */
    autoAttack(target) {
      const attacker = combat.currentTurn();
      if (!attacker) return { error: 'No current turn' };
      const rawRoll = rng.roll();
      return combat.attack(rawRoll, target);
    },

    /** @returns {boolean} Whether combat has ended */
    get isFinished() { return finished; },
    /** @returns {number} Current round number */
    get round() { return round; },
    /** @returns {string[]} Combat log entries */
    get log() { return [...log]; },
    /** @returns {object[]} All combatants with current state */
    get combatants() { return turnOrder; },
  };

  return combat;
}
