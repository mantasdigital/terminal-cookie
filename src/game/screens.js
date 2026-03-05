/**
 * Screen manager — maps engine states to render functions and input handlers.
 * Each screen: { render(state, renderer), handleInput(key, engine) → void }
 */

import { GameState } from '../core/engine.js';
import { titleScreen, masterCookie, miniCookie, dungeonMap, monsterArt, lootIcon, teamMember } from '../ui/ascii.js';
import { renderHelp } from '../ui/help.js';
import { buildPortrait } from './team.js';
import { resolveRoll } from './combat.js';
import { loadLeaderboard, formatLeaderboardCompact, formatLeaderboardFull } from '../leaderboard/leaderboard.js';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatCrumbs } from '../ui/format.js';

const __screens_dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__screens_dirname, '..', '..');
const SESSIONS_PATH = join(PROJECT_ROOT, 'data', 'sessions.json');
const COOKIE_BIN = join(PROJECT_ROOT, 'bin', 'cookie.js');
const SESSION_TTL_MS = 60_000;

// Cache leaderboard data once at import time
let _leaderboardCache = null;
try { _leaderboardCache = loadLeaderboard(); } catch { _leaderboardCache = { entries: [] }; }

/**
 * Check if any MCP/Claude AI sessions are currently active.
 * Results are cached for 5 seconds to avoid 30+ fs reads/sec.
 * Returns { connected: boolean, count: number }
 */
let _aiCache = { connected: false, count: 0 };
let _aiCacheTime = 0;
const AI_CACHE_TTL = 5000;

function checkAIConnection() {
  const now = Date.now();
  if (now - _aiCacheTime < AI_CACHE_TTL) return _aiCache;

  try {
    if (!existsSync(SESSIONS_PATH)) {
      _aiCache = { connected: false, count: 0 };
    } else {
      const data = JSON.parse(readFileSync(SESSIONS_PATH, 'utf-8'));
      let count = 0;
      for (const session of Object.values(data.sessions || {})) {
        if (now - session.lastSeen <= SESSION_TTL_MS) count++;
      }
      _aiCache = { connected: count > 0, count };
    }
  } catch {
    _aiCache = { connected: false, count: 0 };
  }

  _aiCacheTime = now;
  return _aiCache;
}

/**
 * Render AI connection badge in top-right corner.
 * Only renders if settings.game.showAIStatus is true (or settings not available).
 */
function renderAIBadge(state, renderer) {
  const showAI = state.settings?.game?.showAIStatus ?? true;
  if (!showAI) return;

  const cols = renderer.capabilities.cols;
  const ai = checkAIConnection();
  let badge;
  if (ai.connected) {
    badge = ai.count > 1 ? `AI: ${ai.count} connected` : 'AI: connected';
    badge = renderer.color(badge, 'green');
  } else {
    badge = renderer.dim('AI: --');
  }
  // Right-align at row 0
  const badgeLen = ai.connected ? (ai.count > 1 ? 16 : 13) : 6;
  renderer.bufferWrite(0, Math.max(0, cols - badgeLen - 1), badge);
}

/**
 * Render security alert banner at the top of the screen.
 * Auto-dismisses alerts older than 15 seconds.
 */
function renderSecurityBanner(state, renderer) {
  if (!state.securityAlerts || state.securityAlerts.length === 0) return;

  const now = Date.now();
  // Auto-dismiss alerts older than 15 seconds
  // Note: we filter but don't mutate state here (render is read-only)
  const active = state.securityAlerts.filter(a => now - a.time < 15000);
  if (active.length === 0) return;

  const latest = active[active.length - 1];
  const cols = renderer.capabilities.cols;
  const banner = `[!] SECURITY: ${latest.summary}`;
  renderer.bufferWrite(1, 0, renderer.color(banner.substring(0, cols), 'red'));
}

/**
 * Render security log overlay (toggled with ! key).
 * Shows the last 20 entries from state.securityLog.
 */
function renderSecurityLogOverlay(state, renderer) {
  if (!ui.securityLogVisible) return;

  const log = state.securityLog ?? [];
  const cols = renderer.capabilities.cols;
  const rows = renderer.capabilities.rows;
  const maxEntries = Math.min(log.length, 20);
  const height = maxEntries + 4;
  const width = Math.min(cols - 4, 70);
  const startRow = Math.max(0, Math.floor((rows - height) / 2));
  const startCol = Math.max(0, Math.floor((cols - width) / 2));

  // Border
  const border = '+' + '-'.repeat(width - 2) + '+';
  renderer.bufferWrite(startRow, startCol, border);
  const title = '| SECURITY LOG (press ! to close)';
  renderer.bufferWrite(startRow + 1, startCol, title + ' '.repeat(Math.max(0, width - title.length - 1)) + '|');

  if (log.length === 0) {
    const empty = '|  No security events recorded.';
    renderer.bufferWrite(startRow + 2, startCol, empty + ' '.repeat(Math.max(0, width - empty.length - 1)) + '|');
  } else {
    const recent = log.slice(-maxEntries);
    for (let i = 0; i < recent.length; i++) {
      const entry = recent[i];
      const time = new Date(entry.time).toLocaleTimeString();
      const line = `|  [${time}] ${entry.summary}`;
      const trimmed = line.substring(0, width - 1);
      renderer.bufferWrite(startRow + 2 + i, startCol,
        renderer.color(trimmed + ' '.repeat(Math.max(0, width - trimmed.length - 1)) + '|', 'red'));
    }
  }

  const bottomRow = startRow + 2 + Math.max(maxEntries, 1);
  renderer.bufferWrite(bottomRow, startCol, border);
}

// ── Shared helpers ──────────────────────────────────────────────────

function hpBar(current, max, width = 20) {
  const filled = Math.round((current / Math.max(max, 1)) * width);
  return '[' + '#'.repeat(filled) + '-'.repeat(width - filled) + '] ' + current + '/' + max;
}

function truncate(str, len) {
  return str.length > len ? str.substring(0, len - 1) + '~' : str;
}

// ── Menu state for each screen ──────────────────────────────────────

/** Persistent UI state across render/input cycles. */
const ui = {
  menuIndex: 0,
  tavernTab: 'party',    // party | recruit | inventory
  dungeonChoice: 0,
  lootIndex: 0,
  settingIndex: 0,
  helpVisible: false,
  leaderboardVisible: false,
  securityLogVisible: false,
  notification: '',
  notificationTimeout: null,
  modeSelectVisible: false,
  modeSelection: 0, // 0=default, 1=work
};

