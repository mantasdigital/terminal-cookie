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
      '      . --  " -  .',
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
    '   \\^..^/',
    '    )  (',
    '   /|  |\\',
    '  /_|  |_\\',
  ],
  spider: [
    '  /\\(OO)/\\',
    ' //|<>|\\\\',
    '// |--| \\\\',
    '/  /||\\ \\',
  ],
  slime: [
    '    .~~~.',
    '  /o    o\\',
    ' | ~~~~~~ |',
    '  \\_~~~~_/',
    '   `\'\'\'\'`',
  ],
  troll: [
    '   .===.',
    '  /o _ o\\',
    '  |=====|',
    ' /| ### |\\',
    '  |_| |_|',
  ],
  dragon: [
    '     /\\_)',
    '    /o  o\\',
    '   / >==> )',
    '  | /~~~\\/',
    ' /|/ ||||',
    ' \\_) ^^^^',
  ],
  mushroom: [
    '   .oOOo.',
    '  /:::::::\\',
    '  |::():::|',
    '   |::::|',
    '  /|    |\\',
  ],
  beetle: [
    '  <*o  o*>',
    '  |*====*|',
    '  |*~~~~*|',
    '   \\/  \\/',
  ],
  ogre: [
    '   (o_O)',
    '  /|==|\\',
    ' / |##| \\',
    '   |##|',
    '  _|  |_',
  ],
  drip_wraith: [
    '   ,..,',
    '  (o  o)',
    '  :    :',
    '  :~~~~:',
    '   `~~`',
    '    ..',
  ],
  crab: [
    '  v(oo)v',
    ' [|====|]',
    ' [|####|]',
    '  //  \\\\',
    '  ``  ``',
  ],
  // -- crypt --
  skeleton: [
    '   .=.',
    '  (x.x)',
    '  /|_|\\',
    '  /)X(\\',
    '  _| |_',
    ' |_   _|',
  ],
  ghost: [
    '    .~.',
    '   (O O)',
    '   | ~ |',
    '   |   |',
    '   ^~^~^',
    '    ~~~',
  ],
  zombie: [
    '  __/\\__',
    ' (o    o)',
    ' /|/\\/|\\',
    '/ |    | \\',
    '  `    `',
  ],
  lich: [
    '   /^~^\\',
    '  |o   o|',
    '  |~~~~~|',
    '  | |-| |',
    ' /|     |\\',
    '  /     \\',
  ],
  wraith: [
    '    .*.',
    '   .oOo.',
    '  (o~~~~o)',
    '   \\~~~~/ ',
    '    |--|',
    '    `--`',
  ],
  skull_swarm: [
    '  @o@ @o@',
    ' @o@ @o@ @o@',
    ' @o@  @o@',
    '  @o@ @o@',
  ],
  coffin: [
    '  .------.',
    '  |XXXXXX|',
    '  |X    X|',
    '  |X ** X|',
    '  |XXXXXX|',
    '  \'------\'',
  ],
  rat: [
    '  (\\  /)',
    '  (\'><\')',
    '  /|==|\\',
    '   |~~|',
    '  /|  |\\',
  ],
  death_knight: [
    '  {=====}',
    '  |^   ^|',
    '  |]==[|',
    ' /| ## |\\',
    '  | ## |',
    '  /|  |\\',
  ],
  guardian: [
    '  [=====]',
    '  |[+ +]|',
    '  |[===]|',
    '  | |=| |',
    '  |_| |_|',
  ],
  // -- forest --
  wolf: [
    '   /\\_/\\',
    '  / o o \\',
    ' (  V    )',
    '  \\~~~~~/ ',
    '   || ||',
    '   \'\' \'\'',
  ],
  bear: [
    '  (o    o)',
    ' /|~~~~~~|\\',
    ' ||  <>  ||',
    '  |~~~~~~|',
    '  |_|  |_|',
  ],
  treant: [
    ' /\\/==\\/\\',
    ' \\/|oo|\\/',
    '   |--|',
    '  /|##|\\',
    ' / |##| \\',
    '   |  |',
    '  _|__|_',
  ],
  sprite: [
    '  *\\_/*',
    '  (o.o)',
    '  /|~|\\',
    '   /|\\',
    '   v v',
  ],
  vine: [
    '  ~\\/\\/~',
    '  }|  |{',
    ' ~}|  |{~',
    '  }|--|{',
    '  ~/  \\~',
    '   ~  ~',
  ],
  scorpion: [
    '    /`\\/',
    '   {o  o}',
    '  /|~~~~|\\',
    '  ~|====|~',
    '   //  \\\\',
  ],
  pixie: [
    '  *  +  *',
    ' + ** +  *',
    ' *  + ** +',
    '  +  *  +',
  ],
  golem: [
    '  [ooo]',
    '  |/\\/|',
    ' /|/\\/|\\',
    '  |/\\/|',
    '  /|||\\',
    '  `|||`',
  ],
  boar: [
    '  /\\o/\\',
    ' (=====)',
    ' |~~~~~|',
    '  || ||',
    '  \'\' \'\'',
  ],
  spore: [
    '   .oOo.',
    '  :o.O.o:',
    ' .:oOoOo:.',
    '  :o.O.o:',
    '   `oOo`',
  ],
  // -- volcano --
  imp: [
    '  >\\^/<',
    '  (o.o)',
    '  /|~|\\',
    '   |^|',
    '   ^ ^',
  ],
  magma_golem: [
    '  [###]',
    '  |~#~|',
    ' /|###|\\',
    '  |~#~|',
    '  [___]',
  ],
  fire_serpent: [
    '    /~==>',
    '   /~*~*\\',
    '  /*~*~*~\\',
    ' ~*~*~*~*~',
    '  ~~~~~~~~',
  ],
  demon: [
    '  /^V^\\',
    '  |><||',
    ' /|~~~~|\\',
    '  |^^^^|',
    '  /|  |\\',
    '  ^ ^^ ^',
  ],
  phoenix: [
    '  ~\\/\\/~',
    '  (O  O)',
    ' /|~~~~|\\',
    '//|^~~^|\\\\',
    '  ^^^^^^',
    '   ~~~~',
  ],
  slag_beetle: [
    '  <#  #>',
    '  |~##~|',
    '  |~##~|',
    '   \\/\\/',
    '   ^  ^',
  ],
  flame_wraith: [
    '   /^\\',
    '  {~.~}',
    '  :^^^:',
    '  : ~ :',
    '   ^^^',
    '    ~',
  ],
  obsidian: [
    '  [VVV]',
    '  |###|',
    ' /|###|\\',
    '  |###|',
    '  [___]',
  ],
  worm: [
    '   /OO>',
    '  /~~~~\\',
    ' /~~~~~~\\',
    ' ~~~~~~~*~',
    '  ~~~~~~~~',
  ],
  sulfur_sprite: [
    '   *~*',
    '  (o.o)',
    '  ~|^|~',
    '   \\|/',
    '    ~',
  ],
  // -- abyss --
  shadow: [
    '    .:.',
    '   :. .:',
    '  :. . .:',
    '  :.. ..:',
    '   :. .:',
    '    .:.',
  ],
  tentacle: [
    '  /\\/\\/\\',
    '  | || |',
    '  | || |',
    '  | || |',
    '  ~~~~~~',
    '   ~~~~',
  ],
  void_walker: [
    '   /?\\',
    '  /|?|\\',
    ' / |?| \\',
    '   |?|',
    '   ^ ^',
  ],
  eldritch: [
    '  /-----\\',
    '  | (O) |',
    '  | /-\\ |',
    '  \\-----/',
    '   |||||',
    '   `\'\'\'`',
  ],
  cookie_monster: [
    '   (:::)',
    '  /(::::)\\',
    ' |(::::::)|',
    ' |(::::::)|',
    '  \\(::::)/',
    '   (:::)',
  ],
  null_shade: [
    '   .  .',
    '  . .. .',
    ' :      :',
    ' :  ..  :',
    '  ` .. `',
    '   `  `',
  ],
  mind_leech: [
    '  /~~~~~~\\',
    '  |<o  o>|',
    '  |\\~~~~/ |',
    '  \\~~~~~~/',
    '   `~~~~`',
  ],
  rift_sentinel: [
    '  {=====}',
    '  |><><>|',
    ' /|<><><|\\',
    '  |><><>|',
    '  /|  |\\',
  ],
  gravity_worm: [
    '   ~OO~',
    '  /~~~~\\',
    ' /~~~~~~\\',
    ' ~~~~~~~~',
    '  ~~~~~~',
  ],
  dread_maw: [
    '  /VVVVV\\',
    '  |     |',
    '  |^^^^^|',
    '  |     |',
    '  \\VVVVV/',
    '   \\___/',
  ],
};

