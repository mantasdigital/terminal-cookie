/**
 * Random event system — triggers, resolution, intervals, AFK auto-resolve.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EVENTS_PATH = join(__dirname, '..', '..', 'data', 'events.json');

let eventsData = null;
function loadEvents() {
  if (!eventsData) eventsData = JSON.parse(readFileSync(EVENTS_PATH, 'utf8'));
  return eventsData;
}

// Minimum rooms between events to prevent spam
const MIN_EVENT_INTERVAL = 3;

/**
 * Create an event manager for a dungeon run.
 * @returns {object} Event manager
 */
export function createEventManager() {
  let roomsSinceLastEvent = MIN_EVENT_INTERVAL; // Allow first room to trigger

  const manager = {
    /**
     * Roll for a random event when entering a room.
     * @param {object} options
     * @param {string} options.biome - Current biome id
     * @param {number} options.level - Dungeon level
     * @param {object} options.rng - RNG instance
     * @param {string} options.roomType - Current room type
     * @returns {object|null} Event descriptor or null
     */
    rollEvent({ biome, level, rng, roomType }) {
      // No events in entrance or if too soon
      if (roomsSinceLastEvent < MIN_EVENT_INTERVAL) {
        roomsSinceLastEvent++;
        return null;
      }

      // Event chance increases with level, lower for safe room types
      const baseChance = roomType === 'empty' ? 0.3 : 0.15;
      const chance = Math.min(0.6, baseChance + level * 0.01);

      if (!rng.chance(chance)) {
        roomsSinceLastEvent++;
        return null;
      }

      const events = loadEvents();

      // Filter events by biome
      const eligible = events.filter(e => {
        if (e.biomes === 'all') return true;
        if (Array.isArray(e.biomes)) return e.biomes.includes(biome);
        return false;
      });

      if (eligible.length === 0) return null;

      // Weight: safe events more likely at low levels, dangerous at high
      const weighted = eligible.map(e => ({
        item: e,
        weight: eventWeight(e, level),
      }));

      const event = rng.weightedPick(weighted);
      roomsSinceLastEvent = 0;

      return {
        ...event,
        resolved: false,
      };
    },

    /**
     * Resolve an event manually (player chose an action).
     * @param {object} event - Event descriptor
     * @param {object} team - Player team array
     * @param {object} rng
     * @returns {object} Resolution result
     */
    resolveEvent(event, team, rng) {
      return resolveEventLogic(event, team, rng);
    },

    /**
     * Auto-resolve a dangerous event (AFK mode).
     * Uses average team stats to determine outcome.
     * @param {object} event
     * @param {object[]} team
     * @param {object} rng
     * @returns {object} Resolution result
     */
    autoResolve(event, team, rng) {
      return resolveEventLogic(event, team, rng);
    },

    /**
     * Check if an event is dangerous (requires player input in normal mode).
     * @param {object} event
     * @returns {boolean}
     */
    isDangerous(event) {
      return event && event.dangerLevel >= 2;
    },

    /** Reset the interval counter (e.g., on new dungeon floor). */
    resetInterval() {
      roomsSinceLastEvent = MIN_EVENT_INTERVAL;
    },
  };

  return manager;
}

/**
 * Calculate event weight based on level.
 */
function eventWeight(event, level) {
  const danger = event.dangerLevel || 0;
  if (danger === 0) {
    // Beneficial: more common at low levels
    return Math.max(1, 10 - level * 0.3);
  }
  if (danger >= 2) {
    // Dangerous: more common at high levels
    return Math.max(1, 3 + level * 0.5);
  }
  // Neutral
  return 5;
}

/**
 * Core event resolution logic.
 */