function notify(renderer, msg, level = 'info') {
  renderer.showNotification(msg, level);
  ui.notification = msg;
}

/**
 * Render work mode badge on all screens when in work mode.
 */
function renderWorkModeBadge(state, renderer) {
  if (state.gameMode !== 'work') return;
  renderer.bufferWrite(0, 2, renderer.color(' WORK MODE ', 'yellow'));

  // Show last 5 passive log entries near bottom
  const log = state.passiveLog ?? [];
  const recent = log.slice(-5);
  const rows = renderer.capabilities.rows;
  const startRow = Math.max(0, rows - 7);
  for (let i = 0; i < recent.length; i++) {
    const entry = typeof recent[i] === 'string' ? recent[i] : recent[i]?.message ?? '';
    renderer.bufferWrite(startRow + i, 2, renderer.dim(truncate(entry, renderer.capabilities.cols - 4)));
  }
}

// ── MENU SCREEN ─────────────────────────────────────────────────────

const menuOptions = ['New Game', 'Load Game', 'Leaderboard', 'Settings', 'Quit'];

const menuScreen = {
  render(state, renderer) {
    renderer.clear();
    const cols = renderer.capabilities.cols;
    const title = titleScreen();
    const lines = title.split('\n');
    for (let i = 0; i < lines.length; i++) {
      renderer.bufferWrite(1 + i, 0, renderer.centerText(lines[i], cols));
    }

    // Compact leaderboard between title and menu
    const lbEntries = _leaderboardCache?.entries ?? [];
    if (lbEntries.length > 0) {
      const lbText = formatLeaderboardCompact(lbEntries, 5);
      const lbLines = lbText.split('\n');
      const lbTop = lines.length + 2;
      for (let i = 0; i < lbLines.length; i++) {
        renderer.bufferWrite(lbTop + i, 0, renderer.centerText(renderer.dim(lbLines[i]), cols));
      }
    }

    const menuTop = lines.length + (lbEntries.length > 0 ? 2 + Math.min(lbEntries.length, 5) + 2 : 3);
    for (let i = 0; i < menuOptions.length; i++) {
      const prefix = i === ui.menuIndex ? ' > ' : '   ';
      const label = prefix + menuOptions[i];
      const styled = i === ui.menuIndex ? renderer.bold(label) : label;
      renderer.bufferWrite(menuTop + i, 0, renderer.centerText(styled, cols));
    }

    // AI connection status (in menu body — shown regardless of badge setting)
    const ai = checkAIConnection();
    const aiRow = menuTop + menuOptions.length + 2;
    if (ai.connected) {
      const aiLabel = ai.count > 1
        ? `Claude AI connected (${ai.count} sessions)`
        : 'Claude AI connected';
      renderer.bufferWrite(aiRow, 0, renderer.centerText(renderer.color(aiLabel, 'green'), cols));
    } else {
      renderer.bufferWrite(aiRow, 0, renderer.centerText(renderer.dim('Claude AI: not connected'), cols));
      renderer.bufferWrite(aiRow + 1, 0, renderer.centerText(renderer.dim('Step 1: Run this in another terminal:'), cols));
      renderer.bufferWrite(aiRow + 2, 0, renderer.centerText(`claude mcp add terminal-cookie -- node ${COOKIE_BIN} --mcp`, cols));
      renderer.bufferWrite(aiRow + 3, 0, renderer.centerText(renderer.dim('Step 2: Tell Claude: "Click the cookie"'), cols));
    }

    renderer.showStatus('Arrows=navigate Enter=select L=leaderboard Q=quit ?=help');
    renderAIBadge(state, renderer);
    renderSecurityBanner(state, renderer);
    renderSecurityLogOverlay(state, renderer);

    // Full leaderboard overlay
    if (ui.leaderboardVisible) {
      const fullLb = formatLeaderboardFull(lbEntries);
      const lbOverlayLines = fullLb.split('\n');
      const startRow = Math.max(0, Math.floor((renderer.capabilities.rows - lbOverlayLines.length) / 2));
      const startCol = Math.max(0, Math.floor((cols - (lbOverlayLines[0]?.length ?? 0)) / 2));
      for (let i = 0; i < lbOverlayLines.length; i++) {
        renderer.bufferWrite(startRow + i, startCol, lbOverlayLines[i]);
      }
    }

    if (ui.helpVisible) {
      const help = renderHelp('MENU');
      const helpLines = help.split('\n');
      const startRow = Math.max(0, Math.floor((renderer.capabilities.rows - helpLines.length) / 2));
      const startCol = Math.max(0, Math.floor((cols - (helpLines[0]?.length ?? 0)) / 2));
      for (let i = 0; i < helpLines.length; i++) {
        renderer.bufferWrite(startRow + i, startCol, helpLines[i]);
      }
    }

    // Mode selection overlay
    if (ui.modeSelectVisible) {
      const rows = renderer.capabilities.rows;
      const midCol = Math.floor(cols / 2);
      const startRow = Math.max(2, Math.floor(rows / 2) - 6);

      // Clear center area
      for (let r = startRow - 1; r < startRow + 12; r++) {
        renderer.bufferWrite(r, 0, ' '.repeat(cols));
      }

      const titleText = '=== Choose Your Mode ===';
      renderer.bufferWrite(startRow, Math.floor((cols - titleText.length) / 2), renderer.bold(titleText));

      const dividerCol = midCol;
      const leftCol = Math.max(2, midCol - 24);
      const rightCol = midCol + 3;

      const leftLines = [
        'DEFAULT MODE',
        '',
        'You make all choices',
        'Full dungeon crawler',
        'Manual recruiting',
        'Control every action',
      ];
      const rightLines = [
        'WORK MODE',
        '',
        'Game plays itself',
        'Focus on your coding',
        'Auto-recruit & fight',
        'Never blocks for input',
      ];

      const isLeft = ui.modeSelection === 0;
      for (let i = 0; i < leftLines.length; i++) {
        const row = startRow + 2 + i;
        const leftText = isLeft ? renderer.bold(leftLines[i]) : renderer.dim(leftLines[i]);
        const rightText = !isLeft ? renderer.bold(rightLines[i]) : renderer.dim(rightLines[i]);
        renderer.bufferWrite(row, leftCol, leftText);
        if (i > 0) renderer.bufferWrite(row, dividerCol, '|');
        renderer.bufferWrite(row, rightCol, rightText);
      }

      // Selection markers
      const markerRow = startRow + 2;
      if (isLeft) {
        renderer.bufferWrite(markerRow, leftCol - 3, renderer.bold('>>'));
        renderer.bufferWrite(markerRow, leftCol + 14, renderer.bold('<<'));
      } else {
        renderer.bufferWrite(markerRow, rightCol - 3, renderer.bold('>>'));
        renderer.bufferWrite(markerRow, rightCol + 11, renderer.bold('<<'));
      }

      const helpRow = startRow + 9;
      const helpText = 'Left/Right=choose  Enter=confirm  Esc=back';
      renderer.bufferWrite(helpRow, Math.floor((cols - helpText.length) / 2), renderer.dim(helpText));
    }

    renderWorkModeBadge(state, renderer);
    renderer.render();
  },

  async handleInput(key, engine) {
    // Mode selection overlay intercepts all keys
    if (ui.modeSelectVisible) {
      if (key === 'left' || key === 'right') {
        ui.modeSelection = ui.modeSelection === 0 ? 1 : 0;
      } else if (key === 'enter') {
        const state = engine.getStateRef();
        state.gameMode = ui.modeSelection === 0 ? 'default' : 'work';
        ui.modeSelectVisible = false;
        await engine.transition(GameState.TAVERN);
      } else if (key === 'escape') {
        ui.modeSelectVisible = false;
      }
      return;
    }

    if (key === '!') { ui.securityLogVisible = !ui.securityLogVisible; return; }
    if (ui.securityLogVisible) { if (key === 'escape') ui.securityLogVisible = false; return; }
    if (key === '?') { ui.helpVisible = !ui.helpVisible; return; }
    if (ui.helpVisible) { if (key === 'escape') ui.helpVisible = false; return; }
    if (ui.leaderboardVisible) { if (key === 'escape' || key === 'l') ui.leaderboardVisible = false; return; }

    if (key === 'up') ui.menuIndex = (ui.menuIndex - 1 + menuOptions.length) % menuOptions.length;
    else if (key === 'down') ui.menuIndex = (ui.menuIndex + 1) % menuOptions.length;
    else if (key === 'enter' || key === 'space') {
      switch (ui.menuIndex) {
        case 0: // New Game
          ui.modeSelectVisible = true;
          ui.modeSelection = 0;
          break;
        case 1: // Load Game
          await engine.transition(GameState.TAVERN);
          break;
        case 2: // Leaderboard
          ui.leaderboardVisible = !ui.leaderboardVisible;
          break;
        case 3: // Settings
          await engine.transition(GameState.SETTINGS);
          break;
        case 4: // Quit
          await engine.shutdown();
          break;
      }
    } else if (key === 'n') {
      ui.modeSelectVisible = true;
      ui.modeSelection = 0;
    } else if (key === 'l') {
      ui.leaderboardVisible = !ui.leaderboardVisible;
    } else if (key === 's') {
      await engine.transition(GameState.SETTINGS);
    } else if (key === 'q' || key === 'escape') {
      await engine.shutdown();
    }
  },
};

