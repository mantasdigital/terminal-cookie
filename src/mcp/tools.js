// src/mcp/tools.js — MCP tool definitions with strict schemas

import { masterCookie, miniCookie, trashCookie, explodeCookie, titleScreen, rollBar } from '../ui/ascii.js';
import { createScanner } from '../security/scanner.js';
import { createRedactor } from '../security/redactor.js';
import { classifyPrompt } from '../prompts/classifier.js';
import { generateTavernRoster } from '../game/team.js';
import { equipItem, canEquip } from '../game/loot.js';
import { generateDungeon } from '../game/dungeon.js';
import { COOKIE_REACTIONS } from './reactions.js';
import { loadLeaderboard, formatLeaderboardFull } from '../leaderboard/leaderboard.js';
import { loadLocalScores, generateSubmissionFile } from '../leaderboard/submit.js';

const scanner = createScanner();
const redactor = createRedactor();

/**
 * All tool definitions for the MCP server.
 * Each tool has: name, description, inputSchema, handler(params, context)
 */
export function defineTools() {
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

        // Power click gives 3x the normal click rate
        const baseEarned = cookie.click();
        const powerBonus = baseEarned * 2; // 2x extra on top of the 1x from click()
        state.crumbs += powerBonus;

        const bonuses = settings.getBonuses();
        const settingsBonus = Math.floor(baseEarned * 3 * (bonuses.crumbMultiplier - 1));
        const sessionMultiplier = sessions ? sessions.multiplier() : 1.0;
        const sessionBonus = Math.floor(baseEarned * 3 * (sessionMultiplier - 1));
        const total = baseEarned * 3 + settingsBonus + sessionBonus;

        state.crumbs += settingsBonus + sessionBonus;
        scores.recordClick(total);
        scores.setMax('highest_crumbs', state.crumbs);

        const pick = COOKIE_REACTIONS[
          Math.abs(Date.now() + cookie.sessionClicks) % COOKIE_REACTIONS.length
        ];
        const art = miniCookie();
        const activeTerminals = sessions ? sessions.activeSessions() : 1;

        const lines = [
          art,
          '',
          `  POWER CLICK! ${pick}`,
          '',
          `  +${total} crumbs! (3x power click)`,
        ];

        const parts = [`${baseEarned * 3} base`];
        if (settingsBonus > 0) parts.push(`+${settingsBonus} settings`);
        if (sessionBonus > 0) parts.push(`+${sessionBonus} multi-terminal`);
        if (parts.length > 1) lines.push(`  (${parts.join(', ')})`);

        lines.push(`  Total: ${cookie.crumbs} crumbs`);
        lines.push(`  Session clicks: ${cookie.sessionClicks}`);

        if (activeTerminals > 1) {
          lines.push(`  Terminals mining: ${activeTerminals} (x${sessionMultiplier.toFixed(1)} speed)`);
        }

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
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
        const frames = explodeCookie();
        // In MCP, show final frame + trash art
        const lines = [
          trashCookie(),
          '',
          '  The cookie has been DESTROYED.',
          '  No crumbs were earned.',
          '  The cookie gods frown upon you.',
          '',
          frames[frames.length - 1],
        ];

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
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
        const { engine, settings, scores } = ctx;
        const state = engine.getState();
        const bonuses = settings.getBonuses();

        const teamLines = (state.team || []).map((m, i) => {
          const hp = m.alive ? `${m.currentHp}/${m.maxHp} HP` : 'DEAD';
          return `  ${i + 1}. ${m.name} [${m.race} ${m.class}] Lv.${m.level} ${hp}`;
        });

        const lines = [
          '=== COOKIE STATUS ===',
          '',
          `  State:   ${state.currentState}`,
          `  Crumbs:  ${state.crumbs}`,
          `  Seed:    ${state.seed || 'N/A'}`,
          '',
          `  --- Team (${(state.team || []).length}) ---`,
          teamLines.length > 0 ? teamLines.join('\n') : '  (empty)',
          '',
          `  --- Inventory ---`,
          `  Items: ${(state.inventory || []).length}`,
          '',
          `  --- Bonuses ---`,
          `  Crumb multiplier: x${bonuses.crumbMultiplier.toFixed(2)}`,
          `  Loot find bonus:  +${(bonuses.lootFindBonus * 100).toFixed(0)}%`,
          `  XP multiplier:    x${bonuses.xpMultiplier.toFixed(2)}`,
          bonuses.titles.length > 0 ? `  Titles: ${bonuses.titles.join(', ')}` : '',
          '',
          `  --- Dungeon ---`,
          state.dungeonProgress ? `  Level: ${state.dungeonProgress.level}, Room: ${state.dungeonProgress.currentRoom}` : '  Not in dungeon',
          '',
          '=====================',
        ];

        return {
          content: [{ type: 'text', text: lines.filter(l => l !== '').join('\n') }],
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
        const lines = [
          `  ===== ENTERING DUNGEON =====`,
          `  Level: ${level}`,
          `  Biome: ${dungeon.biomeName}`,
          `  Rooms: ${totalRooms}`,
          dungeon.curses.length > 0 ? `  Curses: ${dungeon.curses.join(', ')}` : '',
          '',
          `  Your team of ${aliveMembers.length} ventures into the depths...`,
          '',
          `  ${aliveMembers.map(m => m.name).join(', ')}`,
          '',
          `  Room 1/${totalRooms}: The entrance looms before you.`,
          `  ${dungeon.biomeDescription || 'Dark corridors stretch in every direction.'}`,
          '',
          '  Dungeon will auto-advance in the background.',
          '  Use cookie_status to check progress, cookie_pending for actions.',
          '  ============================',
        ];

        return {
          content: [{ type: 'text', text: lines.filter(l => l !== '').join('\n') }],
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

        const bar = rollBar(modified, 20);

        let outcome = 'Normal';
        if (crit) outcome = 'CRITICAL! Natural 20!';
        else if (fumble) outcome = 'FUMBLE! Natural 1...';
        else if (modified >= 15) outcome = 'Great roll!';
        else if (modified >= 10) outcome = 'Decent roll.';
        else if (modified >= 5) outcome = 'Below average.';
        else outcome = 'Poor roll.';

        const lines = [
          '  === COOKIE ROLL ===',
          '',
          `  ${bar}`,
          '',
          `  Raw:      ${rawRoll}`,
          `  Modifier: +${modifier} (LCK ${stat})`,
          `  Final:    ${modified}`,
          `  Outcome:  ${outcome}`,
          '',
          '  ====================',
        ];

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
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
          return {
            content: [{ type: 'text', text: '  === INVENTORY ===\n\n  (empty)\n\n  ==================' }],
          };
        }

        const itemLines = inventory.map((item, i) => {
          const stats = item.stats ? ` (${Object.entries(item.stats).map(([k, v]) => `${k}:${v > 0 ? '+' : ''}${v}`).join(' ')})` : '';
          const rarity = item.rarity ? `[${item.rarity.toUpperCase()}]` : '';
          const equipped = item.equipped ? ' *EQUIPPED*' : '';
          return `  ${i + 1}. ${rarity} ${item.name || 'Unknown Item'}${stats}${equipped}`;
        });

        const lines = [
          '  === INVENTORY ===',
          `  Items: ${inventory.length}`,
          '',
          ...itemLines,
          '',
          '  ==================',
        ];

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
        };
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
        const state = engine.getState();
        const result = saveState(params.slot, state);

        if (result.success) {
          return {
            content: [{ type: 'text', text: `  Game saved to slot ${params.slot}.` }],
          };
        }
        return {
          content: [{ type: 'text', text: `  Save failed: ${result.error}` }],
          isError: true,
        };
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
          const data = result.data;
          const backup = result.fromBackup ? ' (restored from backup)' : '';
          const lines = [
            `  Game loaded from slot ${params.slot}${backup}.`,
            '',
            `  State:  ${data.currentState}`,
            `  Crumbs: ${data.crumbs}`,
            `  Team:   ${(data.team || []).length} members`,
            `  Items:  ${(data.inventory || []).length}`,
          ];
          return {
            content: [{ type: 'text', text: lines.join('\n') }],
          };
        }
        return {
          content: [{ type: 'text', text: `  Load failed: ${result.error}` }],
          isError: true,
        };
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
        const { scores } = ctx;
        return {
          content: [{ type: 'text', text: scores.formatDisplay() }],
        };
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

        // Award crumbs for responding to prompts
        const crumbReward = 5;
        state.crumbs = (state.crumbs || 0) + crumbReward;
        scores.increment('total_crumbs_earned', crumbReward);

        const lines = [
          `  Response recorded for prompt "${params.prompt_id}".`,
          `  Type: ${params.response_type}`,
          `  +${crumbReward} crumbs earned!`,
          '',
          miniCookie(),
        ];

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
        };
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
        const result = scanner.scan(params.code);

        if (result.findings.length > 0) {
          scores.increment('threats_detected', result.findings.length);
        }

        const lines = ['  === SECURITY SCAN RESULTS ===', ''];

        if (result.findings.length === 0) {
          lines.push('  No security issues detected.');
        } else {
          for (const finding of result.findings) {
            lines.push(`  [${finding.risk_level}] ${finding.rule_id}`);
            lines.push(`  ${finding.description}`);
            for (const m of finding.matches) {
              const code = redactor.redact(m.match);
              lines.push(`    Line ${m.line}, Col ${m.column}: ${code}`);
            }
            lines.push(`  Recommendation: ${finding.recommendation}`);
            lines.push('');
          }
        }

        lines.push(`  Summary: ${result.summary}`);
        lines.push(`  Overall Risk: ${result.highest_risk}`);
        lines.push('');
        lines.push('  ============================');

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
        };
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
        if (!vault || !vault.isUnlocked()) {
          return {
            content: [{ type: 'text', text: '  Vault is locked. Unlock it first with your master password.' }],
            isError: true,
          };
        }

        try {
          vault.store(params.label, params.value, params.type);
          const redacted = redactor.redact(params.value);
          return {
            content: [{ type: 'text', text: `  Stored "${params.label}" (${params.type}): ${redacted}` }],
          };
        } catch (err) {
          return {
            content: [{ type: 'text', text: `  Vault store failed: ${err.message}` }],
            isError: true,
          };
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
        if (!vault || !vault.isUnlocked()) {
          return {
            content: [{ type: 'text', text: '  Vault is locked. Unlock it first with your master password.' }],
            isError: true,
          };
        }

        try {
          const entry = vault.retrieve(params.label);
          if (!entry) {
            return {
              content: [{ type: 'text', text: `  Entry "${params.label}" not found.` }],
              isError: true,
            };
          }

          const redacted = redactor.redact(entry.value);
          const lines = [
            `  === VAULT ENTRY ===`,
            `  Label:   ${entry.label}`,
            `  Type:    ${entry.type}`,
            `  Value:   ${redacted}`,
            `  Stored:  ${entry.storedAt}`,
            '',
            '  (Value is redacted. Handle with care.)',
            '  ====================',
          ];

          return {
            content: [{ type: 'text', text: lines.join('\n') }],
          };
        } catch (err) {
          return {
            content: [{ type: 'text', text: `  Vault retrieve failed: ${err.message}` }],
            isError: true,
          };
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

        // Crumbs based on complexity
        let crumbReward = Math.max(1, Math.floor(wordCount / 5));
        if (classification.confidence > 0.7) crumbReward += 3;
        if (classification.type === 'code_review') crumbReward += 5;
        if (classification.type === 'permission') crumbReward += 2;

        state.crumbs += crumbReward;
        state.stats.crumbsEarned = (state.stats.crumbsEarned || 0) + crumbReward;
        scores.increment('total_crumbs_earned', crumbReward);

        // Cookie-themed response
        const cookieWords = ['crumbly', 'buttery', 'crispy', 'golden', 'freshly-baked', 'sugar-coated'];
        const adj = cookieWords[Math.abs(text.length) % cookieWords.length];

        const lines = [
          `  === COOKIE INTERCEPT ===`,
          `  Type: ${classification.type} (${(classification.confidence * 100).toFixed(0)}% confidence)`,
          `  Words: ${wordCount}`,
          `  +${crumbReward} crumbs earned!`,
          '',
          `  The Cookie Oracle says: "A ${adj} prompt indeed."`,
          '',
          miniCookie(),
          '  ========================',
        ];

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
        };
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

        // List mode
        const pending = state.pendingActions || [];
        if (pending.length === 0) {
          return { content: [{ type: 'text', text: '  No pending actions.' }] };
        }

        const lines = [
          `  === PENDING ACTIONS (${pending.length}) ===`,
          '',
        ];
        for (const action of pending) {
          lines.push(`  [${action.id}] ${action.type}: ${action.description}`);
          lines.push(`    Choices: ${action.choices.join(', ')}`);
          lines.push('');
        }
        lines.push('  Use cookie_pending with action_id + choice to resolve.');
        lines.push('  ==============================');

        return { content: [{ type: 'text', text: lines.join('\n') }] };
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

        const lines = [
          '  === DUNGEON CONFIG ===',
          `  Tick interval: ${state.passiveConfig.tickIntervalMs / 1000}s`,
          `  Auto-loot:     ${state.passiveConfig.autoLoot ? 'ON' : 'OFF'}`,
          `  Auto-sell:     ${state.passiveConfig.autoSell ? 'ON' : 'OFF'}`,
          '  ======================',
        ];

        return { content: [{ type: 'text', text: lines.join('\n') }] };
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
          return { content: [{ type: 'text', text: '  Tavern roster refreshed! Use cookie_tavern to view.' }] };
        }

        if (action === 'recruit') {
          const idx = (params.index || 1) - 1;
          const roster = state._tavernRoster;
          if (idx < 0 || idx >= roster.length) {
            return { content: [{ type: 'text', text: `  Invalid index. Roster has ${roster.length} recruits.` }], isError: true };
          }
          const recruit = roster[idx];
          if (state.crumbs < recruit.cost) {
            return { content: [{ type: 'text', text: `  Not enough crumbs! Need ${recruit.cost}, have ${state.crumbs}.` }], isError: true };
          }
          state.crumbs -= recruit.cost;
          state.team.push(recruit);
          roster.splice(idx, 1);

          const lines = [
            `  Recruited ${recruit.name}!`,
            `  ${recruit.race} ${recruit.class} | HP: ${recruit.maxHp} | ATK: ${recruit.stats.atk} | DEF: ${recruit.stats.def}`,
            `  Cost: ${recruit.cost} crumbs | Remaining: ${state.crumbs}`,
          ];
          return { content: [{ type: 'text', text: lines.join('\n') }] };
        }

        // View
        const roster = state._tavernRoster;
        const lines = [
          '  === THE CRUMBY TAVERN ===',
          `  Your crumbs: ${state.crumbs}`,
          '',
        ];

        roster.forEach((m, i) => {
          lines.push(`  ${i + 1}. ${m.name} [${m.race} ${m.class}] - ${m.personality}`);
          lines.push(`     HP:${m.maxHp} ATK:${m.stats.atk} DEF:${m.stats.def} SPD:${m.stats.spd} LCK:${m.stats.lck}`);
          lines.push(`     Abilities: ${m.abilities.join(', ')}`);
          lines.push(`     Cost: ${m.cost} crumbs`);
          lines.push('');
        });

        lines.push(`  Team size: ${state.team.length}`);
        lines.push('  Use cookie_tavern with action "recruit" and index to hire.');
        lines.push('  ==========================');

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
        // Remove from inventory
        state.inventory.splice(itemIdx, 1);
        // Add previous item back if any
        if (previous) state.inventory.push(previous);

        const lines = [
          `  ${member.name} equipped ${item.name} [${item.rarity}]!`,
          `  Slot: ${item.slot}`,
          `  Stats: ${Object.entries(item.statBonus || {}).map(([k, v]) => `${k}:+${v}`).join(' ')}`,
        ];
        if (previous) {
          lines.push(`  Unequipped: ${previous.name}`);
        }

        return { content: [{ type: 'text', text: lines.join('\n') }] };
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
          '  === TERMINAL COOKIE HELP ===',
          '',
          '  Every interaction auto-clicks the cookie and earns crumbs!',
          '',
          '  Game Commands:',
          '    cookie_click     - Power-click for 3x bonus crumbs',
          '    cookie_trash     - Destroy a cookie (no reward)',
          '    cookie_status    - View team, crumbs, state',
          '    cookie_explore   - Enter a dungeon (level required)',
          '    cookie_roll      - Roll a d20',
          '    cookie_inventory - View loot and equipment',
          '    cookie_respond   - Answer an AI prompt',
          '',
          '  Passive Mode:',
          '    cookie_intercept     - Filter prompt text for crumbs',
          '    cookie_pending       - View/resolve pending actions',
          '    cookie_dungeon_config - Configure tick interval, auto-loot',
          '    cookie_tavern        - Recruit team members',
          '    cookie_equip         - Equip items to team members',
          '',
          '  Save/Load:',
          '    cookie_save      - Save game (slot 1-3)',
          '    cookie_load      - Load game (slot 1-3)',
          '    cookie_scores    - View high scores',
          '',
          '  Leaderboard:',
          '    cookie_leaderboard   - View the community leaderboard',
          '    cookie_submit_score  - Submit your score to the leaderboard',
          '',
          '  Security:',
          '    security_scan    - Scan code for risks',
          '    vault_store      - Store secret in vault',
          '    vault_retrieve   - Retrieve secret from vault',
          '',
          `  Current State: ${state.currentState}`,
          `  Crumbs: ${state.crumbs}`,
          '',
          '  ============================',
        ];

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
        };
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
        return {
          content: [{ type: 'text', text: formatLeaderboardFull(lb.entries) }],
        };
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
          const lines = [
            '  === SCORE SUBMITTED ===',
            '',
            `  ID:       ${id}`,
            `  Name:     ${entry.name}`,
            entry.org ? `  Org:      ${entry.org}` : '',
            `  Dungeons: ${entry.dungeons_cleared}`,
            `  Level:    ${entry.highest_level}`,
            `  Clicks:   ${entry.total_clicks}`,
            `  Crumbs:   ${entry.total_crumbs_earned}`,
            '',
            `  File: ${path}`,
            '',
            '  To complete submission:',
            '    1. Create a branch: git checkout -b leaderboard/submit-' + id,
            '    2. Commit: git add data/submissions/ && git commit -m "leaderboard: submit score"',
            '    3. Push: git push -u origin leaderboard/submit-' + id,
            '    4. Open a PR for review',
            '',
            '  ========================',
          ];

          return {
            content: [{ type: 'text', text: lines.filter(l => l !== '').join('\n') }],
          };
        } catch (err) {
          return {
            content: [{ type: 'text', text: `  Submission failed: ${err.message}` }],
            isError: true,
          };
        }
      },
    },
  ];
}
