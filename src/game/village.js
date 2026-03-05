/**
 * Village system — persistent settlement unlocked at 9+ alive team members.
 * Buildings provide passive bonuses, new items, and deeper progression.
 * Once unlocked, the village persists even if team shrinks below 9.
 * Building/upgrading requires 9+ alive members.
 */

const VILLAGE_UNLOCK_THRESHOLD = 9;
const MAX_BUILDING_LEVEL = 3;

/**
 * Building definitions — each has 3 upgrade levels with escalating costs and bonuses.
 */
const BUILDINGS = {
  bakery: {
    name: 'Bakery',
    icon: '[B]',
    desc: 'Produces crumbs passively as your team explores.',
    ascii: [
      '  _____  ',
      ' |  ~~ | ',
      ' | @@@ | ',
      ' |_____|_',
      ' /BAKERY/',
    ],
    levels: [
      { cost: 0,   bonuses: { crumbsPerRoom: 2 },  label: 'Lv1: +2 crumbs/room' },
      { cost: 80,  bonuses: { crumbsPerRoom: 5 },  label: 'Lv2: +5 crumbs/room' },
      { cost: 200, bonuses: { crumbsPerRoom: 10 }, label: 'Lv3: +10 crumbs/room' },
    ],
  },
  forge: {
    name: 'Forge',
    icon: '[F]',
    desc: 'Reduces enchanting costs and crafts gear.',
    ascii: [
      '  /^^^^\\  ',
      ' | {~~} | ',
      ' | |/\\| | ',
      ' |______|',
      ' /FORGE/ ',
    ],
    levels: [
      { cost: 50,  bonuses: { enchantDiscount: 0.15, craftPower: 2 },  label: 'Lv1: -15% enchant cost, craft pwr +2' },
      { cost: 150, bonuses: { enchantDiscount: 0.30, craftPower: 5 },  label: 'Lv2: -30% enchant cost, craft pwr +5' },
      { cost: 350, bonuses: { enchantDiscount: 0.50, craftPower: 10 }, label: 'Lv3: -50% enchant cost, craft pwr +10' },
    ],
  },
  watchtower: {
    name: 'Watchtower',
    icon: '[W]',
    desc: 'Scouts ahead and strengthens defenses.',
    ascii: [
      '    |>   ',
      '   [=]   ',
      '   | |   ',
      '  /| |\\  ',
      ' /TOWER\\ ',
    ],
    levels: [
      { cost: 80,  bonuses: { scoutRooms: 1, defBonus: 1 }, label: 'Lv1: scout 1 room, +1 DEF' },
      { cost: 200, bonuses: { scoutRooms: 2, defBonus: 2 }, label: 'Lv2: scout 2 rooms, +2 DEF' },
      { cost: 400, bonuses: { scoutRooms: 3, defBonus: 3 }, label: 'Lv3: scout 3 rooms, +3 DEF' },
    ],
  },
  herbalist: {
    name: 'Herbalist',
    icon: '[H]',
    desc: 'Brews potions and grants poison resistance.',
    ascii: [
      '  .-~~-.  ',
      ' {herbs}  ',
      ' |<>  <>| ',
      ' |______|',
      ' /HERBS/ ',
    ],
    levels: [
      { cost: 60,  bonuses: { healPerRoom: 2, poisonResist: 0.2 },  label: 'Lv1: +2 heal/room, 20% poison resist' },
      { cost: 160, bonuses: { healPerRoom: 4, poisonResist: 0.4 },  label: 'Lv2: +4 heal/room, 40% poison resist' },
      { cost: 350, bonuses: { healPerRoom: 8, poisonResist: 0.7 },  label: 'Lv3: +8 heal/room, 70% poison resist' },
    ],
  },
  training: {
    name: 'Training Ground',
    icon: '[T]',
    desc: 'Boosts XP gain and improves recruits.',
    ascii: [
      '  |/ \\|  ',
      '  /o  o\\  ',
      ' | \\||/ | ',
      ' |______|',
      ' /TRAIN/ ',
    ],
    levels: [
      { cost: 100, bonuses: { xpMultiplier: 0.15, recruitStatBonus: 1 }, label: 'Lv1: +15% XP, recruits +1 stats' },
      { cost: 250, bonuses: { xpMultiplier: 0.30, recruitStatBonus: 2 }, label: 'Lv2: +30% XP, recruits +2 stats' },
      { cost: 500, bonuses: { xpMultiplier: 0.50, recruitStatBonus: 4 }, label: 'Lv3: +50% XP, recruits +4 stats' },
    ],
  },
  merchant: {
    name: 'Merchant Guild',
    icon: '[M]',
    desc: 'Better sell prices and exclusive shop items.',
    ascii: [
      '  $---$  ',
      ' |GUILD| ',
      ' |$  $ | ',
      ' |_____|',
      ' /MERCH/ ',
    ],
    levels: [
      { cost: 120, bonuses: { sellMultiplier: 0.25, shopDiscount: 0.10 }, label: 'Lv1: +25% sell, -10% shop' },
      { cost: 280, bonuses: { sellMultiplier: 0.50, shopDiscount: 0.20 }, label: 'Lv2: +50% sell, -20% shop' },
      { cost: 550, bonuses: { sellMultiplier: 1.00, shopDiscount: 0.35 }, label: 'Lv3: +100% sell, -35% shop' },
    ],
  },
  archive: {
    name: 'Archive',
    icon: '[A]',
    desc: 'Reveals enemy weaknesses and biome intel.',
    ascii: [
      '  .===.  ',
      ' |BOOKS| ',
      ' |=====| ',
      ' |_____|',
      ' /STUDY/ ',
    ],
    levels: [
      { cost: 150, bonuses: { revealWeakness: true, lootQuality: 2, atkBonus: 1 }, label: 'Lv1: enemy info, +2 loot, +1 ATK' },
      { cost: 350, bonuses: { revealWeakness: true, lootQuality: 5, atkBonus: 2 }, label: 'Lv2: enemy info, +5 loot, +2 ATK' },
      { cost: 600, bonuses: { revealWeakness: true, lootQuality: 10, atkBonus: 3 }, label: 'Lv3: enemy info, +10 loot, +3 ATK' },
    ],
  },
};