// ── TAVERN SCREEN ───────────────────────────────────────────────────

const tavernScreen = {
  render(state, renderer) {
    renderer.clear();
    const cols = renderer.capabilities.cols;

    renderer.showHeader('=== The Tavern ===');

    // Cookie area
    const cookieArt = miniCookie().split('\n');
    for (let i = 0; i < cookieArt.length; i++) {
      renderer.bufferWrite(2 + i, 2, cookieArt[i]);
    }
    renderer.bufferWrite(2, 12, renderer.bold(`Crumbs: ${formatCrumbs(state.crumbs ?? 0)}`));
    renderer.bufferWrite(3, 12, renderer.dim('Earned via AI interactions'));

    // Tabs
    const tabs = ['[Party]', '[Recruit]', '[Inventory]'];
    const tabMap = ['party', 'recruit', 'inventory'];
    let tabStr = '';
    for (let i = 0; i < tabs.length; i++) {
      const active = tabMap[i] === ui.tavernTab;
      tabStr += (active ? renderer.bold(tabs[i]) : renderer.dim(tabs[i])) + '  ';
    }
    renderer.bufferWrite(6, 2, tabStr);

    const contentTop = 8;

    if (ui.tavernTab === 'party') {
      const team = state.team ?? [];
      if (team.length === 0) {
        renderer.bufferWrite(contentTop, 4, 'No team members yet. Press [R] to recruit!');
      } else {
        for (let i = 0; i < Math.min(team.length, 6); i++) {
          const m = team[i];
          const portrait = buildPortrait(m);
          for (let j = 0; j < portrait.length; j++) {
            renderer.bufferWrite(contentTop + i * 5 + j, 4, portrait[j]);
          }
          const info = `${m.name} Lv${m.level} ${m.race} ${m.class} HP:${hpBar(m.currentHp, m.maxHp, 10)}`;
          renderer.bufferWrite(contentTop + i * 5, 16, truncate(info, cols - 20));
          const stats = `ATK:${m.stats.atk} DEF:${m.stats.def} SPD:${m.stats.spd} LCK:${m.stats.lck}`;
          renderer.bufferWrite(contentTop + i * 5 + 1, 16, stats);
        }
      }
    } else if (ui.tavernTab === 'recruit') {
      const roster = state.tavernRoster ?? [];
      if (roster.length === 0) {
        renderer.bufferWrite(contentTop, 4, 'No recruits available. Clear a dungeon to refresh.');
      } else {
        const crumbs = state.crumbs ?? 0;
        for (let i = 0; i < roster.length; i++) {
          const m = roster[i];
          const prefix = i === ui.menuIndex ? '> ' : '  ';
          const affordable = crumbs >= m.cost;
          const costLabel = affordable ? `${m.cost} crumbs` : renderer.color(`${m.cost} crumbs (need ${m.cost - crumbs} more)`, 'red');
          const info = `${prefix}${m.name} ${m.race} ${m.class} (${m.personality}) - ${costLabel}`;
          renderer.bufferWrite(contentTop + i * 2, 4, truncate(info, cols - 8));
          const stats = `    HP:${m.stats.hp} ATK:${m.stats.atk} DEF:${m.stats.def} SPD:${m.stats.spd} LCK:${m.stats.lck}`;
          renderer.bufferWrite(contentTop + i * 2 + 1, 4, stats);
        }
        renderer.bufferWrite(contentTop + roster.length * 2 + 1, 4, renderer.dim('Use Up/Down to browse, Enter to recruit'));
      }
    } else if (ui.tavernTab === 'inventory') {
      const inv = state.inventory ?? [];
      if (inv.length === 0) {
        renderer.bufferWrite(contentTop, 4, 'Inventory is empty.');
      } else {
        for (let i = 0; i < Math.min(inv.length, 12); i++) {
          const item = inv[i];
          const icon = lootIcon(item.slot ?? 'weapon', item.rarity ?? 'common');
          renderer.bufferWrite(contentTop + i, 4, `${icon} ${item.name ?? 'Unknown'} (${item.rarity ?? '?'}) val:${item.value ?? 0}`);
        }
        if (inv.length > 12) {
          renderer.bufferWrite(contentTop + 12, 4, `... and ${inv.length - 12} more`);
        }
      }
    }

    // Dungeon auto-start timer
    if (state.dungeonTimer && state.dungeonTimer.remaining > 0) {
      const secs = Math.ceil(state.dungeonTimer.remaining / 1000);
      const barWidth = 20;
      const filled = Math.round((state.dungeonTimer.remaining / state.dungeonTimer.total) * barWidth);
      const timerBar = '[' + '='.repeat(filled) + ' '.repeat(barWidth - filled) + ']';
      const timerRow = renderer.capabilities.rows - 4;
      renderer.bufferWrite(timerRow, 4, renderer.bold('Dungeon starts in: ') + renderer.color(`${secs}s`, 'yellow') + ' ' + timerBar);
      renderer.bufferWrite(timerRow + 1, 4, renderer.dim('Press [E] to enter now'));
    }

    renderer.showStatus('R=recruit I=inventory E=dungeon W=save Ctrl-C=quit ?=help');
    renderAIBadge(state, renderer);
    renderWorkModeBadge(state, renderer);
    renderSecurityBanner(state, renderer);
    renderSecurityLogOverlay(state, renderer);
    if (ui.helpVisible) {
      const help = renderHelp('TAVERN');
      const helpLines = help.split('\n');
      const startRow = Math.max(0, Math.floor((renderer.capabilities.rows - helpLines.length) / 2));
      const startCol = Math.max(0, Math.floor((renderer.capabilities.cols - (helpLines[0]?.length ?? 0)) / 2));
      for (let i = 0; i < helpLines.length; i++) {
        renderer.bufferWrite(startRow + i, startCol, helpLines[i]);
      }
    }
    renderer.render();
  },

  async handleInput(key, engine) {
    if (key === '!') { ui.securityLogVisible = !ui.securityLogVisible; return; }
    if (ui.securityLogVisible) { if (key === 'escape') ui.securityLogVisible = false; return; }
    if (key === '?') { ui.helpVisible = !ui.helpVisible; return; }
    if (ui.helpVisible) { if (key === 'escape') ui.helpVisible = false; return; }

    const state = engine.getState();

    switch (key) {
      case 'r':
        ui.tavernTab = 'recruit';
        ui.menuIndex = 0;
        break;
      case 'i':
        ui.tavernTab = 'inventory';
        break;
      case 'left':
        { const tabs = ['party', 'recruit', 'inventory'];
          const idx = tabs.indexOf(ui.tavernTab);
          ui.tavernTab = tabs[(idx - 1 + tabs.length) % tabs.length]; }
        break;
      case 'right':
        { const tabs = ['party', 'recruit', 'inventory'];
          const idx = tabs.indexOf(ui.tavernTab);
          ui.tavernTab = tabs[(idx + 1) % tabs.length]; }
        break;
      case 'up':
        ui.menuIndex = Math.max(0, ui.menuIndex - 1);
        break;
      case 'down':
        ui.menuIndex++;
        break;
      case 'enter':
        if (ui.tavernTab === 'recruit') return 'recruit_select';
        break;
      case 'e': case 'd':
        if ((state.team ?? []).length > 0) {
          return 'explore_dungeon';
        }
        break;
      case 'w':
        return 'save_game';
      case 's':
        await engine.transition(GameState.SETTINGS);
        break;
      case 'escape':
        await engine.transition(GameState.MENU);
        break;
    }
  },
};