// Fallback art for any template not explicitly defined
const FALLBACK_MONSTER = [
  '   .?.',
  '  (?.?)',
  '  /|+|\\',
  '   | |',
  '   ^ ^',
];

// ── PROCEDURAL MONSTER GENERATION ────────────────────────────────
// Modular parts system: 30 heads × 25 bodies × 20 legs × decorations = 15,000+ unique combinations

const PROC_HEADS = [
  // Eyes and faces - wide variety
  ['  (o.o)  '],
  ['  (O_O)  '],
  ['  {>.<}  '],
  ['  [o o]  '],
  ['  <*.* > '],
  ['   /O\\   '],
  ['  (x_x)  '],
  ['  |o.o|  '],
  ['  (=.=)  '],
  ['  <o_o>  '],
  ['  {O.O}  '],
  ['  [>_<]  '],
  ['  (o O)  '],
  ['  |*.*|  '],
  ['  <@.@>  '],
  ['   .^.   ', '  (o o)  '],
  ['  /\\_/\\  ', '  (O O)  '],
  ['   ___   ', '  (o_o)  '],
  ['  ~\\/~   ', '  {o.o}  '],
  ['  /===\\  ', '  |O O|  '],
  ['  .---.  ', '  |o_o|  '],
  ['  ,---.  ', '  (>.>)  '],
  ['  /^^^\\  ', '  |*_*|  '],
  ['  \\vvv/  ', '  (O.o)  '],
  ['  /ooo\\  ', '  |^ ^|  '],
  ['  {===}  ', '  |o.o|  '],
  ['  <--->  ', '  (O_o)  '],
  ['  /\\ /\\  ', '  (o.o)  '],
  ['  |^^^|  ', '  |o o|  '],
  ['   ***   ', '  (O_O)  '],
];

