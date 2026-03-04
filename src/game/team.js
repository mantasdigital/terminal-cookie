/**
 * Procedural team member generation — races, classes, stats, portraits, leveling.
 */

/** @typedef {{name: string, hp: number, atk: number, def: number, spd: number, lck: number}} StatBlock */

export const RACES = {
  Human:  { hp: 0, atk: 0, def: 0, spd: 0, lck: 0 },
  Dwarf:  { hp: 2, atk: 1, def: 2, spd: -2, lck: -1 },
  Elf:    { hp: -1, atk: 0, def: -1, spd: 2, lck: 2 },
  Goblin: { hp: -1, atk: 1, def: -2, spd: 3, lck: 1 },
  Golem:  { hp: 4, atk: 2, def: 3, spd: -4, lck: -3 },
  Sprite: { hp: -3, atk: -1, def: -2, spd: 4, lck: 4 },
};

export const CLASSES = {
  Warrior:   { primary: 'atk', hp: 2, atk: 3, def: 2, spd: 0, lck: -1, abilities: ['Shield Bash', 'Rally'] },
  Scout:     { primary: 'spd', hp: 0, atk: 1, def: 0, spd: 3, lck: 2, abilities: ['Sneak', 'Ambush'] },
  Healer:    { primary: 'lck', hp: 1, atk: -1, def: 1, spd: 0, lck: 3, abilities: ['Heal', 'Bless'] },
  Mage:      { primary: 'atk', hp: -1, atk: 3, def: -1, spd: 1, lck: 2, abilities: ['Fireball', 'Barrier'] },
  Bard:      { primary: 'lck', hp: 0, atk: 0, def: 0, spd: 2, lck: 3, abilities: ['Inspire', 'Lullaby'] },
  Berserker: { primary: 'atk', hp: 3, atk: 4, def: -2, spd: 1, lck: -1, abilities: ['Rage', 'Reckless Strike'] },
};

export const PERSONALITIES = ['Brave', 'Cautious', 'Greedy', 'Loyal', 'Reckless'];

const FIRST_NAMES = [
  'Ash', 'Bramble', 'Cinder', 'Dusk', 'Ember', 'Fern', 'Grit',
  'Hazel', 'Ivy', 'Jasper', 'Kale', 'Lark', 'Moss', 'Nettle',
  'Oak', 'Pip', 'Quill', 'Rue', 'Sage', 'Thorn', 'Umber', 'Vale',
  'Wren', 'Yarrow', 'Zinc', 'Basil', 'Clay', 'Drift', 'Echo', 'Flint',
];

const PORTRAIT_PARTS = {
  Human:  { head: ' O ', body: '/|\\', legs: '/ \\' },
  Dwarf:  { head: '{O}', body: '[+]', legs: ' | ' },
  Elf:    { head: '/>\\', body: ' | ', legs: '/ \\' },
  Goblin: { head: '\\o/', body: ' | ', legs: '/`\\' },
  Golem:  { head: '[#]', body: '[X]', legs: '[_]' },
  Sprite: { head: ' * ', body: ' | ', legs: ' v ' },
};

/**
 * Generate a random team member.
 * @param {import('../core/rng.js').createRNG} rng
 * @returns {object} Team member
 */
export function generateMember(rng) {
  const raceNames = Object.keys(RACES);
  const classNames = Object.keys(CLASSES);

  const race = raceNames[rng.int(0, raceNames.length - 1)];
  const cls = classNames[rng.int(0, classNames.length - 1)];
  const personality = PERSONALITIES[rng.int(0, PERSONALITIES.length - 1)];
  const name = FIRST_NAMES[rng.int(0, FIRST_NAMES.length - 1)];

  const raceMods = RACES[race];
  const classMods = CLASSES[cls];
  const BASE = 5;

  const stats = {
    hp:  Math.max(1, BASE + raceMods.hp + classMods.hp + rng.int(-2, 2)),
    atk: Math.max(1, BASE + raceMods.atk + classMods.atk + rng.int(-2, 2)),
    def: Math.max(1, BASE + raceMods.def + classMods.def + rng.int(-2, 2)),
    spd: Math.max(1, BASE + raceMods.spd + classMods.spd + rng.int(-2, 2)),
    lck: Math.max(1, BASE + raceMods.lck + classMods.lck + rng.int(-2, 2)),
  };

  const totalStats = stats.hp + stats.atk + stats.def + stats.spd + stats.lck;
  const cost = totalStats * 10;

  return {
    id: rng.int(10000, 99999),
    name,
    race,
    class: cls,
    personality,
    stats,
    maxHp: stats.hp * 4,
    currentHp: stats.hp * 4,
    level: 1,
    xp: 0,
    abilities: [...classMods.abilities],
    equipment: { weapon: null, armor: null, accessory: null },
    cost,
    alive: true,
  };
}

/**
 * Generate a tavern roster of 3-5 recruits.
 * @param {object} rng
 * @returns {object[]} Array of members
 */
export function generateTavernRoster(rng) {
  const count = rng.int(3, 5);
  const roster = [];
  for (let i = 0; i < count; i++) {
    roster.push(generateMember(rng));
  }
  return roster;
}

/**
 * Award XP and apply leveling to a team member.
 * @param {object} member
 * @param {number} dangerLevel - Dungeon room danger level
 * @returns {{ leveled: boolean, newLevel: number }}
 */
export function awardXP(member, dangerLevel) {
  const xpGain = 10 * dangerLevel;
  member.xp += xpGain;

  const cap = 50;
  let leveled = false;

  while (member.level < cap) {
    const xpNeeded = 100 * member.level;
    if (member.xp < xpNeeded) break;

    member.xp -= xpNeeded;
    member.level++;
    leveled = true;

    // +1 primary stat, +1 HP per level
    const primary = CLASSES[member.class]?.primary ?? 'atk';
    member.stats[primary]++;
    member.stats.hp++;
    member.maxHp += 4;
    member.currentHp = member.maxHp;

    // Every 5 levels: ability upgrade (add suffix)
    if (member.level % 5 === 0 && member.abilities.length > 0) {
      const idx = (member.level / 5 - 1) % member.abilities.length;
      member.abilities[idx] = member.abilities[idx] + '+';
    }

    // Every 10 levels: +1 all stats
    if (member.level % 10 === 0) {
      member.stats.hp++;
      member.stats.atk++;
      member.stats.def++;
      member.stats.spd++;
      member.stats.lck++;
      member.maxHp += 4;
    }
  }

  return { leveled, newLevel: member.level };
}

/**
 * Build an ASCII portrait for a member.
 * @param {object} member
 * @returns {string[]} Lines of the portrait
 */
export function buildPortrait(member) {
  const parts = PORTRAIT_PARTS[member.race] ?? PORTRAIT_PARTS.Human;
  const classTag = member.class.substring(0, 3).toUpperCase();
  return [
    `  ${parts.head}`,
    `  ${parts.body}`,
    `  ${parts.legs}`,
    ` [${classTag}]`,
  ];
}