// ── DUNGEON SCREEN ──────────────────────────────────────────────────

const dungeonScreen = {
  render(state, renderer) {
    renderer.clear();
    const cols = renderer.capabilities.cols;
    const dp = state.dungeonProgress;

    renderer.showHeader('=== Dungeon ===');

    if (!dp) {
      renderer.bufferWrite(3, 4, 'Preparing dungeon...');
      renderer.render();
      return;
    }

    // Dungeon map
    if (dp.rooms) {
      const mapArt = dungeonMap(dp.rooms, dp.currentRoom ?? 0);
      const mapLines = mapArt.split('\n');
      for (let i = 0; i < Math.min(mapLines.length, 12); i++) {
        renderer.bufferWrite(2 + i, 2, mapLines[i]);
      }
    }

    // Room description
    const room = dp.rooms?.find(r => r.id === dp.currentRoom);
    const roomCol = Math.min(35, Math.floor(cols / 2));
    if (room) {
      renderer.bufferWrite(2, roomCol, renderer.bold(`Room: ${room.name ?? 'Unknown'}`));
      renderer.bufferWrite(3, roomCol, room.description ?? 'An empty chamber.');

      // Room content
      if (room.content === 'enemy') {
        renderer.bufferWrite(5, roomCol, renderer.color('Enemy spotted!', 'red'));
        if (room.enemy) {
          const art = monsterArt(room.enemy.template ?? 'slime', room.enemy.mutations ?? []);
          const artLines = art.split('\n');
          for (let i = 0; i < artLines.length; i++) {
            renderer.bufferWrite(6 + i, roomCol, artLines[i]);
          }
        }
      } else if (room.content === 'loot') {
        renderer.bufferWrite(5, roomCol, renderer.color('Treasure found!', 'yellow'));
      } else if (room.content === 'trap') {
        renderer.bufferWrite(5, roomCol, renderer.color('A trap!', 'red'));
      } else if (room.content === 'shrine') {
        renderer.bufferWrite(5, roomCol, renderer.color('A mysterious shrine...', 'cyan'));
      } else if (room.content === 'npc') {
        renderer.bufferWrite(5, roomCol, renderer.color('A mysterious figure...', 'magenta'));
        if (state.activeNPC) {
          renderer.bufferWrite(6, roomCol, renderer.bold(state.activeNPC.name));
          renderer.bufferWrite(7, roomCol, truncate(`"${state.activeNPC.dialogue}"`, cols - roomCol - 2));
        }
      }

      // Story log — latest 3 entries
      const storyLog = state.storyLog || [];
      const recentStory = storyLog.slice(-3);
      if (recentStory.length > 0) {
        const storyRow = 10;
        renderer.bufferWrite(storyRow, roomCol, renderer.dim('-- Story --'));
        for (let i = 0; i < recentStory.length; i++) {
          renderer.bufferWrite(storyRow + 1 + i, roomCol, renderer.dim(truncate(recentStory[i].text, cols - roomCol - 2)));
        }
      }

      // Fork options
      const conns = room.connections ?? [];
      if (conns.length > 1) {
        renderer.bufferWrite(14, roomCol, 'Choose a path:');
        for (let i = 0; i < conns.length; i++) {
          const target = dp.rooms?.find(r => r.id === conns[i]);
          const prefix = i === ui.dungeonChoice ? '> ' : '  ';
          renderer.bufferWrite(15 + i, roomCol, `${prefix}${target?.name ?? 'Path ' + (i + 1)}`);
        }
      }
    }

    // Active skill modifiers
    const team = state.team ?? [];
    const partyRow = renderer.capabilities.rows - 4;
    const mods = state.skillModifiers || [];
    if (mods.length > 0) {
      const modRow = partyRow - 2;
      const modStr = mods.map(m => `${m.stat}${m.amount > 0 ? '+' : ''}${m.amount}(${m.duration === -1 ? 'perm' : m.duration + 'r'})`).join(' ');
      renderer.bufferWrite(modRow, 2, renderer.dim('Mods: ' + truncate(modStr, cols - 6)));
    }

    // Party summary along bottom
    for (let i = 0; i < Math.min(team.length, 4); i++) {
      const m = team[i];
      const col = i * Math.floor(cols / 4);
      renderer.bufferWrite(partyRow, col, `${m.name} ${hpBar(m.currentHp, m.maxHp, 8)}`);
    }

    renderer.showStatus('Arrows=navigate Enter=interact W=save ?=help');
    renderAIBadge(state, renderer);
    renderWorkModeBadge(state, renderer);
    renderSecurityBanner(state, renderer);
    renderSecurityLogOverlay(state, renderer);
    if (ui.helpVisible) {
      const help = renderHelp('DUNGEON');
      const helpLines = help.split('\n');
      const startRow = Math.max(0, Math.floor((renderer.capabilities.rows - helpLines.length) / 2));
      const startCol = Math.max(0, Math.floor((renderer.capabilities.cols - (helpLines[0]?.length ?? 0)) / 2));
      for (let i = 0; i < helpLines.length; i++) {
        renderer.bufferWrite(startRow + i, startCol, helpLines[i]);
      }
    }
    renderer.render();
  },

  async handleInput(key, engine) {
    if (key === '!') { ui.securityLogVisible = !ui.securityLogVisible; return; }
    if (ui.securityLogVisible) { if (key === 'escape') ui.securityLogVisible = false; return; }
    if (key === '?') { ui.helpVisible = !ui.helpVisible; return; }
    if (ui.helpVisible) { if (key === 'escape') ui.helpVisible = false; return; }

    const state = engine.getState();
    const dp = state.dungeonProgress;

    switch (key) {
      case 'up': case 'left':
        ui.dungeonChoice = Math.max(0, ui.dungeonChoice - 1);
        break;
      case 'down': case 'right':
        ui.dungeonChoice++;
        break;
      case 'enter':
        return 'dungeon_interact';
      case 'w':
        return 'save_game';
    }
  },
};

