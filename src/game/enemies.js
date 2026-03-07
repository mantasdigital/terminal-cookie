/**
 * Enemy generation — template-based with stat scaling, mutations, procedural ASCII,
 * boss generation, and balance simulation.
 */

import { createRNG } from '../core/rng.js';
import { createCombat } from './combat.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MONSTERS_PATH = join(__dirname, '..', '..', 'data', 'monsters.json');

let monstersData = null;
function loadMonsters() {
  if (!monstersData) monstersData = JSON.parse(readFileSync(MONSTERS_PATH, 'utf8'));
  return monstersData;
}

// Mutation definitions
const MUTATIONS = {
  Giant:         { hpMul: 1.5, atkMul: 1.0, defMul: 1.0, tag: 'Giant' },
  Armored:       { hpMul: 1.0, atkMul: 1.0, defMul: 2.0, tag: 'Armored' },
  Swift:         { hpMul: 1.0, atkMul: 1.0, defMul: 1.0, tag: 'Swift', goesFirst: true },
  Venomous:      { hpMul: 1.0, atkMul: 1.0, defMul: 1.0, tag: 'Venomous', dot: 3 },
  Ethereal:      { hpMul: 1.0, atkMul: 1.0, defMul: 1.0, tag: 'Ethereal', dodgeChance: 0.5 },
  Enraged:       { hpMul: 1.0, atkMul: 2.0, defMul: 0.5, tag: 'Enraged' },
  'Cookie-Cursed': { hpMul: 1.0, atkMul: 1.0, defMul: 1.0, tag: 'Cookie-Cursed', stealCrumbs: true },
  Regenerating:  { hpMul: 1.0, atkMul: 1.0, defMul: 1.0, tag: 'Regenerating', healPerRound: 5 },
  Shapeshifter:  { hpMul: 1.0, atkMul: 1.0, defMul: 1.0, tag: 'Shapeshifter', mimicTeam: true },
  Ancient:       { hpMul: 2.0, atkMul: 2.0, defMul: 2.0, tag: 'Ancient', guaranteedRareDrop: true },
};

// Exclusion matrix: pairs that cannot coexist
const EXCLUSIONS = [
  ['Ethereal', 'Armored'],
  ['Swift', 'Giant'],
  ['Ancient', 'Cookie-Cursed'],
];

const MUTATION_NAMES = Object.keys(MUTATIONS);

const BOSS_ABILITIES = [
  { name: 'Summon Minions', type: 'summon', description: 'Calls forth lesser creatures to fight alongside it.' },
  { name: 'Devastating Sweep', type: 'aoe', description: 'Attacks all party members at once for reduced damage.' },
  { name: 'Phase Shift', type: 'phase', description: 'Becomes invulnerable for one round, then strikes with doubled power.' },
  { name: 'Dark Curse', type: 'curse', description: 'Reduces all party stats by 2 for 3 rounds.' },
];

/**
 * Generate an enemy for a dungeon room.
 * @param {object} options
 * @param {string} options.biome - Biome id
 * @param {number} options.level - Dungeon level
 * @param {object} options.rng - RNG instance
 * @param {boolean} [options.isBoss=false]
 * @param {Set<string>} [options.usedNames] - Track name collisions
 * @returns {object} Enemy descriptor
 */
