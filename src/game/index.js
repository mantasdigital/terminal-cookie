/**
 * Main game orchestrator — wires engine, screens, subsystems, and game loop.
 */

import { createEngine, GameState } from '../core/engine.js';
import { createRNG, generateSeed } from '../core/rng.js';
import { createRenderer } from '../ui/terminal.js';
import { createInputHandler } from '../ui/input.js';
import { detectCapabilities } from '../ui/compat.js';
import { createResizeHandler } from '../ui/resize.js';
import { saveGame, loadGame, listSlots } from '../save/state.js';
import { createSettings } from '../config/settings.js';
import { createCookieHandler } from './cookie.js';
import { generateTavernRoster, awardXP } from './team.js';
import { createEconomy } from './economy.js';
import { createCombat } from './combat.js';
import { createRollBar } from './roll-bar.js';
import { createGraveyard } from './graveyard.js';
import { createTutorial } from './tutorial.js';
import { generateDungeon, moveToRoom, clearRoom, getAvailableMoves } from './dungeon.js';
import { generateEnemy, generateRoomEnemies } from './enemies.js';
import { generateLoot, generateEnemyDrops, equipItem, sellValue } from './loot.js';
import { createEventManager } from './events.js';
import { getScreen, getUIState, resetUIState } from './screens.js';
import { classifyPrompt } from '../prompts/classifier.js';
import { getWidget } from '../prompts/widgets.js';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SETTINGS_PATH = join(__dirname, '..', '..', 'saves', 'settings.json');
const TARGET_FPS = 30;
const FRAME_MS = Math.floor(1000 / TARGET_FPS);
const AUTOSAVE_INTERVAL_MS = 60_000;

// Re-export prompt system for MCP server integration
export { classifyPrompt } from '../prompts/classifier.js';
export { getWidget } from '../prompts/widgets.js';

/**
 * Create and run the full game.
 * @param {object} [options]
 * @param {number} [options.slot=1] - Save slot to use
 * @param {boolean} [options.debug=false] - Enable debug mode
 * @param {boolean} [options.newGame=false] - Force new game
 * @returns {Promise<void>} Resolves when game exits
 */
