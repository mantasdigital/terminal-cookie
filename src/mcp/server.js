// src/mcp/server.js — MCP server using @modelcontextprotocol/sdk

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createEngine } from '../core/engine.js';
import { createMutex } from '../core/mutex.js';
import { createCookieHandler } from '../game/cookie.js';
import { createSettings } from '../config/settings.js';
import { createScores } from '../save/scores.js';
import { saveGame, loadGame } from '../save/state.js';
import { defineTools } from './tools.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const SETTINGS_PATH = join(PROJECT_ROOT, 'data', 'settings.json');

// Initialize game systems
const engine = createEngine();
const gameState = engine.getState();
const cookie = createCookieHandler(gameState);
const settings = createSettings(SETTINGS_PATH);
settings.load();
const scores = createScores();
scores.load();
const mutex = createMutex();

// Vault is optional — loaded if available
let vault = null;
try {
  const { createVault } = await import('../security/vault.js');
  vault = createVault();
} catch {
  // Vault unavailable
}

// Tool context passed to handlers
const toolContext = {
  engine,
  cookie,
  settings,
  scores,
  vault,
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

// Check if dungeon is active
function isDungeonActive() {
  const state = engine.getState();
  return state.currentState === 'DUNGEON' || state.currentState === 'COMBAT';
}

// Dungeon-only tools that can proceed during dungeon
const DUNGEON_TOOLS = new Set([
  'cookie_roll',
  'cookie_status',
  'cookie_inventory',
  'cookie_help',
  'cookie_save',
]);

// Create MCP server
const server = new Server(
  {
    name: 'terminal-cookie',
    version: '0.1.0',
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

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: params } = request.params;

  const tool = toolMap.get(name);
  if (!tool) {
    return {
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }

  // Dungeon gate: if in dungeon, only allow dungeon-compatible tools
  if (isDungeonActive() && !DUNGEON_TOOLS.has(name)) {
    return {
      content: [{ type: 'text', text: `Busy in dungeon! Only dungeon-related commands are available: ${[...DUNGEON_TOOLS].join(', ')}` }],
      isError: true,
    };
  }

  // Serialize tool calls through mutex
  return mutex.withLock(async () => {
    try {
      const result = await tool.handler(params || {}, toolContext);

      // Autosave scores after every action
      try { scores.save(); } catch { /* best effort */ }

      return result;
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error in ${name}: ${err.message}` }],
        isError: true,
      };
    }
  });
});

// Start server
async function main() {
  await engine.start();

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err.message}\n`);
  process.exit(1);
});
