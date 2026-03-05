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
import { createStoryManager } from './story.js';
import { getScreen, getUIState, resetUIState } from './screens.js';
import { classifyPrompt } from '../prompts/classifier.js';
import { getWidget } from '../prompts/widgets.js';
import { createLiveState } from '../save/live-state.js';
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

  // ── Live state bridge (syncs with MCP server) ─────────────────
  const liveState = createLiveState({
    getState: () => engine.getState(),
    setState: (external) => {
      // Merge MCP server changes into local state
      const local = engine.getStateRef();
      // For crumbs, take the higher value to avoid losing local earnings
      if (external.crumbs != null) local.crumbs = Math.max(local.crumbs ?? 0, external.crumbs);
      // For team, merge by ID — never lose locally recruited members
      if (external.team && Array.isArray(external.team)) {
        const localIds = new Set((local.team ?? []).map(m => m.id));
        for (const m of external.team) {
          if (!localIds.has(m.id)) {
            local.team = local.team ?? [];
            local.team.push(m);
          }
        }
      }
      if (external.inventory) {
        // Merge inventories by ID
        const localInvIds = new Set((local.inventory ?? []).map(i => i.id));
        for (const item of external.inventory) {
          if (item.id && !localInvIds.has(item.id)) {
            local.inventory = local.inventory ?? [];
            local.inventory.push(item);
          }
        }
      }
      if (external.stats) Object.assign(local.stats, external.stats);
      if (external.dungeonProgress !== undefined && !local.dungeonProgress) {
        local.dungeonProgress = external.dungeonProgress;
      }
      if (external.pendingActions) local.pendingActions = external.pendingActions;
      if (external.passiveLog) local.passiveLog = external.passiveLog;
      if (external.totalToolCalls != null) local.totalToolCalls = Math.max(local.totalToolCalls ?? 0, external.totalToolCalls);
    },
    label: 'game',
  });
  liveState.start();

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
  const state = engine.getStateRef();
  const rng = createRNG(seed);
  const cookie = createCookieHandler(state);
  const economy = createEconomy(state);
  const graveyard = createGraveyard(state);
  const tutorial = createTutorial(state);
  const eventManager = createEventManager();
  const storyManager = createStoryManager(state);
  let rollBar = null;
  let activeCombat = null;
  let voiceController = null;

  // ── Dungeon auto-start timer ──────────────────────────────────
  // After first recruit, show a countdown; auto-enter dungeon when it expires.
  let dungeonTimer = null; // { remaining: ms, total: ms } or null

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

  // ── Work mode auto-loop ──────────────────────────────────────────
  let workModeLastCookieClick = 0;
  let workModeLastRecruit = 0;
  let workModeLastRoomAdvance = 0;
  let workModeLastDeathRecover = 0;
  let workModeLastLootAction = 0;

  function isWorkMode() { return state.gameMode === 'work'; }

  function workModeLog(msg) {
    state.passiveLog = state.passiveLog ?? [];
    state.passiveLog.push({ message: msg, time: Date.now() });
    if (state.passiveLog.length > 50) state.passiveLog.splice(0, state.passiveLog.length - 50);
  }

  async function workModeTick() {
    const now = Date.now();
    const currentState = state.currentState;

    try {
      if (currentState === GameState.MENU) {
        await engine.transition(GameState.TAVERN);
        workModeLog('Auto: entering tavern');
        return;
      }

      if (currentState === GameState.SETTINGS || currentState === GameState.HELP) {
        try { await engine.transition(GameState.TAVERN); } catch {
          try { await engine.transition(GameState.MENU); } catch { /* stay */ }
        }
        return;
      }

      if (currentState === GameState.TAVERN) {
        // Auto cookie click every 2s
        if (now - workModeLastCookieClick >= 2000) {
          workModeLastCookieClick = now;
          const bonuses = settings.getBonuses();
          const earned = cookie.click();
          const boosted = Math.floor(earned * bonuses.crumbMultiplier);
          state.crumbs += (boosted - earned);
        }

        // Auto recruit cheapest affordable every 3s
        if (now - workModeLastRecruit >= 3000) {
          workModeLastRecruit = now;
          const roster = state.tavernRoster ?? [];
          if (roster.length > 0) {
            // Find cheapest affordable
            const affordable = roster
              .map((m, i) => ({ m, i, cost: economy.recruitCost(m) }))
              .filter(x => state.crumbs >= x.cost)
              .sort((a, b) => a.cost - b.cost);
            if (affordable.length > 0) {
              const { m: member, i: idx } = affordable[0];
              if (economy.tryRecruit(member)) {
                state.team = state.team ?? [];
                state.team.push(member);
                roster.splice(idx, 1);
                workModeLog(`Auto: recruited ${member.name} the ${member.class}`);
                if (!dungeonTimer && !state.dungeonProgress) {
                  startDungeonTimer();
                }
              }
            }
          }
        }

        // Auto enter dungeon immediately if team and no dungeon in progress
        if ((state.team ?? []).length > 0 && !state.dungeonProgress && !dungeonTimer) {
          await enterDungeon();
          workModeLog('Auto: entering dungeon');
        }
        return;
      }

      if (currentState === GameState.DUNGEON) {
        // Simulate enter key to interact every 2s
        if (now - workModeLastRoomAdvance >= 2000) {
          workModeLastRoomAdvance = now;
          // Set a random fork choice before interacting
          const dp = state.dungeonProgress;
          if (dp) {
            const room = dp.rooms?.find(r => r.id === dp.currentRoom);
            const conns = room?.connections ?? [];
            if (conns.length > 1) {
              const uiState = getUIState();
              uiState.dungeonChoice = rng.int(0, conns.length - 1);
            }
            // Check if dungeon has no more connections (end of dungeon)
            if (conns.length === 0 && !room?.content) {
              state.dungeonProgress = null;
              state.stats.dungeonsCleared = (state.stats.dungeonsCleared ?? 0) + 1;
              workModeLog('Auto: dungeon cleared!');
              try { await engine.transition(GameState.TAVERN); } catch { /* ignore */ }
              return;
            }
          }
          await handleKey({ key: 'enter' });
        }
        return;
      }

      if (currentState === GameState.COMBAT) {
        // Auto-attack every tick
        if (activeCombat && !activeCombat.isFinished) {
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
            workModeLog('Auto: combat victory!');
            await engine.transition(GameState.LOOT);
          } else if (attackResult.outcome === 'defeat') {
            state.stats.deaths = (state.stats.deaths ?? 0) + 1;
            const dungeonLevel = state.dungeonProgress?.level ?? 1;
            const penalty = storyManager.applyDeathPenalty(dungeonLevel);
            storyManager.addStoryEntry(`Your team has fallen! Lost ${penalty} crumbs.`, 'combat');
            graveyard.recordWipe(state.team, state.lastDungeonSeed ?? 0);
            economy.activateWipeDiscount();
            activeCombat = null;
            rollBar = null;
            workModeLog('Auto: team defeated');
            await engine.transition(GameState.DEATH);
          }
        }
        return;
      }

      if (currentState === GameState.LOOT) {
        // Auto-resolve spin wheel
        if (state.spinWheel) {
          if (state.spinWheel.selectedIdx < 0) {
            // Auto-spin
            const prizes = state.spinWheel.prizes;
            state.spinWheel.selectedIdx = rng.int(0, prizes.length - 1);
            workModeLog(`Auto: spin wheel landed on ${prizes[state.spinWheel.selectedIdx]?.name}`);
          }
          // Auto-equip or sell the prize
          const item = state.spinWheel.prizes[state.spinWheel.selectedIdx];
          if (item) {
            const member = (state.team ?? []).find(m => m.currentHp > 0 && !m.equipment?.[item.slot ?? 'weapon']);
            if (member) {
              member.equipment = member.equipment ?? {};
              member.equipment[item.slot ?? 'weapon'] = item;
            } else {
              economy.sellItem(item);
            }
          }
          state.spinWheel = null;
          return;
        }

        if (now - workModeLastLootAction >= 500) {
          workModeLastLootAction = now;
          const loot = state.pendingLoot ?? [];
          if (loot.length > 0) {
            const item = loot[0];
            const slot = item.slot ?? 'weapon';
            // Try equip to first team member with empty matching slot
            const member = (state.team ?? []).find(m => m.currentHp > 0 && !m.equipment?.[slot]);
            if (member) {
              member.equipment = member.equipment ?? {};
              member.equipment[slot] = item;
              workModeLog(`Auto: equipped ${item.name} on ${member.name}`);
            } else {
              economy.sellItem(item);
              workModeLog(`Auto: sold ${item.name}`);
            }
            loot.splice(0, 1);
          } else {
            // All loot handled, continue
            if (state.dungeonProgress) {
              try { await engine.transition(GameState.DUNGEON); } catch { /* ignore */ }
            } else {
              try { await engine.transition(GameState.TAVERN); } catch { /* ignore */ }
            }
          }
        }
        return;
      }

      if (currentState === GameState.DEATH) {
        if (now - workModeLastDeathRecover >= 2000) {
          workModeLastDeathRecover = now;
          // Clear team and recover
          state.team = [];
          state.dungeonProgress = null;
          // Regenerate tavern roster
          state.tavernRoster = generateTavernRoster(rng);
          workModeLog('Auto: recovering from death, new roster generated');
          try { await engine.transition(GameState.TAVERN); } catch { /* ignore */ }
        }
        return;
      }
    } catch (err) {
      if (debug) process.stderr.write(`[workmode] ${err.message}\n`);
      // Fallback: try to get back to tavern
      try { await engine.transition(GameState.TAVERN); } catch {
        try { await engine.transition(GameState.MENU); } catch { /* stuck */ }
      }
    }
  }

  /** Start the dungeon auto-timer with a random duration (8-20 seconds). */
  function startDungeonTimer() {
    const totalMs = (rng.int(8, 20)) * 1000;
    dungeonTimer = { remaining: totalMs, total: totalMs };
  }

  /** Generate dungeon and transition to DUNGEON state. */
  async function enterDungeon() {
    dungeonTimer = null;
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
      const usedSignatures = new Set();
      for (const room of state.dungeonProgress.rooms) {
        if (room.type === 'monster' || room.type === 'boss' || room.type === 'miniboss') {
          room.content = 'enemy';
          const isBoss = room.type === 'boss' || room.type === 'miniboss';
          // Scale enemy level by room depth for progressive difficulty
          const roomLevel = dungeonLevel + Math.floor(room.depth * 0.3);
          const enemies = generateRoomEnemies({ level: roomLevel, rng, isBoss });
          room.enemy = enemies[0] ?? generateEnemy({ level: roomLevel, rng });
          room.enemies = enemies;
        } else if (room.type === 'loot') {
          room.content = 'loot';
          const bonuses = settings.getBonuses();
          room.loot = [generateLoot({ level: dungeonLevel, rng, qualityBonus: bonuses.lootFindBonus, usedSignatures })].filter(Boolean);
        } else if (room.type === 'trap') {
          room.content = 'trap';
        } else if (room.type === 'shrine') {
          room.content = 'shrine';
        } else if (room.type === 'npc') {
          room.content = 'npc';
        }
      }
      cookie.resetSession();
      storyManager.resetForDungeon();
      await engine.transition(GameState.DUNGEON);
    } catch (err) {
      if (debug) process.stderr.write(`[dungeon] ${err.message}\n`);
    }
  }

  // ── Rendering ───────────────────────────────────────────────────

  function getEnrichedState() {
    // state is the direct engine ref, so just enrich with transient UI data
    const s = { ...state };
    s.settings = settings.getAll();
    s.bonuses = settings.getBonuses();
    s.activeCombat = activeCombat;
    s.rollBarState = rollBar ? { display: rollBar.render() } : null;
    s.dungeonTimer = dungeonTimer;
    s.graveyardRunAvailable = state.lastDungeonSeed != null && graveyard.hasGrave(state.lastDungeonSeed);
    s.storyLog = state.storyLog;
    s.skillModifiers = state.skillModifiers;
    s.activeNPC = state.activeNPC;
    s.lastDeathPenalty = state.lastDeathPenalty;
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

    // Crumbs are earned via AI interactions (MCP server), not key presses

    // Handle voice select_1/select_2 shortcuts
    if (event.key === '1' || event.key === 'select_1') {
      const s = engine.getState();
      if (s.currentState === GameState.TAVERN) {
        const ui = getUIState();
        ui.menuIndex = 0;
        // Will be handled as recruit_select below
      } else if (s.currentState === GameState.DUNGEON) {
        const ui = getUIState();
        ui.dungeonChoice = 0;
      } else if (s.currentState === GameState.LOOT) {
        return; // equip handled by 'e' key
      }
    } else if (event.key === '2' || event.key === 'select_2') {
      const s = engine.getState();
      if (s.currentState === GameState.TAVERN) {
        const ui = getUIState();
        ui.menuIndex = 1;
      } else if (s.currentState === GameState.DUNGEON) {
        const ui = getUIState();
        ui.dungeonChoice = 1;
      }
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
        const cost = economy.recruitCost(member);
        if (state.crumbs < cost) {
          renderer.showNotification(`Not enough crumbs! Need ${cost}, have ${state.crumbs}. Press C to click cookies.`, 'warn');
        } else if (economy.tryRecruit(member)) {
          state.team = state.team ?? [];
          state.team.push(member);
          roster.splice(ui.menuIndex, 1);
          renderer.showNotification(`${member.name} the ${member.race} ${member.class} joins your team!`, 'info');
          tutorial.advance('recruit');
          // Start dungeon auto-timer after first recruit (if not already running)
          if (!dungeonTimer && !state.dungeonProgress) {
            startDungeonTimer();
          }
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
          const dungeonLevel = state.dungeonProgress?.level ?? 1;
          const penalty = storyManager.applyDeathPenalty(dungeonLevel);
          storyManager.addStoryEntry(`Your team has fallen! Lost ${penalty} crumbs to the dungeon.`, 'combat');
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
        const dungeonLevel = state.dungeonProgress?.level ?? 1;
        const penalty = storyManager.applyDeathPenalty(dungeonLevel);
        storyManager.addStoryEntry(`Your team has fallen! Lost ${penalty} crumbs to the dungeon.`, 'combat');
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
    } else if (result === 'spin_wheel_start') {
      // Spin the wheel — pick a random prize
      if (state.spinWheel) {
        state.spinWheel.spinning = true;
        // Weighted selection: later indices (rarer) are less likely
        const weights = state.spinWheel.prizes.map((_, i) => Math.max(1, state.spinWheel.prizes.length - i));
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        let roll = rng.int(1, totalWeight);
        let selected = 0;
        for (let i = 0; i < weights.length; i++) {
          roll -= weights[i];
          if (roll <= 0) { selected = i; break; }
        }
        state.spinWheel.selectedIdx = selected;
        state.spinWheel.spinning = false;
      }
    } else if (result === 'spin_wheel_equip') {
      if (state.spinWheel && state.spinWheel.selectedIdx >= 0) {
        const item = state.spinWheel.prizes[state.spinWheel.selectedIdx];
        if (item) {
          const member = (state.team ?? []).find(m => m.currentHp > 0 && !m.equipment?.[item.slot ?? 'weapon']);
          if (member) {
            member.equipment = member.equipment ?? {};
            member.equipment[item.slot ?? 'weapon'] = item;
          } else {
            state.inventory = state.inventory ?? [];
            state.inventory.push(item);
          }
        }
        state.spinWheel = null;
      }
    } else if (result === 'spin_wheel_sell') {
      if (state.spinWheel && state.spinWheel.selectedIdx >= 0) {
        const item = state.spinWheel.prizes[state.spinWheel.selectedIdx];
        if (item) economy.sellItem(item);
        state.spinWheel = null;
      }
    } else if (result === 'spin_wheel_done') {
      // Continue without taking the prize
      state.spinWheel = null;
    } else if (result === 'explore_dungeon') {
      await enterDungeon();
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
          // 30% chance of spin wheel instead of normal loot
          if (rng.chance(0.3)) {
            const level = dp?.level ?? 1;
            const bonuses = settings.getBonuses();
            const prizes = [];
            const rarities = ['common', 'common', 'uncommon', 'uncommon', 'rare', 'legendary'];
            for (let i = 0; i < 6; i++) {
              const item = generateLoot({ level, rng, qualityBonus: bonuses.lootFindBonus });
              if (item) {
                item.rarity = rarities[i];
                prizes.push(item);
              }
            }
            if (prizes.length > 0) {
              state.spinWheel = { prizes, selectedIdx: -1, spinning: false };
            }
          }
          await engine.transition(GameState.LOOT);
        } else if (room?.content === 'shrine') {
          // Shrine: heal team
          for (const m of (state.team ?? [])) {
            m.currentHp = m.maxHp;
          }
          clearRoom(dp, dp.currentRoom);
        } else if (room?.content === 'npc') {
          // NPC encounter — load NPC data and set active
          try {
            const { readFileSync } = await import('fs');
            const { dirname: dn, join: jn } = await import('path');
            const { fileURLToPath: furl } = await import('url');
            const dd = dn(furl(import.meta.url));
            const npcsPath = jn(dd, '..', '..', 'data', 'npcs.json');
            const npcs = JSON.parse(readFileSync(npcsPath, 'utf-8'));
            const biome = state.dungeonProgress?.biome ?? 'cave';
            const eligible = npcs.filter(n => n.biome === biome || n.biome === 'any');
            if (eligible.length > 0) {
              const npc = eligible[rng.int(0, eligible.length - 1)];
              storyManager.setActiveNPC(npc);
              storyManager.addStoryEntry(`You encounter ${npc.name}: "${npc.dialogue}"`, 'npc');
              // Auto-resolve first offer for now (full NPC interaction via MCP tools)
              const offer = npc.offers[0];
              if (offer?.effect?.action === 'buff') {
                storyManager.applySkillModifier({
                  stat: offer.effect.stat,
                  amount: offer.effect.amount,
                  duration: offer.effect.duration || 3,
                  source: npc.name,
                });
              } else if (offer?.effect?.action === 'heal') {
                for (const m of (state.team ?? []).filter(t => t.currentHp > 0)) {
                  m.currentHp = Math.min(m.maxHp, m.currentHp + (offer.effect.amount || 20));
                }
              }
              if (offer?.cost > 0) {
                state.crumbs = Math.max(0, state.crumbs - offer.cost);
              }
            }
          } catch { /* NPC data unavailable */ }
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
          } else {
            // Dead end or dungeon complete — return to tavern
            state.stats.dungeonsCleared = (state.stats.dungeonsCleared ?? 0) + 1;
            state.dungeonProgress = null;
            await engine.transition(GameState.TAVERN);
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
    } else if (result === 'save_game') {
      saveGame(slot, engine.getState());
      renderer.showNotification('Game saved!', 'success');
    } else if (result === 'save_and_quit') {
      saveGame(slot, engine.getState());
      await engine.shutdown();
    }

    // Reset UI state on screen transition
    const newState = engine.getState().currentState;
    if (newState !== prevState) {
      resetUIState();
      // Restart dungeon timer when returning to tavern with a team
      if (newState === GameState.TAVERN && (state.team ?? []).length > 0 && !state.dungeonProgress && !dungeonTimer) {
        startDungeonTimer();
      }
      // Clear timer when leaving tavern
      if (prevState === GameState.TAVERN && newState !== GameState.TAVERN) {
        dungeonTimer = null;
      }
    }

    // Immediate render after input
    renderCurrentScreen();
  }

  // ── Game loop ───────────────────────────────────────────────────

  let loopTimer = null;
  let lastAutosave = Date.now();

  async function gameLoop() {
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

    // Dungeon auto-start timer tick
    if (dungeonTimer && state.currentState === GameState.TAVERN) {
      dungeonTimer.remaining -= FRAME_MS;
      if (dungeonTimer.remaining <= 0 && (state.team ?? []).length > 0) {
        await enterDungeon();
      }
    }

    // Work mode auto-loop
    if (isWorkMode()) {
      await workModeTick();
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
    liveState.stop();
    if (voiceController) voiceController.stop();
    input.stop();
    resize.destroy();
    renderer.showCursor();
    renderer.leaveAltScreen();
  }

  // Start everything
  await engine.start();

  // Activate work mode passive settings on load
  if (state.gameMode === 'work') {
    state.passiveConfig.autoLoot = true;
    state.passiveConfig.autoSell = true;
  }

  // Show tutorial if needed
  if (tutorial.shouldShow() && !options.newGame) {
    // Tutorial integrates into normal flow via the tutorial.advance() calls
  }

  input.onKey(handleKey);
  input.emitter.on('quit', async () => {
    // Save before quitting
    saveGame(slot, engine.getState());
    await engine.shutdown();
    cleanup();
    process.exit(0);
  });

  input.start();
  // resize handler auto-starts on creation (listens to SIGWINCH)

  // Enter alternate screen buffer to prevent scrollback pollution
  renderer.enterAltScreen();

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
