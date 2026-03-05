/**
 * Trophy system — persistent achievements earned through gameplay milestones.
 */

export const TROPHY_DEFS = [
  // Boss trophies
  { id: 'first_boss', name: 'First Blood', desc: 'Defeat your first boss', icon: '[!]', category: 'Boss' },
  { id: 'boss_10', name: 'Boss Slayer', desc: 'Defeat 10 bosses', icon: '[!!]', category: 'Boss' },
  { id: 'boss_50', name: 'Boss Hunter', desc: 'Defeat 50 bosses', icon: '[!!!]', category: 'Boss' },
  { id: 'boss_100', name: 'Boss Legend', desc: 'Defeat 100 bosses', icon: '{!}', category: 'Boss' },
  { id: 'boss_500', name: 'Boss God', desc: 'Defeat 500 bosses', icon: '{!!}', category: 'Boss' },
  { id: 'flawless', name: 'Flawless Victory', desc: 'Beat a boss with no allies lost', icon: '<*>', category: 'Boss' },

  // Combat trophies
  { id: 'dmg_100', name: 'Glass Cannon', desc: 'Deal 100+ damage in a single hit', icon: '/!\\', category: 'Combat' },
  { id: 'dmg_500', name: 'Devastating', desc: 'Deal 500+ damage in a single hit', icon: '/!!\\', category: 'Combat' },
  { id: 'dmg_9999', name: 'Apocalyptic', desc: 'Deal 9999+ damage in a single hit', icon: '/!!!\\', category: 'Combat' },
  { id: 'monsters_100', name: 'Monster Hunter', desc: 'Slay 100 monsters', icon: '(x)', category: 'Combat' },
  { id: 'monsters_1000', name: 'Exterminator', desc: 'Slay 1000 monsters', icon: '(xx)', category: 'Combat' },
  { id: 'monsters_10000', name: 'Genocide', desc: 'Slay 10000 monsters', icon: '(xxx)', category: 'Combat' },

  // Death trophies
  { id: 'first_death', name: 'First Fall', desc: 'Suffer your first team wipe', icon: '[x]', category: 'Death' },
  { id: 'deaths_10', name: 'Stubborn', desc: 'Suffer 10 team wipes', icon: '[xx]', category: 'Death' },
  { id: 'deaths_100', name: 'Undying Spirit', desc: 'Suffer 100 team wipes', icon: '[xxx]', category: 'Death' },
  { id: 'deaths_500', name: 'Eternal Suffering', desc: 'Suffer 500 team wipes', icon: '{x}', category: 'Death' },

  // Level trophies
  { id: 'level_25', name: 'Veteran', desc: 'Reach level 25', icon: 'L25', category: 'Level' },
  { id: 'level_50', name: 'Hero', desc: 'Reach level 50', icon: 'L50', category: 'Level' },
  { id: 'level_100', name: 'Legend', desc: 'Reach level 100', icon: 'L!!', category: 'Level' },
  { id: 'level_150', name: 'Mythic', desc: 'Reach level 150', icon: 'L**', category: 'Level' },
  { id: 'level_200', name: 'Transcendent', desc: 'Reach level 200', icon: 'L##', category: 'Level' },
  { id: 'level_500', name: 'Ascended', desc: 'Reach level 500', icon: 'L!!!!!', category: 'Level' },
  { id: 'full_house', name: 'Full House', desc: '5+ members at level 50+', icon: '<5>', category: 'Level' },

  // Loot trophies
  { id: 'legendary_find', name: 'Legendary Find', desc: 'Find a Legendary item', icon: '{L}', category: 'Loot' },
  { id: 'legendary_10', name: 'Collector', desc: 'Find 10 Legendary items', icon: '{LL}', category: 'Loot' },
  { id: 'legendary_50', name: 'Hoarder', desc: 'Find 50 Legendary items', icon: '{LLL}', category: 'Loot' },
  { id: 'enchant_5', name: 'Enchanter', desc: 'Enchant an item to +5', icon: '+5', category: 'Loot' },
  { id: 'enchant_10', name: 'Master Enchanter', desc: 'Enchant an item to +10', icon: '+10', category: 'Loot' },

  // Progression trophies
  { id: 'village_unlock', name: 'Village Founder', desc: 'Unlock the village', icon: '[V]', category: 'Progression' },
  { id: 'village_max', name: 'Master Builder', desc: 'Max all village buildings', icon: '{V}', category: 'Progression' },
  { id: 'talisman_max', name: 'Talisman Master', desc: 'Max talisman level', icon: '{T}', category: 'Progression' },
  { id: 'dungeon_first', name: 'First Steps', desc: 'Clear your first dungeon', icon: '[D]', category: 'Progression' },
  { id: 'dungeon_100', name: 'Dungeon Master', desc: 'Clear 100 dungeons', icon: '{D}', category: 'Progression' },
  { id: 'dungeon_500', name: 'Dungeon Lord', desc: 'Clear 500 dungeons', icon: '{DD}', category: 'Progression' },
  { id: 'recruit_50', name: 'Army Builder', desc: 'Recruit 50 members total', icon: '[R]', category: 'Progression' },
  { id: 'recruit_200', name: 'Warlord', desc: 'Recruit 200 members total', icon: '{R}', category: 'Progression' },

  // Crumb trophies
  { id: 'crumbs_10k', name: 'Baker', desc: 'Earn 10,000 crumbs total', icon: '(c)', category: 'Crumbs' },
  { id: 'crumbs_100k', name: 'Master Baker', desc: 'Earn 100,000 crumbs total', icon: '(cc)', category: 'Crumbs' },
  { id: 'crumbs_1m', name: 'Cookie Mogul', desc: 'Earn 1,000,000 crumbs total', icon: '(C)', category: 'Crumbs' },
  { id: 'crumbs_10m', name: 'Cookie Emperor', desc: 'Earn 10,000,000 crumbs total', icon: '(CC)', category: 'Crumbs' },
  { id: 'crumbs_100m', name: 'Cookie God', desc: 'Earn 100,000,000 crumbs total', icon: '{C}', category: 'Crumbs' },

  // Time trophies
  { id: 'time_1h', name: 'Getting Started', desc: 'Play for 1 hour', icon: '[1h]', category: 'Time' },
  { id: 'time_10h', name: 'Dedicated', desc: 'Play for 10 hours', icon: '[10h]', category: 'Time' },
  { id: 'time_100h', name: 'Obsessed', desc: 'Play for 100 hours', icon: '[100h]', category: 'Time' },
  { id: 'time_999h', name: 'Eternal', desc: 'Play for 999 hours', icon: '{999h}', category: 'Time' },
  { id: 'time_9999h', name: 'Beyond Time', desc: 'Play for 9999 hours', icon: '{!!!h}', category: 'Time' },

  // Buyable trophies (shop)
  { id: 'golden_cookie', name: 'Golden Cookie', desc: 'Bought for 1,000,000 crumbs', icon: '(G)', category: 'Shop', cost: 1_000_000 },
  { id: 'diamond_cookie', name: 'Diamond Cookie', desc: 'Bought for 5,000,000 crumbs', icon: '<D>', category: 'Shop', cost: 5_000_000 },
  { id: 'cosmic_cookie', name: 'Cosmic Cookie', desc: 'Bought for 25,000,000 crumbs', icon: '{*}', category: 'Shop', cost: 25_000_000 },
  { id: 'infinity_cookie', name: 'Infinity Cookie', desc: 'Bought for 100,000,000 crumbs', icon: '{8}', category: 'Shop', cost: 100_000_000 },
];

