/**
 * Screen manager — maps engine states to render functions and input handlers.
 * Each screen: { render(state, renderer), handleInput(key, engine) → void }
 */

import { GameState } from '../core/engine.js';
import { titleScreen, masterCookie, miniCookie, dungeonMap, monsterArt, lootIcon, itemArt, teamMember } from '../ui/ascii.js';
import { renderHelp } from '../ui/help.js';
import { buildPortrait } from './team.js';
import { resolveRoll } from './combat.js';
import { loadLeaderboard, formatLeaderboardCompact, formatLeaderboardFull } from '../leaderboard/leaderboard.js';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { formatCrumbs } from '../ui/format.js';
import { getTalismanBonuses, getUpgradeCost, canUpgrade, getMaxLevel, formatTalismanInfo } from './talisman.js';
import { enchantCost } from './loot.js';
import { listSlots } from '../save/state.js';
import {
  isVillageUnlocked, canUnlockVillage, canBuildOrUpgrade,
  getBuildingLevel, getBuildingCost, getBuildingDefs, getBuildingIds,
  getVillageBonuses, getMaxBuildingLevel, getUnlockThreshold,
} from './village.js';
import { getEarnedTrophies, getAllTrophies, getBuyableTrophies, hasTrophy } from './trophies.js';

const __screens_dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__screens_dirname, '..', '..');
const SESSIONS_PATH = join(homedir(), '.terminal-cookie', 'sessions.json');
const COOKIE_BIN = join(PROJECT_ROOT, 'bin', 'cookie.js');
const SESSION_TTL_MS = 300_000;

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
  } catch (err) {
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

  // Crumbs + AI status on row 0
  const crumbText = `Crumbs: ${formatCrumbs(state.crumbs ?? 0)}`;
  const crumbLen = crumbText.replace(/\x1b\[[^m]*m/g, '').length;

  let badge;
  if (ai.connected) {
    badge = ai.count > 1 ? `AI: ${ai.count} connected` : 'AI: connected';
    badge = renderer.color(badge, 'green');
  } else {
    badge = renderer.dim('AI: --');
  }
  const badgeLen = ai.connected ? (ai.count > 1 ? 16 : 13) : 6;

  // Right-align: crumbs then AI badge
  const totalLen = crumbLen + 3 + badgeLen;
  const startCol = Math.max(0, cols - totalLen - 1);
  renderer.bufferWrite(0, startCol, renderer.bold(crumbText) + '  ' + badge);

  // Token usage display (below crumbs, on by default)
  const showTokens = state.settings?.game?.showTokenUsage ?? false;
  if (showTokens && state.tokenUsage > 0) {
    const fmtTk = (n) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` :
                          n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : `${n}`;

    const totalLabel = `Tokens: ~${fmtTk(state.tokenUsage)}`;
    const dailyTokens = (state.tokenUsageDaily?.date === new Date().toISOString().slice(0, 10))
      ? state.tokenUsageDaily.tokens : 0;
    const monthlyTokens = (state.tokenUsageMonthly?.month === new Date().toISOString().slice(0, 7))
      ? state.tokenUsageMonthly.tokens : 0;
    const todayLabel = `Today: ~${fmtTk(dailyTokens)}`;
    const monthLabel = `Month: ~${fmtTk(monthlyTokens)}`;

    const tokenLine = `${totalLabel}  ${todayLabel}  ${monthLabel}`;
    const tokenCol = Math.max(0, cols - tokenLine.length - 1);
    renderer.bufferWrite(1, tokenCol, renderer.dim(tokenLine));
  }
}

/** Get the configured security alert key (default '!'). */
function getAlertKey(state) {
  return state?.settings?.security?.alertKey ?? '!';
}

/** Get the configured security dismiss key (default 'd'). */
function getDismissKey(state) {
  return state?.settings?.security?.dismissKey ?? 'd';
}

/**
 * Handle security log input (toggle and dismiss).
 * Returns an action string or null. Call at top of handleInput.
 * @param {string} key
 * @param {object} engine
 * @returns {string|null|undefined}
 */
function handleSecurityInput(key, engine) {
  const state = engine.getState();
  const alertKey = getAlertKey(state);
  const dismissKey = getDismissKey(state);
  if (key === alertKey) { ui.securityLogVisible = !ui.securityLogVisible; return 'handled'; }
  if (ui.securityLogVisible) {
    if (key === 'escape') { ui.securityLogVisible = false; return 'handled'; }
    if (key === dismissKey) return 'dismiss_security';
    return 'handled'; // consume all keys while log is open
  }
  return null;
}

/**
 * Render security alert banner at the top of the screen.
 * Shows unresolved alerts with pause indicator.
 */
function renderSecurityBanner(state, renderer) {
  if (!state.securityAlerts || state.securityAlerts.length === 0) return;

  // Check for unresolved (non-dismissed) alerts
  const unresolved = state.securityAlerts.filter(a => !a.dismissed);
  if (unresolved.length === 0) {
    // Still show dismissed but recent alerts briefly
    const now = Date.now();
    const recent = state.securityAlerts.filter(a => now - a.time < 15000);
    if (recent.length === 0) return;
    const latest = recent[recent.length - 1];
    const cols = renderer.capabilities.cols;
    const banner = `[!] SECURITY: ${latest.summary}`;
    renderer.bufferWrite(1, 0, renderer.color(banner.substring(0, cols), 'brightBlack'));
    return;
  }

  const latest = unresolved[unresolved.length - 1];
  const cols = renderer.capabilities.cols;
  const aKey = getAlertKey(state);
  const dKey = getDismissKey(state);
  const banner = `[!] SECURITY PAUSED: ${latest.summary} | [${aKey}]=view [${dKey.toUpperCase()}]=dismiss`;
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
  const hasUnresolved = (state.securityAlerts ?? []).some(a => !a.dismissed);
  const aKey = getAlertKey(state);
  const dKey = getDismissKey(state);
  const titleText = hasUnresolved
    ? `| SECURITY LOG  [${aKey}]=close  [${dKey.toUpperCase()}]=dismiss alerts`
    : `| SECURITY LOG  [${aKey}]=close`;
  renderer.bufferWrite(startRow + 1, startCol, titleText + ' '.repeat(Math.max(0, width - titleText.length - 1)) + '|');

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

/** Color a loot icon based on rarity. */
function coloredIcon(renderer, slot, rarity) {
  const icon = lootIcon(slot, rarity);
  const colors = {
    common: 'brightBlack',
    uncommon: 'green',
    rare: 'cyan',
    epic: 'magenta',
    legendary: 'yellow',
  };
  return renderer.color(icon, colors[rarity] || 'brightBlack');
}

// ── Menu state for each screen ──────────────────────────────────────

/** Persistent UI state across render/input cycles. */
const ui = {
  menuIndex: 0,
  tavernTab: 'party',    // party | recruit | inventory | talisman | shop | log
  dungeonChoice: 0,
  lootIndex: 0,
  settingIndex: 0,
  invIndex: 0,           // inventory item selection
  shopIndex: 0,          // shop item selection
  logScroll: 0,          // adventure log scroll offset
  partyIndex: 0,         // party member selection
  partySlot: 0,          // equipment slot selection within party member (0=weapon,1=armor,2=accessory)
  equipPicker: false,    // show member picker when equipping from inventory
  equipPickerIdx: 0,     // selected member in equip picker
  villageIndex: 0,       // village building selection
  trophyIndex: 0,        // trophy list selection
  helpVisible: false,
  leaderboardVisible: false,
  securityLogVisible: false,
  notification: '',
  notificationTimeout: null,
  modeSelectVisible: false,
  modeSelection: 0, // 0=default, 1=work
  settingsFrom: null, // track which screen opened settings
  slotPickerVisible: false,
  slotPickerMode: 'new', // 'new' or 'load'
  slotPickerIndex: 0,
  slotPickerData: [],  // populated by listSlots()
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
  renderer.bufferWrite(0, 15, renderer.dim('Q=Menu'));

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
      renderer.bufferWrite(aiRow + 1, 0, renderer.centerText(renderer.dim('Auto-reconnects on next Claude interaction'), cols));
      renderer.bufferWrite(aiRow + 2, 0, renderer.centerText(renderer.dim('First time? Run in another terminal:'), cols));
      renderer.bufferWrite(aiRow + 3, 0, renderer.centerText(`claude mcp add terminal-cookie -- node ${COOKIE_BIN} --mcp`, cols));
      renderer.bufferWrite(aiRow + 4, 0, renderer.centerText(renderer.dim('Then tell Claude: "Click the cookie"'), cols));
    }


    renderer.showStatus('Arrows=navigate Enter=select L=leaderboard Q=menu ?=help');
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

    // Slot picker overlay
    if (ui.slotPickerVisible) {
      const rows = renderer.capabilities.rows;
      const startRow = Math.max(2, Math.floor(rows / 2) - 5);
      const boxWidth = 44;
      const boxLeft = Math.max(0, Math.floor((cols - boxWidth) / 2));

      // Clear area
      for (let r = startRow - 1; r < startRow + 10; r++) {
        renderer.bufferWrite(r, boxLeft - 2, ' '.repeat(boxWidth + 4));
      }

      const isNew = ui.slotPickerMode === 'new';
      const titleText = isNew ? '=== Choose Save Slot ===' : '=== Load Save Slot ===';
      renderer.bufferWrite(startRow, Math.floor((cols - titleText.length) / 2), renderer.bold(titleText));

      const slots = ui.slotPickerData;
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        const selected = i === ui.slotPickerIndex;
        const prefix = selected ? ' > ' : '   ';
        let label;
        if (s.exists) {
          const mode = s.gameMode ? ` [${s.gameMode}]` : '';
          const team = s.teamSize > 0 ? ` Team:${s.teamSize}` : '';
          label = `Slot ${s.slot}: ${formatCrumbs(s.crumbs)} crumbs${team}${mode}`;
        } else {
          label = `Slot ${s.slot}: (empty)`;
        }
        const line = prefix + label;
        renderer.bufferWrite(startRow + 2 + i * 2, boxLeft, selected ? renderer.bold(line) : line);
        if (s.exists && s.savedAt && s.savedAt !== 'corrupted') {
          const dateStr = new Date(s.savedAt).toLocaleString();
          renderer.bufferWrite(startRow + 3 + i * 2, boxLeft + 5, renderer.dim(dateStr));
        }
      }

      const helpRow = startRow + 2 + slots.length * 2 + 1;
      const helpText = isNew ? 'Up/Down=select  Enter=confirm  Esc=back' : 'Up/Down=select  Enter=load  Esc=back';
      renderer.bufferWrite(helpRow, Math.floor((cols - helpText.length) / 2), renderer.dim(helpText));
    }

    renderWorkModeBadge(state, renderer);
    renderer.render();
  },

  async handleInput(key, engine) {
    // Slot picker overlay intercepts all keys when visible
    if (ui.slotPickerVisible) {
      const slots = ui.slotPickerData;
      if (key === 'up') ui.slotPickerIndex = Math.max(0, ui.slotPickerIndex - 1);
      else if (key === 'down') ui.slotPickerIndex = Math.min(slots.length - 1, ui.slotPickerIndex + 1);
      else if (key === 'enter') {
        const chosen = slots[ui.slotPickerIndex];
        if (ui.slotPickerMode === 'load' && !chosen.exists) return; // can't load empty
        ui.slotPickerVisible = false;
        if (ui.slotPickerMode === 'new') {
          return { action: 'new_game_slot', slot: chosen.slot, mode: ui.modeSelection === 0 ? 'default' : 'work' };
        } else {
          return { action: 'load_game_slot', slot: chosen.slot };
        }
      } else if (key === 'escape') {
        ui.slotPickerVisible = false;
      }
      return;
    }

    // Mode selection overlay intercepts all keys
    if (ui.modeSelectVisible) {
      if (key === 'left' || key === 'right') {
        ui.modeSelection = ui.modeSelection === 0 ? 1 : 0;
      } else if (key === 'enter') {
        ui.modeSelectVisible = false;
        ui.slotPickerVisible = true;
        ui.slotPickerMode = 'new';
        ui.slotPickerIndex = 0;
        ui.slotPickerData = listSlots();
      } else if (key === 'escape') {
        ui.modeSelectVisible = false;
      }
      return;
    }

    { const sr = handleSecurityInput(key, engine); if (sr === 'handled') return; if (sr) return sr; }
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
          ui.slotPickerVisible = true;
          ui.slotPickerMode = 'load';
          ui.slotPickerIndex = 0;
          ui.slotPickerData = listSlots();
          break;
        case 2: // Leaderboard
          ui.leaderboardVisible = !ui.leaderboardVisible;
          break;
        case 3: // Settings
          ui.settingsFrom = 'MENU';
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
      ui.settingsFrom = 'MENU';
      await engine.transition(GameState.SETTINGS);
    } else if (key === 'q' || key === 'escape') {
      await engine.shutdown();
    }
  },
};

// ── Shop item definitions ───────────────────────────────────────────

const SHOP_ITEMS = [
  { id: 'heal_potion',   name: 'Healing Potion',   cost: 15,  desc: 'Heal all team +20 HP',             icon: '{U}' },
  { id: 'whetstone',     name: 'Whetstone',        cost: 25,  desc: '+3 ATK for next combat',           icon: '/|>' },
  { id: 'iron_shield',   name: 'Iron Shield Oil',  cost: 25,  desc: '+3 DEF for next combat',           icon: '(O)' },
  { id: 'lucky_charm',   name: 'Lucky Charm',      cost: 40,  desc: '+5 LCK for next combat',           icon: '<o>' },
  { id: 'enchant_scroll',name: 'Enchant Scroll',   cost: 50,  desc: 'Enchant selected inventory item',  icon: '~#~' },
  { id: 'reroll_roster', name: 'Refresh Roster',   cost: 30,  desc: 'New recruits at the tavern',       icon: '(?)', },
];

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

    // Tabs — Village only shows if unlocked
    const hasVillage = isVillageUnlocked(state) || canUnlockVillage(state);
    const tabs = hasVillage
      ? ['[Party]', '[Recruit]', '[Inventory]', '[Shop]', '[Village]', '[Talisman]', '[Trophies]', '[Log]']
      : ['[Party]', '[Recruit]', '[Inventory]', '[Shop]', '[Talisman]', '[Trophies]', '[Log]'];
    const tabMap = hasVillage
      ? ['party', 'recruit', 'inventory', 'shop', 'village', 'talisman', 'trophies', 'log']
      : ['party', 'recruit', 'inventory', 'shop', 'talisman', 'trophies', 'log'];
    let tabStr = '';
    for (let i = 0; i < tabs.length; i++) {
      const active = tabMap[i] === ui.tavernTab;
      tabStr += (active ? renderer.bold(tabs[i]) : renderer.dim(tabs[i])) + ' ';
    }
    renderer.bufferWrite(6, 2, tabStr);

    const contentTop = 8;

    if (ui.tavernTab === 'party') {
      const team = state.team ?? [];
      if (team.length === 0) {
        renderer.bufferWrite(contentTop, 4, 'No team members yet. Press [R] to recruit!');
      } else {
        // Clamp partyIndex
        if (ui.partyIndex >= team.length) ui.partyIndex = team.length - 1;
        if (ui.partyIndex < 0) ui.partyIndex = 0;

        for (let i = 0; i < Math.min(team.length, 6); i++) {
          const m = team[i];
          const selected = i === ui.partyIndex;
          const marker = selected ? '> ' : '  ';
          const portrait = buildPortrait(m);
          for (let j = 0; j < portrait.length; j++) {
            renderer.bufferWrite(contentTop + i * 5 + j, 4, portrait[j]);
          }
          const dead = m.currentHp <= 0;
          const info = `${marker}${m.name} Lv${m.level} ${m.race} ${m.class} HP:${hpBar(m.currentHp, m.maxHp, 10)}`;
          const line = dead ? renderer.color(info, 'red') : (selected ? renderer.bold(info) : info);
          renderer.bufferWrite(contentTop + i * 5, 16, truncate(line, cols - 20));
          const stats = `  ATK:${m.stats.atk} DEF:${m.stats.def} SPD:${m.stats.spd} LCK:${m.stats.lck}`;
          renderer.bufferWrite(contentTop + i * 5 + 1, 16, stats);
          // Show equipped items inline with colored icons
          const eq = m.equipment ?? {};
          const eqParts = [];
          if (eq.weapon) eqParts.push(`${coloredIcon(renderer, 'weapon', eq.weapon.rarity ?? 'common')} ${eq.weapon.name}`);
          if (eq.armor) eqParts.push(`${coloredIcon(renderer, 'armor', eq.armor.rarity ?? 'common')} ${eq.armor.name}`);
          if (eq.accessory) eqParts.push(`${coloredIcon(renderer, eq.accessory.slot ?? 'ring', eq.accessory.rarity ?? 'common')} ${eq.accessory.name}`);
          if (eqParts.length > 0) {
            renderer.bufferWrite(contentTop + i * 5 + 2, 16, truncate(eqParts.join('  '), cols - 20));
          }
        }

        // Selected member equipment detail panel on right
        const sel = team[ui.partyIndex];
        if (sel) {
          const detCol = Math.max(cols - 34, Math.floor(cols * 0.55));
          renderer.bufferWrite(contentTop, detCol, renderer.bold(`${sel.name}'s Equipment`));
          const eq = sel.equipment ?? {};
          const slots = ['weapon', 'armor', 'accessory'];
          const slotLabels = ['Weapon', 'Armor', 'Accessory'];
          for (let s = 0; s < slots.length; s++) {
            const item = eq[slots[s]];
            const slotSelected = s === ui.partySlot;
            const prefix = slotSelected ? '> ' : '  ';
            if (item) {
              const icon = coloredIcon(renderer, slots[s], item.rarity ?? 'common');
              const ench = item.enchantLevel ? renderer.color(` +${item.enchantLevel}`, 'cyan') : '';
              const line = `${prefix}${slotLabels[s]}: ${icon} ${item.name}${ench}`;
              renderer.bufferWrite(contentTop + 2 + s * 3, detCol, slotSelected ? renderer.bold(line) : line);
              const statStr = item.statBonus ? Object.entries(item.statBonus).map(([k, v]) => `${k}:+${v}`).join(' ') : '';
              renderer.bufferWrite(contentTop + 3 + s * 3, detCol, renderer.dim(`    Pwr:${item.power ?? 0} ${statStr}`));
            } else {
              const line = `${prefix}${slotLabels[s]}: ${renderer.dim('--- empty ---')}`;
              renderer.bufferWrite(contentTop + 2 + s * 3, detCol, slotSelected ? renderer.bold(line) : line);
            }
          }
          renderer.bufferWrite(contentTop + 12, detCol, renderer.dim('[U] Unequip  [Tab] Switch slot'));
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
          const costLabel = affordable
            ? renderer.color(`${m.cost}c`, 'green')
            : renderer.color(`${m.cost}c`, 'red');
          const info = `${prefix}${m.name} the ${m.race} ${m.class}  ${costLabel}`;
          const row = contentTop + i * 3;
          renderer.bufferWrite(row, 4, i === ui.menuIndex ? renderer.bold(truncate(info, cols - 8)) : truncate(info, cols - 8));
          const stats = `    HP:${m.stats.hp}  ATK:${m.stats.atk}  DEF:${m.stats.def}  SPD:${m.stats.spd}  LCK:${m.stats.lck}`;
          renderer.bufferWrite(row + 1, 4, renderer.dim(stats));
        }
        renderer.bufferWrite(contentTop + roster.length * 3 + 1, 4, renderer.dim('Up/Down=browse  Enter=recruit'));

        // Show selected recruit portrait on the right side
        const selected = roster[ui.menuIndex];
        if (selected) {
          const previewCol = Math.max(cols - 28, Math.floor(cols * 0.6));
          const portrait = buildPortrait(selected);
          renderer.bufferWrite(contentTop, previewCol, renderer.bold(selected.name));
          renderer.bufferWrite(contentTop + 1, previewCol, renderer.dim(`${selected.race} ${selected.class}`));
          renderer.bufferWrite(contentTop + 2, previewCol, renderer.dim(`(${selected.personality})`));
          for (let j = 0; j < portrait.length; j++) {
            renderer.bufferWrite(contentTop + 4 + j, previewCol + 2, portrait[j]);
          }
          // Show abilities
          const abilities = selected.abilities ?? [];
          if (abilities.length > 0) {
            renderer.bufferWrite(contentTop + 9, previewCol, renderer.dim('Abilities:'));
            for (let a = 0; a < abilities.length; a++) {
              renderer.bufferWrite(contentTop + 10 + a, previewCol + 2, abilities[a]);
            }
          }
        }
      }
    } else if (ui.tavernTab === 'inventory') {
      const inv = state.inventory ?? [];
      if (inv.length === 0) {
        renderer.bufferWrite(contentTop + 1, 4, 'Inventory is empty. Find loot in dungeons!');
      } else {
        const maxShow = Math.min(inv.length, 10);
        for (let i = 0; i < maxShow; i++) {
          const item = inv[i];
          const prefix = i === ui.invIndex ? '> ' : '  ';
          const icon = coloredIcon(renderer, item.slot ?? 'weapon', item.rarity ?? 'common');
          const enchLvl = item.enchantLevel ? renderer.color(` +${item.enchantLevel}`, 'cyan') : '';
          const rarityColor = { uncommon: 'green', rare: 'cyan', epic: 'magenta', legendary: 'yellow' };
          const rarityTag = item.rarity !== 'common' ? renderer.color(` (${item.rarity})`, rarityColor[item.rarity] || 'brightBlack') : '';
          const line = `${prefix}${icon} ${item.name ?? 'Unknown'}${rarityTag}${enchLvl}`;
          const row = contentTop + Math.floor(i * 1.5);
          renderer.bufferWrite(row, 4, i === ui.invIndex ? renderer.bold(line) : line);
          // Value on second line for selected item
          if (i === ui.invIndex) {
            renderer.bufferWrite(row + 1, 10, renderer.dim(`val: ${item.value ?? 0} crumbs`));
          }
        }
        if (inv.length > 10) {
          renderer.bufferWrite(contentTop + Math.floor(10 * 1.5), 4, renderer.dim(`... +${inv.length - 10} more`));
        }

        // Selected item detail on right
        const sel = inv[ui.invIndex];
        if (sel) {
          const detCol = Math.max(cols - 34, Math.floor(cols * 0.55));
          // Item art
          const art = itemArt(sel.slot ?? 'weapon', sel.rarity ?? 'common');
          for (let a = 0; a < art.lines.length; a++) {
            const artLine = art.color ? renderer.color(art.lines[a], art.color) : art.lines[a];
            renderer.bufferWrite(contentTop + a, detCol, artLine);
          }
          const infoStart = contentTop + art.lines.length + 1;
          renderer.bufferWrite(infoStart, detCol, renderer.bold(sel.name ?? 'Unknown'));
          renderer.bufferWrite(infoStart + 1, detCol, renderer.dim(`${sel.slot ?? '?'} / ${sel.rarity ?? '?'}`));
          renderer.bufferWrite(infoStart + 3, detCol, `Power: ${sel.power ?? 0}  Value: ${sel.value ?? 0}`);
          if (sel.statBonus) {
            const statStr = Object.entries(sel.statBonus).map(([k, v]) => `${k}: +${v}`).join('  ');
            renderer.bufferWrite(infoStart + 4, detCol, statStr);
          }
          if (sel.effect) {
            renderer.bufferWrite(infoStart + 5, detCol, renderer.dim(`Effect: ${sel.effect}`));
          }
          const rawECost = enchantCost(sel);
          const vDisc = getVillageBonuses(state).enchantDiscount;
          const eCost = Math.max(1, Math.round(rawECost * (1 - vDisc)));
          const canEnchant = (state.crumbs ?? 0) >= eCost && sel.slot !== 'consumable';
          const discLabel = vDisc > 0 ? ` (-${Math.round(vDisc * 100)}%)` : '';
          renderer.bufferWrite(infoStart + 7, detCol, canEnchant
            ? renderer.color(`[X] Enchant (${eCost}c${discLabel})`, 'cyan')
            : renderer.dim(`Enchant: ${eCost}c${discLabel}`));
          renderer.bufferWrite(infoStart + 9, detCol, '[E] Equip to...');
          renderer.bufferWrite(infoStart + 10, detCol, '[S] Sell  [D] Drop');
        }

        // Equip picker overlay — choose which team member gets the item
        if (ui.equipPicker) {
          const team = state.team ?? [];
          const boxW = 36;
          const boxH = team.length + 4;
          const boxX = Math.floor((cols - boxW) / 2);
          const boxY = Math.floor((renderer.capabilities.rows - boxH) / 2);
          renderer.bufferWrite(boxY, boxX, '+' + '-'.repeat(boxW - 2) + '+');
          renderer.bufferWrite(boxY + 1, boxX, '| ' + renderer.bold('Equip to whom?').padEnd(boxW - 4) + ' |');
          for (let t = 0; t < team.length; t++) {
            const m = team[t];
            const prefix = t === ui.equipPickerIdx ? '> ' : '  ';
            const dead = m.currentHp <= 0;
            const eq = m.equipment ?? {};
            const selItem = inv[ui.invIndex];
            const slot = selItem?.slot ?? 'weapon';
            const hasSlot = eq[slot] ? ` [${eq[slot].name}]` : '';
            let label = `${prefix}${m.name} Lv${m.level} ${m.class}${hasSlot}`;
            if (dead) label = renderer.color(label, 'red');
            else if (t === ui.equipPickerIdx) label = renderer.bold(label);
            renderer.bufferWrite(boxY + 2 + t, boxX, '| ' + truncate(label, boxW - 4).padEnd(boxW - 4) + ' |');
          }
          renderer.bufferWrite(boxY + 2 + team.length, boxX, '| ' + renderer.dim('Enter=equip  Esc=cancel').padEnd(boxW - 4) + ' |');
          renderer.bufferWrite(boxY + 3 + team.length, boxX, '+' + '-'.repeat(boxW - 2) + '+');
        }
      }
    } else if (ui.tavernTab === 'shop') {
      renderer.bufferWrite(contentTop - 1, 4, renderer.bold('Welcome to the Shop!'));
      renderer.bufferWrite(contentTop, 4, renderer.dim(`You have ${formatCrumbs(state.crumbs ?? 0)} crumbs`));
      const crumbs = state.crumbs ?? 0;
      for (let i = 0; i < SHOP_ITEMS.length; i++) {
        const item = SHOP_ITEMS[i];
        const prefix = i === ui.shopIndex ? '> ' : '  ';
        const affordable = crumbs >= item.cost;
        const costStr = affordable ? renderer.color(`${item.cost}c`, 'green') : renderer.color(`${item.cost}c`, 'red');
        const line = `${prefix}${renderer.dim(item.icon)} ${item.name}  ${costStr}`;
        const row = contentTop + 2 + i * 2;
        renderer.bufferWrite(row, 4, i === ui.shopIndex ? renderer.bold(line) : line);
        renderer.bufferWrite(row + 1, 10, renderer.dim(item.desc));
      }
      renderer.bufferWrite(contentTop + 2 + SHOP_ITEMS.length * 2 + 1, 4, renderer.dim('Up/Down=browse  Enter=buy'));

      // Show active buffs on right
      const buffs = state.shopBuffs ?? {};
      const buffCol = Math.max(cols - 28, Math.floor(cols * 0.6));
      renderer.bufferWrite(contentTop, buffCol, renderer.bold('Active Buffs:'));
      let buffRow = 1;
      if (buffs.atk) { renderer.bufferWrite(contentTop + buffRow++, buffCol, renderer.color(`  ATK +${buffs.atk}`, 'yellow')); }
      if (buffs.def) { renderer.bufferWrite(contentTop + buffRow++, buffCol, renderer.color(`  DEF +${buffs.def}`, 'yellow')); }
      if (buffs.lck) { renderer.bufferWrite(contentTop + buffRow++, buffCol, renderer.color(`  LCK +${buffs.lck}`, 'yellow')); }
      if (buffRow === 1) { renderer.bufferWrite(contentTop + buffRow, buffCol, renderer.dim('  None')); }
    } else if (ui.tavernTab === 'talisman') {
      const talisman = state.talisman;
      if (!talisman) {
        renderer.bufferWrite(contentTop, 4, 'No talisman found.');
      } else {
        // Talisman ASCII art
        const art = [
          '    *',
          '   /|\\',
          '  / | \\',
          ' /  |  \\',
          ' \\  |  /',
          '  \\ | /',
          '   \\|/',
          '    *',
        ];
        for (let i = 0; i < art.length; i++) {
          renderer.bufferWrite(contentTop + i, 4, renderer.color(art[i], 'yellow'));
        }

        // Talisman info
        const info = formatTalismanInfo(talisman, state.crumbs ?? 0);
        for (let i = 0; i < info.length; i++) {
          renderer.bufferWrite(contentTop + i, 18, info[i]);
        }

        // Upgrade prompt
        const promptRow = contentTop + Math.max(art.length, info.length) + 1;
        if (talisman.level < getMaxLevel()) {
          const cost = getUpgradeCost(talisman.level);
          const affordable = (state.crumbs ?? 0) >= cost;
          if (affordable) {
            renderer.bufferWrite(promptRow, 4, renderer.color('Press [U] to upgrade!', 'green'));
          } else {
            renderer.bufferWrite(promptRow, 4, renderer.dim(`Need ${cost} crumbs to upgrade (have ${state.crumbs ?? 0})`));
          }
        } else {
          renderer.bufferWrite(promptRow, 4, renderer.color('Talisman is fully upgraded!', 'yellow'));
        }
      }
    } else if (ui.tavernTab === 'village') {
      const alive = (state.team ?? []).filter(m => m.currentHp > 0).length;
      const unlocked = isVillageUnlocked(state);

      if (!unlocked && canUnlockVillage(state)) {
        // Show unlock prompt
        renderer.bufferWrite(contentTop, 4, renderer.bold('Your party is strong enough to found a village!'));
        renderer.bufferWrite(contentTop + 2, 4, `Team alive: ${alive}/${getUnlockThreshold()} required`);
        renderer.bufferWrite(contentTop + 4, 4, 'A village provides buildings with powerful bonuses:');
        renderer.bufferWrite(contentTop + 5, 6, '- Bakery: passive crumbs per dungeon room');
        renderer.bufferWrite(contentTop + 6, 6, '- Forge: cheaper enchanting, gear crafting');
        renderer.bufferWrite(contentTop + 7, 6, '- Watchtower: scout ahead, defense bonus');
        renderer.bufferWrite(contentTop + 8, 6, '- Herbalist: healing, poison resistance');
        renderer.bufferWrite(contentTop + 9, 6, '- Training Ground: XP boost, better recruits');
        renderer.bufferWrite(contentTop + 10, 6, '- Merchant Guild: better prices');
        renderer.bufferWrite(contentTop + 11, 6, '- Archive: enemy intel, loot quality');
        renderer.bufferWrite(contentTop + 13, 4, renderer.color('Press [Enter] to found your village! (Bakery is free)', 'green'));
      } else if (!unlocked) {
        renderer.bufferWrite(contentTop, 4, renderer.dim(`Village locked - need ${getUnlockThreshold()} alive team members (have ${alive})`));
      } else {
        // Village is unlocked — show buildings
        const canBuild = canBuildOrUpgrade(state);
        const buildingIds = getBuildingIds();
        const defs = getBuildingDefs();
        const maxLevel = getMaxBuildingLevel();
        const bonuses = getVillageBonuses(state);

        renderer.bufferWrite(contentTop - 1, 4, renderer.bold('-- Your Village --') +
          (canBuild ? renderer.color(' (can build)', 'green') : renderer.dim(` (need ${getUnlockThreshold()}+ alive to build, have ${alive})`)));

        // Building list on left
        const maxShow = Math.min(buildingIds.length, 10);
        if (ui.villageIndex >= buildingIds.length) ui.villageIndex = buildingIds.length - 1;
        if (ui.villageIndex < 0) ui.villageIndex = 0;

        for (let i = 0; i < maxShow; i++) {
          const id = buildingIds[i];
          const def = defs[id];
          const level = getBuildingLevel(state, id);
          const selected = i === ui.villageIndex;
          const prefix = selected ? '> ' : '  ';
          const maxed = level >= maxLevel;

          let line;
          if (level === 0) {
            const cost = def.levels[0].cost;
            const costStr = cost === 0 ? renderer.color('FREE', 'green') : `${cost}c`;
            line = `${prefix}${def.icon} ${def.name}: ${renderer.dim('Not built')} [${costStr}]`;
          } else {
            const lvlStr = maxed ? renderer.color(`Lv${level} MAX`, 'yellow') : `Lv${level}/${maxLevel}`;
            line = `${prefix}${def.icon} ${def.name}: ${lvlStr}`;
          }
          renderer.bufferWrite(contentTop + i * 2, 4, selected ? renderer.bold(line) : line);
          // Show current bonus
          if (level > 0) {
            renderer.bufferWrite(contentTop + i * 2 + 1, 8, renderer.dim(def.levels[level - 1].label));
          } else {
            renderer.bufferWrite(contentTop + i * 2 + 1, 8, renderer.dim(def.desc));
          }
        }

        // Selected building detail on right
        const selId = buildingIds[ui.villageIndex];
        const selDef = defs[selId];
        const selLevel = getBuildingLevel(state, selId);
        if (selDef) {
          const detCol = Math.max(cols - 34, Math.floor(cols * 0.55));
          // ASCII art
          const art = selDef.ascii ?? [];
          for (let a = 0; a < art.length; a++) {
            renderer.bufferWrite(contentTop + a, detCol, art[a]);
          }
          const infoStart = contentTop + art.length + 1;
          renderer.bufferWrite(infoStart, detCol, renderer.bold(selDef.name));
          renderer.bufferWrite(infoStart + 1, detCol, renderer.dim(selDef.desc));

          if (selLevel > 0 && selLevel < maxLevel) {
            const nextCost = selDef.levels[selLevel].cost;
            const canAfford = (state.crumbs ?? 0) >= nextCost && canBuild;
            renderer.bufferWrite(infoStart + 3, detCol, 'Next upgrade:');
            renderer.bufferWrite(infoStart + 4, detCol, `  ${selDef.levels[selLevel].label}`);
            renderer.bufferWrite(infoStart + 5, detCol, canAfford
              ? renderer.color(`  [Enter] Upgrade (${nextCost}c)`, 'green')
              : renderer.dim(`  ${nextCost} crumbs needed`));
          } else if (selLevel === 0) {
            const cost = selDef.levels[0].cost;
            const canAfford = (state.crumbs ?? 0) >= cost && canBuild;
            renderer.bufferWrite(infoStart + 3, detCol, canAfford
              ? renderer.color(`[Enter] Build (${cost === 0 ? 'FREE' : cost + 'c'})`, 'green')
              : renderer.dim(`${cost} crumbs to build`));
          } else {
            renderer.bufferWrite(infoStart + 3, detCol, renderer.color('Fully upgraded!', 'yellow'));
          }

          // Show aggregate bonuses at bottom
          const bonusRow = infoStart + 7;
          renderer.bufferWrite(bonusRow, detCol, renderer.dim('Village bonuses:'));
          let bRow = bonusRow + 1;
          if (bonuses.crumbsPerRoom > 0) renderer.bufferWrite(bRow++, detCol, `  Crumbs/room: +${bonuses.crumbsPerRoom}`);
          if (bonuses.defBonus > 0) renderer.bufferWrite(bRow++, detCol, `  DEF: +${bonuses.defBonus}`);
          if (bonuses.atkBonus > 0) renderer.bufferWrite(bRow++, detCol, `  ATK: +${bonuses.atkBonus}`);
          if (bonuses.healPerRoom > 0) renderer.bufferWrite(bRow++, detCol, `  Heal/room: +${bonuses.healPerRoom}`);
          if (bonuses.xpMultiplier > 0) renderer.bufferWrite(bRow++, detCol, `  XP: +${Math.round(bonuses.xpMultiplier * 100)}%`);
          if (bonuses.enchantDiscount > 0) renderer.bufferWrite(bRow++, detCol, `  Enchant: -${Math.round(bonuses.enchantDiscount * 100)}%`);
          if (bonuses.lootQuality > 0) renderer.bufferWrite(bRow++, detCol, `  Loot: +${bonuses.lootQuality}`);
        }
      }
    } else if (ui.tavernTab === 'trophies') {
      const earned = getEarnedTrophies(state);
      const all = getAllTrophies();
      const buyable = getBuyableTrophies(state);
      const cols2 = renderer.capabilities.cols;
      const maxRows = renderer.capabilities.rows - contentTop - 5;

      renderer.bufferWrite(contentTop, 4, renderer.bold(`Trophies: ${earned.length}/${all.length}`));

      // Group by category
      const categories = [...new Set(all.map(t => t.category))];
      let row = contentTop + 2;
      let trophyListIdx = 0;
      for (const cat of categories) {
        if (row >= contentTop + maxRows) break;
        renderer.bufferWrite(row, 4, renderer.bold(`-- ${cat} --`));
        row++;
        const catTrophies = all.filter(t => t.category === cat);
        for (const t of catTrophies) {
          if (row >= contentTop + maxRows) break;
          const owned = hasTrophy(state, t.id);
          const prefix = trophyListIdx === ui.trophyIndex ? '> ' : '  ';
          const icon = owned ? renderer.color(t.icon, 'yellow') : renderer.dim(t.icon);
          const name = owned ? renderer.color(t.name, 'green') : renderer.dim(t.name);
          const desc = owned ? t.desc : '???';
          const costLabel = t.cost && !owned ? renderer.dim(` [${formatCrumbs(t.cost)}c]`) : '';
          renderer.bufferWrite(row, 4, `${prefix}${icon} ${name} ${renderer.dim(desc)}${costLabel}`);
          row++;
          trophyListIdx++;
        }
      }

      // Buy prompt for buyable trophies
      if (buyable.length > 0) {
        const allFlat = all.filter(t => !t.cost || !hasTrophy(state, t.id));
        renderer.bufferWrite(renderer.capabilities.rows - 5, 4, renderer.dim('Enter=buy trophy (if buyable)'));
      }
    } else if (ui.tavernTab === 'log') {
      const log = state.adventureLog ?? [];
      if (log.length === 0) {
        renderer.bufferWrite(contentTop, 4, 'No adventures yet. Enter a dungeon to begin!');
      } else {
        const maxRows = renderer.capabilities.rows - contentTop - 5;
        const scrollMax = Math.max(0, log.length - maxRows);
        ui.logScroll = Math.max(0, Math.min(ui.logScroll, scrollMax));
        const visible = log.slice(log.length - maxRows - ui.logScroll, log.length - ui.logScroll);
        renderer.bufferWrite(contentTop - 1, 4, renderer.bold('-- Adventure Log --') + renderer.dim(`  (${log.length} entries)`));
        for (let i = 0; i < visible.length; i++) {
          const entry = visible[i];
          const typeColors = { combat: 'red', loot: 'yellow', recruit: 'green', death: 'red', shop: 'cyan', dungeon: 'brightBlack', enchant: 'magenta', village: 'green' };
          const color = typeColors[entry.type] || 'brightBlack';
          const tag = `[${(entry.type ?? 'event').toUpperCase().substring(0, 4)}]`;
          renderer.bufferWrite(contentTop + i, 4, renderer.color(tag, color) + ' ' + truncate(entry.text, cols - 14));
        }
        if (scrollMax > 0) {
          renderer.bufferWrite(contentTop + visible.length, 4, renderer.dim('Use Up/Down to scroll'));
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

    renderer.showStatus('R=recruit I=inv H=shop V=village T=talisman G=log E=dungeon Q=menu ?=help');
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
    { const sr = handleSecurityInput(key, engine); if (sr === 'handled') return; if (sr) return sr; }
    if (key === '?') { ui.helpVisible = !ui.helpVisible; return; }
    if (ui.helpVisible) { if (key === 'escape') ui.helpVisible = false; return; }

    const state = engine.getState();

    // Equip picker overlay intercepts all keys when visible
    if (ui.equipPicker) {
      const team = state.team ?? [];
      if (key === 'up') ui.equipPickerIdx = Math.max(0, ui.equipPickerIdx - 1);
      else if (key === 'down') ui.equipPickerIdx = Math.min(team.length - 1, ui.equipPickerIdx + 1);
      else if (key === 'enter') {
        ui.equipPicker = false;
        return { action: 'inv_equip_to', index: ui.invIndex, memberIndex: ui.equipPickerIdx };
      } else if (key === 'escape') {
        ui.equipPicker = false;
      }
      return;
    }

    switch (key) {
      case 'r':
        ui.tavernTab = 'recruit';
        ui.menuIndex = 0;
        break;
      case 'i':
        ui.tavernTab = 'inventory';
        ui.invIndex = 0;
        break;
      case 'h':
        ui.tavernTab = 'shop';
        ui.shopIndex = 0;
        break;
      case 't':
        ui.tavernTab = 'talisman';
        break;
      case 'v':
        ui.tavernTab = 'village';
        ui.villageIndex = 0;
        break;
      case 'g':
        ui.tavernTab = 'log';
        ui.logScroll = 0;
        break;
      case 'u':
        if (ui.tavernTab === 'talisman') return 'talisman_upgrade';
        if (ui.tavernTab === 'party') return { action: 'party_unequip', memberIndex: ui.partyIndex, slot: ui.partySlot };
        break;
      case 'x':
        if (ui.tavernTab === 'inventory') return { action: 'inv_enchant', index: ui.invIndex };
        break;
      case 'tab':
        if (ui.tavernTab === 'party') {
          ui.partySlot = (ui.partySlot + 1) % 3;
        }
        break;
      case 'left':
        { const hasV = isVillageUnlocked(state) || canUnlockVillage(state);
          const tabs = hasV
            ? ['party', 'recruit', 'inventory', 'shop', 'village', 'talisman', 'log']
            : ['party', 'recruit', 'inventory', 'shop', 'talisman', 'log'];
          const idx = tabs.indexOf(ui.tavernTab);
          ui.tavernTab = tabs[(idx - 1 + tabs.length) % tabs.length]; }
        break;
      case 'right':
        { const hasV = isVillageUnlocked(state) || canUnlockVillage(state);
          const tabs = hasV
            ? ['party', 'recruit', 'inventory', 'shop', 'village', 'talisman', 'log']
            : ['party', 'recruit', 'inventory', 'shop', 'talisman', 'log'];
          const idx = tabs.indexOf(ui.tavernTab);
          ui.tavernTab = tabs[(idx + 1) % tabs.length]; }
        break;
      case 'up':
        if (ui.tavernTab === 'party') ui.partyIndex = Math.max(0, ui.partyIndex - 1);
        else if (ui.tavernTab === 'recruit') ui.menuIndex = Math.max(0, ui.menuIndex - 1);
        else if (ui.tavernTab === 'inventory') ui.invIndex = Math.max(0, ui.invIndex - 1);
        else if (ui.tavernTab === 'shop') ui.shopIndex = Math.max(0, ui.shopIndex - 1);
        else if (ui.tavernTab === 'village') ui.villageIndex = Math.max(0, ui.villageIndex - 1);
        else if (ui.tavernTab === 'trophies') ui.trophyIndex = Math.max(0, ui.trophyIndex - 1);
        else if (ui.tavernTab === 'log') ui.logScroll = Math.min((state.adventureLog ?? []).length, ui.logScroll + 1);
        else ui.menuIndex = Math.max(0, ui.menuIndex - 1);
        break;
      case 'down':
        if (ui.tavernTab === 'party') ui.partyIndex = Math.min((state.team ?? []).length - 1, ui.partyIndex + 1);
        else if (ui.tavernTab === 'recruit') ui.menuIndex++;
        else if (ui.tavernTab === 'inventory') ui.invIndex = Math.min((state.inventory ?? []).length - 1, ui.invIndex + 1);
        else if (ui.tavernTab === 'shop') ui.shopIndex = Math.min(SHOP_ITEMS.length - 1, ui.shopIndex + 1);
        else if (ui.tavernTab === 'village') ui.villageIndex = Math.min(getBuildingIds().length - 1, ui.villageIndex + 1);
        else if (ui.tavernTab === 'trophies') ui.trophyIndex = Math.min(getAllTrophies().length - 1, ui.trophyIndex + 1);
        else if (ui.tavernTab === 'log') ui.logScroll = Math.max(0, ui.logScroll - 1);
        else ui.menuIndex++;
        break;
      case 'enter':
        if (ui.tavernTab === 'recruit') return 'recruit_select';
        if (ui.tavernTab === 'shop') return { action: 'shop_buy', index: ui.shopIndex };
        if (ui.tavernTab === 'village') {
          if (!isVillageUnlocked(state) && canUnlockVillage(state)) {
            return 'village_unlock';
          }
          if (isVillageUnlocked(state)) {
            return { action: 'village_build', buildingIndex: ui.villageIndex };
          }
          return;
        }
        if (ui.tavernTab === 'inventory') {
          // Open equip picker if team exists
          if ((state.team ?? []).length > 0 && (state.inventory ?? []).length > 0) {
            ui.equipPicker = true;
            ui.equipPickerIdx = 0;
          }
          return;
        }
        if (ui.tavernTab === 'trophies') {
          // Map flat trophyIndex to trophy def, then find buyable index
          const allT = getAllTrophies();
          const selected = allT[ui.trophyIndex];
          if (selected && selected.cost && !hasTrophy(state, selected.id)) {
            const buyable = getBuyableTrophies(state);
            const buyIdx = buyable.findIndex(t => t.id === selected.id);
            if (buyIdx >= 0) return { action: 'trophy_buy', index: buyIdx };
          }
          return;
        }
        break;
      case 'e':
        if (ui.tavernTab === 'inventory') {
          if ((state.team ?? []).length > 0 && (state.inventory ?? []).length > 0) {
            ui.equipPicker = true;
            ui.equipPickerIdx = 0;
          }
          return;
        }
        if ((state.team ?? []).length > 0) return 'explore_dungeon';
        break;
      case 'd':
        if (ui.tavernTab === 'inventory') return { action: 'inv_drop', index: ui.invIndex };
        if ((state.team ?? []).length > 0) return 'explore_dungeon';
        break;
      case 'w':
        return 'save_game';
      case 's':
        if (ui.tavernTab === 'inventory') return { action: 'inv_sell', index: ui.invIndex };
        ui.settingsFrom = 'TAVERN';
        await engine.transition(GameState.SETTINGS);
        break;
      case 'escape':
        await engine.transition(GameState.MENU);
        break;
      case 'q':
        return 'go_to_menu';
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

    const autoDungeon = state.settings?.game?.autoDungeon ?? true;
    renderer.showStatus(autoDungeon ? 'Auto-dungeon ON | Q=menu W=save ?=help' : 'Arrows=navigate Enter=interact Q=menu W=save ?=help');
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
    { const sr = handleSecurityInput(key, engine); if (sr === 'handled') return; if (sr) return sr; }
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
      case 'q':
        return 'go_to_menu';
    }
  },
};

// ── COMBAT SCREEN ───────────────────────────────────────────────────

/** Render a d20 die face as ASCII art. */
function renderDie(value) {
  const v = String(value ?? '?').padStart(2);
  return [
    '+------+',
    '| d20  |',
    `|  ${v}  |`,
    '+------+',
  ];
}

const combatScreen = {
  render(state, renderer) {
    renderer.clear();
    const cols = renderer.capabilities.cols;
    const rows = renderer.capabilities.rows;
    const combat = state.activeCombat;

    renderer.showHeader(`=== Auto-Battle - Round ${combat?.round ?? 1} ===`);

    if (!combat) {
      renderer.bufferWrite(3, 4, 'Preparing for battle...');
      renderer.render();
      return;
    }

    // Enemies (top portion, compact)
    const enemies = (combat.combatants ?? []).filter(c => c.side === 'enemy');
    const halfCols = Math.max(cols - 42, Math.floor(cols * 0.55));
    for (let i = 0; i < Math.min(enemies.length, 3); i++) {
      const e = enemies[i];
      const nameColor = e.currentHp > 0 ? 'red' : 'brightBlack';
      const dead = e.currentHp <= 0 ? ' [DEAD]' : '';
      renderer.bufferWrite(2 + i * 2, 4, renderer.color(truncate(e.name + dead, halfCols - 6), nameColor));
      if (e.currentHp > 0) renderer.bufferWrite(3 + i * 2, 6, hpBar(e.currentHp, e.maxHp, 12));
    }

    // Team (bottom portion, compact)
    const team = (combat.combatants ?? []).filter(c => c.side === 'team');
    const teamRow = 2 + Math.min(enemies.length, 3) * 2 + 1;
    renderer.bufferWrite(teamRow, 4, renderer.dim('--- Your Team ---'));
    for (let i = 0; i < Math.min(team.length, 4); i++) {
      const m = team[i];
      const nameColor = m.currentHp > 0 ? 'green' : 'brightBlack';
      const dead = m.currentHp <= 0 ? ' [DEAD]' : '';
      renderer.bufferWrite(teamRow + 1 + i * 2, 4, renderer.color(truncate(m.name + dead, halfCols - 6), nameColor));
      if (m.currentHp > 0) renderer.bufferWrite(teamRow + 2 + i * 2, 6, hpBar(m.currentHp, m.maxHp, 12));
    }

    // Right panel: dice + log
    const rightCol = Math.max(halfCols + 2, cols - 38);
    const diceCol = rightCol;

    // Last roll dice display
    const lastRoll = state._lastCombatRoll;
    if (lastRoll) {
      const die = renderDie(lastRoll.raw);
      for (let i = 0; i < die.length; i++) {
        renderer.bufferWrite(2 + i, diceCol, die[i]);
      }
      const rollInfo = lastRoll.crit ? renderer.color('CRITICAL!', 'yellow') :
                       lastRoll.fumble ? renderer.color('FUMBLE!', 'red') :
                       `Roll: ${lastRoll.raw} (+${lastRoll.modifier}) = ${lastRoll.modified}`;
      renderer.bufferWrite(6, diceCol, rollInfo);
      if (lastRoll.attacker) {
        renderer.bufferWrite(7, diceCol, renderer.dim(truncate(`${lastRoll.attacker} -> ${lastRoll.target}`, 36)));
      }
      if (lastRoll.damage !== undefined) {
        renderer.bufferWrite(8, diceCol, lastRoll.damage > 0
          ? renderer.color(`${lastRoll.damage} damage`, 'red')
          : renderer.dim('0 damage (blocked)'));
      }
    }

    // Battle log (right side, below dice)
    const log = combat.log ?? [];
    const logStartRow = 10;
    renderer.bufferWrite(logStartRow, diceCol, renderer.bold('-- Battle Log --'));
    const maxLogLines = rows - logStartRow - 4;
    const recentLog = log.slice(-Math.min(maxLogLines, 8));
    for (let i = 0; i < recentLog.length; i++) {
      renderer.bufferWrite(logStartRow + 1 + i, diceCol, renderer.dim(truncate(recentLog[i], 36)));
    }

    // Auto-battle indicator
    const autoRow = rows - 3;
    renderer.bufferWrite(autoRow, 4, renderer.dim('Auto-battling... Space=speed up  A=instant resolve  Q=menu'));

    renderer.showStatus('Space=speed up | A=resolve all | Q=menu | ?=help');
    renderAIBadge(state, renderer);
    renderWorkModeBadge(state, renderer);
    renderSecurityBanner(state, renderer);
    renderSecurityLogOverlay(state, renderer);
    if (ui.helpVisible) {
      const help = renderHelp('COMBAT');
      const helpLines = help.split('\n');
      const startRow = Math.max(0, Math.floor((rows - helpLines.length) / 2));
      const startCol = Math.max(0, Math.floor((cols - (helpLines[0]?.length ?? 0)) / 2));
      for (let i = 0; i < helpLines.length; i++) {
        renderer.bufferWrite(startRow + i, startCol, helpLines[i]);
      }
    }
    renderer.render();
  },

  async handleInput(key, engine) {
    { const sr = handleSecurityInput(key, engine); if (sr === 'handled') return; if (sr) return sr; }
    if (key === '?') { ui.helpVisible = !ui.helpVisible; return; }
    if (ui.helpVisible) { if (key === 'escape') ui.helpVisible = false; return; }

    switch (key) {
      case 'space': case 'enter':
        return 'combat_speed_up';
      case 'a':
        return 'attack';
      case 'q':
        return 'go_to_menu';
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
        const icon = coloredIcon(renderer, prizes[i].slot ?? 'weapon', rarity);
        const color = rarity === 'legendary' ? 'yellow' : rarity === 'rare' ? 'cyan' : rarity === 'uncommon' ? 'green' : 'brightBlack';
        renderer.bufferWrite(5 + i * 2, 4, prefix + icon + ' ' + renderer.color(prizes[i].name, color));
        renderer.bufferWrite(6 + i * 2, 12, renderer.dim(rarity));
      }

      if (!spinning && selectedIdx >= 0) {
        const won = prizes[selectedIdx];
        renderer.bufferWrite(5 + prizes.length * 2 + 1, 4, renderer.bold(`You won: ${won?.name ?? 'something'}!`));
        renderer.bufferWrite(5 + prizes.length * 2 + 3, 4, '[E] Equip   [S] Sell   [Enter] Continue');
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
      const icon = coloredIcon(renderer, item.slot ?? 'weapon', item.rarity ?? 'common');
      const selected = i === ui.lootIndex;
      const rarityColor = { uncommon: 'green', rare: 'cyan', epic: 'magenta', legendary: 'yellow' };
      const nameStr = item.rarity && item.rarity !== 'common'
        ? renderer.color(item.name ?? 'Unknown Item', rarityColor[item.rarity] || 'brightBlack')
        : (item.name ?? 'Unknown Item');
      const line = `${prefix}${icon} ${nameStr}`;
      renderer.bufferWrite(3 + i * 4, 4, selected ? renderer.bold(line) : line);

      // Item stats
      if (item.stats) {
        const statLine = Object.entries(item.stats).map(([k, v]) => `${k}: ${v > 0 ? '+' : ''}${v}`).join('  ');
        renderer.bufferWrite(4 + i * 4, 10, statLine);
      }
      renderer.bufferWrite(5 + i * 4, 10, renderer.dim(`${item.rarity ?? 'common'} / val: ${item.value ?? 0}c`));
    }

    // Show fallen allies warning
    const team = state.team ?? [];
    const alive = team.filter(m => m.currentHp > 0).length;
    const dead = team.length - alive;
    let extraRow = 0;
    const warnStart = 3 + loot.length * 4 + 1;
    if (dead > 0 || (state.stats?.permanentDeaths ?? 0) > 0) {
      if (dead > 0) {
        renderer.bufferWrite(warnStart + extraRow, 4, renderer.color(`${dead} ally fell — gear saved to inventory.`, 'red'));
        extraRow++;
      }
      if (alive === 0) {
        renderer.bufferWrite(warnStart + extraRow, 4, renderer.color('No survivors. Returning to tavern.', 'red'));
        extraRow++;
      }
    }

    // Actions for selected item
    const actionsRow = warnStart + extraRow + 1;
    renderer.bufferWrite(actionsRow, 6, '[E] Equip   [S] Sell   [D] Discard   [Enter] Next');

    renderer.showStatus('Up/Down=select E=equip S=sell D=discard Enter=continue Q=menu');
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
        if (state.dungeonProgress && (state.team ?? []).some(m => m.currentHp > 0)) {
          await engine.transition(GameState.DUNGEON);
        } else {
          // No living team or no dungeon — return to tavern
          await engine.transition(GameState.TAVERN);
        }
        ui.lootIndex = 0;
        break;
      case 'q':
        return 'go_to_menu';
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
    let row = summaryRow + 1;
    renderer.bufferWrite(row++, 6, `Crumbs earned:  ${formatCrumbs(stats.crumbsEarned ?? 0)}`);
    renderer.bufferWrite(row++, 6, `Monsters slain: ${stats.monstersSlain ?? 0}`);
    renderer.bufferWrite(row++, 6, `Rooms cleared:  ${stats.roomsCleared ?? 0}`);
    renderer.bufferWrite(row++, 6, `Total deaths:   ${stats.deaths ?? 0}`);
    if (stats.permanentDeaths) {
      renderer.bufferWrite(row++, 6, renderer.color(`Allies lost:    ${stats.permanentDeaths} (permanent)`, 'red'));
    }

    // Death penalty display
    const penalty = state.lastDeathPenalty ?? 0;
    if (penalty > 0) {
      renderer.bufferWrite(row++, 6, renderer.color(`Crumbs lost:    ${penalty} (death penalty)`, 'red'));
    }

    const talismanReward = state.lastTalismanDeathReward ?? 0;
    if (talismanReward > 0) {
      renderer.bufferWrite(row++, 6, renderer.color(`Talisman saved: +${talismanReward} crumbs (consolation)`, 'cyan'));
    }

    // Talisman salvaged loot
    row++;
    const salvaged = state.lastSalvagedLoot ?? [];
    if (salvaged.length > 0) {
      renderer.bufferWrite(row++, 4, renderer.color('Talisman salvaged items to inventory:', 'yellow'));
      row++;
      for (let i = 0; i < salvaged.length; i++) {
        const item = salvaged[i];
        const source = item.salvageSource ? renderer.dim(` (from ${item.salvageSource})`) : '';
        renderer.bufferWrite(row++, 6,
          `${coloredIcon(renderer, item.slot ?? 'weapon', item.rarity ?? 'common')} ${item.name ?? 'Item'}${source}`);
      }
    }

    // Recovered loot (graveyard)
    const recovered = state.recoveredLoot ?? [];
    if (recovered.length > 0) {
      row++;
      renderer.bufferWrite(row++, 4, renderer.color('Recovered from the grave:', 'yellow'));
      row++;
      for (let i = 0; i < recovered.length; i++) {
        const item = recovered[i];
        renderer.bufferWrite(row++, 6, `${coloredIcon(renderer, item.slot ?? 'weapon', item.rarity ?? 'common')} ${item.name ?? 'Item'}`);
      }
    }

    // Graveyard run hint
    if (state.graveyardRunAvailable) {
      renderer.bufferWrite(row++, 4,
        renderer.color('A graveyard run is available — re-enter the same dungeon to recover more!', 'cyan'));
    }

    const bottomRow = renderer.capabilities.rows - 3;
    renderer.bufferWrite(bottomRow, 0, renderer.centerText('[Enter] Return to Tavern   [M] Return to Menu', cols));

    renderer.showStatus('Enter=tavern M/Esc=menu Q=menu');
    renderAIBadge(state, renderer);
    renderWorkModeBadge(state, renderer);
    renderSecurityBanner(state, renderer);
    renderSecurityLogOverlay(state, renderer);
    renderer.render();
  },

  async handleInput(key, engine) {
    { const sr = handleSecurityInput(key, engine); if (sr === 'handled') return; if (sr) return sr; }
    switch (key) {
      case 'enter':
        await engine.transition(GameState.TAVERN);
        break;
      case 'm': case 'escape':
        await engine.transition(GameState.MENU);
        break;
      case 'q':
        return 'go_to_menu';
    }
  },
};

// ── DUNGEON SUMMARY SCREEN ──────────────────────────────────────────

const dungeonSummaryScreen = {
  render(state, renderer) {
    renderer.clear();
    const cols = renderer.capabilities.cols;
    const stats = state._dungeonRunStats ?? {};
    const success = stats.success !== false;

    if (success) {
      renderer.showHeader('=== Dungeon Cleared! ===');
    } else {
      renderer.showHeader('=== Defeat ===');
      // R.I.P. art for death
      const deathArt = [
        '     ___________',
        '    /           \\',
        '   |   R.I.P.   |',
        '   |  Your team  |',
        '   |  has fallen |',
        '   |_____________|',
      ];
      for (let i = 0; i < deathArt.length; i++) {
        renderer.bufferWrite(2 + i, 0, renderer.centerText(deathArt[i], cols));
      }
    }

    const startRow = success ? 3 : 10;
    let row = startRow;

    // Crumbs earned
    const crumbsBefore = stats.crumbsBefore ?? 0;
    const crumbsNow = state.crumbs ?? 0;
    const crumbsEarned = Math.max(0, crumbsNow - crumbsBefore);
    renderer.bufferWrite(row++, 4, renderer.bold('-- Run Summary --'));
    row++;

    renderer.bufferWrite(row++, 6, `Crumbs earned:   ${renderer.color(formatCrumbs(crumbsEarned), crumbsEarned > 0 ? 'green' : 'brightBlack')}`);
    renderer.bufferWrite(row++, 6, `Rooms cleared:   ${stats.roomsCleared ?? 0}`);
    renderer.bufferWrite(row++, 6, `Monsters slain:  ${stats.monstersSlain ?? 0}`);
    if ((stats.bossesSlain ?? 0) > 0) {
      renderer.bufferWrite(row++, 6, renderer.color(`Bosses slain:    ${stats.bossesSlain}`, 'yellow'));
    }
    row++;

    // Loot
    const loot = stats.lootCollected ?? [];
    if (loot.length > 0) {
      renderer.bufferWrite(row++, 6, `Loot found:      ${loot.length} item(s)`);
      row++;
      const maxLoot = Math.min(loot.length, 5);
      for (let i = 0; i < maxLoot; i++) {
        const item = loot[i];
        const icon = coloredIcon(renderer, item.slot ?? 'weapon', item.rarity ?? 'common');
        const rarityColor = { uncommon: 'green', rare: 'cyan', epic: 'magenta', legendary: 'yellow' };
        const name = item.rarity && item.rarity !== 'common'
          ? renderer.color(item.name ?? 'Item', rarityColor[item.rarity] || 'brightBlack')
          : (item.name ?? 'Item');
        renderer.bufferWrite(row++, 8, `${icon} ${name}`);
      }
      if (loot.length > 5) renderer.bufferWrite(row++, 8, renderer.dim(`... +${loot.length - 5} more`));
    } else {
      renderer.bufferWrite(row++, 6, renderer.dim('No loot found'));
    }
    row++;

    if (stats.lootSold > 0) {
      renderer.bufferWrite(row++, 6, `Loot sold for:   ${stats.lootSold} crumbs`);
    }

    // Allies lost
    if (stats.alliesLost > 0) {
      row++;
      renderer.bufferWrite(row++, 6, renderer.color(`Allies lost:     ${stats.alliesLost}`, 'red'));
    }

    // Death-specific info
    if (!success) {
      row++;
      const penalty = stats.deathPenalty ?? 0;
      if (penalty > 0) {
        renderer.bufferWrite(row++, 6, renderer.color(`Death penalty:   -${penalty} crumbs`, 'red'));
      }
      const talismanReward = state.lastTalismanDeathReward ?? 0;
      if (talismanReward > 0) {
        renderer.bufferWrite(row++, 6, renderer.color(`Talisman saved:  +${talismanReward} crumbs`, 'cyan'));
      }
      const salvaged = state.lastSalvagedLoot ?? [];
      if (salvaged.length > 0) {
        row++;
        renderer.bufferWrite(row++, 4, renderer.color('Talisman salvaged:', 'yellow'));
        row++;
        for (let i = 0; i < Math.min(salvaged.length, 4); i++) {
          const item = salvaged[i];
          const source = item.salvageSource ? renderer.dim(` (from ${item.salvageSource})`) : '';
          renderer.bufferWrite(row++, 6,
            `${coloredIcon(renderer, item.slot ?? 'weapon', item.rarity ?? 'common')} ${item.name ?? 'Item'}${source}`);
        }
      }
    }

    // Continue prompt
    row += 2;
    const autoMode = state.gameMode === 'work' || (state.settings?.game?.autoDungeon ?? true);
    if (autoMode) {
      renderer.bufferWrite(row, 0, renderer.centerText(renderer.dim('Continuing automatically...'), cols));
    } else {
      renderer.bufferWrite(row, 0, renderer.centerText('[Enter] Continue to Tavern   [Q] Menu', cols));
    }

    renderer.showStatus('Enter=continue Q=menu');
    renderAIBadge(state, renderer);
    renderWorkModeBadge(state, renderer);
    renderSecurityBanner(state, renderer);
    renderer.render();
  },

  async handleInput(key, engine) {
    const state = engine.getState();
    const isDefeat = state._dungeonRunStats && state._dungeonRunStats.success === false;

    switch (key) {
      case 'enter': case 'space':
        return isDefeat ? 'summary_death_continue' : 'summary_continue';
      case 'q':
        return 'go_to_menu';
      case 'escape': case 'm':
        return 'go_to_menu';
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
  { section: 'Security', key: 'security.alertKey', label: 'Alert View Key', bonus: 'Key to open log', type: 'cycle',
    options: ['!', '@', '#', '$', '%'] },
  { section: 'Security', key: 'security.dismissKey', label: 'Alert Dismiss Key', bonus: 'Key to dismiss', type: 'cycle',
    options: ['d', 'x', 'i', 'r'] },
  { section: 'Voice', key: 'voice.enabled', label: 'Voice Control', bonus: '' },
  { section: 'Voice', key: 'voice.feedbackSound', label: 'Voice Feedback Sound', bonus: '' },
  { section: 'Voice', key: 'voice.inputWords.choice1', label: 'Voice Word: Choice 1', bonus: '' },
  { section: 'Voice', key: 'voice.inputWords.choice2', label: 'Voice Word: Choice 2', bonus: '' },
  { section: 'Game', key: 'game.autoDungeon', label: 'Auto-Dungeon', bonus: 'Auto-play dungeons' },
  { section: 'Game', key: 'game.autoRecruit', label: 'Auto-Recruit', bonus: 'Recruit best affordable' },
  { section: 'Game', key: 'game.recruitSort', label: 'Recruit Sort', bonus: 'Left/Right to cycle', type: 'cycle',
    options: ['totalStats', 'atk', 'def', 'hp', 'spd', 'lck', 'primary', 'efficiency'] },
  { section: 'Game', key: 'game.autoEquip', label: 'Auto-Equip', bonus: 'Equip gear & use potions' },
  { section: 'Game', key: 'game.equipStrategy', label: 'Equip Strategy', bonus: 'Left/Right to cycle', type: 'cycle',
    options: ['power', 'rarity', 'primaryStat', 'teamNeed', 'value'] },
  { section: 'Game', key: 'game.colorBlindMode', label: 'Color-Blind Mode', bonus: '+2% loot find' },
  { section: 'Game', key: 'game.compactMode', label: 'Compact Mode', bonus: '' },
  { section: 'Game', key: 'game.showAIStatus', label: 'Show AI Status', bonus: '' },
  { section: 'Game', key: 'game.showTokenUsage', label: 'Show Token Usage', bonus: '' },
  { section: 'Game', key: 'game.debugLogging', label: 'Debug Logging', bonus: '' },
];

const settingsScreen = {
  render(state, renderer) {
    renderer.clear();
    const cols = renderer.capabilities.cols;
    const settings = state.settings ?? {};

    renderer.showHeader('=== Settings ===');

    const maxVisibleRows = renderer.capabilities.rows - 12; // reserve space for header, bonuses, status

    // Build row data: section headers + setting entries with their indices
    const rowData = [];
    let currentSection = '';
    for (let i = 0; i < SETTINGS_LAYOUT.length; i++) {
      const s = SETTINGS_LAYOUT[i];
      if (s.section !== currentSection) {
        currentSection = s.section;
        rowData.push({ type: 'header', section: currentSection });
      }
      rowData.push({ type: 'setting', index: i, setting: s });
    }

    // Find the row index of the selected setting
    const selectedRowIdx = rowData.findIndex(r => r.type === 'setting' && r.index === ui.settingIndex);

    // Compute scroll offset to keep selection visible
    const scrollOffset = Math.max(0, Math.min(
      selectedRowIdx - Math.floor(maxVisibleRows / 2),
      rowData.length - maxVisibleRows
    ));

    const visibleRows = rowData.slice(scrollOffset, scrollOffset + maxVisibleRows);
    let row = 3;

    for (const entry of visibleRows) {
      if (entry.type === 'header') {
        renderer.bufferWrite(row, 4, renderer.bold(`-- ${entry.section} --`));
        row++;
        continue;
      }

      const s = entry.setting;
      const i = entry.index;

      // Get value by traversing dot path
      const parts = s.key.split('.');
      let val = settings;
      for (const p of parts) val = val?.[p];

      const prefix = i === ui.settingIndex ? '> ' : '  ';
      let toggle;
      if (s.type === 'cycle' && s.options) {
        const current = val ?? s.options[0];
        toggle = renderer.color(`[${current}]`, 'cyan');
        // Pad to keep alignment
        const pad = Math.max(0, 14 - current.length);
        toggle += ' '.repeat(pad);
      } else {
        const enabled = !!val;
        toggle = enabled ? renderer.color('[ON] ', 'green') : renderer.color('[OFF]', 'brightBlack');
      }
      const bonus = s.bonus ? renderer.dim(` ${s.bonus}`) : '';
      const line = `${prefix}${toggle} ${s.label}${bonus}`;
      renderer.bufferWrite(row, 4, line);
      row++;
    }

    // Scroll indicator
    if (rowData.length > maxVisibleRows) {
      const pos = Math.round((scrollOffset / Math.max(1, rowData.length - maxVisibleRows)) * 100);
      renderer.bufferWrite(row, 4, renderer.dim(`-- ${pos}% -- (${SETTINGS_LAYOUT.length} settings)`));
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
    { const sr = handleSecurityInput(key, engine); if (sr === 'handled') return; if (sr) return sr; }
    switch (key) {
      case 'up':
        ui.settingIndex = Math.max(0, ui.settingIndex - 1);
        break;
      case 'down':
        ui.settingIndex = Math.min(SETTINGS_LAYOUT.length - 1, ui.settingIndex + 1);
        break;
      case 'enter': case 'space': case 'left': case 'right': {
        const s = SETTINGS_LAYOUT[ui.settingIndex];
        if (!s) break;
        if (s.type === 'cycle' && s.options) {
          const dir = (key === 'left') ? -1 : 1;
          return { action: 'cycle_setting', key: s.key, options: s.options, dir };
        }
        return { action: 'toggle_setting', key: s.key };
      }
      case 'r':
        return 'reset_settings';
      case 'escape':
        { // Return to where settings was opened from
          const target = ui.settingsFrom === 'MENU' ? GameState.MENU : GameState.TAVERN;
          ui.settingsFrom = null;
          try { await engine.transition(target); } catch {
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

// ── CUTSCENE SCREEN ─────────────────────────────────────────────────

const cutsceneScreen = {
  render(state, renderer) {
    renderer.clear();
    const cols = renderer.capabilities.cols;
    const rows = renderer.capabilities.rows;
    const cs = state._cutscene;

    if (!cs || !cs.frames || cs.currentFrame >= cs.frames.length) {
      renderer.bufferWrite(Math.floor(rows / 2), 0, renderer.centerText('...', cols));
      renderer.render();
      return;
    }

    const frame = cs.frames[cs.currentFrame];
    const frameColor = frame.color || 'white';
    const artLines = frame.art || [];
    const textLines = frame.lines || [];
    const totalLines = artLines.length + (artLines.length > 0 ? 1 : 0) + textLines.length;
    const startRow = Math.max(2, Math.floor((rows - totalLines) / 2) - 1);

    // Decorative top border
    const border = renderer.dim('~'.repeat(Math.min(60, cols - 8)));
    renderer.bufferWrite(startRow - 1, 0, renderer.centerText(border, cols));

    let row = startRow;

    // ASCII art (centered, colored)
    for (const line of artLines) {
      renderer.bufferWrite(row++, 0, renderer.centerText(renderer.color(line, frameColor), cols));
    }
    if (artLines.length > 0) row++; // gap between art and text

    // Text lines (centered, colored, with emphasis)
    for (const line of textLines) {
      const styled = line.startsWith('"')
        ? renderer.color(line, 'yellow') // dialogue in yellow
        : renderer.color(line, frameColor);
      renderer.bufferWrite(row++, 0, renderer.centerText(styled, cols));
    }

    // Decorative bottom border
    renderer.bufferWrite(row + 1, 0, renderer.centerText(border, cols));

    // Progress indicator
    const progress = `[ ${cs.currentFrame + 1} / ${cs.frames.length} ]`;
    renderer.bufferWrite(rows - 3, 0, renderer.centerText(renderer.dim(progress), cols));

    // Skip hint
    const skipHint = renderer.dim('Press [Enter] or [Space] to skip');
    renderer.bufferWrite(rows - 2, 0, renderer.centerText(skipHint, cols));

    renderAIBadge(state, renderer);
    renderWorkModeBadge(state, renderer);
    renderSecurityBanner(state, renderer);
    renderSecurityLogOverlay(state, renderer);
    renderer.render();
  },

  async handleInput(key, engine) {
    { const sr = handleSecurityInput(key, engine); if (sr === 'handled') return; if (sr) return sr; }
    if (key === 'enter' || key === 'space' || key === 'escape') {
      return 'cutscene_skip';
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
  [GameState.DUNGEON_SUMMARY]: dungeonSummaryScreen,
  [GameState.CUTSCENE]: cutsceneScreen,
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
  ui.invIndex = 0;
  ui.shopIndex = 0;
  ui.logScroll = 0;
  ui.partyIndex = 0;
  ui.partySlot = 0;
  ui.equipPicker = false;
  ui.equipPickerIdx = 0;
  ui.villageIndex = 0;
  ui.helpVisible = false;
  ui.leaderboardVisible = false;
  ui.securityLogVisible = false;
  ui.modeSelectVisible = false;
  ui.modeSelection = 0;
}

export { screens };