const PROC_BODIES = [
  // Torsos - humanoid, beast, amorphous
  ['  /|~|\\  ', '  | | |  '],
  ['  [===]  ', '  |   |  '],
  [' /|||||\\', '  |||||  '],
  ['  {~~~}  ', '  {   }  '],
  ['  |XXX|  ', '  |   |  '],
  ['  /===\\  ', '  \\===/  '],
  [' <|===|> ', '  |===|  '],
  ['  |/\\/|  ', '  |/\\/|  '],
  ['  (~~~)  ', '  (   )  '],
  ['  |###|  ', '  |# #|  '],
  ['  {ooo}  ', '  { o }  '],
  ['  |+-+|  ', '  |   |  '],
  [' /\\  /\\ ', ' /    \\ '],
  ['  |<=>|  ', '  |   |  '],
  ['  [*+*]  ', '  [   ]  '],
  ['  |^^^|  ', '  |vvv|  '],
  ['  /oOo\\  ', '  \\oOo/  '],
  [' {|==|}  ', '  |==|   '],
  ['  |~#~|  ', '  |~#~|  '],
  ['  [/\\/]  ', '  [/\\/]  '],
  ['  |<><|  ', '  |><>|  '],
  ['  (###)  ', '  (   )  '],
  ['  |=*=|  ', '  |   |  '],
  ['  {|||} ', '  {|||} '],
  ['  |oXo|  ', '  |oXo|  '],
];