// ── COMBAT SCREEN ───────────────────────────────────────────────────

const combatScreen = {
  render(state, renderer) {
    renderer.clear();
    const cols = renderer.capabilities.cols;
    const combat = state.activeCombat;

    renderer.showHeader(`=== Combat - Round ${combat?.round ?? 1} ===`);

    if (!combat) {
      renderer.bufferWrite(3, 4, 'Preparing for battle...');
      renderer.render();
      return;
    }

    // Enemies (top portion)
    const enemies = (combat.combatants ?? []).filter(c => c.side === 'enemy' && c.currentHp > 0);
    for (let i = 0; i < Math.min(enemies.length, 4); i++) {
      const e = enemies[i];
      const col = 4 + i * Math.floor(cols / 4);
      renderer.bufferWrite(2, col, renderer.color(e.name, 'red'));
      renderer.bufferWrite(3, col, hpBar(e.currentHp, e.maxHp, 10));
      if (e.template) {
        const art = monsterArt(e.template, []);
        const artLines = art.split('\n');
        for (let j = 0; j < Math.min(artLines.length, 4); j++) {
          renderer.bufferWrite(4 + j, col, artLines[j]);
        }
      }
    }

    // Roll bar area
    const rollRow = 10;
    if (state.rollBarState) {
      renderer.bufferWrite(rollRow, 4, renderer.bold('Roll Bar:'));
      renderer.bufferWrite(rollRow + 1, 4, state.rollBarState.display ?? '[--roll--]');
    }

    // Team (bottom portion)
    const team = (combat.combatants ?? []).filter(c => c.side === 'team');
    const teamRow = 13;
    for (let i = 0; i < Math.min(team.length, 4); i++) {
      const m = team[i];
      const col = 4 + i * Math.floor(cols / 4);
      const nameColor = m.currentHp > 0 ? 'green' : 'brightBlack';
      renderer.bufferWrite(teamRow, col, renderer.color(m.name, nameColor));
      renderer.bufferWrite(teamRow + 1, col, hpBar(m.currentHp, m.maxHp, 10));
      const portrait = buildPortrait(m);
      for (let j = 0; j < portrait.length; j++) {
        renderer.bufferWrite(teamRow + 2 + j, col, portrait[j]);
      }
    }

    // Current turn indicator
    const current = combat.currentTurn?.();
    if (current) {
      renderer.bufferWrite(teamRow + 6, 4, `>> ${current.name}'s turn`);
    }

    // Combat log (right side)
    const log = combat.log ?? [];
    const logCol = Math.max(cols - 40, Math.floor(cols / 2));
    renderer.bufferWrite(2, logCol, renderer.bold('-- Battle Log --'));
    const recentLog = log.slice(-10);
    for (let i = 0; i < recentLog.length; i++) {
      renderer.bufferWrite(3 + i, logCol, truncate(recentLog[i], 38));
    }

    renderer.showStatus('Space/Enter=roll | A=attack S=special U=item F=flee | ?=help');
    renderAIBadge(state, renderer);
    renderWorkModeBadge(state, renderer);
    renderSecurityBanner(state, renderer);
    renderSecurityLogOverlay(state, renderer);
    if (ui.helpVisible) {
      const help = renderHelp('COMBAT');
      const helpLines = help.split('\n');
      const startRow = Math.max(0, Math.floor((renderer.capabilities.rows - helpLines.length) / 2));
      const startCol = Math.max(0, Math.floor((renderer.capabilities.cols - (helpLines[0]?.length ?? 0)) / 2));
      for (let i = 0; i < helpLines.length; i++) {
        renderer.bufferWrite(startRow + i, startCol, helpLines[i]);
      }
    }
    renderer.render();
  },

  async handleInput(key, engine) {
    if (key === '!') { ui.securityLogVisible = !ui.securityLogVisible; return; }
    if (ui.securityLogVisible) { if (key === 'escape') ui.securityLogVisible = false; return; }
    if (key === '?') { ui.helpVisible = !ui.helpVisible; return; }
    if (ui.helpVisible) { if (key === 'escape') ui.helpVisible = false; return; }

    switch (key) {
      case 'space': case 'enter':
        return 'roll_stop';
      case 'a':
        return 'attack';
      case 's':
        return 'special';
      case 'u':
        return 'use_item';
      case 'f':
        return 'flee';
    }
  },
};