export function generateEnemy({ biome, level, rng, isBoss = false, usedNames }) {
  const monsters = loadMonsters();
  const pool = monsters[biome] || monsters.cave;

  // Pick a template
  const template = pool[rng.int(0, pool.length - 1)];

  // Stat scaling: hp*(1+level*0.15), atk*(1+level*0.13), def*(1+level*0.10)
  let hp  = Math.round(template.base_hp  * (1 + level * 0.15));
  let atk = Math.round(template.base_atk * (1 + level * 0.13));
  let def = Math.round(template.base_def * (1 + level * 0.07));

  // Mutations: 0-3 for normal, 3-5 for boss
  const mutationCount = isBoss ? rng.int(3, 5) : rng.int(0, 2);
  const mutations = pickMutations(rng, mutationCount);

  // Apply mutation stat multipliers
  for (const mut of mutations) {
    const m = MUTATIONS[mut];
    hp  = Math.round(hp * m.hpMul);
    atk = Math.round(atk * m.atkMul);
    def = Math.round(def * m.defMul);
  }

  // Boss: x3 stats
  if (isBoss) {
    hp *= 3;
    atk = Math.round(atk * 1.8);
    def = Math.round(def * 1.5);
  }

  // Build name: [mutations] + [template]
  const mutPrefix = mutations.length > 0 ? mutations.join(' ') + ' ' : '';
  let name = mutPrefix + template.name;

  // Name collision handling
  if (usedNames) {
    if (usedNames.has(name)) {
      let counter = 2;
      while (usedNames.has(`${name} ${counter}`)) counter++;
      name = `${name} ${counter}`;
    }
    usedNames.add(name);
  }

  // Build ASCII art from template parts + mutation transforms
  const ascii = buildEnemyAscii(template.ascii_parts, mutations, rng.int(0, 999999));

  // Mutation properties
  const properties = {};
  for (const mut of mutations) {
    const m = MUTATIONS[mut];
    if (m.goesFirst) properties.goesFirst = true;
    if (m.dot) properties.dot = (properties.dot || 0) + m.dot;
    if (m.dodgeChance) properties.dodgeChance = m.dodgeChance;
    if (m.stealCrumbs) properties.stealCrumbs = true;
    if (m.healPerRound) properties.healPerRound = (properties.healPerRound || 0) + m.healPerRound;
    if (m.mimicTeam) properties.mimicTeam = true;
    if (m.guaranteedRareDrop) properties.guaranteedRareDrop = true;
  }

  // Boss ability
  let bossAbility = null;
  if (isBoss) {
    bossAbility = BOSS_ABILITIES[rng.int(0, BOSS_ABILITIES.length - 1)];
  }

  // Drop calculation
  const dropChance = Math.min(1.0, 0.3 + mutations.length * 0.15);
  const lootQuality = level + mutations.length * 3;

  // Loot rarity floor for bosses
  const minRarity = isBoss ? 'Rare' : (properties.guaranteedRareDrop ? 'Rare' : null);

  const spd = Math.max(1, 5 + rng.int(-2, 2) + (properties.goesFirst ? 10 : 0));

  return {
    id: rng.int(100000, 999999),
    name,
    templateName: template.name,
    biome,
    level,
    isBoss,
    stats: { hp, atk, def, spd },
    maxHp: hp,
    currentHp: hp,
    mutations,
    properties,
    bossAbility,
    ascii,
    dropChance,
    lootQuality,
    minRarity,
    alive: true,
  };
}

/**
 * Pick N mutations respecting exclusion matrix.
 */
function pickMutations(rng, count) {
  const picked = [];
  const available = [...MUTATION_NAMES];

  for (let i = 0; i < count && available.length > 0; i++) {
    const idx = rng.int(0, available.length - 1);
    const mut = available[idx];

    // Check exclusions against already picked
    const excluded = EXCLUSIONS.some(([a, b]) =>
      (mut === a && picked.includes(b)) || (mut === b && picked.includes(a))
    );

    if (excluded) {
      available.splice(idx, 1);
      i--; // retry
      continue;
    }

    picked.push(mut);
    available.splice(idx, 1);

    // Remove all exclusion partners from available
    for (const [a, b] of EXCLUSIONS) {
      if (mut === a) {
        const bi = available.indexOf(b);
        if (bi !== -1) available.splice(bi, 1);
      } else if (mut === b) {
        const ai = available.indexOf(a);
        if (ai !== -1) available.splice(ai, 1);
      }
    }
  }

  return picked;
}

/**
 * Build enemy ASCII art from parts + mutations.
 * Includes procedural per-instance variation via seed.
 * Max 7 lines x 30 chars.
 */
function buildEnemyAscii(parts, mutations, seed = 0) {
  let lines = [
    ...(parts.head || []),
    ...(parts.body || []),
    ...(parts.legs || []),
  ];

  // Procedural variation: subtle per-instance modifications
  if (seed > 0) {
    let s = seed;
    function next() { s = (s * 16807 + 12345) & 0x7fffffff; return s; }

    // 30% chance: swap a random non-space char for a thematic variant
    if (next() % 100 < 30) {
      const charSwaps = { '/': '\\', '|': '!', '-': '=', 'o': 'O', '.': '*', '#': '+', '~': '^' };
      const lineIdx = next() % lines.length;
      const line = lines[lineIdx];
      const swapable = Object.keys(charSwaps);
      for (let i = 0; i < line.length; i++) {
        if (swapable.includes(line[i]) && next() % 100 < 15) {
          lines[lineIdx] = line.substring(0, i) + charSwaps[line[i]] + line.substring(i + 1);
          break;
        }
      }
    }

    // 20% chance: add a small accent mark
    if (next() % 100 < 20) {
      const accents = ["'", '`', ',', '.', '*', '+'];
      const accent = accents[next() % accents.length];
      const targetLine = next() % lines.length;
      const pos = lines[targetLine].lastIndexOf(' ');
      if (pos > 0 && pos < lines[targetLine].length - 1) {
        lines[targetLine] = lines[targetLine].substring(0, pos) + accent + lines[targetLine].substring(pos + 1);
      }
    }
  }

  for (const mut of mutations) {
    switch (mut) {
      case 'Giant':
        lines = lines.map(l => l.split('').map(c => c + c).join(''));
        break;
      case 'Armored':
        lines = lines.map(l => '[#]' + l + '[#]');
        break;
      case 'Swift':
        lines = lines.map(l => '>>' + l);
        break;
      case 'Venomous':
        lines.push(' ~~ ~~ ~~ ');
        break;
      case 'Ethereal':
        lines = lines.map(l => l.replace(/[^\s]/g, '.'));
        break;
      case 'Enraged':
        lines[0] = '!!! ' + lines[0] + ' !!!';
        lines.push('  !!!!!!!!!');
        break;
      case 'Cookie-Cursed':
        lines.push(' (::)(::)(::)');
        break;
      case 'Regenerating':
        lines.push('  +++ +++');
        break;
      case 'Shapeshifter':
        lines = lines.map(l => '?' + l.slice(1));
        lines.push('  ~shape~shift~');
        break;
      case 'Ancient':
        lines[0] = '*** ' + lines[0] + ' ***';
        lines.push('  === ANCIENT ===');
        break;
    }
  }

  // Enforce bounds
  return lines.slice(0, 7).map(l => l.substring(0, 30));
}