function resolveEventLogic(event, team, rng) {
  const effect = event.effect;
  if (!effect) return { success: true, message: event.description };

  const action = effect.action;
  const result = { eventId: event.id, eventName: event.name, action };

  switch (action) {
    case 'heal': {
      const amount = effect.amount || 20;
      for (const member of team) {
        if (member.alive && member.currentHp > 0) {
          member.currentHp = Math.min(member.maxHp, member.currentHp + amount);
        }
      }
      result.success = true;
      result.message = `Your team is healed for ${amount} HP each!`;
      break;
    }

    case 'full_heal': {
      for (const member of team) {
        if (member.alive) {
          member.currentHp = member.maxHp;
        }
      }
      result.success = true;
      result.message = 'Your entire team is fully healed!';
      break;
    }

    case 'buff': {
      const stat = effect.stat;
      const bonus = effect.bonus || 3;
      const duration = effect.duration || 3;
      for (const member of team) {
        if (stat === 'all') {
          for (const s of ['hp', 'atk', 'def', 'spd', 'lck']) {
            member.stats[s] += bonus;
          }
        } else if (member.stats[stat] !== undefined) {
          member.stats[stat] += bonus;
        }
      }
      result.success = true;
      result.message = `Your team receives +${bonus} to ${stat === 'all' ? 'all stats' : stat} for ${duration} rooms!`;
      result.buff = { stat, bonus, duration };
      break;
    }

    case 'debuff': {
      const stat = effect.stat;
      const penalty = effect.penalty || 3;
      const duration = effect.duration || 3;
      for (const member of team) {
        if (member.stats[stat] !== undefined) {
          member.stats[stat] = Math.max(1, member.stats[stat] - penalty);
        }
      }
      result.success = true;
      result.message = `A curse weakens your team: -${penalty} ${stat} for ${duration} rooms.`;
      result.debuff = { stat, penalty, duration };
      break;
    }

    case 'skill_check': {
      const stat = effect.stat || 'spd';
      // Average team stat
      const aliveTeam = team.filter(m => m.alive && m.currentHp > 0);
      const avgStat = aliveTeam.length > 0
        ? aliveTeam.reduce((sum, m) => sum + (m.stats[stat] || 5), 0) / aliveTeam.length
        : 5;
      const roll = rng.roll(20);
      const modifier = Math.floor(avgStat / 4);
      const success = (roll + modifier) >= 10;

      if (success) {
        result.success = true;
        result.message = effect.successText || 'You passed the check!';
      } else {
        const damage = effect.failDamage || 10;
        for (const member of aliveTeam) {
          member.currentHp = Math.max(0, member.currentHp - damage);
          if (member.currentHp <= 0) member.alive = false;
        }
        result.success = false;
        result.message = `Failed! Your team takes ${damage} damage each.`;
      }
      result.roll = roll;
      result.modifier = modifier;
      break;
    }

    case 'grant_loot': {
      result.success = true;
      result.lootRolls = effect.rolls || 1;
      result.message = `You found a hidden cache! Roll ${result.lootRolls} loot item(s).`;
      break;
    }

    case 'grant_crumbs': {
      const multiplier = effect.multiplier || 1;
      const amount = Math.round(10 * multiplier);
      result.success = true;
      result.crumbs = amount;
      result.message = `You collect ${amount} crumbs!`;
      break;
    }

    case 'shop': {
      result.success = true;
      result.isShop = true;
      result.priceMultiplier = effect.priceMultiplier || 1.5;
      result.message = 'A merchant offers their wares at dungeon prices.';
      break;
    }

    case 'extra_combat': {
      result.success = true;
      result.triggerCombat = true;
      result.enemyCount = effect.enemyCount || 1;
      result.message = event.description;
      break;
    }

    case 'add_enemies': {
      result.success = true;
      result.addEnemies = effect.extraEnemies || 1;
      result.message = event.description;
      break;
    }

    case 'shuffle_rooms': {
      result.success = true;
      result.shuffleRooms = true;
      result.message = 'The dungeon shifts around you! Some paths have changed.';
      break;
    }

    case 'random_gift_or_curse': {
      const isGift = rng.chance(effect.giftChance || 0.5);
      if (isGift) {
        result.success = true;
        result.lootRolls = 1;
        result.message = 'The stranger hands you a wrapped gift. It contains treasure!';
      } else {
        const damage = 10;
        for (const member of team.filter(m => m.alive)) {
          member.currentHp = Math.max(0, member.currentHp - damage);
        }
        result.success = false;
        result.message = 'The stranger cackles and curses your party! Everyone takes 10 damage.';
      }
      break;
    }

    case 'duel': {
      const roll = rng.roll(20);
      const success = roll >= 8;
      result.success = success;
      if (success) {
        result.crumbs = effect.rewardCrumbs || 50;
        result.message = `You win the duel! Earned ${result.crumbs} crumbs.`;
      } else {
        result.message = 'You lose the duel, but walk away with your dignity... mostly.';
      }
      break;
    }

    default:
      result.success = true;
      result.message = event.description;
  }

  return result;
}

/**
 * Get all events matching a category.
 * @param {string} type - combat|environmental|beneficial|social|cookie
 * @returns {object[]}
 */
export function getEventsByType(type) {
  return loadEvents().filter(e => e.type === type);
}