// ── LOOT SCREEN ─────────────────────────────────────────────────────

const lootScreen = {
  render(state, renderer) {
    renderer.clear();
    const cols = renderer.capabilities.cols;

    // Spin wheel mode
    if (state.spinWheel) {
      renderer.showHeader('=== Spin the Wheel! ===');
      const wheel = state.spinWheel;
      const prizes = wheel.prizes ?? [];
      const selectedIdx = wheel.selectedIdx ?? -1;
      const spinning = wheel.spinning ?? false;

      renderer.bufferWrite(3, 4, spinning
        ? renderer.color('>>> SPINNING... <<<', 'yellow')
        : renderer.bold('Press Enter to spin!'));

      for (let i = 0; i < prizes.length; i++) {
        const prefix = i === selectedIdx ? renderer.color(' >> ', 'yellow') : '    ';
        const rarity = prizes[i].rarity ?? 'common';
        const color = rarity === 'legendary' ? 'yellow' : rarity === 'rare' ? 'cyan' : rarity === 'uncommon' ? 'green' : 'brightBlack';
        renderer.bufferWrite(5 + i, 4, prefix + renderer.color(`[${rarity.toUpperCase()}] ${prizes[i].name}`, color));
      }

      if (!spinning && selectedIdx >= 0) {
        const won = prizes[selectedIdx];
        renderer.bufferWrite(5 + prizes.length + 1, 4, renderer.bold(`You won: ${won?.name ?? 'something'}!`));
        renderer.bufferWrite(5 + prizes.length + 2, 4, '[E] Equip   [S] Sell   [Enter] Continue');
      }

      renderer.showStatus(spinning ? 'Spinning...' : 'Enter=spin/continue E=equip S=sell');
      renderAIBadge(state, renderer);
      renderWorkModeBadge(state, renderer);
      renderer.render();
      return;
    }

    renderer.showHeader('=== Loot Found! ===');

    const loot = state.pendingLoot ?? [];
    if (loot.length === 0) {
      renderer.bufferWrite(3, 4, 'Nothing found.');
      renderer.bufferWrite(5, 4, 'Press Enter to continue...');
      renderer.render();
      return;
    }

    for (let i = 0; i < loot.length; i++) {
      const item = loot[i];
      const prefix = i === ui.lootIndex ? '> ' : '  ';
      const icon = lootIcon(item.slot ?? 'weapon', item.rarity ?? 'common');
      const selected = i === ui.lootIndex;
      const line = `${prefix}${icon} ${item.name ?? 'Unknown Item'} (${item.rarity ?? 'common'})`;
      renderer.bufferWrite(3 + i * 3, 4, selected ? renderer.bold(line) : line);

      // Item stats
      if (item.stats) {
        const statLine = Object.entries(item.stats).map(([k, v]) => `${k}:${v > 0 ? '+' : ''}${v}`).join(' ');
        renderer.bufferWrite(4 + i * 3, 8, statLine);
      }
      renderer.bufferWrite(5 + i * 3, 8, `Value: ${item.value ?? 0} crumbs`);
    }

    // Actions for selected item
    const actionsRow = 3 + loot.length * 3 + 1;
    renderer.bufferWrite(actionsRow, 4, renderer.bold('Actions:'));
    renderer.bufferWrite(actionsRow + 1, 6, '[E] Equip   [S] Sell   [D] Discard   [Enter] Next');

    renderer.showStatus('Up/Down=select E=equip S=sell D=discard Enter=continue');
    renderAIBadge(state, renderer);
    renderWorkModeBadge(state, renderer);
    renderer.render();
  },

  async handleInput(key, engine) {
    const stateRef = engine.getStateRef();

    // Spin wheel mode
    if (stateRef.spinWheel) {
      const wheel = stateRef.spinWheel;
      if (key === 'enter') {
        if (wheel.spinning) return; // already spinning
        if (wheel.selectedIdx < 0) {
          // Start spin
          return 'spin_wheel_start';
        } else {
          // Continue after win
          return 'spin_wheel_done';
        }
      } else if (key === 'e' && wheel.selectedIdx >= 0) {
        return 'spin_wheel_equip';
      } else if (key === 's' && wheel.selectedIdx >= 0) {
        return 'spin_wheel_sell';
      }
      return;
    }

    const state = engine.getState();
    const loot = state.pendingLoot ?? [];

    switch (key) {
      case 'up':
        ui.lootIndex = Math.max(0, ui.lootIndex - 1);
        break;
      case 'down':
        ui.lootIndex = Math.min(loot.length - 1, ui.lootIndex + 1);
        break;
      case 'e':
        return 'loot_equip';
      case 's':
        return 'loot_sell';
      case 'd':
        return 'loot_discard';
      case 'enter':
        if (state.dungeonProgress) {
          await engine.transition(GameState.DUNGEON);
        } else {
          await engine.transition(GameState.TAVERN);
        }
        ui.lootIndex = 0;
        break;
    }
  },
};

