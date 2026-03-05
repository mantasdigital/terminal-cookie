/**
 * Procedural dungeon generator — tree structure, seed-based, BFS-validated.
 */

import { createRNG } from '../core/rng.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIOMES_PATH = join(__dirname, '..', '..', 'data', 'biomes.json');
const MONSTERS_PATH = join(__dirname, '..', '..', 'data', 'monsters.json');

let biomesData = null;
let monstersData = null;

function loadBiomes() {
  if (!biomesData) biomesData = JSON.parse(readFileSync(BIOMES_PATH, 'utf8'));
  return biomesData;
}

function loadMonsters() {
  if (!monstersData) monstersData = JSON.parse(readFileSync(MONSTERS_PATH, 'utf8'));
  return monstersData;
}

/** Room type weight tables: [type, baseWeight, lvl20Weight] */
const ROOM_TYPE_WEIGHTS = [
  ['empty',    20, 5],
  ['monster',  30, 35],
  ['trap',     12, 20],
  ['loot',     12, 8],
  ['shrine',    8, 4],
  ['npc',       8, 8],
  ['miniboss',  5, 12],
  ['boss',      5, 8],
];

const MAX_ROOMS = 30;
const MAX_FORKS = 3;
const MAX_DEPTH = 8;
const BIOME_IDS = ['cave', 'crypt', 'forest', 'volcano', 'abyss'];
const CURSES = ['darkness', 'poison', 'silence', 'gravity'];

/**
 * Interpolate room type weights by dungeon level.
 * Weights shift linearly from base (level 1) to cap (level 20+).
 */
function getRoomWeights(level) {
  const t = Math.min(level / 20, 1);
  return ROOM_TYPE_WEIGHTS.map(([type, base, cap]) => ({
    item: type,
    weight: base + (cap - base) * t,
  }));
}

/**
 * Generate a dungeon.
 * @param {object} options
 * @param {number} options.level - Dungeon level (1+)
 * @param {number} options.seed - RNG seed
 * @param {string} [options.biome] - Force a biome id; random if omitted
 * @returns {object} Dungeon descriptor
 */
export function generateDungeon({ level, seed, biome }) {
  const rng = createRNG(seed);
  const biomes = loadBiomes();

  // Pick biome
  const biomeId = biome || BIOME_IDS[rng.int(0, BIOME_IDS.length - 1)];
  const biomeData = biomes.find(b => b.id === biomeId) || biomes[0];

  // Room count scales with level: starts at 12, grows to MAX_ROOMS
  const roomCount = Math.min(MAX_ROOMS, 12 + Math.floor(level / 2));

  // Curses: chance increases with level, pick from biome curses or generic
  const activeCurses = [];
  const cursePool = biomeData.curses || CURSES;
  for (const c of cursePool) {
    if (rng.chance(0.1 + level * 0.02)) {
      activeCurses.push(c);
    }
  }

  // Build tree
  const rooms = buildRoomTree(rng, roomCount, level);

  // BFS validation: ensure entrance (room 0) can reach exit (last room)
  const exitId = rooms.length - 1;
  rooms[exitId].isExit = true;
  rooms[0].isEntrance = true;

  if (!bfsReachable(rooms, 0, exitId)) {
    // Force a path by chaining rooms 0..exitId
    for (let i = 0; i < exitId; i++) {
      if (!rooms[i].connections.includes(i + 1)) {
        rooms[i].connections.push(i + 1);
      }
    }
  }

  return {
    level,
    seed,
    biome: biomeId,
    biomeName: biomeData.name,
    biomeDescription: biomeData.description,
    flavorTexts: biomeData.flavorTexts,
    curses: activeCurses,
    rooms,
    currentRoom: 0,
    completed: false,
  };
}

/**
 * Build a linear room chain with occasional forks that rejoin.
 * Every room connects to the next, ensuring no dead ends.
 * Final room is boss. Minibosses placed randomly in the back half.
 * After dungeon 1, multiple minibosses appear.
 */
function buildRoomTree(rng, roomCount, level) {
  const weights = getRoomWeights(level);
  const rooms = [];

  // Create entrance
  rooms.push(createRoom(0, 'empty', 0));

  const lastIdx = roomCount - 1;

  // Build linear spine
  for (let i = 1; i < roomCount; i++) {
    let type;
    if (i === lastIdx) {
      type = 'boss';
    } else {
      type = rng.weightedPick(weights);
      // Don't allow random boss/miniboss placement here; we place them below
      if (type === 'boss' || type === 'miniboss') type = 'monster';
    }
    rooms.push(createRoom(i, type, i));
    rooms[i - 1].connections.push(i);
  }

  // Place minibosses in the back half (random positions, not fixed)
  const minibossCount = level <= 1 ? 1 : Math.min(3, 1 + Math.floor(level / 4));
  const backHalfStart = Math.floor(roomCount * 0.35);
  const candidates = [];
  for (let i = backHalfStart; i < lastIdx; i++) {
    if (rooms[i].type !== 'boss' && rooms[i].type !== 'empty') {
      candidates.push(i);
    }
  }
  // Shuffle candidates and pick up to minibossCount
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  for (let i = 0; i < Math.min(minibossCount, candidates.length); i++) {
    rooms[candidates[i]].type = 'miniboss';
    rooms[candidates[i]].name = ROOM_NAMES.miniboss[candidates[i] % ROOM_NAMES.miniboss.length];
    rooms[candidates[i]].description = ROOM_DESCRIPTIONS.miniboss;
  }

  // Scatter extra loot rooms (chests) — 1-3 per dungeon
  const lootCount = rng.int(1, Math.min(3, 1 + Math.floor(level / 3)));
  const lootCandidates = [];
  for (let i = 2; i < lastIdx; i++) {
    if (rooms[i].type === 'empty') lootCandidates.push(i);
  }
  for (let i = 0; i < Math.min(lootCount, lootCandidates.length); i++) {
    const idx = rng.int(0, lootCandidates.length - 1);
    rooms[lootCandidates[idx]].type = 'loot';
    rooms[lootCandidates[idx]].name = ROOM_NAMES.loot[lootCandidates[idx] % ROOM_NAMES.loot.length];
    rooms[lootCandidates[idx]].description = ROOM_DESCRIPTIONS.loot;
    lootCandidates.splice(idx, 1);
  }

  // Add occasional fork paths: a room can also connect to room i+2 (skip one)
  for (let i = 0; i < roomCount - 2; i++) {
    if (rng.chance(0.25) && !rooms[i].connections.includes(i + 2)) {
      rooms[i].connections.push(i + 2);
    }
  }

  return rooms;
}