const TROPHY_MAP = new Map(TROPHY_DEFS.map(t => [t.id, t]));

/**
 * Check if a trophy is already earned.
 */
export function hasTrophy(state, id) {
  return (state.trophies ?? []).includes(id);
}

/**
 * Award a trophy if not already earned. Returns the trophy def if newly awarded, null otherwise.
 */
export function awardTrophy(state, id) {
  if (hasTrophy(state, id)) return null;
  state.trophies = state.trophies ?? [];
  state.trophies.push(id);
  return TROPHY_MAP.get(id) ?? null;
}

/**
 * Get the trophy definition by id.
 */
export function getTrophyDef(id) {
  return TROPHY_MAP.get(id) ?? null;
}

/**
 * Get all earned trophy definitions.
 */
export function getEarnedTrophies(state) {
  return (state.trophies ?? []).map(id => TROPHY_MAP.get(id)).filter(Boolean);
}

/**
 * Get all trophy definitions.
 */
export function getAllTrophies() {
  return TROPHY_DEFS;
}

/**
 * Get buyable trophies that haven't been earned yet.
 */
export function getBuyableTrophies(state) {
  return TROPHY_DEFS.filter(t => t.cost && !hasTrophy(state, t.id));
}

/**
 * Run all automatic trophy checks against current game state.
 * Returns array of newly awarded trophy defs.
 */