/**
 * Generate enemies for a room.
 * @param {object} options
 * @param {string} options.biome
 * @param {number} options.level
 * @param {object} options.rng
 * @param {string} options.roomType - 'monster' or 'boss'
 * @returns {object[]} Array of enemies
 */
export function generateRoomEnemies({ biome, level, rng, roomType }) {
  const usedNames = new Set();
  const enemies = [];

  if (roomType === 'boss') {
    enemies.push(generateEnemy({ biome, level, rng, isBoss: true, usedNames }));
  } else {
    // 1-3 enemies based on level
    const count = Math.min(3, 1 + Math.floor(level / 7));
    for (let i = 0; i < count; i++) {
      enemies.push(generateEnemy({ biome, level, rng, isBoss: false, usedNames }));
    }
  }

  return enemies;
}

/**
 * Balance simulation: run N simulated fights to check win rate.
 * Adjusts enemy stats if win rate is outside 0.65-0.85 range.
 * @param {object} options
 * @param {object[]} options.enemies - Enemies to test
 * @param {number} [options.iterations=500]
 * @param {number} [options.seed=42]
 * @returns {{ winRate: number, adjustments: number }}
 */
export function balanceSimulation({ enemies, iterations = 500, seed = 42 }) {
  const MAX_ADJUSTMENTS = 5;
  let adjustments = 0;

  // Create an average team for simulation
  function makeAverageTeam(simRng) {
    return [
      { id: 1, name: 'Sim-War', stats: { hp: 7, atk: 8, def: 7, spd: 5, lck: 4 }, maxHp: 28, currentHp: 28, side: 'team' },
      { id: 2, name: 'Sim-Mage', stats: { hp: 4, atk: 8, def: 4, spd: 6, lck: 7 }, maxHp: 16, currentHp: 16, side: 'team' },
      { id: 3, name: 'Sim-Heal', stats: { hp: 6, atk: 4, def: 6, spd: 5, lck: 8 }, maxHp: 24, currentHp: 24, side: 'team' },
    ];
  }

  for (let adj = 0; adj < MAX_ADJUSTMENTS; adj++) {
    let wins = 0;
    const simRng = createRNG(seed + adj * 1000);

    for (let i = 0; i < iterations; i++) {
      const team = makeAverageTeam(simRng);
      const enemyClones = enemies.map(e => ({
        ...e,
        stats: { ...e.stats },
        currentHp: e.maxHp,
        side: 'enemy',
      }));

      const combat = createCombat({ team, enemies: enemyClones, rng: simRng });

      let turns = 0;
      while (!combat.isFinished && turns < 100) {
        combat.autoAttack();
        turns++;
      }

      if (combat.isFinished) {
        const teamAlive = combat.combatants.some(c => c.side === 'team' && c.currentHp > 0);
        if (teamAlive) wins++;
      }
    }

    const winRate = wins / iterations;

    if (winRate >= 0.65 && winRate <= 0.85) {
      return { winRate, adjustments };
    }

    // Adjust: if win rate too high, buff enemies; if too low, nerf them
    adjustments++;
    const scale = winRate > 0.85 ? 1.1 : 0.9;
    for (const e of enemies) {
      e.stats.hp = Math.round(e.stats.hp * scale);
      e.maxHp = e.stats.hp;
      e.currentHp = e.maxHp;
      e.stats.atk = Math.round(e.stats.atk * scale);
    }
  }

  // Return best effort
  return { winRate: -1, adjustments };
}
