// src/ui/ascii.js — ASCII art library for Terminal Cookie
// All art generators return strings or arrays of strings.

/**
 * Large detailed cookie (8+ lines) with chocolate chip pattern.
 */
export function masterCookie() {
  return [
    '         .-""""""""-.',
    '       .\'  ::::  ::  \'.',
    '      /  (::::)   ::::  \\',
    '     |  :::  (::::)  ::  |',
    '     | (::::)   :::(::::)|',
    '     |  :::  (::::)  ::  |',
    '      \\  (::::)   ::::  /',
    '       \'.  ::::  ::  .\'',
    '         \'-........-\'',
  ].join('\n');
}

/**
 * Small 3-line cookie.
 */
export function miniCookie() {
  return [
    ' (::)',
    '(::::)',
    ' (::)',
  ].join('\n');
}

/**
 * Cookie with X marks (trash/destroyed).
 */
export function trashCookie() {
  return [
    '     .--""""--.',
    '   .\'  XX  XX  \'.',
    '  / XX    XX  XX \\',
    ' | XXXX  XX  XXXX|',
    '  \\ XX    XX  XX /',
    '   \'.  XX  XX  .\'',
    '     \'--....--\'',
  ].join('\n');
}

/**
 * Explosion animation frames (array of multi-line strings).
 */
export function explodeCookie() {
  return [
    // Frame 0: intact
    [
      '     .--""""--.',
      '   .\'  ::  ::  \'.',
      '  / (::::) ::::  \\',
      ' |  ::  (::::) :: |',
      '  \\ (::::) ::::  /',
      '   \'.  ::  ::  .\'',
      '     \'--....--\'',
    ].join('\n'),
    // Frame 1: cracking
    [
      '     .--""""/--.',
      '   .\'  ::/ ::  \'.',
      '  / (:::/  ::::  \\',
      ' | ___/  (::::) :: |',
      '  \\ (:::/) ::::  /',
      '   \'. /::  ::  .\'',
      '     \'--/...--\'',
    ].join('\n'),
    // Frame 2: breaking apart
    [
      '      . --  \" -  .',
      '    .   ::  ::   .',
      '   /  (::    ::)   \\',
      '  |     *(  )*    |',
      '   \\  (::    ::)   /',
      '    .   ::  ::   .',
      '      . --  . -  .',
    ].join('\n'),
    // Frame 3: fragments
    [
      '       *       *',
      '    .     ::      .',
      '  ::   *       *  ::',
      '      .  (::)  .',
      '  *        *      .',
      '    ::       ::',
      '       *       *',
    ].join('\n'),
    // Frame 4: dust
    [
      '        .    .',
      '     .    .    .',
      '   .   .    .   .',
      '     .   ..   .',
      '   .    .  .    .',
      '     .    .    .',
      '        .    .',
    ].join('\n'),
    // Frame 5: gone
    [
      '',
      '',
      '        ~ poof ~',
      '',
      '',
      '',
      '',
    ].join('\n'),
  ];
}

// ---- Team Member Portraits ----

const HEADS = {
  human:   ['  O  ', ' /|\\ ', ' / \\ '],
  elf:     [' @/  ', ' /|\\ ', ' / \\ '],
  dwarf:   ['  #  ', ' /#\\ ', ' | | '],
  goblin:  [' .o. ', ' /|\\ ', '  |  '],
  golem:   [' [#] ', ' [X] ', ' [_] '],
  sprite:  ['  *  ', ' .|. ', '  v  '],
};

const WEAPONS = {
  warrior:   [' ]== ', ' |/  ', ' |   '],
  scout:     [' /-- ', ' |\\  ', ' |   '],
  healer:    [' +-- ', ' |\\  ', ' |   '],
  mage:      [' *~~ ', ' |\\  ', ' |   '],
  bard:      [' d~~ ', ' |\\  ', ' |   '],
  berserker: [' X== ', ' |/  ', ' |   '],
};

const EXPRESSIONS = {
  brave:     ':D',
  cautious:  'o_o',
  greedy:    '$.$',
  loyal:     '^_^',
  reckless:  '>:D',
};

/**
 * Generate a 3-line team member portrait.
 * Accepts any case — lookups are normalized to lowercase.
 * @param {string} race - Human|Dwarf|Elf|Goblin|Golem|Sprite
 * @param {string} classType - Warrior|Scout|Healer|Mage|Bard|Berserker
 * @param {string} personality - Brave|Cautious|Greedy|Loyal|Reckless
 * @returns {string}
 */
export function teamMember(race, classType, personality) {
  const head = HEADS[String(race).toLowerCase()] || HEADS.human;
  const weapon = WEAPONS[String(classType).toLowerCase()] || WEAPONS.warrior;
  const expr = EXPRESSIONS[String(personality).toLowerCase()] || ':)';

  // Combine: head line gets expression, body gets weapon
  const line0 = head[0] + ' ' + expr;
  const line1 = head[1] + weapon[0];
  const line2 = head[2] + weapon[2];
  return [line0, line1, line2].join('\n');
}

// ---- Dungeon Map ----