// ── DEATH SCREEN ────────────────────────────────────────────────────

const deathScreen = {
  render(state, renderer) {
    renderer.clear();
    const cols = renderer.capabilities.cols;

    renderer.showHeader('=== Defeat ===');

    const stats = state.stats ?? {};
    const deathArt = [
      '     ___________',
      '    /           \\',
      '   |   R.I.P.   |',
      '   |             |',
      '   |  Your team  |',
      '   |  has fallen |',
      '   |_____________|',
      '   |             |',
      '  /|\\           /|\\',
      ' / | \\         / | \\',
    ];
    for (let i = 0; i < deathArt.length; i++) {
      renderer.bufferWrite(2 + i, 0, renderer.centerText(deathArt[i], cols));
    }

    // Death summary
    const summaryRow = 14;
    renderer.bufferWrite(summaryRow, 4, renderer.bold('Run Summary:'));
    renderer.bufferWrite(summaryRow + 1, 6, `Crumbs earned:  ${formatCrumbs(stats.crumbsEarned ?? 0)}`);
    renderer.bufferWrite(summaryRow + 2, 6, `Monsters slain: ${stats.monstersSlain ?? 0}`);
    renderer.bufferWrite(summaryRow + 3, 6, `Rooms cleared:  ${stats.roomsCleared ?? 0}`);
    renderer.bufferWrite(summaryRow + 4, 6, `Total deaths:   ${stats.deaths ?? 0}`);

    // Death penalty display
    const penalty = state.lastDeathPenalty ?? 0;
    if (penalty > 0) {
      renderer.bufferWrite(summaryRow + 5, 6, renderer.color(`Crumbs lost:    ${penalty} (death penalty)`, 'red'));
    }

    // Recovered loot
    const recovered = state.recoveredLoot ?? [];
    if (recovered.length > 0) {
      renderer.bufferWrite(summaryRow + 6, 4, renderer.color('Recovered from the grave:', 'yellow'));
      for (let i = 0; i < recovered.length; i++) {
        const item = recovered[i];
        renderer.bufferWrite(summaryRow + 7 + i, 6, `${lootIcon(item.slot ?? 'weapon', item.rarity ?? 'common')} ${item.name ?? 'Item'}`);
      }
    }

    // Graveyard run hint
    if (state.graveyardRunAvailable) {
      renderer.bufferWrite(summaryRow + 8 + recovered.length, 4,
        renderer.color('A graveyard run is available — re-enter the same dungeon to recover more!', 'cyan'));
    }

    const bottomRow = renderer.capabilities.rows - 3;
    renderer.bufferWrite(bottomRow, 0, renderer.centerText('[Enter] Return to Tavern   [M] Return to Menu', cols));

    renderer.showStatus('Press Enter to continue');
    renderAIBadge(state, renderer);
    renderWorkModeBadge(state, renderer);
    renderSecurityBanner(state, renderer);
    renderSecurityLogOverlay(state, renderer);
    renderer.render();
  },

  async handleInput(key, engine) {
    if (key === '!') { ui.securityLogVisible = !ui.securityLogVisible; return; }
    if (ui.securityLogVisible) { if (key === 'escape') ui.securityLogVisible = false; return; }
    switch (key) {
      case 'enter':
        await engine.transition(GameState.TAVERN);
        break;
      case 'm': case 'escape':
        await engine.transition(GameState.MENU);
        break;
    }
  },
};

// ── SETTINGS SCREEN ─────────────────────────────────────────────────

const SETTINGS_LAYOUT = [
  { section: 'Focus', key: 'focus.autoFocus', label: 'Auto-Focus Window', bonus: '+15% crumbs' },
  { section: 'Focus', key: 'focus.bell', label: 'Terminal Bell', bonus: '+5% loot find' },
  { section: 'Focus', key: 'focus.stickyTop', label: 'Always On Top', bonus: '+10% XP' },
  { section: 'Security', key: 'security.vaultEnabled', label: 'Enable Vault', bonus: '+10% crumbs' },
  { section: 'Security', key: 'security.autoRedact', label: 'Auto-Redact', bonus: '+5% loot find' },
  { section: 'Security', key: 'security.encryptedClipboard', label: 'Encrypted Clipboard', bonus: '+5% XP' },
  { section: 'Security', key: 'security.aiMonitor', label: 'AI Activity Monitor', bonus: '+5% crumbs' },
  { section: 'Voice', key: 'voice.enabled', label: 'Voice Control', bonus: '' },
  { section: 'Voice', key: 'voice.feedbackSound', label: 'Voice Feedback Sound', bonus: '' },
  { section: 'Voice', key: 'voice.inputWords.choice1', label: 'Voice Word: Choice 1', bonus: '' },
  { section: 'Voice', key: 'voice.inputWords.choice2', label: 'Voice Word: Choice 2', bonus: '' },
  { section: 'Game', key: 'game.colorBlindMode', label: 'Color-Blind Mode', bonus: '+2% loot find' },
  { section: 'Game', key: 'game.compactMode', label: 'Compact Mode', bonus: '' },
  { section: 'Game', key: 'game.showAIStatus', label: 'Show AI Status', bonus: '' },
  { section: 'Game', key: 'game.debugLogging', label: 'Debug Logging', bonus: '' },
];

