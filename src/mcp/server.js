// src/mcp/server.js — MCP server using @modelcontextprotocol/sdk

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createEngine } from '../core/engine.js';
import { createCookieHandler } from '../game/cookie.js';
import { createSettings } from '../config/settings.js';
import { createScores } from '../save/scores.js';
import { saveGame, loadGame } from '../save/state.js';
import { defineTools } from './tools.js';
import { createPassiveRunner } from './passive-runner.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { createSessionTracker } from './sessions.js';
import { COOKIE_REACTIONS } from './reactions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const SETTINGS_PATH = join(PROJECT_ROOT, 'data', 'settings.json');
const SESSIONS_PATH = join(PROJECT_ROOT, 'data', 'sessions.json');

// Initialize game systems
const engine = createEngine();
const gameState = engine.getStateRef();
const sessions = createSessionTracker(SESSIONS_PATH);
const cookie = createCookieHandler(gameState);
const settings = createSettings(SETTINGS_PATH);
settings.load();
const scores = createScores();
scores.load();

// Vault is optional — loaded if available
let vault = null;
try {
  const { createVault } = await import('../security/vault.js');
  vault = createVault();
} catch {
  // Vault unavailable
}

// Create passive runner
const passiveRunner = createPassiveRunner({
  engine,
  rng: engine.rng,
  settings,
  scores,
});

// Tool context passed to handlers
const toolContext = {
  engine,
  cookie,
  settings,
  scores,
  vault,
  passiveRunner,
  sessions,
  saveState(slot, state) {
    return saveGame(slot, state);
  },
  loadState(slot) {
    const result = loadGame(slot);
    if (result.success && result.data) {
      // Reload engine with loaded state
      Object.assign(gameState, result.data);
    }
    return result;
  },
  setDungeon(dungeonState) {
    gameState.dungeonProgress = dungeonState;
  },
};

// Define tools
const tools = defineTools();
const toolMap = new Map(tools.map(t => [t.name, t]));

// Create MCP server
const server = new Server(
  {
    name: 'terminal-cookie',
    version: '0.2.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: tools.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  };
});

// Call tool handler — no dungeon gate, all tools available all the time
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: params } = request.params;

  const tool = toolMap.get(name);
  if (!tool) {
    return {
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }

  // Serialize tool calls through engine mutex
  return engine.mutex.withLock(async () => {
    try {
      // Register this session heartbeat
      sessions.heartbeat();

      // Drain background events that happened since last tool call
      const backgroundEvents = passiveRunner.drain();

      // === AUTO COOKIE CLICK on every tool call ===
      // Every interaction with Claude is a cookie click — you don't need to
      // explicitly "click the cookie". Chatting, accepting choices, using any
      // tool — it all mines crumbs automatically.
      const earned = cookie.click();
      const bonuses = settings.getBonuses();
      const settingsBonus = Math.floor(earned * (bonuses.crumbMultiplier - 1));
      const sessionMultiplier = sessions.multiplier();
      const sessionBonus = Math.floor(earned * (sessionMultiplier - 1));
      const totalAutoClick = earned + settingsBonus + sessionBonus;
      if (settingsBonus + sessionBonus > 0) {
        gameState.crumbs += settingsBonus + sessionBonus;
      }
      scores.recordClick(totalAutoClick);
      scores.setMax('highest_crumbs', gameState.crumbs);

      // Pick a reaction for this auto-click
      const reaction = COOKIE_REACTIONS[
        Math.abs(Date.now() + cookie.sessionClicks) % COOKIE_REACTIONS.length
      ];

      // Award passive milestone crumbs
      passiveRunner.passiveEarning(name);

      // Execute actual tool handler
      const result = await tool.handler(params || {}, toolContext);

      // Autosave scores after every action
      try { scores.save(); } catch { /* best effort */ }

      // Build the response — always append cookie click info
      const statusText = passiveRunner.statusLine();
      const originalText = result.content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('\n');

      const activeCount = sessions.activeSessions();
      const appendParts = [originalText, '', '---'];

      // Auto-click line (compact for non-game tools, detailed for cookie_click)
      if (name === 'cookie_click') {
        // cookie_click already shows its own detailed output, just add status
        appendParts.push(statusText);
      } else {
        // Every other tool: show the auto-click crumb earning
        const bonusParts = [];
        if (settingsBonus > 0) bonusParts.push(`+${settingsBonus} bonus`);
        if (sessionBonus > 0) bonusParts.push(`+${sessionBonus} multi-terminal`);
        const breakdown = bonusParts.length > 0 ? ` (${earned} + ${bonusParts.join(' + ')})` : '';
        appendParts.push(`  +${totalAutoClick} crumbs${breakdown} | ${reaction}`);
        appendParts.push(statusText);
      }

      if (activeCount > 1) {
        appendParts.push(`  Terminals: ${activeCount} (x${sessionMultiplier.toFixed(1)} mining speed)`);
      }

      if (backgroundEvents.length > 0) {
        appendParts.push('', '  Recent events:');
        for (const ev of backgroundEvents.slice(-10)) {
          appendParts.push(`    ${ev.msg}`);
        }
      }

      const pending = gameState.pendingActions || [];
      if (pending.length > 0) {
        appendParts.push('', `  ${pending.length} pending action(s) — use cookie_pending to view/resolve.`);
      }

      return {
        content: [{ type: 'text', text: appendParts.join('\n') }],
        isError: result.isError,
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error in ${name}: ${err.message}` }],
        isError: true,
      };
    }
  });
});

// Autosave interval (60s)
let autosaveHandle = null;

// Start server
async function main() {
  await engine.start();

  // Start passive background runner
  passiveRunner.start();

  // Autosave every 60s to a dedicated auto-save file (doesn't overwrite manual saves)
  const AUTOSAVE_DIR = join(PROJECT_ROOT, 'saves');
  const AUTOSAVE_PATH = join(AUTOSAVE_DIR, 'autosave.json');
  autosaveHandle = setInterval(() => {
    engine.mutex.withLock(() => {
      try {
        if (!existsSync(AUTOSAVE_DIR)) mkdirSync(AUTOSAVE_DIR, { recursive: true });
        const data = { ...engine.getStateRef(), savedAt: new Date().toISOString(), _autosave: true };
        writeFileSync(AUTOSAVE_PATH, JSON.stringify(data, null, 2), 'utf-8');
      } catch {
        // best-effort autosave
      }
    });
  }, 60000);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err.message}\n`);
  process.exit(1);
});
