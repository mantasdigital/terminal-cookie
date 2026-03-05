/**
 * Talisman system — persistent artifact that survives death and provides
 * scaling passive bonuses. Upgradeable with crumbs across 10 levels.
 *
 * Inspired by roster/meta-progression systems: the talisman is never lost,
 * but must be invested in to grow stronger.
 */

const MAX_LEVEL = 10;

/**
 * Talisman tier definitions. Each level provides cumulative bonuses.
 * - crumbBonus:  fractional bonus applied to crumb earnings (0.05 = +5%)
 * - lootQuality: flat quality bonus added to loot generation
 * - hpRegen:     HP healed per alive team member between dungeon rooms
 * - deathReward: crumbs granted as consolation on team wipe
 * - atkBonus:    flat ATK bonus applied to every team member in combat
 * - defBonus:    flat DEF bonus applied to every team member in combat
 * - salvageRate: chance (0-1) to recover each equipped item on death, scaled by dungeon depth
 */
const TIERS = [
  /*  1 */ { upgradeCost: 0,    crumbBonus: 0.05, lootQuality: 1,  hpRegen: 1, deathReward: 5,   atkBonus: 0, defBonus: 0, salvageRate: 0.0  },
  /*  2 */ { upgradeCost: 30,   crumbBonus: 0.08, lootQuality: 2,  hpRegen: 1, deathReward: 8,   atkBonus: 0, defBonus: 0, salvageRate: 0.1  },
  /*  3 */ { upgradeCost: 75,   crumbBonus: 0.12, lootQuality: 3,  hpRegen: 2, deathReward: 12,  atkBonus: 0, defBonus: 0, salvageRate: 0.15 },
  /*  4 */ { upgradeCost: 150,  crumbBonus: 0.16, lootQuality: 4,  hpRegen: 2, deathReward: 18,  atkBonus: 1, defBonus: 0, salvageRate: 0.2  },
  /*  5 */ { upgradeCost: 300,  crumbBonus: 0.20, lootQuality: 6,  hpRegen: 3, deathReward: 25,  atkBonus: 1, defBonus: 0, salvageRate: 0.3  },
  /*  6 */ { upgradeCost: 500,  crumbBonus: 0.25, lootQuality: 8,  hpRegen: 3, deathReward: 35,  atkBonus: 1, defBonus: 1, salvageRate: 0.4  },
  /*  7 */ { upgradeCost: 800,  crumbBonus: 0.30, lootQuality: 10, hpRegen: 4, deathReward: 50,  atkBonus: 2, defBonus: 1, salvageRate: 0.5  },
  /*  8 */ { upgradeCost: 1200, crumbBonus: 0.35, lootQuality: 13, hpRegen: 5, deathReward: 70,  atkBonus: 2, defBonus: 2, salvageRate: 0.6  },
  /*  9 */ { upgradeCost: 1800, crumbBonus: 0.42, lootQuality: 16, hpRegen: 6, deathReward: 100, atkBonus: 3, defBonus: 2, salvageRate: 0.75 },
  /* 10 */ { upgradeCost: 0,    crumbBonus: 0.50, lootQuality: 20, hpRegen: 8, deathReward: 150, atkBonus: 3, defBonus: 3, salvageRate: 0.9  },
];

/**
 * Get the bonuses for a given talisman level.
 * @param {number} level - Talisman level (1-10)
 * @returns {object} Tier bonuses
 */
export function getTalismanBonuses(level) {
  const idx = Math.max(0, Math.min(MAX_LEVEL - 1, (level ?? 1) - 1));
  return { ...TIERS[idx] };
}

/**
 * Get the crumb cost to upgrade from current level to the next.
 * Returns 0 if already at max level.
 * @param {number} currentLevel
 * @returns {number}
 */
export function getUpgradeCost(currentLevel) {
  if (currentLevel >= MAX_LEVEL) return 0;
  return TIERS[currentLevel].upgradeCost; // next tier's cost
}

/**
 * Check if upgrade is possible (not max level, enough crumbs).
 * @param {object} talisman - { level }
 * @param {number} crumbs - Available crumbs
 * @returns {boolean}
 */
export function canUpgrade(talisman, crumbs) {
  if (!talisman || talisman.level >= MAX_LEVEL) return false;
  return crumbs >= getUpgradeCost(talisman.level);
}

/**
 * Upgrade the talisman. Mutates talisman.level and deducts crumbs from state.
 * @param {object} gameState - Game state with talisman and crumbs
 * @returns {{ success: boolean, newLevel?: number, cost?: number }}
 */
export function upgradeTalisman(gameState) {
  const talisman = gameState.talisman;
  if (!talisman) return { success: false };
  const cost = getUpgradeCost(talisman.level);
  if (talisman.level >= MAX_LEVEL || gameState.crumbs < cost) {
    return { success: false };
  }
  gameState.crumbs -= cost;
  gameState._lastCrumbSpend = Date.now();
  talisman.level++;
  return { success: true, newLevel: talisman.level, cost };
}

/**
 * Apply talisman HP regen to all alive team members.
 * Call this between dungeon rooms.
 * @param {object} gameState
 */