export async function runGame(options = {}) {
  const slot = options.slot ?? 1;
  const debug = options.debug ?? false;

  // ── Settings ────────────────────────────────────────────────────
  const settings = createSettings(SETTINGS_PATH);
  settings.load();

  // ── Load or create save ─────────────────────────────────────────
  let saveData = null;
  if (!options.newGame) {
    const loaded = loadGame(slot);
    if (loaded.success) {
      saveData = loaded.data;
      if (loaded.fromBackup && debug) {
        process.stderr.write('[game] Loaded from backup save\n');
      }
    }
  }

  // ── Engine ──────────────────────────────────────────────────────
  const seed = saveData?.seed ?? generateSeed();
  const engine = createEngine({
    seed,
    saveData,
    onSave: (state) => saveGame(slot, state),
    onRender: () => { /* Rendering driven by game loop, not engine events */ },
  });

  // ── Terminal setup ──────────────────────────────────────────────
  const caps = detectCapabilities();
  const renderer = createRenderer(caps);
  renderer.colorBlindSafe = settings.get('game.colorBlindMode') ?? false;

  const input = createInputHandler();
  // Resize handler takes the renderer directly and calls updateCapabilities
  const resize = createResizeHandler(renderer);
  resize.onResize(() => {
    renderCurrentScreen();
  });

  // ── Game subsystems ─────────────────────────────────────────────
  const state = engine.getState();
  const rng = createRNG(seed);
  const cookie = createCookieHandler(state);
  const economy = createEconomy(state);
  const graveyard = createGraveyard(state);
  const tutorial = createTutorial(state);
  const eventManager = createEventManager();
  let rollBar = null;
  let activeCombat = null;
  let voiceController = null;

  // Initialize voice controller if enabled
  if (settings.get('voice.enabled')) {
    try {
      const { createVoiceController } = await import('../voice/voice.js');
      voiceController = createVoiceController(settings.get('voice'), input);
      voiceController.start();
    } catch {
      if (debug) process.stderr.write('[game] Voice controller unavailable\n');
    }
  }

  // Generate initial tavern roster if none
  if (!state.tavernRoster || state.tavernRoster.length === 0) {
    state.tavernRoster = generateTavernRoster(rng);
  }

  // ── Rendering ───────────────────────────────────────────────────

  function getEnrichedState() {
    const s = engine.getState();
    s.tavernRoster = state.tavernRoster;
    s.settings = settings.getAll();
    s.bonuses = settings.getBonuses();
    s.activeCombat = activeCombat;
    s.rollBarState = rollBar ? { display: rollBar.render() } : null;
    s.pendingLoot = state.pendingLoot ?? [];
    s.recoveredLoot = state.recoveredLoot ?? [];
    s.graveyardRunAvailable = state.lastDungeonSeed != null && graveyard.hasGrave(state.lastDungeonSeed);
    return s;
  }

  function renderCurrentScreen() {
    const s = getEnrichedState();
    const screen = getScreen(s.currentState);
    if (screen) {
      try {
        screen.render(s, renderer);
      } catch (err) {
        if (debug) process.stderr.write(`[render] ${err.message}\n`);
      }
    }
  }

  // ── Input handling ──────────────────────────────────────────────

  async function handleKey(event) {
    const s = engine.getState();
    const screen = getScreen(s.currentState);
    if (!screen) return;

    const prevState = s.currentState;
    let result;
    try {
      result = await screen.handleInput(event.key, engine);
    } catch (err) {
      if (debug) process.stderr.write(`[input] ${err.message}\n`);
      return;
    }

    // Handle action results from screens
    if (result === 'cookie_click') {
      const bonuses = settings.getBonuses();
      const earned = cookie.click();
      const boosted = Math.floor(earned * bonuses.crumbMultiplier);
      state.crumbs += (boosted - earned); // add bonus portion
      tutorial.advance('click_cookie');
    } else if (result === 'recruit_select') {
      const ui = getUIState();
      const roster = state.tavernRoster ?? [];
      const member = roster[ui.menuIndex];
      if (member) {
        if (economy.tryRecruit(member)) {
          state.team = state.team ?? [];
          state.team.push(member);
          roster.splice(ui.menuIndex, 1);
          tutorial.advance('recruit');
        }
      }
    } else if (result === 'roll_stop' && rollBar) {
      const val = rollBar.stop();
      if (activeCombat && !activeCombat.isFinished) {
        const attackResult = activeCombat.attack(val);
        if (attackResult.outcome === 'victory') {
          state.stats.monstersSlain = (state.stats.monstersSlain ?? 0) + 1;
          // Generate loot drops from defeated enemies
          const dp = state.dungeonProgress;
          const level = dp?.level ?? 1;
          const bonuses = settings.getBonuses();
          const drops = generateEnemyDrops({ level, rng, qualityBonus: bonuses.lootFindBonus });
          state.pendingLoot = drops;
          // Award XP to surviving team
          for (const m of (state.team ?? []).filter(t => t.currentHp > 0)) {
            awardXP(m, level);
          }
          // Clear room content
          if (dp) clearRoom(dp, dp.currentRoom);
          activeCombat = null;
          rollBar = null;
          await engine.transition(GameState.LOOT);
        } else if (attackResult.outcome === 'defeat') {
          state.stats.deaths = (state.stats.deaths ?? 0) + 1;
          graveyard.recordWipe(state.team, state.lastDungeonSeed ?? 0);
          economy.activateWipeDiscount();
          await engine.transition(GameState.DEATH);
        } else {
          // Next turn — start new roll bar
          rollBar = createRollBar();
          rollBar.start();
        }
      }
    } else if (result === 'attack' && activeCombat && !activeCombat.isFinished) {
      // Auto-attack for keyboard shortcut
      const attackResult = activeCombat.autoAttack();
      if (attackResult.outcome === 'victory') {
        state.stats.monstersSlain = (state.stats.monstersSlain ?? 0) + 1;
        const dp = state.dungeonProgress;
        const level = dp?.level ?? 1;
        const bonuses = settings.getBonuses();
        state.pendingLoot = generateEnemyDrops({ level, rng, qualityBonus: bonuses.lootFindBonus });
        for (const m of (state.team ?? []).filter(t => t.currentHp > 0)) {
          awardXP(m, level);
        }
        if (dp) clearRoom(dp, dp.currentRoom);
        activeCombat = null;
        rollBar = null;
        await engine.transition(GameState.LOOT);
      } else if (attackResult.outcome === 'defeat') {
        state.stats.deaths = (state.stats.deaths ?? 0) + 1;
        await engine.transition(GameState.DEATH);
      }
    } else if (result === 'loot_equip' || result === 'loot_sell' || result === 'loot_discard') {
      const ui = getUIState();
      const loot = state.pendingLoot ?? [];
      const item = loot[ui.lootIndex];
      if (item) {
        if (result === 'loot_sell') {
          economy.sellItem(item);
        } else if (result === 'loot_equip') {
          // Equip to first team member with empty slot
          const member = (state.team ?? []).find(m => m.alive && !m.equipment[item.slot ?? 'weapon']);
          if (member) {
            member.equipment[item.slot ?? 'weapon'] = item;
          } else {
            state.inventory = state.inventory ?? [];
            state.inventory.push(item);
          }
        }
        // Discard: just remove from pending
        loot.splice(ui.lootIndex, 1);
        if (ui.lootIndex >= loot.length) ui.lootIndex = Math.max(0, loot.length - 1);
      }
    } else if (result === 'explore_dungeon') {
      // Generate dungeon and enter
      const dungeonLevel = (state.stats.dungeonsCleared ?? 0) + 1;
      const dungeonSeed = rng.int(1, 999999);
      try {
        const dungeon = generateDungeon({ seed: dungeonSeed, level: dungeonLevel, rng });
        state.dungeonProgress = {
          ...dungeon,
          currentRoom: dungeon.rooms[0]?.id ?? 0,
          dungeonSeed,
          level: dungeonLevel,
        };
        state.lastDungeonSeed = dungeonSeed;
        // Populate rooms with enemies and loot
        const usedSignatures = new Set();
        for (const room of state.dungeonProgress.rooms) {
          if (room.type === 'monster' || room.type === 'boss') {
            room.content = 'enemy';
            const enemies = generateRoomEnemies({ level: dungeonLevel, rng, isBoss: room.type === 'boss' });
            room.enemy = enemies[0] ?? generateEnemy({ level: dungeonLevel, rng });
            room.enemies = enemies;
          } else if (room.type === 'loot') {
            room.content = 'loot';
            const bonuses = settings.getBonuses();
            room.loot = [generateLoot({ level: dungeonLevel, rng, qualityBonus: bonuses.lootFindBonus, usedSignatures })].filter(Boolean);
          } else if (room.type === 'trap') {
            room.content = 'trap';
          } else if (room.type === 'shrine') {
            room.content = 'shrine';
          }
        }
        cookie.resetSession();
        await engine.transition(GameState.DUNGEON);
      } catch (err) {
        if (debug) process.stderr.write(`[dungeon] ${err.message}\n`);
      }
    } else if (result === 'dungeon_interact') {
      // Interact with current room
      const dp = state.dungeonProgress;
      if (dp) {
        const room = dp.rooms?.find(r => r.id === dp.currentRoom);

        // Check for random events
        const event = eventManager.rollEvent({
          biome: dp.biome ?? 'cave',
          level: dp.level ?? 1,
          rng,
          roomType: room?.type ?? 'empty',
        });
        if (event) {
          state.activeEvent = event;
        }

        if (room?.content === 'enemy' && (room.enemies?.length > 0 || room.enemy)) {
          const enemies = room.enemies ?? [room.enemy];
          activeCombat = createCombat({
            team: state.team,
            enemies,
            rng,
          });
          rollBar = createRollBar();
          rollBar.start();
          await engine.transition(GameState.COMBAT);
        } else if (room?.content === 'loot') {
          state.pendingLoot = room.loot ?? [];
          clearRoom(dp, dp.currentRoom);
          await engine.transition(GameState.LOOT);
        } else if (room?.content === 'shrine') {
          // Shrine: heal team
          for (const m of (state.team ?? [])) {
            m.currentHp = m.maxHp;
          }
          clearRoom(dp, dp.currentRoom);
        } else if (room?.content === 'trap') {
          // Trap: damage random team member
          const alive = (state.team ?? []).filter(m => m.currentHp > 0);
          if (alive.length > 0) {
            const victim = alive[rng.int(0, alive.length - 1)];
            const dmg = rng.int(1, dp.level ?? 1) + 2;
            victim.currentHp = Math.max(0, victim.currentHp - dmg);
          }
          clearRoom(dp, dp.currentRoom);
        } else {
          // Move to next room at fork
          const conns = room?.connections ?? [];
          const uiState = getUIState();
          const nextId = conns[uiState.dungeonChoice] ?? conns[0];
          if (nextId != null) {
            moveToRoom(dp, nextId);
            state.stats.roomsCleared = (state.stats.roomsCleared ?? 0) + 1;
          }
        }
      }
    } else if (typeof result === 'object' && result?.action === 'toggle_setting') {
      const current = settings.get(result.key);
      settings.set(result.key, !current);
      settings.save();
      renderer.colorBlindSafe = settings.get('game.colorBlindMode') ?? false;
      // Handle voice toggle
      if (result.key === 'voice.enabled') {
        if (!current && !voiceController) {
          try {
            const { createVoiceController } = await import('../voice/voice.js');
            voiceController = createVoiceController(settings.get('voice'), input);
            voiceController.start();
          } catch { /* voice unavailable */ }
        } else if (current && voiceController) {
          voiceController.stop();
          voiceController = null;
        }
      }
    } else if (result === 'reset_settings') {
      settings.reset();
      settings.save();
    } else if (result === 'flee') {
      activeCombat = null;
      rollBar = null;
      try { await engine.transition(GameState.DUNGEON); } catch { /* ignore */ }
    }

    // Reset UI state on screen transition
    const newState = engine.getState().currentState;
    if (newState !== prevState) {
      resetUIState();
    }

    // Immediate render after input
    renderCurrentScreen();
  }

  // ── Game loop ───────────────────────────────────────────────────

  let loopTimer = null;
  let lastAutosave = Date.now();

  function gameLoop() {
    if (!engine.running) {
      cleanup();
      return;
    }

    // Engine tick (scheduler, etc)
    engine.update(FRAME_MS);

    // Roll bar tick during combat
    if (rollBar && !rollBar.isStopped) {
      const { expired } = rollBar.tick();
      if (expired && activeCombat) {
        // Auto-roll on timeout
        const val = rollBar.value;
        activeCombat.attack(val);
      }
    }

    // Autosave
    const now = Date.now();
    if (now - lastAutosave >= AUTOSAVE_INTERVAL_MS) {
      lastAutosave = now;
      saveGame(slot, engine.getState());
    }

    // Render
    renderCurrentScreen();

    loopTimer = setTimeout(gameLoop, FRAME_MS);
  }

  // ── Lifecycle ───────────────────────────────────────────────────

  function cleanup() {
    if (loopTimer) clearTimeout(loopTimer);
    if (voiceController) voiceController.stop();
    input.stop();
    resize.destroy();
    renderer.clear();
    renderer.showCursor();
  }

  // Start everything
  await engine.start();

  // Show tutorial if needed
  if (tutorial.shouldShow() && !options.newGame) {
    // Tutorial integrates into normal flow via the tutorial.advance() calls
  }

  input.onKey(handleKey);
  input.emitter.on('quit', async () => {
    await engine.shutdown();
    cleanup();
    process.exit(0);
  });

  input.start();
  // resize handler auto-starts on creation (listens to SIGWINCH)

  // Initial render
  renderCurrentScreen();

  // Start game loop
  gameLoop();

  // Return a promise that resolves on shutdown
  return new Promise((resolve) => {
    const check = setInterval(() => {
      if (!engine.running) {
        clearInterval(check);
        cleanup();
        resolve();
      }
    }, 200);
  });
}
