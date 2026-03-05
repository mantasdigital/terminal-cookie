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
  ['empty',   30, 5],
  ['monster', 25, 35],
  ['trap',    15, 25],
  ['loot',    15, 10],
  ['shrine',  10, 5],
  ['npc',     10, 15],
  ['boss',    5,  20],
];

const MAX_ROOMS = 25;
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

  // Room count: 3 + level/5, capped at MAX_ROOMS
  const roomCount = Math.min(MAX_ROOMS, 3 + Math.floor(level / 5));

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
 * Build the room tree structure.
 */
function buildRoomTree(rng, roomCount, level) {
  const weights = getRoomWeights(level);
  const rooms = [];

  // Create entrance
  rooms.push(createRoom(0, 'empty', 0));

  let nextId = 1;
  const frontier = [0]; // rooms that can still branch

  while (nextId < roomCount && frontier.length > 0) {
    const parentIdx = rng.int(0, frontier.length - 1);
    const parentId = frontier[parentIdx];
    const parent = rooms[parentId];

    // Max forks from this parent
    if (parent.connections.length >= MAX_FORKS) {
      frontier.splice(parentIdx, 1);
      continue;
    }

    // Depth check
    if (parent.depth >= MAX_DEPTH - 1) {
      frontier.splice(parentIdx, 1);
      continue;
    }

    // How many children to add from this parent this iteration
    const remaining = roomCount - nextId;
    const maxNew = Math.min(remaining, MAX_FORKS - parent.connections.length, rng.int(1, 2));

    for (let i = 0; i < maxNew && nextId < roomCount; i++) {
      const type = rng.weightedPick(weights);
      const child = createRoom(nextId, type, parent.depth + 1);
      parent.connections.push(nextId);
      rooms.push(child);

      if (child.depth < MAX_DEPTH - 1) {
        frontier.push(nextId);
      }
      nextId++;
    }
  }

  // Fill remaining if frontier ran out
  while (nextId < roomCount) {
    const type = rng.weightedPick(weights);
    const parentId = rng.int(0, rooms.length - 2);
    const child = createRoom(nextId, type, rooms[parentId].depth + 1);
    rooms[parentId].connections.push(nextId);
    rooms.push(child);
    nextId++;
  }

  // Ensure at least one boss room at deeper levels
  if (level >= 3) {
    const hasBoss = rooms.some(r => r.type === 'boss');
    if (!hasBoss) {
      // Convert the deepest non-entrance room to boss
      let deepest = rooms[rooms.length - 1];
      if (deepest.id !== 0) {
        deepest.type = 'boss';
      }
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
  boss:    ['Boss Arena', 'Grand Chamber', 'Throne Room', 'Final Stand', 'The Gauntlet'],
};

const ROOM_DESCRIPTIONS = {
  empty:   'An unremarkable room. Nothing of interest here.',
  monster: 'Something lurks in the shadows...',
  trap:    'The air feels wrong. Watch your step!',
  loot:    'Something glitters in the corner.',
  shrine:  'A warm light radiates from an ancient altar.',
  npc: 'Someone waits here... friend or foe?',
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
