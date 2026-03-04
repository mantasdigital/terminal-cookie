// src/ui/help.js — Context-sensitive help overlay
// Returns formatted ASCII box with key bindings per screen.

const HELP_DATA = {
  MENU: {
    title: 'Main Menu',
    keys: [
      ['Up/Down',   'Navigate menu options'],
      ['Enter',     'Select option'],
      ['N',         'New game'],
      ['L',         'Load game'],
      ['S',         'Settings'],
      ['Q / Esc',   'Quit game'],
      ['?',         'Toggle this help'],
    ],
  },
  TAVERN: {
    title: 'The Tavern',
    keys: [
      ['Up/Down',   'Browse party members'],
      ['Left/Right','Switch tabs (Party / Shop / Quests)'],
      ['Enter',     'Select / Interact'],
      ['R',         'Recruit new member'],
      ['E',         'Equip items'],
      ['I',         'View inventory'],
      ['D',         'Enter dungeon'],
      ['Esc',       'Back to menu'],
      ['?',         'Toggle this help'],
    ],
  },
  DUNGEON: {
    title: 'Dungeon Crawl',
    keys: [
      ['Up/Down',   'Move through rooms'],
      ['Left/Right','Choose path at branches'],
      ['Enter',     'Enter room / Interact'],
      ['M',         'View dungeon map'],
      ['I',         'View inventory'],
      ['P',         'View party status'],
      ['Space',     'Search current room'],
      ['Esc',       'Retreat to tavern'],
      ['?',         'Toggle this help'],
    ],
  },
  COMBAT: {
    title: 'Combat',
    keys: [
      ['Up/Down',   'Select action'],
      ['Left/Right','Switch target'],
      ['Enter',     'Confirm action'],
      ['1-4',       'Quick-select party member'],
      ['A',         'Attack'],
      ['S',         'Special ability'],
      ['U',         'Use item'],
      ['F',         'Flee (if possible)'],
      ['Tab',       'Cycle targets'],
      ['?',         'Toggle this help'],
    ],
  },
  SETTINGS: {
    title: 'Settings',
    keys: [
      ['Up/Down',   'Navigate settings'],
      ['Left/Right','Adjust value'],
      ['Enter',     'Toggle / Confirm'],
      ['R',         'Reset to defaults'],
      ['Esc',       'Back to menu'],
      ['?',         'Toggle this help'],
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