const ROOM_NAMES = {
  empty:   ['Empty Chamber', 'Dusty Corridor', 'Quiet Passage', 'Crumbling Hall', 'Dim Alcove'],
  monster: ['Monster Den', 'Growling Cavern', 'Infested Room', 'Dark Lair', 'Hostile Chamber'],
  trap:    ['Trapped Hallway', 'Suspicious Room', 'Rigged Passage', 'Danger Zone', 'Booby-Trapped Hall'],
  loot:    ['Treasure Room', 'Glinting Vault', 'Hidden Cache', 'Stash Room', 'Loot Chamber'],
  shrine:  ['Ancient Shrine', 'Healing Font', 'Sacred Altar', 'Blessed Spring', 'Mystic Shrine'],
  npc: ['Stranger\'s Camp', 'Mysterious Figure', 'Wanderer\'s Rest', 'Hidden Meeting', 'Campfire Glow'],
  miniboss: ['Elite Guard Post', 'Champion\'s Hall', 'Warden\'s Chamber', 'Proving Ground', 'Inner Sanctum'],
  boss:    ['Boss Arena', 'Grand Chamber', 'Throne Room', 'Final Stand', 'The Gauntlet'],
};

const ROOM_DESCRIPTIONS = {
  empty:   'An unremarkable room. Nothing of interest here.',
  monster: 'Something lurks in the shadows...',
  trap:    'The air feels wrong. Watch your step!',
  loot:    'Something glitters in the corner.',
  shrine:  'A warm light radiates from an ancient altar.',
  npc: 'Someone waits here... friend or foe?',
  miniboss: 'A powerful creature guards this passage. Prepare yourself!',
  boss:    'A massive chamber. The ground trembles beneath you.',
};

function createRoom(id, type, depth) {
  const names = ROOM_NAMES[type] || ROOM_NAMES.empty;
  const name = names[id % names.length];
  return {
    id,
    type,
    depth,
    name,
    description: ROOM_DESCRIPTIONS[type] || ROOM_DESCRIPTIONS.empty,
    connections: [],
    visited: false,
    cleared: false,
    isEntrance: false,
    isExit: false,
    loot: [],
    enemies: [],
    event: null,
  };
}

/**
 * BFS reachability check.
 */
function bfsReachable(rooms, startId, targetId) {
  const visited = new Set();
  const queue = [startId];
  visited.add(startId);

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === targetId) return true;
    for (const next of rooms[current].connections) {
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}

/**
 * Get available moves from the current room.
 * @param {object} dungeon
 * @returns {number[]} Room ids reachable from current
 */
export function getAvailableMoves(dungeon) {
  const room = dungeon.rooms[dungeon.currentRoom];
  return room ? room.connections : [];
}

/**
 * Move to a connected room.
 * @param {object} dungeon
 * @param {number} roomId
 * @returns {boolean} Whether the move succeeded
 */
export function moveToRoom(dungeon, roomId) {
  const current = dungeon.rooms[dungeon.currentRoom];
  if (!current || !current.connections.includes(roomId)) return false;
  dungeon.currentRoom = roomId;
  dungeon.rooms[roomId].visited = true;
  if (dungeon.rooms[roomId].isExit && dungeon.rooms[roomId].cleared) {
    dungeon.completed = true;
  }
  return true;
}

/**
 * Mark the current room as cleared and remove its content so the player can move on.
 * @param {object} dungeon
 */
export function clearRoom(dungeon) {
  const room = dungeon.rooms[dungeon.currentRoom];
  if (room) {
    room.cleared = true;
    room.content = null;
    room.enemy = null;
    room.enemies = [];
    room.loot = [];
    room.event = null;
  }
}

/**
 * Get a random flavor text for the current biome.
 * @param {object} dungeon
 * @param {object} rng
 * @returns {string}
 */
export function getFlavorText(dungeon, rng) {
  const texts = dungeon.flavorTexts || [];
  if (texts.length === 0) return '';
  return texts[rng.int(0, texts.length - 1)];
}
