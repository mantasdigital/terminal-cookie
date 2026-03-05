// src/ui/help.js — Context-sensitive help overlay
// Returns formatted ASCII box with key bindings per screen.

const HELP_DATA = {
  MENU: {
    title: 'Main Menu',
    keys: [
      ['Up/Down',   'Move selection up/down'],
      ['Enter',     'Choose the selected option'],
      ['N',         'Start a new game'],
      ['L',         'Load a saved game'],
      ['S',         'Open settings'],
      ['Q / Esc',   'Quit the game'],
      ['?',         'Show/hide this help'],
    ],
  },
  TAVERN: {
    title: 'The Tavern (Home Base)',
    keys: [
      ['C / Space', 'Click cookie to earn crumbs'],
      ['R',         'Switch to Recruit tab'],
      ['I',         'Switch to Inventory tab'],
      ['T',         'Switch to Talisman tab'],
      ['H',         'Switch to Shop tab'],
      ['G',         'Switch to Adventure Log tab'],
      ['Left/Right','Switch between tabs'],
      ['Up/Down',   'Browse list up/down'],
      ['Enter',     'Recruit / Buy / Equip selected'],
      ['X',         'Enchant selected item (Inventory)'],
      ['E',         'Enter the dungeon (need a team)'],
      ['S',         'Open settings'],
      ['Esc',       'Back to main menu'],
      ['?',         'Show/hide this help'],
    ],
  },
  DUNGEON: {
    title: 'Dungeon',
    keys: [
      ['Up/Down',   'Choose a path at forks'],
      ['Enter',     'Interact with current room'],
      ['Esc',       'Retreat back to tavern'],
      ['?',         'Show/hide this help'],
    ],
  },
  COMBAT: {
    title: 'Combat (Auto-Battle)',
    keys: [
      ['Space/Enter','Speed up (instant turn)'],
      ['A',         'Auto-resolve entire battle'],
      ['F',         'Flee from battle'],
      ['?',         'Show/hide this help'],
    ],
  },
  SETTINGS: {
    title: 'Settings',
    keys: [
      ['Up/Down',   'Move between settings'],
      ['Enter/Space','Toggle setting on/off'],
      ['R',         'Reset all settings to defaults'],
      ['Esc',       'Go back'],
      ['?',         'Show/hide this help'],
    ],
  },
};

/**
 * Render a help overlay for the given screen.
 * @param {string} currentScreen - MENU|TAVERN|DUNGEON|COMBAT|SETTINGS
 * @returns {string} formatted ASCII help box
 */
export function renderHelp(currentScreen) {
  const data = HELP_DATA[currentScreen] || HELP_DATA.MENU;

  // Calculate dimensions
  const maxKeyLen = Math.max(...data.keys.map(([k]) => k.length));
  const maxDescLen = Math.max(...data.keys.map(([, d]) => d.length));
  const innerWidth = maxKeyLen + 3 + maxDescLen; // key + ' : ' + desc
  const boxWidth = innerWidth + 4; // '| ' + content + ' |'

  const lines = [];
  const hBar = '-'.repeat(boxWidth - 2);
  const titleStr = ` ${data.title} Help `;
  const titlePos = Math.floor((boxWidth - 2 - titleStr.length) / 2);

  // Top border with title
  lines.push(
    '+' + hBar.substring(0, titlePos) + titleStr + hBar.substring(titlePos + titleStr.length) + '+'
  );

  // Empty line
  lines.push('| ' + ' '.repeat(innerWidth) + ' |');

  // Key bindings
  for (const [key, desc] of data.keys) {
    const keyPad = key.padEnd(maxKeyLen);
    const line = `  ${keyPad} : ${desc}`;
    const padded = line.padEnd(innerWidth);
    lines.push('| ' + padded + ' |');
  }

  // Empty line
  lines.push('| ' + ' '.repeat(innerWidth) + ' |');

  // Footer
  const footer = 'Press ? to close help';
  const footerPad = footer.padStart(Math.floor((innerWidth + footer.length) / 2)).padEnd(innerWidth);
  lines.push('| ' + footerPad + ' |');

  // Bottom border
  lines.push('+' + hBar + '+');

  return lines.join('\n');
}
