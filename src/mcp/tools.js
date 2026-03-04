// src/mcp/tools.js — MCP tool definitions with strict schemas

import { masterCookie, miniCookie, trashCookie, explodeCookie, titleScreen, rollBar } from '../ui/ascii.js';
import { createScanner } from '../security/scanner.js';
import { createRedactor } from '../security/redactor.js';

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
      description: 'Click the cookie to earn crumbs. The most basic action in Terminal Cookie.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      handler(params, ctx) {
        const { engine, cookie, scores, settings } = ctx;
        const state = engine.getState();
        const earned = cookie.click();
        const bonuses = settings.getBonuses();
        const bonus = Math.floor(earned * (bonuses.crumbMultiplier - 1));
        const total = earned + bonus;

        if (bonus > 0) {
          state.crumbs += bonus;
        }
        scores.recordClick(total);
        scores.setMax('highest_crumbs', state.crumbs + (bonus > 0 ? bonus : 0));

        const art = miniCookie();
        const lines = [
          art,
          '',
          `  +${total} crumbs!${bonus > 0 ? ` (${earned} base + ${bonus} bonus)` : ''}`,
          `  Total: ${cookie.crumbs} crumbs`,
          `  Session clicks: ${cookie.sessionClicks}`,
        ];

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
        const state = engine.getState();

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

        // Initialize dungeon progress
        const dungeonState = {
          level,
          currentRoom: 0,
          roomsCleared: 0,
          totalRooms: 3 + level,
          started: new Date().toISOString(),
        };

        // Update state via engine context
        if (ctx.setDungeon) ctx.setDungeon(dungeonState);

        const lines = [
          `  ===== ENTERING DUNGEON =====`,
          `  Level: ${level}`,
          `  Rooms: ${dungeonState.totalRooms}`,
          '',
          `  Your team of ${aliveMembers.length} ventures into the depths...`,
          '',
          `  ${aliveMembers.map(m => m.name).join(', ')}`,
          '',
          `  Room 1/${dungeonState.totalRooms}: The entrance looms before you.`,
          `  Dark corridors stretch in every direction.`,
          '',
          '  Use cookie_roll to interact with the dungeon.',
          '  ============================',
        ];

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
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
        const state = engine.getState();

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
          '  Game Commands:',
          '    cookie_click     - Click the cookie for crumbs',
          '    cookie_trash     - Destroy a cookie (no reward)',
          '    cookie_status    - View team, crumbs, state',
          '    cookie_explore   - Enter a dungeon (level required)',
          '    cookie_roll      - Roll a d20',
          '    cookie_inventory - View loot and equipment',
          '    cookie_respond   - Answer an AI prompt',
          '',
          '  Save/Load:',
          '    cookie_save      - Save game (slot 1-3)',
          '    cookie_load      - Load game (slot 1-3)',
          '    cookie_scores    - View high scores',
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
  ];
}