const settingsScreen = {
  render(state, renderer) {
    renderer.clear();
    const cols = renderer.capabilities.cols;
    const settings = state.settings ?? {};

    renderer.showHeader('=== Settings ===');

    let currentSection = '';
    let row = 3;

    for (let i = 0; i < SETTINGS_LAYOUT.length; i++) {
      const s = SETTINGS_LAYOUT[i];

      // Section header
      if (s.section !== currentSection) {
        currentSection = s.section;
        renderer.bufferWrite(row, 4, renderer.bold(`-- ${currentSection} --`));
        row++;
      }

      // Get value by traversing dot path
      const parts = s.key.split('.');
      let val = settings;
      for (const p of parts) val = val?.[p];
      const enabled = !!val;

      const prefix = i === ui.settingIndex ? '> ' : '  ';
      const toggle = enabled ? renderer.color('[ON] ', 'green') : renderer.color('[OFF]', 'brightBlack');
      const bonus = s.bonus ? renderer.dim(` ${s.bonus}`) : '';
      const line = `${prefix}${toggle} ${s.label}${bonus}`;
      renderer.bufferWrite(row, 4, line);
      row++;
    }

    // Bonuses summary
    row += 2;
    const bonuses = state.bonuses;
    if (bonuses) {
      renderer.bufferWrite(row, 4, renderer.bold('Active Bonuses:'));
      renderer.bufferWrite(row + 1, 6, `Crumb multiplier: x${bonuses.crumbMultiplier.toFixed(2)}`);
      renderer.bufferWrite(row + 2, 6, `Loot find bonus:  +${(bonuses.lootFindBonus * 100).toFixed(0)}%`);
      renderer.bufferWrite(row + 3, 6, `XP multiplier:    x${bonuses.xpMultiplier.toFixed(2)}`);
      if (bonuses.titles?.length > 0) {
        renderer.bufferWrite(row + 4, 6, renderer.color(`Titles: ${bonuses.titles.join(', ')}`, 'yellow'));
      }
    }

    renderer.showStatus('Up/Down=navigate Enter=toggle R=reset Esc=back ?=help');
    renderAIBadge(state, renderer);
    renderWorkModeBadge(state, renderer);
    renderSecurityBanner(state, renderer);
    renderSecurityLogOverlay(state, renderer);
    renderer.render();
  },

  async handleInput(key, engine) {
    if (key === '!') { ui.securityLogVisible = !ui.securityLogVisible; return; }
    if (ui.securityLogVisible) { if (key === 'escape') ui.securityLogVisible = false; return; }
    switch (key) {
      case 'up':
        ui.settingIndex = Math.max(0, ui.settingIndex - 1);
        break;
      case 'down':
        ui.settingIndex = Math.min(SETTINGS_LAYOUT.length - 1, ui.settingIndex + 1);
        break;
      case 'enter': case 'space': case 'left': case 'right':
        return { action: 'toggle_setting', key: SETTINGS_LAYOUT[ui.settingIndex]?.key };
      case 'r':
        return 'reset_settings';
      case 'escape':
        { const state = engine.getState();
          const from = state.currentState;
          // Go back to wherever we came from
          try { await engine.transition(GameState.TAVERN); } catch {
            try { await engine.transition(GameState.MENU); } catch { /* stay */ }
          }
        }
        break;
    }
  },
};

// ── HELP SCREEN ─────────────────────────────────────────────────────

const helpScreen = {
  render(state, renderer) {
    renderer.clear();
    const cols = renderer.capabilities.cols;

    renderer.showHeader('=== Help ===');

    const lines = [
      'Terminal Cookie is a dungeon-crawling game powered by AI interactions.',
      '',
      'How Crumbs Are Earned:',
      '  - AI tool calls (MCP server):     ~5 crumbs each',
      '  - AI choice selections (yes/no):  ~10 crumbs each',
      '  - Claude Code hooks (auto-mine):   5 crumbs per interaction',
      '  - Key presses in this terminal do NOT earn crumbs',
      '',
      'How to Play:',
      '  1. Connect Claude AI via MCP to earn crumbs',
      '  2. Recruit heroes at the Tavern with your crumbs',
      '  3. Enter the dungeon — fight monsters, find loot',
      '  4. Defeat minibosses and the final boss to clear',
      '  5. Spin the loot wheel for rare rewards!',
      '',
      'Game Modes:',
      '  Default — You control all choices manually',
      '  Work   — Game plays itself while you code',
      '',
      'Tips:',
      '  - Enable Security/Focus settings for crumb multipliers',
      '  - Bigger teams survive longer in dungeons',
      '  - After a wipe, recruits are discounted',
      '  - Dungeons get harder but reward more loot',
      '',
      'Press Esc to return',
    ];

    for (let i = 0; i < lines.length; i++) {
      renderer.bufferWrite(3 + i, 4, lines[i]);
    }

    renderer.showStatus('Esc=back');
    renderAIBadge(state, renderer);
    renderWorkModeBadge(state, renderer);
    renderer.render();
  },

  async handleInput(key, engine) {
    if (key === 'escape' || key === '?') {
      try { await engine.transition(GameState.TAVERN); } catch {
        try { await engine.transition(GameState.MENU); } catch { /* stay */ }
      }
    }
  },
};

// ── Screen registry ─────────────────────────────────────────────────

/** @type {Record<string, {render: function, handleInput: function}>} */
const screens = {
  [GameState.MENU]: menuScreen,
  [GameState.TAVERN]: tavernScreen,
  [GameState.DUNGEON]: dungeonScreen,
  [GameState.COMBAT]: combatScreen,
  [GameState.LOOT]: lootScreen,
  [GameState.DEATH]: deathScreen,
  [GameState.SETTINGS]: settingsScreen,
  [GameState.HELP]: helpScreen,
};

/**
 * Get the screen handler for a given game state.
 * @param {string} stateName - One of GameState values
 * @returns {{ render: function, handleInput: function }|null}
 */
export function getScreen(stateName) {
  return screens[stateName] ?? null;
}

/** Get the shared UI state (for orchestrator to read menu selections etc). */
export function getUIState() {
  return ui;
}

/** Reset transient UI state (e.g. on screen transition). */
export function resetUIState() {
  ui.menuIndex = 0;
  ui.dungeonChoice = 0;
  ui.lootIndex = 0;
  ui.helpVisible = false;
  ui.leaderboardVisible = false;
  ui.securityLogVisible = false;
  ui.modeSelectVisible = false;
  ui.modeSelection = 0;
}

export { screens };