const BUILDING_IDS = Object.keys(BUILDINGS);

/**
 * Check if the village is unlocked (ever had 9+ alive members).
 */
export function isVillageUnlocked(gameState) {
  return !!(gameState.village && gameState.village.unlocked);
}

/**
 * Check if the player can unlock the village right now.
 */
export function canUnlockVillage(gameState) {
  if (isVillageUnlocked(gameState)) return false;
  const alive = (gameState.team ?? []).filter(m => m.currentHp > 0).length;
  return alive >= VILLAGE_UNLOCK_THRESHOLD;
}

/**
 * Unlock the village. Initializes village state with the free bakery at level 1.
 */
export function unlockVillage(gameState) {
  if (isVillageUnlocked(gameState)) return false;
  gameState.village = {
    unlocked: true,
    buildings: {
      bakery: { level: 1 },
    },
  };
  return true;
}

/**
 * Check if the player can build or upgrade (requires 9+ alive members).
 */
export function canBuildOrUpgrade(gameState) {
  const alive = (gameState.team ?? []).filter(m => m.currentHp > 0).length;
  return alive >= VILLAGE_UNLOCK_THRESHOLD;
}

/**
 * Get the current level of a building (0 = not built).
 */
export function getBuildingLevel(gameState, buildingId) {
  if (!gameState.village?.buildings) return 0;
  return gameState.village.buildings[buildingId]?.level ?? 0;
}

/**
 * Get the cost to build or upgrade a building.
 * @returns {number} Cost in crumbs, or 0 if maxed
 */
export function getBuildingCost(gameState, buildingId) {
  const def = BUILDINGS[buildingId];
  if (!def) return 0;
  const currentLevel = getBuildingLevel(gameState, buildingId);
  if (currentLevel >= MAX_BUILDING_LEVEL) return 0;
  return def.levels[currentLevel].cost;
}