const PROC_LEGS = [
  // Feet, roots, tails, bases
  ['  / \\    '],
  ['  || ||  '],
  ['  /| |\\  '],
  ['  ^^^^   '],
  ['  ~~~~   '],
  ['  [__]   '],
  ['  |  |   '],
  ['  /\\ /\\  '],
  ['  vv vv  '],
  ['  `` ``  '],
  ['  //  \\\\ '],
  ['   ||    '],
  ['  _/\\_   '],
  ['  \\  /   '],
  ['  ^  ^   '],
  ['  |__|   '],
  ['  /||\\   '],
  ['  =/\\=   '],
  ['  {__}   '],
  ['  |/\\|   '],
];

const PROC_DECOR = [
  // Decorations appended or prepended
  { type: 'crown', lines: ['  \\|/  '] },
  { type: 'horns', lines: [' )   ( '] },
  { type: 'halo', lines: ['   o   '] },
  { type: 'flames', lines: [' ~*~*~ '] },
  { type: 'sparks', lines: [' + . + '] },
  { type: 'drip', lines: [' .  .  .'] },
  { type: 'frost', lines: [' *  *  *'] },
  { type: 'thorns', lines: ['  >/<  '] },
  { type: 'smoke', lines: ['  ~~~  '] },
  { type: 'eyes', lines: [' o   o '] },
  { type: 'wings_top', lines: ['>\\ . /<'] },
  { type: 'aura', lines: ['. . . .'] },
  { type: 'tail', lines: ['     ~~'] },
  { type: 'shadow', lines: ['  ___  '] },
  { type: 'crystals', lines: [' /\\ /\\ '] },
];

/**
 * Generate procedural monster art from a numeric seed.
 * Produces deterministic, unique ASCII art from modular parts.
 * With 30 heads × 25 bodies × 20 legs × 15 decorations = 225,000 base combinations.
 * Plus biome tinting and size variants = effectively unlimited unique art.
 * @param {number} seed - Deterministic seed for generation
 * @param {string} [biome='cave'] - Biome for thematic tinting
 * @returns {string[]} Array of ASCII art lines
 */
export function proceduralMonsterArt(seed, biome = 'cave') {
  // Simple seeded pseudo-random
  let s = Math.abs(seed) || 1;
  function next() { s = (s * 16807 + 12345) & 0x7fffffff; return s; }
  function pick(arr) { return arr[next() % arr.length]; }

  const head = pick(PROC_HEADS);
  const body = pick(PROC_BODIES);
  const legs = pick(PROC_LEGS);

  let art = [...head, ...body, ...legs];

  // 60% chance: add a decoration on top
  if (next() % 100 < 60) {
    const decor = pick(PROC_DECOR);
    art = [...decor.lines, ...art];
  }

  // 30% chance: add bottom decoration
  if (next() % 100 < 30) {
    const decor = pick(PROC_DECOR);
    art = [...art, ...decor.lines];
  }

  // Size variant: 20% chance to be "wide" (add side chars)
  if (next() % 100 < 20) {
    art = art.map(l => '|' + l + '|');
  }

  // 15% chance: mirror-style symmetry enhancement
  if (next() % 100 < 15) {
    art = art.map(l => {
      const trimmed = l.trimEnd();
      const half = trimmed.substring(0, Math.ceil(trimmed.length / 2));
      const mirrored = half + half.split('').reverse().join('');
      return mirrored;
    });
  }

  // Biome flavor: add subtle theme markers
  const BIOME_ACCENTS = {
    cave: '.',
    crypt: ':',
    forest: '~',
    volcano: '^',
    abyss: '*',
  };
  const accent = BIOME_ACCENTS[biome] || '.';

  // 40% chance: scatter biome accents
  if (next() % 100 < 40) {
    art = art.map(l => l.replace(/ {2}/g, ` ${accent}`));
  }

  // Enforce max 7 lines x 30 chars
  return art.slice(0, 7).map(l => l.substring(0, 30));
}

