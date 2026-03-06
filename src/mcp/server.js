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
import { homedir } from 'os';
import { writeFileSync, readFileSync, mkdirSync, existsSync, renameSync } from 'fs';
import { createSessionTracker } from './sessions.js';
import { COOKIE_REACTIONS } from './reactions.js';
import { createLiveState } from '../save/live-state.js';
import { createScanner } from '../security/scanner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const SETTINGS_PATH = join(PROJECT_ROOT, 'data', 'settings.json');
const SESSIONS_PATH = join(homedir(), '.terminal-cookie', 'sessions.json');
const HOOK_CRUMBS_PATH = join(homedir(), '.terminal-cookie', 'hook-crumbs.json');

// Single scanner instance shared with tools.js
const aiScanner = createScanner();

// Track hook crumbs already drained so MCP never writes to the hook file
let lastDrainedHookCrumbs = 0;

/**
 * Read hook-crumbs.json and add any new crumbs earned by hooks since last drain.
 * MCP only reads this file, never writes — avoids race conditions with hooks.
 */
function drainHookCrumbs(gameState) {
  try {
    if (!existsSync(HOOK_CRUMBS_PATH)) return 0;
    const data = JSON.parse(readFileSync(HOOK_CRUMBS_PATH, 'utf-8'));
    const total = data.total || 0;
    const delta = total - lastDrainedHookCrumbs;
    lastDrainedHookCrumbs = total;
    if (delta > 0) {
      gameState.crumbs += delta;
      gameState._mcpEarned = (gameState._mcpEarned ?? 0) + delta;
      gameState.stats.crumbsEarned = (gameState.stats.crumbsEarned || 0) + delta;
    }
    return delta;
  } catch { return 0; }
}

// Initialize game systems — load existing save so crumbs persist across restarts
const existingSave = loadGame(1);
const engine = createEngine(existingSave.success ? { saveData: existingSave.data } : {});
const gameState = engine.getStateRef();

// Reset per-session CRDT counters so stale save values don't inflate crumbs
// when a running game already has different crumbs. These get re-seeded from
// the game's _lastMcpEarnedApplied on first live-state sync.
gameState._mcpEarned = 0;
gameState._mcpSpent = 0;
const sessions = createSessionTracker(SESSIONS_PATH);
const cookie = createCookieHandler(gameState);
const settings = createSettings(SETTINGS_PATH);
settings.load();
const scores = createScores();
scores.load();

