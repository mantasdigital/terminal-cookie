/**
 * Screen manager — maps engine states to render functions and input handlers.
 * Each screen: { render(state, renderer), handleInput(key, engine) → void }
 */

import { GameState } from '../core/engine.js';
import { titleScreen, masterCookie, miniCookie, dungeonMap, monsterArt, lootIcon, teamMember } from '../ui/ascii.js';
import { renderHelp } from '../ui/help.js';
import { buildPortrait } from './team.js';
import { resolveRoll } from './combat.js';

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
  notification: '',
  notificationTimeout: null,
};

function notify(renderer, msg, level = 'info') {
  renderer.showNotification(msg, level);
  ui.notification = msg;
}

// ── MENU SCREEN ─────────────────────────────────────────────────────

const menuOptions = ['New Game', 'Load Game', 'Settings', 'Quit'];

const menuScreen = {
  render(state, renderer) {
    renderer.clear();
    const title = titleScreen();
    const lines = title.split('\n');
    for (let i = 0; i < lines.length; i++) {
      renderer.bufferWrite(1 + i, 0, renderer.centerText(lines[i], renderer.capabilities.cols));
    }

    const menuTop = lines.length + 3;
    for (let i = 0; i < menuOptions.length; i++) {
      const prefix = i === ui.menuIndex ? ' > ' : '   ';
      const label = prefix + menuOptions[i];
      const styled = i === ui.menuIndex ? renderer.bold(label) : label;
      renderer.bufferWrite(menuTop + i, 0, renderer.centerText(styled, renderer.capabilities.cols));
    }

    renderer.showStatus('Arrow keys to navigate | Enter to select | ? for help');
    if (ui.helpVisible) {
      const help = renderHelp('MENU');
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
    if (key === '?') { ui.helpVisible = !ui.helpVisible; return; }
    if (ui.helpVisible) { if (key === 'escape') ui.helpVisible = false; return; }

    if (key === 'up') ui.menuIndex = (ui.menuIndex - 1 + menuOptions.length) % menuOptions.length;
    else if (key === 'down') ui.menuIndex = (ui.menuIndex + 1) % menuOptions.length;
    else if (key === 'enter' || key === 'space') {
      switch (ui.menuIndex) {
        case 0: // New Game
          await engine.transition(GameState.TAVERN);
          break;
        case 1: // Load Game — engine expects save integration externally
          await engine.transition(GameState.TAVERN);
          break;
        case 2: // Settings
          await engine.transition(GameState.SETTINGS);
          break;
        case 3: // Quit
          await engine.shutdown();
          break;
      }
    } else if (key === 'n') {
      await engine.transition(GameState.TAVERN);
    } else if (key === 'l') {
      await engine.transition(GameState.TAVERN);
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
    renderer.bufferWrite(2, 12, renderer.bold(`Crumbs: ${state.crumbs ?? 0}`));
    renderer.bufferWrite(3, 12, '[C] Click cookie');

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

    renderer.showStatus('C=cookie R=recruit I=inventory E=dungeon S=settings ?=help');
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
    if (key === '?') { ui.helpVisible = !ui.helpVisible; return; }
    if (ui.helpVisible) { if (key === 'escape') ui.helpVisible = false; return; }

    const state = engine.getState();

    switch (key) {
      case 'c': case 'space':
        // Cookie click handled by game orchestrator
        return 'cookie_click';
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

    // Party summary along bottom
    const team = state.team ?? [];
    const partyRow = renderer.capabilities.rows - 4;
    for (let i = 0; i < Math.min(team.length, 4); i++) {
      const m = team[i];
      const col = i * Math.floor(cols / 4);
      renderer.bufferWrite(partyRow, col, `${m.name} ${hpBar(m.currentHp, m.maxHp, 8)}`);
    }

    renderer.showStatus('Arrows=navigate Enter=interact M=map I=inventory Esc=retreat ?=help');
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
      case 'escape':
        await engine.transition(GameState.TAVERN);
        break;
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
    renderer.render();
  },

  async handleInput(key, engine) {
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
        await engine.transition(GameState.DUNGEON);
        ui.lootIndex = 0;
        break;
      case 'escape':
        await engine.transition(GameState.TAVERN);
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
    renderer.bufferWrite(summaryRow + 1, 6, `Crumbs earned:  ${stats.crumbsEarned ?? 0}`);
    renderer.bufferWrite(summaryRow + 2, 6, `Monsters slain: ${stats.monstersSlain ?? 0}`);
    renderer.bufferWrite(summaryRow + 3, 6, `Rooms cleared:  ${stats.roomsCleared ?? 0}`);
    renderer.bufferWrite(summaryRow + 4, 6, `Total deaths:   ${stats.deaths ?? 0}`);

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
    renderer.render();
  },

  async handleInput(key, engine) {
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
  { section: 'Voice', key: 'voice.enabled', label: 'Voice Control', bonus: '' },
  { section: 'Voice', key: 'voice.feedbackSound', label: 'Voice Feedback Sound', bonus: '' },
  { section: 'Game', key: 'game.colorBlindMode', label: 'Color-Blind Mode', bonus: '+2% loot find' },
  { section: 'Game', key: 'game.compactMode', label: 'Compact Mode', bonus: '' },
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
    renderer.render();
  },

  async handleInput(key, engine) {
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
      'Terminal Cookie is a dungeon-crawling cookie clicker for your terminal.',
      '',
      'How to Play:',
      '  1. Click the cookie to earn crumbs',
      '  2. Recruit heroes at the Tavern',
      '  3. Send your team into the dungeon',
      '  4. Fight monsters using the roll bar mechanic',
      '  5. Collect loot and level up!',
      '',
      'Tips:',
      '  - Enable Focus and Security settings for gameplay bonuses',
      '  - Bigger teams have better survival odds',
      '  - After a wipe, you get a discount on new recruits',
      '  - Re-enter the same dungeon within 3 runs to recover lost gear',
      '',
      'Press Esc to return',
    ];

    for (let i = 0; i < lines.length; i++) {
      renderer.bufferWrite(3 + i, 4, lines[i]);
    }

    renderer.showStatus('Esc=back');
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
}

export { screens };
