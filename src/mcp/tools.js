// src/mcp/tools.js — MCP tool definitions with strict schemas

import { masterCookie, miniCookie, trashCookie, explodeCookie, titleScreen, rollBar } from '../ui/ascii.js';
import { createRedactor } from '../security/redactor.js';
import { classifyPrompt } from '../prompts/classifier.js';
import { generateTavernRoster } from '../game/team.js';
import { equipItem, canEquip } from '../game/loot.js';
import { generateDungeon } from '../game/dungeon.js';
import { COOKIE_REACTIONS } from './reactions.js';
import { loadLeaderboard, formatLeaderboardFull } from '../leaderboard/leaderboard.js';
import { loadLocalScores, generateSubmissionFile } from '../leaderboard/submit.js';
import { formatCrumbs } from '../ui/format.js';
import { createStoryManager } from '../game/story.js';
import { getTalismanBonuses, getUpgradeCost, canUpgrade, upgradeTalisman, getMaxLevel, formatTalismanInfo } from '../game/talisman.js';
import {
  isVillageUnlocked, canUnlockVillage, unlockVillage, canBuildOrUpgrade,
  upgradeBuilding, getBuildingIds, getBuildingDefs, getBuildingLevel,
  getVillageBonuses, formatVillageInfo,
} from '../game/village.js';

const redactor = createRedactor();

/**
 * All tool definitions for the MCP server.
 * Each tool has: name, description, inputSchema, handler(params, context)
 * @param {object} [options]
 * @param {object} [options.scanner] - Shared scanner instance (avoids duplicate rule loading)
 */