/**
 * Build or upgrade a building.
 * @returns {{ success: boolean, newLevel?: number, cost?: number, error?: string }}
 */
export function upgradeBuilding(gameState, buildingId) {
  const def = BUILDINGS[buildingId];
  if (!def) return { success: false, error: 'Unknown building' };
  if (!isVillageUnlocked(gameState)) return { success: false, error: 'Village not unlocked' };
  if (!canBuildOrUpgrade(gameState)) return { success: false, error: 'Need 9+ alive team members to build' };

  const currentLevel = getBuildingLevel(gameState, buildingId);
  if (currentLevel >= MAX_BUILDING_LEVEL) return { success: false, error: 'Already max level' };

  const cost = def.levels[currentLevel].cost;
  if (gameState.crumbs < cost) return { success: false, error: `Need ${cost} crumbs (have ${gameState.crumbs})` };

  gameState.crumbs -= cost;
  gameState._lastCrumbSpend = Date.now();
  gameState._lastCrumbSpendAmount = cost;
  gameState.village.buildings = gameState.village.buildings ?? {};
  gameState.village.buildings[buildingId] = { level: currentLevel + 1 };

  return { success: true, newLevel: currentLevel + 1, cost };
}

/**
 * Get aggregated bonuses from all buildings.
 */
export function getVillageBonuses(gameState) {
  const result = {
    crumbsPerRoom: 0,
    enchantDiscount: 0,
    craftPower: 0,
    scoutRooms: 0,
    defBonus: 0,
    healPerRoom: 0,
    poisonResist: 0,
    xpMultiplier: 0,
    recruitStatBonus: 0,
    sellMultiplier: 0,
    shopDiscount: 0,
    revealWeakness: false,
    lootQuality: 0,
    atkBonus: 0,
  };

  if (!gameState.village?.buildings) return result;

  for (const [id, building] of Object.entries(gameState.village.buildings)) {
    const def = BUILDINGS[id];
    if (!def || !building.level) continue;
    const bonuses = def.levels[building.level - 1].bonuses;
    for (const [key, val] of Object.entries(bonuses)) {
      if (typeof val === 'boolean') {
        result[key] = result[key] || val;
      } else {
        result[key] = (result[key] ?? 0) + val;
      }
    }
  }

  return result;
}

/**
 * Format village info for display.
 * @returns {string[]} Lines of text
 */
export function formatVillageInfo(gameState) {
  const lines = [];
  if (!isVillageUnlocked(gameState)) {
    const alive = (gameState.team ?? []).filter(m => m.currentHp > 0).length;
    lines.push(`Village locked — need ${VILLAGE_UNLOCK_THRESHOLD} alive team members (have ${alive})`);
    return lines;
  }

  const canBuild = canBuildOrUpgrade(gameState);
  lines.push(`Village ${canBuild ? '(can build)' : '(need 9+ alive to build)'}`);
  lines.push('');

  for (const id of BUILDING_IDS) {
    const def = BUILDINGS[id];
    const level = getBuildingLevel(gameState, id);
    if (level === 0) {
      const cost = def.levels[0].cost;
      lines.push(`  ${def.icon} ${def.name}: Not built (${cost > 0 ? cost + ' crumbs' : 'FREE'})`);
    } else {
      const label = def.levels[level - 1].label;
      const maxed = level >= MAX_BUILDING_LEVEL;
      const next = maxed ? 'MAX' : `Next: ${def.levels[level].cost} crumbs`;
      lines.push(`  ${def.icon} ${def.name} Lv${level}: ${label} [${next}]`);
    }
  }

  return lines;
}

/**
 * Get building definitions for rendering.
 */
export function getBuildingDefs() {
  return BUILDINGS;
}

/**
 * Get all building IDs.
 */
export function getBuildingIds() {
  return BUILDING_IDS;
}

/**
 * Get the unlock threshold.
 */
export function getUnlockThreshold() {
  return VILLAGE_UNLOCK_THRESHOLD;
}

/**
 * Get max building level.
 */
export function getMaxBuildingLevel() {
  return MAX_BUILDING_LEVEL;
}
