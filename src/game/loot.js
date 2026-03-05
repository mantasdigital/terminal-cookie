/**
 * Procedural loot generation — slots, prefixes, suffixes, rarity, power scaling.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOOT_PATH = join(__dirname, '..', '..', 'data', 'loot-tables.json');

let lootData = null;
function loadLootData() {
  if (!lootData) lootData = JSON.parse(readFileSync(LOOT_PATH, 'utf8'));
  return lootData;
}

const SLOTS = ['weapon', 'armor', 'accessory', 'consumable'];

let nextItemId = 1;

/**
 * Generate a loot item.
 * @param {object} options
 * @param {number} options.level - Dungeon level
 * @param {object} options.rng - RNG instance
 * @param {string} [options.slot] - Force a slot; random if omitted
 * @param {string} [options.minRarity] - Minimum rarity name (for boss drops)
 * @param {number} [options.qualityBonus=0] - Bonus to quality (from mutations etc.)
 * @param {Set<string>} [options.usedSignatures] - Track duplicates in this dungeon
 * @returns {object|null} Loot item, or null if duplicate couldn't be avoided
 */
export function generateLoot({ level, rng, slot, minRarity, qualityBonus = 0, usedSignatures, _depth = 0 }) {
  const data = loadLootData();

  // Pick slot
  const itemSlot = slot || SLOTS[rng.int(0, SLOTS.length - 1)];
  const bases = data.bases[itemSlot];
  if (!bases || bases.length === 0) return null;

  // Pick base item
  const base = bases[rng.int(0, bases.length - 1)];

  // Pick rarity (weighted, with optional floor)
  const rarity = pickRarity(data.rarities, rng, minRarity);

  // Pick prefix (level-gated)
  const eligiblePrefixes = data.prefixes.filter(p => p.min_level <= level);
  const prefix = eligiblePrefixes.length > 0
    ? eligiblePrefixes[rng.int(0, eligiblePrefixes.length - 1)]
    : data.prefixes[0];

  // Pick suffix (50% chance, always for Rare+)
  const rarityIdx = data.rarities.findIndex(r => r.name === rarity.name);
  const hasSuffix = rarityIdx >= 2 || rng.chance(0.5);
  const suffix = hasSuffix
    ? data.suffixes[rng.int(0, data.suffixes.length - 1)]
    : null;

  // Power calculation: base * (1 + level*0.08) * rarity_multiplier + prefix_bonus + suffix_bonus
  const basePower = base.base_power * (1 + level * 0.08) * rarity.multiplier;
  const prefixBonus = prefix.power_bonus;
  const suffixBonus = suffix ? suffix.bonus : 0;
  const power = Math.round(basePower + prefixBonus + suffixBonus + qualityBonus);

  // Build name
  const suffixName = suffix ? ` ${suffix.name}` : '';
  const name = `${prefix.name} ${base.name}${suffixName}`;

  // Signature for duplicate detection
  const signature = `${name}|${power}|${itemSlot}`;
  if (usedSignatures) {
    if (usedSignatures.has(signature)) {
      // Try once more with different picks, but cap recursion depth
      if (_depth >= 5) return null;
      return generateLoot({ level, rng, slot: itemSlot, minRarity: minRarity, qualityBonus, usedSignatures, _depth: _depth + 1 });
    }
    usedSignatures.add(signature);
  }

  // Required level
  const requiredLevel = Math.floor(level * 0.8);

  // Sell value in crumbs
  const value = Math.max(1, Math.round(power * rarity.multiplier * 2));

  // Stat bonus
  const statBonus = {};
  statBonus[base.stat] = Math.max(1, Math.round(power / 3));
  if (suffix) {
    statBonus[suffix.stat] = (statBonus[suffix.stat] || 0) + suffix.bonus;
  }

  const item = {
    id: nextItemId++,
    name,
    slot: itemSlot,
    base: base.name,
    prefix: prefix.name,
    suffix: suffix ? suffix.name : null,
    rarity: rarity.name,
    rarityColor: rarity.color,
    power,
    statBonus,
    requiredLevel,
    value,
    level,
    effect: base.effect || null,
    crumbBonus: suffix?.crumb_bonus || 0,
  };

  return item;
}

/**
 * Pick a rarity with optional minimum floor.
 */
function pickRarity(rarities, rng, minRarity) {
  let pool = rarities;
  if (minRarity) {
    const minIdx = rarities.findIndex(r => r.name === minRarity);
    if (minIdx > 0) {
      pool = rarities.slice(minIdx);
    }
  }
  const table = pool.map(r => ({ item: r, weight: r.weight }));
  return rng.weightedPick(table);
}

/**
 * Generate loot drops for an enemy.
 * @param {object} options
 * @param {object} options.enemy - Enemy with dropChance, lootQuality, minRarity
 * @param {number} options.level - Dungeon level
 * @param {object} options.rng
 * @param {Set<string>} [options.usedSignatures]
 * @returns {object[]} Array of loot items
 */
export function generateEnemyDrops({ enemy, level, rng, usedSignatures }) {
  const drops = [];

  if (rng.chance(enemy.dropChance)) {
    const item = generateLoot({
      level,
      rng,
      minRarity: enemy.minRarity,
      qualityBonus: enemy.lootQuality,
      usedSignatures,
    });
    if (item) drops.push(item);
  }

  // Bosses get a second guaranteed drop
  if (enemy.isBoss) {
    const bonusItem = generateLoot({
      level,
      rng,
      minRarity: 'Rare',
      qualityBonus: enemy.lootQuality + 5,
      usedSignatures,
    });
    if (bonusItem) drops.push(bonusItem);
  }

  return drops;
}

/**
 * Calculate sell value for an item (for the economy system).
 * @param {object} item
 * @returns {number} Crumbs
 */
export function sellValue(item) {
  return item.value || 1;
}

/**
 * Check if a team member meets the level requirement to equip an item.
 * @param {object} member
 * @param {object} item
 * @returns {boolean}
 */
export function canEquip(member, item) {
  if (item.slot === 'consumable') return true;
  return member.level >= (item.requiredLevel || 0);
}

/**
 * Equip an item to a team member, returning the previously equipped item (if any).
 * @param {object} member
 * @param {object} item
 * @returns {object|null} Previously equipped item, or null
 */
export function equipItem(member, item) {
  if (!canEquip(member, item)) return null;

  const equipSlot = item.slot === 'consumable' ? null : item.slot;
  if (!equipSlot) return null;

  const previous = member.equipment[equipSlot];
  member.equipment[equipSlot] = item;

  // Apply stat bonuses
  if (previous) {
    for (const [stat, val] of Object.entries(previous.statBonus || {})) {
      if (member.stats[stat] !== undefined) {
        member.stats[stat] -= val;
      }
    }
  }
  for (const [stat, val] of Object.entries(item.statBonus || {})) {
    if (member.stats[stat] !== undefined) {
      member.stats[stat] += val;
    }
  }

  return previous;
}