export function defineTools(options = {}) {
  const scanner = options.scanner || null;
  return [
    {
      name: 'cookie_click',
      description: 'Power-click the cookie for bonus crumbs. Note: crumbs are already earned automatically on every interaction — this is an extra deliberate click for a bigger reward.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      handler(params, ctx) {
        const { engine, cookie, scores, settings, sessions } = ctx;
        const state = engine.getStateRef();

        // Power click adds 2x extra on top of the auto-click that already happened
        // in server.js (which gave 1x). Total = 3x the normal click rate.
        const rate = cookie.currentRate();
        const powerBonus = Math.floor(rate * 2);
        state.crumbs += powerBonus;
        state.stats.crumbsEarned = (state.stats.crumbsEarned || 0) + powerBonus;

        const bonuses = settings.getBonuses();
        const settingsBonus = Math.floor(powerBonus * (bonuses.crumbMultiplier - 1));
        const sessionMultiplier = sessions ? sessions.multiplier() : 1.0;
        const sessionBonus = Math.floor(powerBonus * (sessionMultiplier - 1));
        const total = powerBonus + settingsBonus + sessionBonus;

        state.crumbs += settingsBonus + sessionBonus;
        scores.recordClick(total);
        scores.setMax('highest_crumbs', state.crumbs);

        const pick = COOKIE_REACTIONS[
          Math.abs(Date.now() + cookie.sessionClicks) % COOKIE_REACTIONS.length
        ];

        return {
          content: [{ type: 'text', text: `+${total} crumbs | Total: ${formatCrumbs(cookie.crumbs)} | ${pick}` }],
        };
      },
    },

    {
      name: 'cookie_trash',
      description: 'Reject or destroy a cookie. For when you want to watch the world burn.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      handler(params, ctx) {
        return {
          content: [{ type: 'text', text: 'Cookie destroyed. 0 crumbs.' }],
        };
      },
    },

    {
      name: 'cookie_status',
      description: 'View your team, crumbs, dungeon state, and active settings.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      handler(params, ctx) {
        const { engine } = ctx;
        const state = engine.getState();
        const team = (state.team || []).map(m => `${m.name} Lv${m.level} ${m.currentHp}/${m.maxHp}`).join(', ') || 'none';
        const dg = state.dungeonProgress ? `L${state.dungeonProgress.level} R${state.dungeonProgress.currentRoom}` : 'none';
        const mods = (state.skillModifiers || []).map(m => `${m.stat}${m.amount>0?'+':''}${m.amount}`).join(',');
        const storyInfo = mods ? ` | Mods:${mods}` : '';
        const npcInfo = state.activeNPC ? ` | NPC:${state.activeNPC.name}` : '';
        return {
          content: [{ type: 'text', text: `${formatCrumbs(state.crumbs)}crumbs | Team: ${team} | Inv:${(state.inventory||[]).length} | Dng:${dg}${storyInfo}${npcInfo}` }],
        };
      },
    },

    {
      name: 'cookie_explore',
      description: 'Send your team into a dungeon. Requires a living team.',
      inputSchema: {
        type: 'object',
        properties: {
          dungeon_level: {
            type: 'number',
            description: 'Dungeon difficulty level (1+)',
            minimum: 1,
          },
        },
        required: ['dungeon_level'],
        additionalProperties: false,
      },
      handler(params, ctx) {
        const { engine } = ctx;
        const state = engine.getStateRef();

        if (!state.team || state.team.length === 0) {
          return {
            content: [{ type: 'text', text: 'Error: No team members. Recruit at the tavern first.' }],
            isError: true,
          };
        }

        const aliveMembers = state.team.filter(m => m.alive);
        if (aliveMembers.length === 0) {
          return {
            content: [{ type: 'text', text: 'Error: All team members are dead. Visit the tavern to recruit more.' }],
            isError: true,
          };
        }

        const level = params.dungeon_level;
        const seed = state.seed || Date.now();

        // Generate a full dungeon with rooms, biome, connections
        const dungeon = generateDungeon({ level, seed: seed + (state.stats.runs || 0) });
        dungeon.roomsCleared = 0;
        dungeon.started = new Date().toISOString();

        // Set as active dungeon
        state.dungeonProgress = dungeon;

        const totalRooms = dungeon.rooms.length;
        const lore = dungeon.biomeDescription || '';
        return {
          content: [{ type: 'text', text: `Dungeon L${level} ${dungeon.biomeName} ${totalRooms}rooms | Team:${aliveMembers.length} | Auto-advancing${lore ? ' | ' + lore : ''}` }],
        };
      },
    },

    {
      name: 'cookie_roll',
      description: 'Roll a d20. In MCP mode, this is an auto-roll (no timing mechanic).',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      handler(params, ctx) {
        const { engine } = ctx;
        const rng = engine.rng;
        const rawRoll = rng.roll();
        const state = engine.getState();

        // Determine stat modifier from first alive team member
        let stat = 5;
        if (state.team) {
          const alive = state.team.find(m => m.alive);
          if (alive) stat = alive.stats?.lck ?? 5;
        }

        const modifier = Math.floor(stat / 4);
        const modified = Math.min(rawRoll + modifier, 20);
        const crit = rawRoll === 20;
        const fumble = rawRoll === 1;

        const cLabel = crit ? 'CRIT!' : fumble ? 'FUMBLE!' : '';
        return {
          content: [{ type: 'text', text: `Roll:${rawRoll}+${modifier}=${modified} ${cLabel}` }],
        };
      },
    },

    {
      name: 'cookie_inventory',
      description: 'View your loot and equipped items with stats.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      handler(params, ctx) {
        const { engine } = ctx;
        const state = engine.getState();
        const inventory = state.inventory || [];

        if (inventory.length === 0) {
          return { content: [{ type: 'text', text: 'Inventory: empty' }] };
        }
        const items = inventory.map((item, i) => `${i+1}.${item.name||'?'}[${(item.rarity||'?')[0]}]`).join(' ');
        return { content: [{ type: 'text', text: `Inv(${inventory.length}): ${items}` }] };
      },
    },

    {
      name: 'cookie_save',
      description: 'Save the current game to a slot.',
      inputSchema: {
        type: 'object',
        properties: {
          slot: {
            type: 'number',
            description: 'Save slot (1-3)',
            minimum: 1,
            maximum: 3,
          },
        },
        required: ['slot'],
        additionalProperties: false,
      },
      async handler(params, ctx) {
        const { engine, saveState } = ctx;
        const result = saveState(params.slot, engine.getState());
        return result.success
          ? { content: [{ type: 'text', text: `Saved slot ${params.slot}` }] }
          : { content: [{ type: 'text', text: `Save failed` }], isError: true };
      },
    },

    {
      name: 'cookie_load',
      description: 'Load a previously saved game from a slot.',
      inputSchema: {
        type: 'object',
        properties: {
          slot: {
            type: 'number',
            description: 'Save slot (1-3)',
            minimum: 1,
            maximum: 3,
          },
        },
        required: ['slot'],
        additionalProperties: false,
      },
      async handler(params, ctx) {
        const { loadState } = ctx;
        const result = loadState(params.slot);
        if (result.success) {
          const d = result.data;
          return { content: [{ type: 'text', text: `Loaded slot ${params.slot} | ${d.crumbs}crumbs ${(d.team||[]).length}team ${(d.inventory||[]).length}items` }] };
        }
        return { content: [{ type: 'text', text: 'Load failed' }], isError: true };
      },
    },

    {
      name: 'cookie_scores',
      description: 'View high scores and persistent stats across all playthroughs.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      handler(params, ctx) {
        return { content: [{ type: 'text', text: ctx.scores.formatDisplay() }] };
      },
    },

    {
      name: 'cookie_respond',
      description: 'Respond to an AI prompt. Submit your answer to earn bonus crumbs.',
      inputSchema: {
        type: 'object',
        properties: {
          prompt_id: {
            type: 'string',
            description: 'The ID of the prompt to respond to',
          },
          response_type: {
            type: 'string',
            description: 'Type of response (text, choice, number, boolean)',
            enum: ['text', 'choice', 'number', 'boolean'],
          },
          value: {
            description: 'The response value',
          },
        },
        required: ['prompt_id', 'response_type', 'value'],
        additionalProperties: false,
      },
      handler(params, ctx) {
        const { engine, scores } = ctx;
        const state = engine.getStateRef();
        const crumbReward = 5;
        state.crumbs = (state.crumbs || 0) + crumbReward;
        scores.increment('total_crumbs_earned', crumbReward);
        return { content: [{ type: 'text', text: `+${crumbReward} crumbs | Total: ${formatCrumbs(state.crumbs)}` }] };
      },
    },

    {
      name: 'security_scan',
      description: 'Scan text content for security risks. Detects hardcoded secrets, obfuscated code, data exfiltration patterns, and more.',
      inputSchema: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description: 'The text/code to scan for security risks',
          },
        },
        required: ['code'],
        additionalProperties: false,
      },
      handler(params, ctx) {
        const { scores } = ctx;
        if (!scanner) {
          return { content: [{ type: 'text', text: 'Scanner not available' }], isError: true };
        }
        const result = scanner.scan(params.code);

        if (result.findings.length > 0) {
          scores.increment('threats_detected', result.findings.length);
        }

        if (result.findings.length === 0) {
          return { content: [{ type: 'text', text: `Scan clean. Risk:${result.highest_risk}` }] };
        }
        const findings = result.findings.map(f => `[${f.risk_level}]${f.rule_id}`).join(' ');
        return { content: [{ type: 'text', text: `${result.findings.length} issues: ${findings} | Risk:${result.highest_risk}` }] };
      },
    },

    {
      name: 'vault_store',
      description: 'Store sensitive data in the encrypted vault.',
      inputSchema: {
        type: 'object',
        properties: {
          label: {
            type: 'string',
            description: 'Label for the stored entry',
          },
          value: {
            type: 'string',
            description: 'The sensitive value to store',
          },
          type: {
            type: 'string',
            description: 'Type of data',
            enum: ['api_key', 'email', 'password', 'custom'],
          },
        },
        required: ['label', 'value', 'type'],
        additionalProperties: false,
      },
      handler(params, ctx) {
        const { vault } = ctx;
        if (!vault || !vault.isUnlocked()) return { content: [{ type: 'text', text: 'Vault locked' }], isError: true };
        try {
          vault.store(params.label, params.value, params.type);
          return { content: [{ type: 'text', text: `Stored "${params.label}"` }] };
        } catch (err) {
          return { content: [{ type: 'text', text: 'Store failed' }], isError: true };
        }
      },
    },

    {
      name: 'vault_retrieve',
      description: 'Retrieve data from the encrypted vault. Returns a redacted preview.',
      inputSchema: {
        type: 'object',
        properties: {
          label: {
            type: 'string',
            description: 'Label of the entry to retrieve',
          },
        },
        required: ['label'],
        additionalProperties: false,
      },
      handler(params, ctx) {
        const { vault } = ctx;
        if (!vault || !vault.isUnlocked()) return { content: [{ type: 'text', text: 'Vault locked' }], isError: true };
        try {
          const entry = vault.retrieve(params.label);
          if (!entry) return { content: [{ type: 'text', text: 'Not found' }], isError: true };
          return { content: [{ type: 'text', text: `${entry.label}(${entry.type}): ${redactor.redact(entry.value)}` }] };
        } catch (err) {
          return { content: [{ type: 'text', text: 'Retrieve failed' }], isError: true };
        }
      },
    },

    {
      name: 'cookie_intercept',
      description: 'Send your prompt text through the cookie filter. Get a cookie-themed version back and earn crumbs based on prompt complexity.',
      inputSchema: {
        type: 'object',
        properties: {
          prompt_text: {
            type: 'string',
            description: 'The prompt text to cookie-ify',
          },
        },
        required: ['prompt_text'],
        additionalProperties: false,
      },
      handler(params, ctx) {
        const { engine, scores } = ctx;
        const state = engine.getStateRef();
        const text = params.prompt_text || '';

        const classification = classifyPrompt(text);
        const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
        let crumbReward = Math.max(1, Math.floor(wordCount / 5));
        if (classification.confidence > 0.7) crumbReward += 3;
        if (classification.type === 'code_review') crumbReward += 5;
        if (classification.type === 'permission') crumbReward += 2;
        state.crumbs += crumbReward;
        state.stats.crumbsEarned = (state.stats.crumbsEarned || 0) + crumbReward;
        scores.increment('total_crumbs_earned', crumbReward);
        return { content: [{ type: 'text', text: `+${crumbReward}crumbs | ${classification.type} | Total:${state.crumbs}` }] };
      },
    },

    {
      name: 'cookie_pending',
      description: 'List and resolve pending actions from passive dungeon exploration. Without params: list all. With action_id + choice: resolve one.',
      inputSchema: {
        type: 'object',
        properties: {
          action_id: {
            type: 'string',
            description: 'ID of the pending action to resolve',
          },
          choice: {
            type: 'string',
            description: 'Your choice for the pending action',
          },
        },
        additionalProperties: false,
      },
      handler(params, ctx) {
        const { engine, passiveRunner } = ctx;
        const state = engine.getStateRef();

        // Resolve mode
        if (params.action_id && params.choice) {
          if (!passiveRunner) {
            return { content: [{ type: 'text', text: 'Passive runner not available.' }], isError: true };
          }
          const result = passiveRunner.resolvePending(params.action_id, params.choice);
          if (result.error) {
            return { content: [{ type: 'text', text: `Error: ${result.error}` }], isError: true };
          }
          const lines = [`  Action resolved: ${result.result}`];
          if (result.log) {
            lines.push('', '  Combat log:', ...result.log.map(l => `    ${l}`));
          }
          return { content: [{ type: 'text', text: lines.join('\n') }] };
        }

        const pending = state.pendingActions || [];
        if (pending.length === 0) return { content: [{ type: 'text', text: 'No pending actions' }] };
        const acts = pending.map(a => `[${a.id}]${a.type}:${a.choices.join('/')}`).join(' | ');
        return { content: [{ type: 'text', text: `${pending.length} pending: ${acts}` }] };
      },
    },

    {
      name: 'cookie_dungeon_config',
      description: 'Configure passive dungeon settings: tick interval, auto-loot, auto-sell.',
      inputSchema: {
        type: 'object',
        properties: {
          tick_interval: {
            type: 'number',
            description: 'Seconds between auto room advances (5-120)',
            minimum: 5,
            maximum: 120,
          },
          auto_loot: {
            type: 'boolean',
            description: 'Automatically pick up loot',
          },
          auto_sell: {
            type: 'boolean',
            description: 'Automatically sell loot for crumbs',
          },
        },
        additionalProperties: false,
      },
      handler(params, ctx) {
        const { engine, passiveRunner } = ctx;
        const state = engine.getStateRef();

        if (!state.passiveConfig) {
          state.passiveConfig = { tickIntervalMs: 15000, autoLoot: true, autoSell: false };
        }

        if (params.tick_interval !== undefined) {
          state.passiveConfig.tickIntervalMs = params.tick_interval * 1000;
          if (passiveRunner) passiveRunner.restart();
        }
        if (params.auto_loot !== undefined) {
          state.passiveConfig.autoLoot = params.auto_loot;
        }
        if (params.auto_sell !== undefined) {
          state.passiveConfig.autoSell = params.auto_sell;
        }

        return { content: [{ type: 'text', text: `Tick:${state.passiveConfig.tickIntervalMs/1000}s Loot:${state.passiveConfig.autoLoot?'on':'off'} Sell:${state.passiveConfig.autoSell?'on':'off'}` }] };
      },
    },

    {
      name: 'cookie_tavern',
      description: 'Visit the tavern to view recruits, recruit a member, or refresh the roster.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'Action: "view" (default), "recruit", or "refresh"',
            enum: ['view', 'recruit', 'refresh'],
          },
          index: {
            type: 'number',
            description: 'Index of the recruit to hire (1-based, for recruit action)',
            minimum: 1,
          },
        },
        additionalProperties: false,
      },
      handler(params, ctx) {
        const { engine } = ctx;
        const state = engine.getStateRef();
        const rng = engine.rng;
        const action = params.action || 'view';

        // Initialize roster if needed
        if (!state._tavernRoster || state._tavernRoster.length === 0) {
          state._tavernRoster = generateTavernRoster(rng);
        }

        if (action === 'refresh') {
          state._tavernRoster = generateTavernRoster(rng);
          return { content: [{ type: 'text', text: 'Roster refreshed' }] };
        }

        if (action === 'recruit') {
          const idx = (params.index || 1) - 1;
          const roster = state._tavernRoster;
          if (idx < 0 || idx >= roster.length) return { content: [{ type: 'text', text: 'Invalid index' }], isError: true };
          const recruit = roster[idx];
          if (state.crumbs < recruit.cost) return { content: [{ type: 'text', text: `Need ${recruit.cost}, have ${state.crumbs}` }], isError: true };
          state.crumbs -= recruit.cost;
          state._lastCrumbSpend = Date.now();
          state._lastCrumbSpendAmount = recruit.cost;
          state.team.push(recruit);
          roster.splice(idx, 1);
          return { content: [{ type: 'text', text: `+${recruit.name} ${recruit.race} ${recruit.class} | ${formatCrumbs(state.crumbs)}crumbs left` }] };
        }

        const roster = state._tavernRoster;
        const lines = [`=== THE CRUMBY TAVERN === ${formatCrumbs(state.crumbs)} crumbs | Team: ${state.team.length}`, ''];
        roster.forEach((m, i) => {
          lines.push(`  ${i + 1}. ${m.name} [${m.race} ${m.class}] ${m.personality}`);
          lines.push(`     HP:${m.maxHp} ATK:${m.stats.atk} DEF:${m.stats.def} SPD:${m.stats.spd} LCK:${m.stats.lck}`);
          lines.push(`     Cost: ${m.cost} crumbs`);
        });
        return { content: [{ type: 'text', text: lines.join('\n') }] };
      },
    },

    {
      name: 'cookie_talisman',
      description: 'View or upgrade your talisman. The talisman is a persistent artifact that survives death and provides passive bonuses (crumb%, loot quality, HP regen, death consolation, team stats). Upgradeable with crumbs across 10 levels.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'Action: "view" (default) or "upgrade"',
            enum: ['view', 'upgrade'],
          },
        },
        additionalProperties: false,
      },
      handler(params, ctx) {
        const { engine } = ctx;
        const state = engine.getStateRef();

        // Ensure talisman exists
        if (!state.talisman) {
          state.talisman = { level: 1 };
        }

        const action = params.action || 'view';

        if (action === 'upgrade') {
          const result = upgradeTalisman(state);
          if (result.success) {
            const b = getTalismanBonuses(result.newLevel);
            return { content: [{ type: 'text', text: [
              `Talisman upgraded to level ${result.newLevel}! (cost: ${result.cost} crumbs)`,
              `Crumbs remaining: ${formatCrumbs(state.crumbs)}`,
              '',
              `Current bonuses:`,
              `  Crumb bonus:     +${Math.round(b.crumbBonus * 100)}%`,
              `  Loot quality:    +${b.lootQuality}`,
              `  HP regen/room:   +${b.hpRegen}`,
              `  Death consolation: ${b.deathReward} crumbs`,
              b.atkBonus > 0 ? `  Team ATK:        +${b.atkBonus}` : null,
              b.defBonus > 0 ? `  Team DEF:        +${b.defBonus}` : null,
            ].filter(Boolean).join('\n') }] };
          }

          if (state.talisman.level >= getMaxLevel()) {
            return { content: [{ type: 'text', text: 'Talisman is already at max level (10)!' }] };
          }
          const cost = getUpgradeCost(state.talisman.level);
          return { content: [{ type: 'text', text: `Not enough crumbs! Need ${cost}, have ${state.crumbs}` }], isError: true };
        }

        // View
        const lines = [
          `=== TALISMAN === ${formatCrumbs(state.crumbs)} crumbs`,
          '',
          ...formatTalismanInfo(state.talisman, state.crumbs),
        ];
        return { content: [{ type: 'text', text: lines.join('\n') }] };
      },
    },

    {
      name: 'cookie_village',
      description: 'View or manage your village. Unlock at 9+ alive team members. Build/upgrade buildings for passive bonuses (crumbs/room, combat stats, enchant discount, XP boost, loot quality, better sell prices). Buildings: bakery, forge, watchtower, herbalist, training, merchant, archive.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'Action: "view" (default), "unlock", or "build"',
            enum: ['view', 'unlock', 'build'],
          },
          building: {
            type: 'string',
            description: 'Building ID to build/upgrade: bakery, forge, watchtower, herbalist, training, merchant, archive',
          },
        },
        additionalProperties: false,
      },
      handler(params, ctx) {
        const { engine } = ctx;
        const state = engine.getStateRef();
        const action = params.action || 'view';

        if (action === 'unlock') {
          if (isVillageUnlocked(state)) {
            return { content: [{ type: 'text', text: 'Village is already unlocked!' }] };
          }
          if (!canUnlockVillage(state)) {
            const alive = (state.team ?? []).filter(m => m.currentHp > 0).length;
            return { content: [{ type: 'text', text: `Need 9+ alive team members (have ${alive})` }], isError: true };
          }
          unlockVillage(state);
          return { content: [{ type: 'text', text: 'Village founded! Bakery built for free.\n\n' + formatVillageInfo(state).join('\n') }] };
        }

        if (action === 'build') {
          const buildingId = params.building;
          if (!buildingId) {
            return { content: [{ type: 'text', text: 'Specify building: bakery, forge, watchtower, herbalist, training, merchant, archive' }], isError: true };
          }
          const result = upgradeBuilding(state, buildingId);
          if (result.success) {
            return { content: [{ type: 'text', text: `${buildingId} upgraded to Lv${result.newLevel}! Cost: ${result.cost} crumbs\n\n` + formatVillageInfo(state).join('\n') }] };
          }
          return { content: [{ type: 'text', text: result.error || 'Cannot build' }], isError: true };
        }

        // View
        const lines = [
          `=== VILLAGE === ${formatCrumbs(state.crumbs)} crumbs`,
          '',
          ...formatVillageInfo(state),
        ];
        return { content: [{ type: 'text', text: lines.join('\n') }] };
      },
    },

    {
      name: 'cookie_equip',
      description: 'Equip an inventory item to a team member.',
      inputSchema: {
        type: 'object',
        properties: {
          item_index: {
            type: 'number',
            description: 'Inventory item index (1-based)',
            minimum: 1,
          },
          member_index: {
            type: 'number',
            description: 'Team member index (1-based)',
            minimum: 1,
          },
        },
        required: ['item_index', 'member_index'],
        additionalProperties: false,
      },
      handler(params, ctx) {
        const { engine } = ctx;
        const state = engine.getStateRef();

        const itemIdx = params.item_index - 1;
        const memberIdx = params.member_index - 1;

        if (!state.inventory || itemIdx < 0 || itemIdx >= state.inventory.length) {
          return { content: [{ type: 'text', text: `  Invalid item index. Inventory has ${(state.inventory || []).length} items.` }], isError: true };
        }
        if (!state.team || memberIdx < 0 || memberIdx >= state.team.length) {
          return { content: [{ type: 'text', text: `  Invalid member index. Team has ${(state.team || []).length} members.` }], isError: true };
        }

        const item = state.inventory[itemIdx];
        const member = state.team[memberIdx];

        if (!canEquip(member, item)) {
          return { content: [{ type: 'text', text: `  ${member.name} cannot equip ${item.name} (requires level ${item.requiredLevel}).` }], isError: true };
        }

        const previous = equipItem(member, item);
        state.inventory.splice(itemIdx, 1);
        if (previous) state.inventory.push(previous);
        return { content: [{ type: 'text', text: `${member.name}+${item.name}[${item.rarity}]${previous ? ' -'+previous.name : ''}` }] };
      },
    },

    {
      name: 'cookie_help',
      description: 'Get a list of available commands and current game state.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      handler(params, ctx) {
        const { engine } = ctx;
        const state = engine.getState();

        const lines = [
          `=== TERMINAL COOKIE === ${state.crumbs} crumbs`,
          '',
          'Game: click status explore roll inventory tavern equip respond',
          'Dungeon: pending dungeon_config intercept',
          'Save: save load scores leaderboard submit_score',
          'Security: security_scan vault_store vault_retrieve',
          '',
          'Every interaction earns crumbs! Selections earn bonus.',
        ];
        return { content: [{ type: 'text', text: lines.join('\n') }] };
      },
    },

    {
      name: 'cookie_leaderboard',
      description: 'View the community leaderboard. Shows top players ranked by dungeons cleared and highest level.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      handler(params, ctx) {
        const lb = loadLeaderboard();
        return { content: [{ type: 'text', text: formatLeaderboardFull(lb.entries) }] };
      },
    },

    {
      name: 'cookie_submit_score',
      description: 'Submit your local score to the community leaderboard. Creates a submission file for PR-based review.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Your display name for the leaderboard (required)',
          },
          org: {
            type: 'string',
            description: 'Your organization or team name (optional)',
          },
        },
        required: ['name'],
        additionalProperties: false,
      },
      handler(params, ctx) {
        const scores = loadLocalScores();
        if (!scores) {
          return {
            content: [{ type: 'text', text: '  No local scores found. Play some games first!' }],
            isError: true,
          };
        }

        try {
          const { id, path, entry } = generateSubmissionFile(scores, params.name, params.org || null);
          return { content: [{ type: 'text', text: `Submitted ${entry.name} D${entry.dungeons_cleared} L${entry.highest_level} | File:${path}` }] };
        } catch (err) {
          return { content: [{ type: 'text', text: 'Submit failed' }], isError: true };
        }
      },
    },

    {
      name: 'cookie_narrate',
      description: 'Claude calls this to inject narrative text into the game. Adds story entries displayed in the terminal during dungeon exploration.',
      inputSchema: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'Narrative text to display',
          },
          type: {
            type: 'string',
            description: 'Entry type: room, npc, event, combat, or lore',
            enum: ['room', 'npc', 'event', 'combat', 'lore'],
          },
        },
        required: ['text'],
        additionalProperties: false,
      },
      handler(params, ctx) {
        const { engine } = ctx;
        const state = engine.getStateRef();
        const story = createStoryManager(state);
        story.addStoryEntry(params.text, params.type || 'lore');
        return { content: [{ type: 'text', text: `Narrated: ${params.text.substring(0, 60)}...` }] };
      },
    },

    {
      name: 'cookie_npc_respond',
      description: 'Resolve an NPC encounter with a choice. Triggers consequences like stat modifiers, crumb rewards, or items.',
      inputSchema: {
        type: 'object',
        properties: {
          choice: {
            type: 'string',
            description: 'The choice to make for the NPC encounter',
          },
        },
        required: ['choice'],
        additionalProperties: false,
      },
      handler(params, ctx) {
        const { engine } = ctx;
        const state = engine.getStateRef();
        const story = createStoryManager(state);
        const npc = story.getActiveNPC();
        if (!npc) {
          return { content: [{ type: 'text', text: 'No active NPC encounter.' }], isError: true };
        }
        const offer = npc.offers.find(o => o.description.toLowerCase().includes(params.choice.toLowerCase()));
        if (!offer) {
          const options = npc.offers.map(o => o.description).join(' | ');
          return { content: [{ type: 'text', text: `No matching choice. Options: ${options}` }], isError: true };
        }
        let result = `Chose: ${offer.description}`;
        if (offer.effect) {
          if (offer.effect.action === 'buff' || offer.effect.action === 'mixed_modifier') {
            const buffs = offer.effect.buffs || [{ stat: offer.effect.stat, amount: offer.effect.amount || 2, duration: offer.effect.duration || 3 }];
            for (const b of buffs) {
              story.applySkillModifier({ stat: b.stat, amount: b.amount, duration: b.duration, source: npc.name });
              result += ` | ${b.amount > 0 ? '+' : ''}${b.amount} ${b.stat}`;
            }
            if (offer.effect.debuffs) {
              for (const d of offer.effect.debuffs) {
                story.applySkillModifier({ stat: d.stat, amount: d.amount, duration: d.duration, source: npc.name });
                result += ` | ${d.amount} ${d.stat}`;
              }
            }
          } else if (offer.effect.action === 'heal' || offer.effect.action === 'full_heal') {
            for (const m of (state.team || []).filter(t => t.currentHp > 0)) {
              if (offer.effect.action === 'full_heal') {
                m.currentHp = m.maxHp;
              } else {
                m.currentHp = Math.min(m.maxHp, m.currentHp + (offer.effect.amount || 20));
              }
            }
            result += ` | Healed`;
          } else if (offer.effect.action === 'grant_crumbs') {
            state.crumbs += offer.effect.amount || 10;
            result += ` | +${offer.effect.amount} crumbs`;
          }
        }
        if (offer.cost > 0) {
          state.crumbs = Math.max(0, state.crumbs - offer.cost);
          state._lastCrumbSpend = Date.now();
          state._lastCrumbSpendAmount = offer.cost;
          result += ` | -${offer.cost} crumbs`;
        }
        story.addStoryEntry(`${npc.name}: ${result}`, 'npc');
        story.setActiveNPC(null);
        return { content: [{ type: 'text', text: result }] };
      },
    },

    {
      name: 'cookie_story_choice',
      description: 'Make a story choice during a dungeon event. Applies consequences based on the event definition.',
      inputSchema: {
        type: 'object',
        properties: {
          choice_id: {
            type: 'string',
            description: 'The ID of the choice to make',
          },
          choice: {
            type: 'string',
            description: 'The chosen option',
          },
        },
        required: ['choice_id', 'choice'],
        additionalProperties: false,
      },
      handler(params, ctx) {
        const { engine } = ctx;
        const state = engine.getStateRef();
        const story = createStoryManager(state);
        story.recordChoice(params.choice_id, params.choice);
        story.addStoryEntry(`Choice made: ${params.choice}`, 'event');
        return { content: [{ type: 'text', text: `Choice recorded: ${params.choice_id} = ${params.choice}` }] };
      },
    },

    {
      name: 'cookie_user_choice',
      description: 'Call this when the user makes a selection choice (yes, no, yes and remember, allow, deny, etc.). Awards bonus crumbs for user engagement. The more the user interacts with AI decisions, the more crumbs they earn.',
      inputSchema: {
        type: 'object',
        properties: {
          choice: {
            type: 'string',
            description: 'The choice the user made (e.g. "yes", "no", "yes and remember", "allow", "deny")',
          },
          context: {
            type: 'string',
            description: 'Brief context of what the choice was about',
          },
        },
        required: ['choice'],
        additionalProperties: false,
      },
      handler(params, ctx) {
        const { engine, scores } = ctx;
        const state = engine.getStateRef();
        const choice = (params.choice || '').toLowerCase();

        // Higher rewards for more engaged choices
        let crumbReward = 10; // base for any choice
        if (choice.includes('remember')) crumbReward = 20; // "yes and remember" = highest
        else if (choice.includes('allow') || choice.includes('yes')) crumbReward = 15;
        else if (choice.includes('deny') || choice.includes('no')) crumbReward = 12;

        state.crumbs += crumbReward;
        state.stats.crumbsEarned = (state.stats.crumbsEarned || 0) + crumbReward;
        scores.increment('total_crumbs_earned', crumbReward);

        return { content: [{ type: 'text', text: `+${crumbReward} crumbs (choice: ${params.choice}) | Total: ${state.crumbs}` }] };
      },
    },
  ];
}