// Room type display symbols for dungeon map
const ROOM_SYMBOLS = {
  empty:   '.',
  monster: 'M',
  trap:    'T',
  loot:    '$',
  shrine:  '+',
  boss:    'B',
};

/**
 * Render a dungeon map as ASCII art.
 * Accepts rooms from dungeon.js (with type/id/connections) or plain {id, name, connections}.
 * @param {Array<{id: number, type?: string, name?: string, connections: number[], visited?: boolean, cleared?: boolean, isEntrance?: boolean, isExit?: boolean}>} rooms
 * @param {number} currentRoom - id of the current room
 * @returns {string}
 */
export function dungeonMap(rooms, currentRoom) {
  if (!rooms || rooms.length === 0) return '  [empty dungeon]';

  const lines = [];
  const drawn = new Set();

  function roomLabel(room) {
    if (room.name) return room.name;
    if (room.isEntrance) return 'Entrance';
    if (room.isExit) return 'Exit';
    const sym = ROOM_SYMBOLS[room.type] || '?';
    return `[${sym}] ${room.type || 'room'} ${room.id}`;
  }

  function drawRoom(room, depth) {
    if (drawn.has(room.id)) return;
    drawn.add(room.id);

    const indent = '  '.repeat(depth);
    const isCurrent = room.id === currentRoom;
    const marker = isCurrent ? '[*]' : room.cleared ? '[x]' : room.visited ? '[-]' : '[ ]';
    lines.push(`${indent}${marker} ${roomLabel(room)}`);

    const conns = (room.connections || []).filter(c => !drawn.has(c));
    for (let i = 0; i < conns.length; i++) {
      const isLast = i === conns.length - 1;
      const connector = isLast ? '`--' : '|--';
      lines.push(`${indent} ${connector}~~~`);
      const next = rooms.find(r => r.id === conns[i]);
      if (next) drawRoom(next, depth + 1);
    }
  }

  drawRoom(rooms[0], 0);
  return lines.join('\n');
}

// ---- Monster Art ----

const MONSTER_TEMPLATES = {
  // -- cave --
  bat: [
    ' /\\_/\\ ',
    '( o.o )',
    ' > ^ < ',
    ' /| |\\ ',
  ],
  spider: [
    ' /\\_/\\  ',
    '/\\(oo)/\\',
    '  /||\\\\ ',
    ' / || \\\\',
  ],
  slime: [
    '  .--.',
    ' /    \\',
    '| .  . |',
    ' \\~~~~/',
    '  \'--\'',
  ],
  troll: [
    '  ___  ',
    ' / o_\\ ',
    '|  __/ ',
    '| |___ ',
    ' \\___/ ',
  ],
  dragon: [
    '     /\\_)',
    '    / o o\\',
    '   /  >  ^)',
    '  /  /|~|',
    ' /__/ | |',
    '       ^^',
  ],
  // -- crypt --
  skeleton: [
    '  .-.  ',
    ' (o.o) ',
    ' /)_(\\ ',
    '  | |  ',
    ' _| |_ ',
    '|_____|',
  ],
  ghost: [
    '  .-.',
    ' (o o)',
    ' | O |',
    ' |   |',
    ' ^~^~^',
  ],
  zombie: [
    '  .-.  ',
    ' (x_x) ',
    ' /|~|\\ ',
    '  | |  ',
    ' _/ \\_ ',
  ],
  lich: [
    ' /^~^\\ ',
    ' |o o| ',
    ' |~~~| ',
    ' |   | ',
    ' /   \\ ',
  ],
  wraith: [
    '  /-\\  ',
    ' (. .) ',
    ' |~~~| ',
    '  \\|/  ',
    '  ~~~  ',
  ],
  // -- forest --
  wolf: [
    '  /\\_/\\',
    ' / o o \\',
    '(   V   )',
    ' \\  ~  /',
    '  \'---\'',
  ],
  bear: [
    ' (o  o)',
    '/|~~~~|\\',
    ' |    | ',
    ' |    | ',
    '  \'--\'  ',
  ],
  treant: [
    ' /==\\  ',
    ' |oo|  ',
    '/|--|\\',
    ' |  |  ',
    ' |__|  ',
  ],
  bandit: [
    '  _O_  ',
    ' /|X|\\ ',
    '  | |  ',
    ' / \\  ',
  ],
  fairy: [
    '  *\\/*  ',
    '  (o.o) ',
    '  /|\\  ',
    '   v   ',
  ],
  // -- volcano --
  imp: [
    ' >\\./<',
    ' (o.o)',
    ' /| |\\',
    '  ^ ^ ',
  ],
  magma_golem: [
    ' [###] ',
    ' |~#~| ',
    ' |   | ',
    ' [___] ',
  ],
  fire_serpent: [
    '  /~>  ',
    ' /~~~\\ ',
    ' ~~~~~  ',
  ],
  demon: [
    ' /^V^\\ ',
    ' |><|| ',
    ' /  \\ ',
  ],
  phoenix: [
    ' ~\\/~  ',
    ' (O O) ',
    '/|~~|\\',
    ' ^^^^  ',
  ],
  // -- abyss --
  shadow: [
    '  .:.',
    ' :...:',
    ':. . .:',
    ' :...:',
    '  .:.',
  ],
  tentacle: [
    ' /\\/\\  ',
    ' |  |  ',
    ' |  |  ',
    ' ~~~~  ',
  ],
  void_walker: [
    '  /?\\  ',
    ' /| |\\ ',
    '  | |  ',
    '  ^ ^  ',
  ],
  eldritch: [
    ' /---\\ ',
    ' |(O)| ',
    ' \\---/ ',
    '  |||  ',
  ],
  cookie_monster: [
    ' (:::) ',
    '/(::::)\\',
    '|(::::)|',
    ' \\:::/ ',
  ],
};