// Live state bridge — syncs with terminal game if running
const liveState = createLiveState({
  getState: () => {
    const state = { ...engine.getStateRef() };
    // Write game-authoritative crumbs to live.json: subtract unapplied MCP
    // earnings so other processes (game, other MCPs) don't double-count them.
    // The delta is conveyed separately via _mcpEarned/_mcpSpent counters.
    const unapplied = ((state._mcpEarned ?? 0) - (state._lastMcpEarnedApplied ?? 0))
                    - ((state._mcpSpent ?? 0) - (state._lastMcpSpentApplied ?? 0));
    if (unapplied > 0) {
      state.crumbs = Math.max(0, (state.crumbs ?? 0) - unapplied);
    }
    return state;
  },
  setState: (external) => {
    const local = engine.getStateRef();

    // If external state has a newer newGameId, it's a full reset from the game
    // Only reset if external is strictly newer (higher timestamp)
    if (external.newGameId && external.newGameId > (local.newGameId ?? 0)) {
      for (const key of Object.keys(local)) delete local[key];
      Object.assign(local, external);
      return;
    }

    // Normal merge
    if (external.newGameId) local.newGameId = external.newGameId;

    // PN-Counter CRDT merge for crumbs:
    // Game is authoritative for crumbs. MCP tracks its own earned/spent counters.
    // MCP merge = game's crumbs + MCP's unapplied net delta.
    if (external.crumbs != null) {
      // Seed MCP counters from game's applied values when behind (new MCP session).
      // This ensures unapplied delta starts at 0 instead of replaying stale history.
      const gameAppliedEarn = external._lastMcpEarnedApplied ?? 0;
      const gameAppliedSpend = external._lastMcpSpentApplied ?? 0;
      if ((local._mcpEarned ?? 0) < gameAppliedEarn) {
        local._mcpEarned = gameAppliedEarn;
      }
      if ((local._mcpSpent ?? 0) < gameAppliedSpend) {
        local._mcpSpent = gameAppliedSpend;
      }

      local._mcpEarned = Math.max(local._mcpEarned ?? 0, external._mcpEarned ?? 0);
      local._mcpSpent = Math.max(local._mcpSpent ?? 0, external._mcpSpent ?? 0);

      const unappliedNet = ((local._mcpEarned ?? 0) - gameAppliedEarn) - ((local._mcpSpent ?? 0) - gameAppliedSpend);

      local.crumbs = Math.max(0, (external.crumbs ?? 0) + unappliedNet);
      local._lastMcpEarnedApplied = gameAppliedEarn;
      local._lastMcpSpentApplied = gameAppliedSpend;
    }
    if (external.totalToolCalls != null) local.totalToolCalls = Math.max(local.totalToolCalls ?? 0, external.totalToolCalls);
    if (external.tokenUsage != null) local.tokenUsage = Math.max(local.tokenUsage ?? 0, external.tokenUsage);
    if (external.tokenUsageDaily) {
      if (!local.tokenUsageDaily || local.tokenUsageDaily.date !== external.tokenUsageDaily.date) {
        local.tokenUsageDaily = external.tokenUsageDaily;
      } else {
        local.tokenUsageDaily.tokens = Math.max(local.tokenUsageDaily.tokens, external.tokenUsageDaily.tokens);
      }
    }
    if (external.tokenUsageMonthly) {
      if (!local.tokenUsageMonthly || local.tokenUsageMonthly.month !== external.tokenUsageMonthly.month) {
        local.tokenUsageMonthly = external.tokenUsageMonthly;
      } else {
        local.tokenUsageMonthly.tokens = Math.max(local.tokenUsageMonthly.tokens, external.tokenUsageMonthly.tokens);
      }
    }
    if (external.playTime != null) local.playTime = Math.max(local.playTime ?? 0, external.playTime);
    if (external.trophies && Array.isArray(external.trophies)) {
      local.trophies = local.trophies ?? [];
      for (const t of external.trophies) {
        if (!local.trophies.includes(t)) local.trophies.push(t);
      }
    }
    if (external.team) local.team = external.team;
    if (external.inventory) local.inventory = external.inventory;
    if (external.stats) Object.assign(local.stats, external.stats);
    if (external.dungeonProgress !== undefined) local.dungeonProgress = external.dungeonProgress;
    if (external.talisman) {
      local.talisman = local.talisman ?? { level: 1 };
      local.talisman.level = Math.max(local.talisman.level, external.talisman.level ?? 1);
    }
    if (external.village) {
      local.village = external.village;
    }
  },
  label: 'mcp',
});

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
  sessions,
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
      // Clear stale keys from current state that aren't in the save,
      // then load the save data cleanly
      const staleKeys = ['securityAlerts', 'securityLog', '_tavernRoster', 'activeNPC', 'skillModifiers'];
      for (const key of staleKeys) {
        delete gameState[key];
      }
      Object.assign(gameState, result.data);
    }
    return result;
  },
  setDungeon(dungeonState) {
    gameState.dungeonProgress = dungeonState;
  },
};