export function applyTalismanRegen(gameState) {
  const talisman = gameState.talisman;
  if (!talisman) return;
  const { hpRegen } = getTalismanBonuses(talisman.level);
  for (const member of (gameState.team ?? [])) {
    if (member.currentHp > 0) {
      member.currentHp = Math.min(member.maxHp, member.currentHp + hpRegen);
    }
  }
}

/**
 * Award talisman death consolation crumbs.
 * @param {object} gameState
 * @returns {number} Crumbs awarded
 */
export function awardDeathReward(gameState) {
  const talisman = gameState.talisman;
  if (!talisman) return 0;
  const { deathReward } = getTalismanBonuses(talisman.level);
  gameState.crumbs += deathReward;
  gameState.stats.crumbsEarned = (gameState.stats.crumbsEarned ?? 0) + deathReward;
  return deathReward;
}

/**
 * Salvage equipped items from dead team members via talisman.
 * Chance scales with talisman level, dungeon depth (rooms cleared), and
 * performance (monsters killed). Higher talisman = more items saved.
 * @param {object} gameState
 * @param {object} rng - RNG instance
 * @returns {object[]} Salvaged items added to inventory
 */
export function salvageLoot(gameState, rng) {
  const talisman = gameState.talisman;
  if (!talisman) return [];

  const { salvageRate } = getTalismanBonuses(talisman.level);
  if (salvageRate <= 0) return [];

  const roomsCleared = gameState.stats?.roomsCleared ?? 0;
  const monstersSlain = gameState.stats?.monstersSlain ?? 0;
  const dungeonLevel = gameState.dungeonProgress?.level ?? 1;

  // Performance bonus: deeper dungeons and more kills improve salvage odds
  const depthBonus = Math.min(0.15, dungeonLevel * 0.02);
  const performanceBonus = Math.min(0.1, (roomsCleared * 0.005) + (monstersSlain * 0.01));
  const totalChance = Math.min(0.95, salvageRate + depthBonus + performanceBonus);

  const team = gameState.team ?? [];
  const salvaged = [];

  for (const member of team) {
    const eq = member.equipment ?? {};
    for (const slot of ['weapon', 'armor', 'accessory']) {
      if (eq[slot] && rng.chance(totalChance)) {
        salvaged.push({ ...eq[slot], salvageSource: member.name });
      }
    }
  }

  // Add salvaged items to inventory
  gameState.inventory = gameState.inventory ?? [];
  for (const item of salvaged) {
    gameState.inventory.push(item);
  }

  return salvaged;
}

/**
 * Create the default talisman object for new games.
 * @returns {object}
 */
export function defaultTalisman() {
  return { level: 1 };
}

/** @returns {number} */
export function getMaxLevel() {
  return MAX_LEVEL;
}

/**
 * Format talisman info for display.
 * @param {object} talisman
 * @param {number} crumbs - Current crumbs (for upgrade affordability)
 * @returns {string[]} Lines of text
 */
export function formatTalismanInfo(talisman, crumbs) {
  if (!talisman) return ['No talisman found.'];
  const b = getTalismanBonuses(talisman.level);
  const lines = [];
  lines.push(`Talisman Level: ${talisman.level}/${MAX_LEVEL}`);
  lines.push('');
  lines.push('Bonuses:');
  lines.push(`  Crumb bonus:     +${Math.round(b.crumbBonus * 100)}%`);
  lines.push(`  Loot quality:    +${b.lootQuality}`);
  lines.push(`  HP regen/room:   +${b.hpRegen}`);
  lines.push(`  Death consolation: ${b.deathReward} crumbs`);
  if (b.salvageRate > 0) lines.push(`  Loot salvage:    ${Math.round(b.salvageRate * 100)}%`);
  if (b.atkBonus > 0) lines.push(`  Team ATK:        +${b.atkBonus}`);
  if (b.defBonus > 0) lines.push(`  Team DEF:        +${b.defBonus}`);

  if (talisman.level < MAX_LEVEL) {
    const cost = getUpgradeCost(talisman.level);
    const affordable = crumbs >= cost;
    const nextB = getTalismanBonuses(talisman.level + 1);
    lines.push('');
    lines.push(`Next level (${talisman.level + 1}): ${cost} crumbs ${affordable ? '[AFFORDABLE]' : `(need ${cost - crumbs} more)`}`);
    lines.push(`  Crumb bonus:     +${Math.round(nextB.crumbBonus * 100)}%`);
    lines.push(`  Loot quality:    +${nextB.lootQuality}`);
    lines.push(`  HP regen/room:   +${nextB.hpRegen}`);
    if (nextB.atkBonus > b.atkBonus) lines.push(`  Team ATK:        +${nextB.atkBonus} (+${nextB.atkBonus - b.atkBonus})`);
    if (nextB.defBonus > b.defBonus) lines.push(`  Team DEF:        +${nextB.defBonus} (+${nextB.defBonus - b.defBonus})`);
  } else {
    lines.push('');
    lines.push('MAX LEVEL - Fully upgraded!');
  }
  return lines;
}