// Fallback art for any template not explicitly defined
const FALLBACK_MONSTER = [
  '  .-.  ',
  ' (?.?) ',
  ' /|+|\\ ',
  '  | |  ',
  '  ^ ^  ',
];

/**
 * Build a monster from a base template plus mutations.
 * Falls back to generic art for unknown templates.
 * @param {string} template - Any monster template key
 * @param {string[]} [mutations=[]] - Giant|Armored|Swift|Venomous|Ethereal|Enraged|Cookie-Cursed|Regenerating
 * @returns {string}
 */
export function monsterArt(template, mutations = []) {
  let art = [...(MONSTER_TEMPLATES[template] || FALLBACK_MONSTER)];

  for (const mut of mutations) {
    switch (mut) {
      case 'Giant':
        art = art.map(line => line.split('').map(c => c + c).join(''));
        break;
      case 'Armored':
        art = art.map(line => '[#]' + line + '[#]');
        break;
      case 'Swift':
        art = art.map(line => '>>' + line);
        break;
      case 'Venomous':
        art.push('  ~~ ~~ ~~ ~~');
        break;
      case 'Ethereal':
        art = art.map(line => line.replace(/[^\s]/g, '.'));
        break;
      case 'Enraged':
        art[0] = '!!! ' + art[0] + ' !!!';
        art.push('   !!!!!!!!!');
        break;
      case 'Cookie-Cursed':
        art.push(' (::)(::)(::)');
        break;
      case 'Regenerating':
        art.push('  +++ +++ +++');
        break;
    }
  }

  // Enforce max 7 lines x 30 chars
  art = art.slice(0, 7).map(line => line.substring(0, 30));
  return art.join('\n');
}

// ---- Loot Icons ----

const LOOT_ICONS = {
  weapon:  '[/>',
  armor:   '[A]',
  helmet:  '{^}',
  shield:  '(#)',
  ring:    ' o ',
  amulet:  '<*>',
  potion:  ' U ',
  scroll:  '=|=',
  boots:   '|_|',
  gloves:  '\\m/',
};

const RARITY_INDICATOR = {
  common:    '.',
  uncommon:  '+',
  rare:      '*',
  epic:      '#',
  legendary: '!',
};

/**
 * Small loot icon per slot with rarity indicator.
 * @param {string} slot - weapon|armor|helmet|shield|ring|amulet|potion|scroll|boots|gloves
 * @param {string} rarity - common|uncommon|rare|epic|legendary
 * @returns {string}
 */
export function lootIcon(slot, rarity) {
  const icon = LOOT_ICONS[slot] || '[?]';
  const ind = RARITY_INDICATOR[rarity] || '.';
  return `${ind}${icon}${ind}`;
}

/**
 * Title screen ASCII art.
 */
export function titleScreen() {
  return [
    '  ______                   _             __   ______            __   _     ',
    ' /_  __/__  _________ _   (_)___  ____ _/ /  / ____/___  ____  / /__(_)__ ',
    '  / / / _ \\/ ___/ __ `__ \\/ / __ \\/ __ `/ /  / /   / __ \\/ __ \\/ //_/ / _ \\',
    ' / / /  __/ /  / / / / / / / / / / /_/ / /  / /___/ /_/ / /_/ / ,< / /  __/',
    '/_/  \\___/_/  /_/ /_/ /_/_/_/ /_/\\__,_/_/   \\____/\\____/\\____/_/|_/_/\\___/ ',
    '',
    '                        .--""""""""--.',
    '                      .\'  (::::) :::  \'.',
    '                     / :::: (::::)  ::  \\',
    '                    |  (::::)  :::  (:::)|',
    '                     \\ ::::  (::::) ::  /',
    '                      \'.  (::::) :::  .\'',
    '                        \'--........--\'',
    '',
    '               A Dungeon Crawler for Your Terminal',
    '                    Press [ENTER] to begin',
  ].join('\n');
}

/**
 * ASCII progress bar for dice-roll visualization.
 * @param {number} position - current roll value
 * @param {number} max - max roll value
 * @returns {string}
 */
export function rollBar(position, max) {
  const width = 30;
  const filled = Math.round((position / Math.max(max, 1)) * width);
  const bar = '='.repeat(filled) + '>' + ' '.repeat(Math.max(0, width - filled - 1));
  const pct = Math.round((position / Math.max(max, 1)) * 100);
  return `[${bar}] ${position}/${max} (${pct}%)`;
}
