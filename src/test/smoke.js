#!/usr/bin/env node

/**
 * Smoke test runner for Terminal Cookie.
 * Verifies all major modules load and function correctly.
 * Exit code 0 = all pass, 1 = any fail.
 *
 * Usage: node src/test/smoke.js
 */

import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// ── Test harness ─────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  \u2713 ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, error: err.message });
    console.log(`  \u2717 ${name}`);
    console.log(`    ${err.message}`);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  \u2713 ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, error: err.message });
    console.log(`  \u2717 ${name}`);
    console.log(`    ${err.message}`);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(msg || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertInRange(value, min, max, msg) {
  if (value < min || value > max) {
    throw new Error(msg || `Expected ${value} in range [${min}, ${max}]`);
  }
}

// Module references (populated in main)
let createRNG, generateSeed;
let createScheduler;
let createMutex;
let createEngine, GameState;
let detectCapabilities;
let createRenderer, color, bold;
let masterCookie, teamMember, monsterArt, miniCookie, titleScreen, rollBar, lootIcon;
let createScanner;
let createVault;
let createRedactor;
let classifyPrompt, TYPES;
let widgetRegistry, getWidget,
    BinaryWidget, MultipleChoiceWidget, TextInputWidget,
    FilePickerWidget, CodeReviewWidget, RatingWidget,
    MultiSelectWidget, ChainWidget, PermissionWidget, FreeformWidget;
let generateDungeon;
let generateEnemy, generateRoomEnemies;
let generateLoot, generateEnemyDrops;
let createEventManager, getEventsByType;
let createKeywordMap;
let getScreen, screens;

// ── Main ─────────────────────────────────────────────────

async function main() {
  // Pre-load all modules
  const moduleCache = {};
  const modulePaths = [
    '../core/rng.js',
    '../core/timer.js',
    '../core/mutex.js',
    '../core/engine.js',
    '../ui/compat.js',
    '../ui/terminal.js',
    '../ui/ascii.js',
    '../security/scanner.js',
    '../security/vault.js',
    '../security/redactor.js',
    '../prompts/classifier.js',
    '../prompts/widgets.js',
    '../game/dungeon.js',
    '../game/enemies.js',
    '../game/loot.js',
    '../game/events.js',
    '../voice/keywords.js',
    '../game/screens.js',
  ];

  console.log('=== Module Loading ===\n');

  for (const mp of modulePaths) {
    try {
      moduleCache[mp] = await import(mp);
      passed++;
      const shortName = mp.replace('../', '');
      console.log(`  \u2713 ${shortName}`);
    } catch (err) {
      const shortName = mp.replace('../', '');
      console.log(`  \u2717 ${shortName}: ${err.message}`);
      failed++;
      failures.push({ name: `Load ${shortName}`, error: err.message });
    }
  }

  // Re-bind after async load
  ({ createRNG, generateSeed } = moduleCache['../core/rng.js'] || {});
  ({ createScheduler } = moduleCache['../core/timer.js'] || {});
  ({ createMutex } = moduleCache['../core/mutex.js'] || {});
  ({ createEngine, GameState } = moduleCache['../core/engine.js'] || {});
  ({ detectCapabilities } = moduleCache['../ui/compat.js'] || {});
  ({ createRenderer, color, bold } = moduleCache['../ui/terminal.js'] || {});
  ({ masterCookie, teamMember, monsterArt, miniCookie, titleScreen, rollBar, lootIcon } = moduleCache['../ui/ascii.js'] || {});
  ({ createScanner } = moduleCache['../security/scanner.js'] || {});
  ({ createVault } = moduleCache['../security/vault.js'] || {});
  ({ createRedactor } = moduleCache['../security/redactor.js'] || {});
  ({ classifyPrompt, TYPES } = moduleCache['../prompts/classifier.js'] || {});
  ({
    widgetRegistry, getWidget,
    BinaryWidget, MultipleChoiceWidget, TextInputWidget,
    FilePickerWidget, CodeReviewWidget, RatingWidget,
    MultiSelectWidget, ChainWidget, PermissionWidget, FreeformWidget,
  } = moduleCache['../prompts/widgets.js'] || {});
  ({ generateDungeon } = moduleCache['../game/dungeon.js'] || {});
  ({ generateEnemy, generateRoomEnemies } = moduleCache['../game/enemies.js'] || {});
  ({ generateLoot, generateEnemyDrops } = moduleCache['../game/loot.js'] || {});
  ({ createEventManager, getEventsByType } = moduleCache['../game/events.js'] || {});
  ({ createKeywordMap } = moduleCache['../voice/keywords.js'] || {});
  ({ getScreen, screens } = moduleCache['../game/screens.js'] || {});

  // ── RNG Tests ────────────────────────────────────────

  console.log('=== RNG ===\n');

  test('Seeded RNG is deterministic', () => {
    const rng1 = createRNG(42);
    const rng2 = createRNG(42);
    const a = [rng1.random(), rng1.random(), rng1.random()];
    const b = [rng2.random(), rng2.random(), rng2.random()];
    assertEqual(a[0], b[0], 'First value mismatch');
    assertEqual(a[1], b[1], 'Second value mismatch');
    assertEqual(a[2], b[2], 'Third value mismatch');
  });

  test('RNG.random returns 0-1', () => {
    const rng = createRNG(123);
    for (let i = 0; i < 100; i++) {
      const v = rng.random();
      assertInRange(v, 0, 1, `random() returned ${v}`);
    }
  });

  test('RNG.int respects bounds', () => {
    const rng = createRNG(456);
    for (let i = 0; i < 100; i++) {
      const v = rng.int(3, 7);
      assertInRange(v, 3, 7, `int(3,7) returned ${v}`);
    }
  });

  test('RNG.roll returns 1-sides', () => {
    const rng = createRNG(789);
    for (let i = 0; i < 50; i++) {
      assertInRange(rng.roll(6), 1, 6);
      assertInRange(rng.roll(20), 1, 20);
    }
  });

  test('RNG.shuffle returns same elements', () => {
    const rng = createRNG(101);
    const arr = [1, 2, 3, 4, 5];
    const shuffled = rng.shuffle(arr);
    assertEqual(shuffled.length, arr.length);
    assertEqual(shuffled.sort().join(','), arr.sort().join(','));
  });

  test('RNG.weightedPick works', () => {
    const rng = createRNG(202);
    const table = [
      { item: 'a', weight: 100 },
      { item: 'b', weight: 0 },
    ];
    // With weight 0 for b, should always pick a
    for (let i = 0; i < 20; i++) {
      assertEqual(rng.weightedPick(table), 'a');
    }
  });

  test('RNG.chance works', () => {
    const rng = createRNG(303);
    // chance(1) should always be true, chance(0) always false
    for (let i = 0; i < 10; i++) {
      assertEqual(rng.chance(1), true);
      assertEqual(rng.chance(0), false);
    }
  });

  test('generateSeed returns positive number', () => {
    const seed = generateSeed();
    assert(typeof seed === 'number', 'seed should be a number');
    assert(seed >= 0, 'seed should be non-negative');
  });

  // ── Classifier Tests ─────────────────────────────────

  console.log('\n=== Classifier ===\n');

  const classifierTests = [
    { input: 'Do you want to grant sudo access to this process?', expected: 'permission' },
    { input: '```js\nconst x = 1;\n```\nDoes this look right?', expected: 'code_review' },
    { input: 'Which file do you want to select? /usr/local/bin', expected: 'file_picker' },
    { input: 'Rate this feature on a scale of 1-10', expected: 'rating' },
    { input: 'Step 1: Build. Step 2: Deploy. Approve to continue?', expected: 'chain' },
    { input: 'Select all that apply: logging, caching, auth', expected: 'multi_select' },
    { input: 'Which color?\n1. Red\n2. Blue\n3. Green', expected: 'multiple_choice' },
    { input: 'Allow this action? yes/no', expected: 'binary' },
    { input: 'Enter your username:', expected: 'text_input' },
    { input: 'Tell me about your weekend plans', expected: 'freeform' },
  ];

  for (const { input, expected } of classifierTests) {
    test(`Classify "${input.slice(0, 40)}..." as ${expected}`, () => {
      const result = classifyPrompt(input);
      assertEqual(result.type, expected, `Got ${result.type} (confidence: ${result.confidence})`);
    });
  }

  test('Classifier returns all expected fields', () => {
    const result = classifyPrompt('Allow? yes/no');
    assert(result.type !== undefined, 'Missing type');
    assert(result.confidence !== undefined, 'Missing confidence');
    assert(result.parsedOptions !== undefined, 'Missing parsedOptions');
    assert(result.context !== undefined, 'Missing context');
  });

  test('TYPES has all 10 types', () => {
    assertEqual(TYPES.length, 10, `Expected 10 types, got ${TYPES.length}`);
  });

  test('Low confidence falls back to freeform', () => {
    const result = classifyPrompt('hello world');
    assertEqual(result.type, 'freeform');
  });

  // ── Scanner Tests ────────────────────────────────────

  console.log('\n=== Security Scanner ===\n');

  test('Scanner detects hardcoded API key', () => {
    const scanner = createScanner();
    const code = 'const key = "sk-proj-abc123def456ghi789jkl012mno345pqr678stu901vwx234yz";';
    const result = scanner.scan(code);
    assert(result.findings.length > 0, 'Expected findings for hardcoded key');
    assert(result.highest_risk !== 'NONE', `Expected risk, got ${result.highest_risk}`);
  });

  test('Scanner clean code returns no findings', () => {
    const scanner = createScanner();
    const code = 'const x = 1;\nconst y = x + 2;\nconsole.log(y);';
    const result = scanner.scan(code);
    assertEqual(result.findings.length, 0, `Expected 0 findings, got ${result.findings.length}`);
  });

  test('Scanner handles binary content', () => {
    const scanner = createScanner();
    const result = scanner.scan('binary\0content');
    assertEqual(result.highest_risk, 'NONE');
    assert(result.summary.includes('binary'), 'Should indicate binary content');
  });

  test('Scanner returns structured findings', () => {
    const scanner = createScanner();
    const code = 'AKIAIOSFODNN7EXAMPLE1';
    const result = scanner.scan(code);
    if (result.findings.length > 0) {
      const f = result.findings[0];
      assert(f.rule_id !== undefined, 'Missing rule_id');
      assert(f.risk_level !== undefined, 'Missing risk_level');
      assert(f.description !== undefined, 'Missing description');
    }
  });

  // ── Redactor Tests ───────────────────────────────────

  console.log('\n=== Redactor ===\n');

  test('Redactor masks API key', () => {
    const redactor = createRedactor();
    const input = 'My key is sk-proj-abc123def456ghi789jkl012mno345pqr678stu901vwx234yz';
    const output = redactor.redact(input);
    assert(!output.includes('abc123def456ghi789jkl012'), 'Key should be redacted');
    assert(output.includes('****'), 'Should contain mask chars');
  });

  test('Redactor masks email', () => {
    const redactor = createRedactor();
    const input = 'Contact user@example.com for info';
    const output = redactor.redact(input);
    assert(!output.includes('user@'), 'Email local part should be masked');
    assert(output.includes('example.com'), 'Domain should remain');
  });

  test('Redactor masks IP address', () => {
    const redactor = createRedactor();
    const input = 'Server at 192.168.1.42 is down';
    const output = redactor.redact(input);
    assert(!output.includes('192.168.1.42'), 'Full IP should be masked');
    assert(output.includes('192.'), 'First octet visible');
    assert(output.includes('.42'), 'Last octet visible');
  });

  // ── ASCII Art Tests ──────────────────────────────────

  console.log('\n=== ASCII Art ===\n');

  test('masterCookie returns non-empty string', () => {
    const art = masterCookie();
    assert(typeof art === 'string', 'Should be string');
    assert(art.length > 20, `Too short: ${art.length} chars`);
    assert(art.includes('::'), 'Should contain chocolate chip pattern');
  });

  test('teamMember renders for each combo', () => {
    const combos = [
      ['human', 'warrior', 'brave'],
      ['elf', 'mage', 'wise'],
      ['dwarf', 'cleric', 'shy'],
    ];
    for (const [race, cls, pers] of combos) {
      const art = teamMember(race, cls, pers);
      assert(typeof art === 'string' && art.length > 5, `Empty art for ${race}/${cls}`);
    }
  });

  test('monsterArt renders all templates', () => {
    const templates = ['bat', 'spider', 'slime', 'troll', 'dragon', 'skeleton', 'ghost', 'wolf', 'imp', 'shadow'];
    for (const t of templates) {
      const art = monsterArt(t);
      assert(typeof art === 'string' && art.length > 5, `Empty monster art for ${t}`);
    }
  });

  test('monsterArt applies mutations', () => {
    const base = monsterArt('bat');
    const giant = monsterArt('bat', ['Giant']);
    assert(giant.length > base.length, 'Giant mutation should increase size');
    const armored = monsterArt('bat', ['Armored']);
    assert(armored.includes('[#]'), 'Armored should have [#] markers');
  });

  test('miniCookie returns non-empty', () => {
    const art = miniCookie();
    assert(art.length > 5);
  });

  test('titleScreen returns non-empty', () => {
    const art = titleScreen();
    assert(art.length > 50);
    assert(art.includes('Terminal'));
  });

  test('rollBar renders correctly', () => {
    const bar = rollBar(7, 20);
    assert(bar.includes('7/20'), 'Should show value/max');
    assert(bar.includes('['), 'Should have bar brackets');
  });

  test('lootIcon renders all slots', () => {
    const slots = ['weapon', 'armor', 'helmet', 'shield', 'ring', 'amulet', 'potion', 'scroll', 'boots', 'gloves'];
    for (const slot of slots) {
      const icon = lootIcon(slot, 'rare');
      assert(icon.length >= 3, `Empty icon for ${slot}`);
      assert(icon.includes('*'), 'Rare rarity should have * indicator');
    }
  });

  // ── Vault Tests ──────────────────────────────────────

  console.log('\n=== Vault ===\n');

  const tmpDir = mkdtempSync(join(tmpdir(), 'cookie-vault-test-'));

  await testAsync('Vault unlock, store, retrieve, lock cycle', async () => {
    const vault = createVault(tmpDir);

    vault.unlock('test-master-password-123');
    assert(vault.isUnlocked(), 'Should be unlocked');

    vault.store('test-key', 'super-secret-value', 'api_key');

    const retrieved = vault.retrieve('test-key');
    assert(retrieved !== null, 'Should retrieve entry');
    assertEqual(retrieved.value, 'super-secret-value');
    assertEqual(retrieved.type, 'api_key');
    assertEqual(retrieved.label, 'test-key');

    vault.lock();
    assert(!vault.isUnlocked(), 'Should be locked');

    let threw = false;
    try {
      vault.retrieve('test-key');
    } catch {
      threw = true;
    }
    assert(threw, 'Should throw when locked');
  });

  await testAsync('Vault list and delete', async () => {
    const vault = createVault(tmpDir);
    vault.unlock('test-master-password-123');

    vault.store('key-a', 'value-a', 'custom');
    vault.store('key-b', 'value-b', 'password');

    const list = vault.list();
    assert(list.length >= 2, `Expected >= 2 entries, got ${list.length}`);

    vault.delete('key-b');
    const listAfter = vault.list();
    assert(!listAfter.find(e => e.label === 'key-b'), 'key-b should be deleted');

    vault.lock();
  });

  await testAsync('Vault rejects wrong password', async () => {
    const vault = createVault(tmpDir);
    let threw = false;
    try {
      vault.unlock('wrong-password');
    } catch {
      threw = true;
    }
    assert(threw, 'Should reject wrong password');
  });

  // Clean up temp dir
  try { rmSync(tmpDir, { recursive: true }); } catch { /* ignore */ }

  // ── Widget Tests ─────────────────────────────────────

  console.log('\n=== Widgets ===\n');

  const widgetTestCases = [
    {
      name: 'BinaryWidget',
      widget: BinaryWidget,
      data: { prompt: 'Allow access?', acceptLabel: 'Yes', denyLabel: 'No' },
    },
    {
      name: 'MultipleChoiceWidget',
      widget: MultipleChoiceWidget,
      data: { prompt: 'Pick a color', choices: [{ key: '1', label: 'Red' }, { key: '2', label: 'Blue' }], _selectedIndex: 0 },
    },
    {
      name: 'TextInputWidget',
      widget: TextInputWidget,
      data: { prompt: 'Enter name:', _text: 'Cookie' },
    },
    {
      name: 'FilePickerWidget',
      widget: FilePickerWidget,
      data: {
        _currentPath: '/home/user',
        _entries: [
          { name: 'Documents', isDir: true },
          { name: 'secret.env', isDir: false, sensitive: true },
          { name: 'readme.md', isDir: false },
        ],
        _selectedIndex: 0,
      },
    },
    {
      name: 'CodeReviewWidget',
      widget: CodeReviewWidget,
      data: {
        _lines: ['const x = 1;', 'const y = 2;', 'return x + y;'],
        _lineApprovals: {},
        _mode: 'overview',
        _currentLine: 0,
        findings: [{ line: 1, message: 'unused variable' }],
      },
    },
    {
      name: 'RatingWidget',
      widget: RatingWidget,
      data: { prompt: 'Rate 1-10', _value: 7, max: 10 },
    },
    {
      name: 'MultiSelectWidget',
      widget: MultiSelectWidget,
      data: {
        prompt: 'Select features',
        items: ['Auth', 'Cache', 'Logs'],
        _items: ['Auth', 'Cache', 'Logs'],
        _selected: new Set([1]),
        _selectedIndex: 0,
      },
    },
    {
      name: 'ChainWidget',
      widget: ChainWidget,
      data: {
        prompt: 'Deploy pipeline',
        steps: ['Build', 'Test', 'Deploy'],
        _steps: ['Build', 'Test', 'Deploy'],
        _currentStep: 1,
        _results: { 0: 'approved' },
      },
    },
    {
      name: 'PermissionWidget',
      widget: PermissionWidget,
      data: { prompt: 'Grant sudo?', _holdDuration: 2000 },
    },
    {
      name: 'FreeformWidget',
      widget: FreeformWidget,
      data: { contextLabel: 'Your thoughts', prompt: 'Share feedback', _text: '' },
    },
  ];

  for (const { name, widget, data } of widgetTestCases) {
    test(`${name}.render produces output`, () => {
      const output = widget.render(data, 60);
      assert(typeof output === 'string', `render() should return string, got ${typeof output}`);
      assert(output.length > 10, `render() output too short: ${output.length} chars`);
    });

    test(`${name}.getInitialState returns object`, () => {
      const state = widget.getInitialState(data);
      assert(typeof state === 'object' && state !== null, 'Should return object');
    });
  }

  // Test widget input handling
  test('BinaryWidget.handleInput accepts with "a"', () => {
    const state = BinaryWidget.getInitialState({});
    const result = BinaryWidget.handleInput('a', state);
    assertEqual(result.done, true);
    assertEqual(result.value, true);
  });

  test('BinaryWidget.handleInput denies with "d"', () => {
    const state = BinaryWidget.getInitialState({});
    const result = BinaryWidget.handleInput('d', state);
    assertEqual(result.done, true);
    assertEqual(result.value, false);
  });

  test('MultipleChoiceWidget navigates with arrows', () => {
    const state = MultipleChoiceWidget.getInitialState({ choices: ['A', 'B', 'C'] });
    const r1 = MultipleChoiceWidget.handleInput('right', state);
    assertEqual(r1.state.selectedIndex, 1);
    const r2 = MultipleChoiceWidget.handleInput('left', r1.state);
    assertEqual(r2.state.selectedIndex, 0);
  });

  test('TextInputWidget adds characters', () => {
    const state = TextInputWidget.getInitialState({});
    const r1 = TextInputWidget.handleInput('h', state);
    assertEqual(r1.state.text, 'h');
    const r2 = TextInputWidget.handleInput('i', r1.state);
    assertEqual(r2.state.text, 'hi');
  });

  test('TextInputWidget backspace works', () => {
    const state = { text: 'hello', cursorPos: 5 };
    const r = TextInputWidget.handleInput('backspace', state);
    assertEqual(r.state.text, 'hell');
  });

  test('RatingWidget adjusts value', () => {
    const state = RatingWidget.getInitialState({ max: 10 });
    const r1 = RatingWidget.handleInput('right', state);
    assertEqual(r1.state.value, state.value + 1);
    const r2 = RatingWidget.handleInput('left', r1.state);
    assertEqual(r2.state.value, state.value);
  });

  test('MultiSelectWidget toggles with space', () => {
    const state = MultiSelectWidget.getInitialState({ items: ['A', 'B'] });
    const r = MultiSelectWidget.handleInput(' ', state);
    assert(r.state.selected.has(0), 'Should toggle item 0 on');
    const r2 = MultiSelectWidget.handleInput(' ', r.state);
    assert(!r2.state.selected.has(0), 'Should toggle item 0 off');
  });

  test('ChainWidget approves current step', () => {
    const state = ChainWidget.getInitialState({ steps: ['A', 'B', 'C'] });
    const r = ChainWidget.handleInput('a', state);
    assertEqual(r.state.results[0], 'approved');
    assertEqual(r.state.currentStep, 1);
  });

  test('CodeReviewWidget switches to line-by-line mode', () => {
    const state = CodeReviewWidget.getInitialState({ code: 'line1\nline2\nline3' });
    const r = CodeReviewWidget.handleInput('l', state);
    assertEqual(r.state.mode, 'line');
  });

  test('getWidget returns correct widget for each type', () => {
    for (const type of TYPES) {
      const w = getWidget(type);
      assert(w !== undefined, `No widget for type "${type}"`);
      assert(typeof w.render === 'function', `Widget for "${type}" missing render`);
    }
  });

  test('widgetRegistry has all 10 types', () => {
    const keys = Object.keys(widgetRegistry);
    assertEqual(keys.length, 10, `Expected 10 widgets, got ${keys.length}`);
  });

  // ── Engine Tests ─────────────────────────────────────

  console.log('\n=== Engine ===\n');

  await testAsync('Engine creates with seed', async () => {
    const engine = createEngine({ seed: 42 });
    const state = engine.getState();
    assertEqual(state.seed, 42);
    assertEqual(state.currentState, GameState.MENU);
    assertEqual(state.crumbs, 0);
  });

  await testAsync('Engine transitions correctly', async () => {
    const engine = createEngine({ seed: 42 });
    await engine.start();
    assertEqual(engine.getState().currentState, GameState.MENU);

    await engine.transition(GameState.TAVERN);
    assertEqual(engine.getState().currentState, GameState.TAVERN);

    await engine.transition(GameState.DUNGEON);
    assertEqual(engine.getState().currentState, GameState.DUNGEON);
  });

  await testAsync('Engine rejects invalid transitions', async () => {
    const engine = createEngine({ seed: 42 });
    await engine.start();
    let threw = false;
    try {
      await engine.transition(GameState.COMBAT);
    } catch {
      threw = true;
    }
    assert(threw, 'MENU -> COMBAT should be invalid');
  });

  await testAsync('Engine shutdown works', async () => {
    const engine = createEngine({ seed: 42 });
    await engine.start();
    assert(engine.running, 'Should be running');
    await engine.shutdown();
    assert(!engine.running, 'Should not be running');
  });

  // ── Mutex Tests ──────────────────────────────────────

  console.log('\n=== Mutex ===\n');

  await testAsync('Mutex lock/unlock', async () => {
    const mutex = createMutex();
    assert(!mutex.isLocked, 'Should start unlocked');
    await mutex.lock();
    assert(mutex.isLocked, 'Should be locked');
    mutex.unlock();
    assert(!mutex.isLocked, 'Should be unlocked after unlock');
  });

  await testAsync('Mutex withLock serializes', async () => {
    const mutex = createMutex();
    let counter = 0;
    await Promise.all([
      mutex.withLock(() => { counter++; }),
      mutex.withLock(() => { counter++; }),
      mutex.withLock(() => { counter++; }),
    ]);
    assertEqual(counter, 3, 'All 3 withLock calls should complete');
  });

  // ── Timer Tests ──────────────────────────────────────

  console.log('\n=== Timer ===\n');

  test('Scheduler creates and pauses', () => {
    const scheduler = createScheduler({});
    assert(!scheduler.isPaused, 'Should start unpaused');
    scheduler.pause();
    assert(scheduler.isPaused, 'Should be paused');
    scheduler.resume();
    assert(!scheduler.isPaused, 'Should resume');
  });

  test('Scheduler queues events', () => {
    const scheduler = createScheduler({});
    const id = scheduler.schedule({ type: 'test', callback: () => {} }, 60000, 60000);
    assert(typeof id === 'number', 'Should return event ID');
    assertEqual(scheduler.pending, 1);
    scheduler.clear();
    assertEqual(scheduler.pending, 0);
  });

  // ── Compat Tests ─────────────────────────────────────

  console.log('\n=== Compat ===\n');

  test('detectCapabilities returns expected shape', () => {
    const caps = detectCapabilities();
    assert(typeof caps.ansi === 'boolean', 'Missing ansi');
    assert(typeof caps.colors === 'string', 'Missing colors');
    assert(typeof caps.rows === 'number', 'Missing rows');
    assert(typeof caps.cols === 'number', 'Missing cols');
    assert(typeof caps.platform === 'string', 'Missing platform');
    assert(typeof caps.belowMinimum === 'boolean', 'Missing belowMinimum');
  });

  // ── Dungeon Tests ──────────────────────────────────

  console.log('\n=== Dungeon ===\n');

  test('generateDungeon returns valid structure', () => {
    const dungeon = generateDungeon({ level: 5, seed: 42, biome: 'cave' });
    assert(dungeon !== null && typeof dungeon === 'object', 'Should return object');
    assert(Array.isArray(dungeon.rooms), 'Should have rooms array');
    assert(dungeon.rooms.length > 0, 'Should have at least one room');
    assertEqual(dungeon.level, 5);
    assertEqual(dungeon.biome, 'cave');
    assert(dungeon.seed !== undefined, 'Should have seed');
  });

  test('Dungeon has entrance and exit rooms', () => {
    const dungeon = generateDungeon({ level: 3, seed: 100, biome: 'forest' });
    const entrance = dungeon.rooms.find(r => r.isEntrance);
    const exit = dungeon.rooms.find(r => r.isExit);
    assert(entrance !== undefined, 'Should have entrance room');
    assert(exit !== undefined, 'Should have exit room');
    assert(entrance.id !== exit.id, 'Entrance and exit should be different');
  });

  test('Dungeon rooms have connections', () => {
    const dungeon = generateDungeon({ level: 5, seed: 42, biome: 'cave' });
    for (const room of dungeon.rooms) {
      assert(Array.isArray(room.connections), `Room ${room.id} missing connections`);
      assert(room.type !== undefined, `Room ${room.id} missing type`);
      assert(room.id !== undefined, `Room missing id`);
    }
  });

  test('Dungeon entrance reachable to exit (BFS)', () => {
    const dungeon = generateDungeon({ level: 10, seed: 777, biome: 'cave' });
    const entrance = dungeon.rooms.find(r => r.isEntrance);
    const exit = dungeon.rooms.find(r => r.isExit);
    const roomMap = new Map(dungeon.rooms.map(r => [r.id, r]));
    const visited = new Set();
    const queue = [entrance.id];
    visited.add(entrance.id);
    while (queue.length > 0) {
      const current = queue.shift();
      const room = roomMap.get(current);
      for (const conn of room.connections) {
        if (!visited.has(conn)) {
          visited.add(conn);
          queue.push(conn);
        }
      }
    }
    assert(visited.has(exit.id), 'Exit should be reachable from entrance via BFS');
  });

  test('Dungeon deterministic with same seed', () => {
    const d1 = generateDungeon({ level: 5, seed: 42, biome: 'cave' });
    const d2 = generateDungeon({ level: 5, seed: 42, biome: 'cave' });
    assertEqual(d1.rooms.length, d2.rooms.length, 'Same seed should produce same room count');
  });

  // ── Enemy Tests ───────────────────────────────────

  console.log('\n=== Enemies ===\n');

  test('generateEnemy returns valid structure', () => {
    const rng = createRNG(42);
    const enemy = generateEnemy({ biome: 'cave', level: 10, rng });
    assert(typeof enemy.name === 'string' && enemy.name.length > 0, 'Should have name');
    assert(enemy.stats.hp > 0, 'Should have positive hp');
    assert(enemy.stats.atk > 0, 'Should have positive atk');
    assert(enemy.stats.def > 0, 'Should have positive def');
    assert(enemy.stats.spd > 0, 'Should have positive spd');
    assertEqual(enemy.currentHp, enemy.maxHp, 'currentHp should equal maxHp');
    assertEqual(enemy.alive, true, 'Should start alive');
    assert(Array.isArray(enemy.ascii), 'Should have ascii array');
    assert(Array.isArray(enemy.mutations), 'Should have mutations array');
  });

  test('generateEnemy boss has boosted stats', () => {
    const rng = createRNG(42);
    const normal = generateEnemy({ biome: 'cave', level: 10, rng });
    const rng2 = createRNG(42);
    const boss = generateEnemy({ biome: 'cave', level: 10, rng: rng2, isBoss: true });
    assert(boss.isBoss === true, 'Boss flag should be set');
    assert(boss.stats.hp > normal.stats.hp, 'Boss hp should exceed normal');
    assert(boss.bossAbility !== null, 'Boss should have ability');
  });

  test('generateRoomEnemies returns correct count', () => {
    const rng = createRNG(123);
    const enemies = generateRoomEnemies({ biome: 'cave', level: 1, rng, roomType: 'monster' });
    assert(enemies.length >= 1 && enemies.length <= 3, `Expected 1-3 enemies, got ${enemies.length}`);
    const bossRoom = generateRoomEnemies({ biome: 'cave', level: 5, rng, roomType: 'boss' });
    assertEqual(bossRoom.length, 1, 'Boss room should have exactly 1 enemy');
    assert(bossRoom[0].isBoss, 'Boss room enemy should be a boss');
  });

  test('Enemy ASCII art within bounds', () => {
    const rng = createRNG(999);
    for (let i = 0; i < 10; i++) {
      const enemy = generateEnemy({ biome: 'cave', level: 15, rng });
      assert(enemy.ascii.length <= 7, `ASCII too tall: ${enemy.ascii.length} lines`);
      for (const line of enemy.ascii) {
        assert(line.length <= 30, `ASCII line too wide: ${line.length} chars`);
      }
    }
  });

  // ── Loot Tests ────────────────────────────────────

  console.log('\n=== Loot ===\n');

  test('generateLoot returns valid item', () => {
    const rng = createRNG(42);
    const item = generateLoot({ level: 10, rng });
    assert(item !== null, 'Should return an item');
    assert(typeof item.name === 'string' && item.name.length > 0, 'Should have name');
    assert(['weapon', 'armor', 'accessory', 'consumable'].includes(item.slot), `Invalid slot: ${item.slot}`);
    assert(typeof item.rarity === 'string', 'Should have rarity');
    assert(item.power > 0, 'Should have positive power');
    assert(item.value > 0, 'Should have positive value');
    assert(typeof item.statBonus === 'object', 'Should have statBonus');
    assert(item.id > 0, 'Should have positive id');
  });

  test('generateLoot respects forced slot', () => {
    const rng = createRNG(42);
    const item = generateLoot({ level: 5, rng, slot: 'weapon' });
    assertEqual(item.slot, 'weapon', 'Should respect forced slot');
  });

  test('generateLoot minRarity floors rarity', () => {
    const rng = createRNG(42);
    const rarities = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
    // Generate many items with Rare floor and check they are >= Rare
    for (let i = 0; i < 20; i++) {
      const item = generateLoot({ level: 10, rng, minRarity: 'Rare' });
      const idx = rarities.indexOf(item.rarity);
      assert(idx >= 2, `Expected Rare or above, got ${item.rarity}`);
    }
  });

  test('generateLoot power scales with level', () => {
    const rng1 = createRNG(42);
    const rng2 = createRNG(42);
    const lowItem = generateLoot({ level: 1, rng: rng1 });
    const highItem = generateLoot({ level: 20, rng: rng2 });
    assert(highItem.power >= lowItem.power, 'Higher level should produce higher power');
  });

  test('generateEnemyDrops works', () => {
    const rng = createRNG(42);
    const enemy = { dropChance: 1.0, lootQuality: 5, minRarity: null, isBoss: false };
    const drops = generateEnemyDrops({ enemy, level: 10, rng });
    assert(Array.isArray(drops), 'Should return array');
    assert(drops.length >= 1, 'With dropChance 1.0, should drop at least 1');
  });

  test('Boss enemy drops include bonus drop', () => {
    const rng = createRNG(42);
    const boss = { dropChance: 1.0, lootQuality: 10, minRarity: null, isBoss: true };
    const drops = generateEnemyDrops({ enemy: boss, level: 10, rng });
    assert(drops.length >= 2, 'Boss should have at least 2 drops (normal + bonus)');
  });

  // ── Events Tests ──────────────────────────────────

  console.log('\n=== Events ===\n');

  test('createEventManager returns manager object', () => {
    const manager = createEventManager();
    assert(typeof manager.rollEvent === 'function', 'Should have rollEvent');
    assert(typeof manager.resolveEvent === 'function', 'Should have resolveEvent');
    assert(typeof manager.autoResolve === 'function', 'Should have autoResolve');
    assert(typeof manager.isDangerous === 'function', 'Should have isDangerous');
    assert(typeof manager.resetInterval === 'function', 'Should have resetInterval');
  });

  test('getEventsByType returns arrays', () => {
    const types = ['combat', 'environmental', 'beneficial', 'social', 'cookie'];
    for (const type of types) {
      const events = getEventsByType(type);
      assert(Array.isArray(events), `Should return array for type ${type}`);
    }
  });

  test('Event manager respects minimum interval', () => {
    const manager = createEventManager();
    const rng = createRNG(42);
    // Reset interval so first room can trigger
    manager.resetInterval();
    // Roll many events and check that they don't fire every room
    let eventCount = 0;
    let lastEventRoom = -999;
    for (let room = 0; room < 50; room++) {
      const event = manager.rollEvent({ biome: 'cave', level: 10, rng, roomType: 'empty' });
      if (event) {
        assert(room - lastEventRoom >= 3, `Events too close: rooms ${lastEventRoom} and ${room}`);
        lastEventRoom = room;
        eventCount++;
      }
    }
    // With 50 rooms at high chance, should get at least a few events
    assert(eventCount > 0, 'Should trigger at least one event in 50 rooms');
  });

  test('Event resolution applies heal effect', () => {
    const manager = createEventManager();
    const rng = createRNG(42);
    const team = [
      { alive: true, currentHp: 10, maxHp: 50, stats: { hp: 10, atk: 5, def: 5, spd: 5, lck: 5 } },
    ];
    const event = { id: 'test', name: 'Test Heal', effect: { action: 'heal', amount: 20 } };
    const result = manager.resolveEvent(event, team, rng);
    assert(result.success === true, 'Heal should succeed');
    assertEqual(team[0].currentHp, 30, 'HP should increase by 20');
  });

  test('isDangerous checks dangerLevel', () => {
    const manager = createEventManager();
    assert(!manager.isDangerous({ dangerLevel: 0 }), 'Level 0 should not be dangerous');
    assert(!manager.isDangerous({ dangerLevel: 1 }), 'Level 1 should not be dangerous');
    assert(manager.isDangerous({ dangerLevel: 2 }), 'Level 2 should be dangerous');
    assert(manager.isDangerous({ dangerLevel: 3 }), 'Level 3 should be dangerous');
  });

  // ── Keywords Tests ────────────────────────────────

  console.log('\n=== Voice Keywords ===\n');

  test('createKeywordMap returns manager', () => {
    const km = createKeywordMap({});
    assert(typeof km.mapWordToKey === 'function', 'Should have mapWordToKey');
    assert(typeof km.addMapping === 'function', 'Should have addMapping');
    assert(typeof km.removeMapping === 'function', 'Should have removeMapping');
  });

  test('Keyword mapping resolves exact words', () => {
    // Default config maps "cookie" -> "click" command -> "enter" key
    const km = createKeywordMap({});
    assertEqual(km.mapWordToKey('cookie'), 'enter');  // cookie -> click -> enter
    assertEqual(km.mapWordToKey('yes'), 'a');          // yes -> accept -> a
    assertEqual(km.mapWordToKey('no'), 'd');            // no -> reject -> d
  });

  test('Keyword mapping returns null for unknown words', () => {
    const km = createKeywordMap({});
    const result = km.mapWordToKey('xyzzy');
    assertEqual(result, null, 'Unknown word should return null');
  });

  test('Keyword fuzzy matching works', () => {
    const km = createKeywordMap({});
    // "cokie" is edit distance 1 from "cookie" (6 chars, threshold 2)
    const result = km.mapWordToKey('cokie');
    assertEqual(result, 'enter', 'Fuzzy match should resolve "cokie" to "enter" (cookie->click->enter)');
  });

  test('Keyword addMapping and removeMapping', () => {
    const km = createKeywordMap({ global: {} });
    km.addMapping('fire', 'f');
    assertEqual(km.mapWordToKey('fire'), 'f');
    km.removeMapping('fire');
    assertEqual(km.mapWordToKey('fire'), null);
  });

  // ── Screens Tests ─────────────────────────────────

  console.log('\n=== Screens ===\n');

  test('getScreen returns screen for all states', () => {
    const stateNames = ['MENU', 'TAVERN', 'DUNGEON', 'COMBAT', 'LOOT', 'DEATH', 'SETTINGS', 'HELP'];
    for (const name of stateNames) {
      const screen = getScreen(name);
      assert(screen !== undefined && screen !== null, `Missing screen for ${name}`);
      assert(typeof screen.render === 'function', `Screen ${name} missing render()`);
      assert(typeof screen.handleInput === 'function', `Screen ${name} missing handleInput()`);
    }
  });

  test('screens object has all entries', () => {
    const keys = Object.keys(screens);
    assert(keys.length >= 8, `Expected at least 8 screens, got ${keys.length}`);
  });

  test('getScreen returns null for invalid state', () => {
    const screen = getScreen('NONEXISTENT');
    assertEqual(screen, null, 'Invalid state should return null');
  });

  // ── Summary ──────────────────────────────────────────

  console.log('\n' + '='.repeat(50));
  console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);

  if (failures.length > 0) {
    console.log('  Failures:');
    for (const f of failures) {
      console.log(`    \u2717 ${f.name}: ${f.error}`);
    }
    console.log('');
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Smoke test runner crashed:', err);
  process.exit(1);
});