// Define tools (pass shared scanner to avoid loading rules twice)
const tools = defineTools({ scanner: aiScanner });
const toolMap = new Map(tools.map(t => [t.name, t]));

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

      // Pull any state changes from terminal game
      liveState.poll();

      // Drain background events that happened since last tool call
      const backgroundEvents = passiveRunner.drain();

      // Drain crumbs earned by Claude Code hooks (messages, selections, etc.)
      const hookCrumbs = drainHookCrumbs(gameState);

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
      gameState._mcpEarned = (gameState._mcpEarned ?? 0) + totalAutoClick;
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

      // AI Activity Scanner — scan tool params and results for security risks
      const aiMonitorEnabled = settings.get('security.aiMonitor') ?? true;
      if (aiMonitorEnabled) {
        try {
          // Scan input params
          const paramText = JSON.stringify(params || {});
          const paramScan = aiScanner.scan(paramText);

          // Scan output
          const outputText = result.content
            ?.filter(c => c.type === 'text')
            .map(c => c.text)
            .join('\n') || '';
          const outputScan = aiScanner.scan(outputText);

          // Collect findings
          const allFindings = [...paramScan.findings, ...outputScan.findings];
          const highRisk = allFindings.filter(f => f.risk_level === 'HIGH' || f.risk_level === 'CRITICAL');

          if (highRisk.length > 0) {
            if (!gameState.securityAlerts) gameState.securityAlerts = [];
            if (!gameState.securityLog) gameState.securityLog = [];

            const alert = {
              time: Date.now(),
              tool: name,
              findings: highRisk.map(f => ({ rule: f.rule_id, risk: f.risk_level })),
              summary: `${highRisk.length} security issue(s) in ${name}: ${highRisk.map(f => f.rule_id).join(', ')}`,
              dismissed: false,
            };

            gameState.securityAlerts.push(alert);
            gameState.securityLog.push(alert);

            // Cap security log at 100
            if (gameState.securityLog.length > 100) {
              gameState.securityLog = gameState.securityLog.slice(-100);
            }
          }
        } catch {
          // Scanner errors should never break the game
        }
      }

      // Estimate token usage from request+response text (~4 chars per token)
      const tokenInput = JSON.stringify(params || {});
      const tokenOutput = result.content
        ?.filter(c => c.type === 'text')
        .map(c => c.text)
        .join('\n') || '';
      const estimatedTokens = Math.ceil((tokenInput.length + tokenOutput.length) / 4);
      gameState.tokenUsage = (gameState.tokenUsage ?? 0) + estimatedTokens;

      // Daily/monthly token tracking
      const _now = new Date();
      const _today = _now.toISOString().slice(0, 10);
      const _month = _now.toISOString().slice(0, 7);

      if (!gameState.tokenUsageDaily || gameState.tokenUsageDaily.date !== _today) {
        gameState.tokenUsageDaily = { date: _today, tokens: 0 };
      }
      gameState.tokenUsageDaily.tokens += estimatedTokens;

      if (!gameState.tokenUsageMonthly || gameState.tokenUsageMonthly.month !== _month) {
        gameState.tokenUsageMonthly = { month: _month, tokens: 0 };
      }
      gameState.tokenUsageMonthly.tokens += estimatedTokens;

      // Autosave scores after every action
      try { scores.save(); } catch { /* best effort */ }

      // Sync state to live file so terminal game sees changes immediately
      liveState.write();

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
        if (hookCrumbs > 0) bonusParts.push(`+${hookCrumbs} hooks`);
        const breakdown = bonusParts.length > 0 ? ` (${earned} + ${bonusParts.join(' + ')})` : '';
        const totalWithHooks = totalAutoClick + hookCrumbs;
        appendParts.push(`  +${totalWithHooks} crumbs${breakdown} | ${reaction}`);
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

  // Start live state sync with terminal game
  liveState.start();

  // Poll hook crumbs every 5s so Claude interactions (selections, messages)
  // earn crumbs without needing an explicit tool call
  const HOOK_POLL_MS = 5000;
  const hookPollHandle = setInterval(() => {
    engine.mutex.withLock(() => {
      const drained = drainHookCrumbs(gameState);
      if (drained > 0) {
        liveState.write();
      }
    });
  }, HOOK_POLL_MS);

  // Autosave every 60s to a dedicated auto-save file (doesn't overwrite manual saves)
  const AUTOSAVE_DIR = join(PROJECT_ROOT, 'saves');
  const AUTOSAVE_PATH = join(AUTOSAVE_DIR, 'autosave.json');
  const AUTOSAVE_TMP = AUTOSAVE_PATH + '.tmp';
  autosaveHandle = setInterval(() => {
    engine.mutex.withLock(() => {
      try {
        if (!existsSync(AUTOSAVE_DIR)) mkdirSync(AUTOSAVE_DIR, { recursive: true });
        const data = { ...engine.getStateRef(), savedAt: new Date().toISOString(), _autosave: true };
        // Drain any hook crumbs before saving
        drainHookCrumbs(engine.getStateRef());
        // Atomic write: write to temp, then rename
        writeFileSync(AUTOSAVE_TMP, JSON.stringify(data, null, 2), 'utf-8');
        renameSync(AUTOSAVE_TMP, AUTOSAVE_PATH);
      } catch {
        // best-effort autosave
      }
    });
  }, 60000);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Clean up intervals and sessions on exit so the process releases the folder
process.on('exit', () => {
  if (hookPollHandle) clearInterval(hookPollHandle);
  if (autosaveHandle) clearInterval(autosaveHandle);
  passiveRunner.stop();
  liveState.stop();
  sessions.deregister();
});

main().catch((err) => {
  process.stderr.write(`Fatal: ${err.message}\n`);
  process.exit(1);
});