export function checkTrophies(state) {
  const awarded = [];

  function tryAward(id) {
    const t = awardTrophy(state, id);
    if (t) awarded.push(t);
  }

  const stats = state.stats ?? {};

  // Boss kills
  const bossKills = stats.bossesDefeated ?? 0;
  if (bossKills >= 1) tryAward('first_boss');
  if (bossKills >= 10) tryAward('boss_10');
  if (bossKills >= 50) tryAward('boss_50');
  if (bossKills >= 100) tryAward('boss_100');
  if (bossKills >= 500) tryAward('boss_500');

  // Monster kills
  const kills = stats.monstersSlain ?? 0;
  if (kills >= 100) tryAward('monsters_100');
  if (kills >= 1000) tryAward('monsters_1000');
  if (kills >= 10000) tryAward('monsters_10000');

  // Damage
  const maxDmg = stats.highestDamage ?? 0;
  if (maxDmg >= 100) tryAward('dmg_100');
  if (maxDmg >= 500) tryAward('dmg_500');
  if (maxDmg >= 9999) tryAward('dmg_9999');

  // Deaths
  const deaths = stats.deaths ?? 0;
  if (deaths >= 1) tryAward('first_death');
  if (deaths >= 10) tryAward('deaths_10');
  if (deaths >= 100) tryAward('deaths_100');
  if (deaths >= 500) tryAward('deaths_500');

  // Levels
  const team = state.team ?? [];
  const maxLevel = Math.max(0, ...team.map(m => m.level ?? 1));
  if (maxLevel >= 25) tryAward('level_25');
  if (maxLevel >= 50) tryAward('level_50');
  if (maxLevel >= 100) tryAward('level_100');
  if (maxLevel >= 150) tryAward('level_150');
  if (maxLevel >= 200) tryAward('level_200');
  if (maxLevel >= 500) tryAward('level_500');
  if (team.filter(m => (m.level ?? 1) >= 50).length >= 5) tryAward('full_house');

  // Legendaries found
  const legendaries = stats.legendariesFound ?? 0;
  if (legendaries >= 1) tryAward('legendary_find');
  if (legendaries >= 10) tryAward('legendary_10');
  if (legendaries >= 50) tryAward('legendary_50');

  // Enchant level
  const maxEnchant = stats.highestEnchant ?? 0;
  if (maxEnchant >= 5) tryAward('enchant_5');
  if (maxEnchant >= 10) tryAward('enchant_10');

  // Village
  if (state.village) tryAward('village_unlock');

  // Talisman max (level 10)
  if ((state.talisman?.level ?? 1) >= 10) tryAward('talisman_max');

  // Dungeons cleared
  const runs = stats.dungeonsCleared ?? stats.runs ?? 0;
  if (runs >= 1) tryAward('dungeon_first');
  if (runs >= 100) tryAward('dungeon_100');
  if (runs >= 500) tryAward('dungeon_500');

  // Recruits
  const recruits = stats.totalRecruits ?? 0;
  if (recruits >= 50) tryAward('recruit_50');
  if (recruits >= 200) tryAward('recruit_200');

  // Crumbs earned
  const earned = stats.crumbsEarned ?? 0;
  if (earned >= 10_000) tryAward('crumbs_10k');
  if (earned >= 100_000) tryAward('crumbs_100k');
  if (earned >= 1_000_000) tryAward('crumbs_1m');
  if (earned >= 10_000_000) tryAward('crumbs_10m');
  if (earned >= 100_000_000) tryAward('crumbs_100m');

  // Play time (in ms)
  const playMs = state.playTime ?? 0;
  const playHours = playMs / 3_600_000;
  if (playHours >= 1) tryAward('time_1h');
  if (playHours >= 10) tryAward('time_10h');
  if (playHours >= 100) tryAward('time_100h');
  if (playHours >= 999) tryAward('time_999h');
  if (playHours >= 9999) tryAward('time_9999h');

  return awarded;
}