/** Simple string hash for deterministic seed from template name */
function hashStr(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0x7fffffff;
  }
  return hash;
}

/**
 * Build a monster from a base template plus mutations.
 * Falls back to procedural generation for unknown templates.
 * @param {string} template - Any monster template key
 * @param {string[]} [mutations=[]] - Giant|Armored|Swift|Venomous|Ethereal|Enraged|Cookie-Cursed|Regenerating
 * @param {number} [seed=0] - Seed for procedural generation fallback
 * @param {string} [biome='cave'] - Biome for procedural generation
 * @returns {string}
 */
export function monsterArt(template, mutations = [], seed = 0, biome = 'cave') {
  let art;
  if (MONSTER_TEMPLATES[template]) {
    art = [...MONSTER_TEMPLATES[template]];
  } else {
    // Use procedural generation for unknown templates
    art = proceduralMonsterArt(seed || (template ? hashStr(template) : Date.now()), biome);
  }

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
  weapon:    '/|>',
  armor:     '[+]',
  helmet:    '{^}',
  shield:    '(O)',
  ring:      '<o>',
  amulet:    '<%>',
  accessory: '<o>',
  potion:    '{U}',
  scroll:    '~#~',
  boots:     '|_|',
  gloves:    '\\~/',
  consumable:'(*)' ,
};

const RARITY_BRACKET = {
  common:    [' ', ' '],
  uncommon:  ['+', '+'],
  rare:      ['*', '*'],
  epic:      ['#', '#'],
  legendary: ['!', '!'],
};

/**
 * Small loot icon per slot with rarity indicator.
 * @param {string} slot - weapon|armor|helmet|shield|ring|amulet|potion|scroll|boots|gloves|accessory|consumable
 * @param {string} rarity - common|uncommon|rare|epic|legendary
 * @returns {string}
 */
export function lootIcon(slot, rarity) {
  const icon = LOOT_ICONS[slot] || '[?]';
  const [l, r] = RARITY_BRACKET[rarity] || [' ', ' '];
  return `${l}${icon}${r}`;
}

/**
 * Multi-line item art (3 lines) for detail views.
 * @param {string} slot
 * @param {string} rarity
 * @returns {string[]}
 */
export function itemArt(slot, rarity) {
  const arts = {
    weapon: [
      '  |  ',
      '  |==>',
      '  |  ',
    ],
    armor: [
      ' .--.',
      ' |##|',
      ' \'--\'',
    ],
    helmet: [
      ' .^^.',
      ' |  |',
      ' \'--\'',
    ],
    shield: [
      ' .--.',
      ' |()| ',
      '  \\/  ',
    ],
    ring: [
      '     ',
      ' (o) ',
      '     ',
    ],
    amulet: [
      '  |  ',
      ' <%> ',
      '     ',
    ],
    accessory: [
      '     ',
      ' <o> ',
      '     ',
    ],
    potion: [
      '  _  ',
      ' {~} ',
      ' {_} ',
    ],
    scroll: [
      ' .==.',
      ' |~~|',
      ' \'==\'',
    ],
    boots: [
      '     ',
      ' |  |',
      ' |__|',
    ],
    gloves: [
      '     ',
      ' \\\\//  ',
      '  \\/  ',
    ],
  };
  const art = arts[slot] || ['     ', ' [?] ', '     '];
  const rarityColors = {
    common: null,
    uncommon: 'green',
    rare: 'cyan',
    epic: 'magenta',
    legendary: 'yellow',
  };
  return { lines: art, color: rarityColors[rarity] || null };
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
