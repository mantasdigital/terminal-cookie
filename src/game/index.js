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
import { generateTavernRoster, awardXP, CLASSES } from './team.js';
import { createEconomy } from './economy.js';
import { createCombat } from './combat.js';
import { createRollBar } from './roll-bar.js';
import { createGraveyard } from './graveyard.js';
import { createTutorial } from './tutorial.js';
import { generateDungeon, moveToRoom, clearRoom, getAvailableMoves } from './dungeon.js';
import { generateEnemy, generateRoomEnemies } from './enemies.js';
import { generateLoot, generateEnemyDrops, equipItem, canEquip, sellValue, enchantItem, enchantCost } from './loot.js';
import { createEventManager } from './events.js';
import { createStoryManager } from './story.js';
import { unlockVillage, upgradeBuilding, getBuildingIds, getVillageBonuses, isVillageUnlocked } from './village.js';
import { getScreen, getUIState, resetUIState } from './screens.js';
import { classifyPrompt } from '../prompts/classifier.js';
import { getWidget } from '../prompts/widgets.js';
import { createLiveState } from '../save/live-state.js';
import { getTalismanBonuses, applyTalismanRegen, awardDeathReward, upgradeTalisman, canUpgrade, getUpgradeCost, salvageLoot } from './talisman.js';
import { checkTrophies, awardTrophy, hasTrophy, getBuyableTrophies } from './trophies.js';
import {
  getDungeonIntroCutscene, getPreMinibossCutscene, getPostMinibossCutscene,
  getPreBossCutscene, getPostBossCutscene, getDungeonCompleteCutscene,
  getRandomEncounterCutscene, getTrophyCutscene, shouldTriggerRandomEncounter,
  getVictoryEndingCutscene, getDefeatEndingCutscene,
} from './cutscenes.js';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { detectPlatform } from '../focus/detect-os.js';
import { summonWindow } from '../focus/summon.js';
import { setAlwaysOnTop } from '../focus/sticky.js';
import { bell, flashTitle, osNotify } from '../focus/notify.js';

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
  let slot = options.slot ?? 1;
  const debug = options.debug ?? false;

  // ── Settings ────────────────────────────────────────────────────
  const settings = createSettings(SETTINGS_PATH);
  settings.load();

  // ── Focus / window management ─────────────────────────────────
  const platform = detectPlatform();
  if (settings.get('focus.stickyTop') && platform.canSticky) {
    setAlwaysOnTop(true, platform);
  }

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

  // ── Clean up MCP-only fields from loaded save ─────────────────
  // If the save was made by MCP, it may contain _mcpEarned/_mcpSpent that
  // are already baked into the crumbs. Align _lastMcpEarnedApplied so
  // reading stale live.json doesn't double-count those earnings.
  {
    const s = engine.getStateRef();
    if (s._mcpEarned != null) {
      s._lastMcpEarnedApplied = Math.max(s._lastMcpEarnedApplied ?? 0, s._mcpEarned);
      delete s._mcpEarned;
    }
    if (s._mcpSpent != null) {
      s._lastMcpSpentApplied = Math.max(s._lastMcpSpentApplied ?? 0, s._mcpSpent);
      delete s._mcpSpent;
    }
  }

  // ── Live state bridge (syncs with MCP server) ─────────────────
  const liveState = createLiveState({
    getState: () => engine.getState(),
    skipInitialPoll: options.newGame === true,
    setState: (external) => {
      const local = engine.getStateRef();

      // If external state has a newer newGameId, it's a full reset — replace everything
      // Only reset if external is strictly newer (higher timestamp) to avoid
      // stale MCP state overwriting a fresh local new-game reset.
      if (external.newGameId && external.newGameId > (local.newGameId ?? 0)) {
        for (const key of Object.keys(local)) delete local[key];
        Object.assign(local, external);
        return;
      }

      // After a new game reset, block ALL stale merges for a grace window
      // so old live.json data doesn't overwrite the fresh game state.
      // Once the live file catches up (same newGameId) or grace expires, resume sync.
      const resetGraceMs = 10_000;
      const resetActive = local.newGameId && local.newGameId !== external.newGameId
        && (Date.now() - local.newGameId) < resetGraceMs;

      // During reset grace: skip all merges — fresh state is authoritative
      if (resetActive) return;

      // PN-Counter CRDT merge for crumbs:
      // Game is authoritative for its own crumbs. MCP sends earned/spent deltas.
      if (external._mcpEarned != null) {
        // CRDT path: MCP has counters — apply delta
        const mcpEarned = external._mcpEarned;
        const mcpSpent = external._mcpSpent ?? 0;
        const lastAppliedEarn = local._lastMcpEarnedApplied ?? 0;
        const lastAppliedSpend = local._lastMcpSpentApplied ?? 0;
        const earnDelta = mcpEarned - lastAppliedEarn;
        const spendDelta = mcpSpent - lastAppliedSpend;
        if (earnDelta > 0 || spendDelta > 0) {
          local.crumbs = Math.max(0, (local.crumbs ?? 0) + earnDelta - spendDelta);
          local._lastMcpEarnedApplied = mcpEarned;
          local._lastMcpSpentApplied = mcpSpent;
        }
      } else if (external.crumbs != null) {
        // Fallback: MCP without CRDT counters — game is authoritative, ignore
        // stale external crumbs to prevent inflation from old save data.
      }
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
      if (external.pendingActions) {
        const hadPending = (local.pendingActions ?? []).length;
        local.pendingActions = external.pendingActions;
        // Summon window when new pending actions arrive from MCP
        if (external.pendingActions.length > hadPending) {
          const wantFocus = settings.get('focus.autoFocus') || settings.get('focus.stickyTop');
          if (wantFocus && platform.canFocus) {
            summonWindow(platform);
          }
          if (settings.get('focus.bell')) {
            bell();
          }
          flashTitle('Cookie needs input!');
          // OS notification so the user sees it even if window raise fails
          if (wantFocus && platform.canNotify) {
            osNotify('Terminal Cookie', 'AI needs your input!', platform);
          }
        }
      }
      if (external.passiveLog) local.passiveLog = external.passiveLog;
      if (external.totalToolCalls != null) local.totalToolCalls = Math.max(local.totalToolCalls ?? 0, external.totalToolCalls);
      if (external.tokenUsage != null) local.tokenUsage = Math.max(local.tokenUsage ?? 0, external.tokenUsage);
      if (external.tokenUsageDaily) {
        if (!local.tokenUsageDaily || local.tokenUsageDaily.date !== external.tokenUsageDaily.date) {
          local.tokenUsageDaily = external.tokenUsageDaily;
        } else {
          local.tokenUsageDaily.tokens = Math.max(local.tokenUsageDaily.tokens, external.tokenUsageDaily.tokens);
        }
      }
      if (external.tokenUsageMonthly) {
        if (!local.tokenUsageMonthly || local.tokenUsageMonthly.month !== external.tokenUsageMonthly.month) {
          local.tokenUsageMonthly = external.tokenUsageMonthly;
        } else {
          local.tokenUsageMonthly.tokens = Math.max(local.tokenUsageMonthly.tokens, external.tokenUsageMonthly.tokens);
        }
      }
      if (external.playTime != null) local.playTime = Math.max(local.playTime ?? 0, external.playTime);
      // Merge trophies: union of both sets
      if (external.trophies && Array.isArray(external.trophies)) {
        local.trophies = local.trophies ?? [];
        for (const t of external.trophies) {
          if (!local.trophies.includes(t)) local.trophies.push(t);
        }
      }
      if (external.talisman) {
        local.talisman = local.talisman ?? { level: 1 };
        local.talisman.level = Math.max(local.talisman.level, external.talisman.level ?? 1);
      }
      if (external.village) {
        local.village = external.village;
      }
      // Merge securityAlerts: add new alerts from MCP, preserve local dismissed state
      if (external.securityAlerts && Array.isArray(external.securityAlerts)) {
        local.securityAlerts = local.securityAlerts ?? [];
        for (const extAlert of external.securityAlerts) {
          const exists = local.securityAlerts.find(a =>
            a.tool === extAlert.tool && Math.abs((a.time ?? 0) - (extAlert.time ?? 0)) < 2000
          );
          if (!exists) {
            local.securityAlerts.push(extAlert);
          }
        }
        // Cap at 50
        if (local.securityAlerts.length > 50) {
          local.securityAlerts = local.securityAlerts.slice(-50);
        }
      }
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
  let combatAutoTimer = 0; // ms since last auto-attack in combat
  let trophyCheckTimer = 0; // ms since last trophy check
  let cutsceneTimer = 0; // ms into current cutscene frame
  let cutsceneAfterState = null; // state to transition to after cutscene
  let cutsceneAfterAction = null; // callback to run after cutscene ends

  // Cutscene helpers
  function startCutscene(frames, afterState, afterAction) {
    if (!frames || frames.length === 0) {
      // No cutscene — go directly to afterState
      if (typeof afterAction === 'function') afterAction();
      if (afterState) engine.transition(afterState).catch(() => {});
      return;
    }
    // If a cutscene is already active, end it first to avoid losing callbacks
    if (state._cutscene) {
      endCutscene();
    }
    // Store non-serializable data outside state
    cutsceneAfterState = afterState ?? null;
    cutsceneAfterAction = afterAction ?? null;
    state._cutscene = {
      frames,
      currentFrame: 0,
    };
    cutsceneTimer = 0;
    engine.transition(GameState.CUTSCENE).catch(() => {});
  }

  function advanceCutscene() {
    const cs = state._cutscene;
    if (!cs) return;
    cs.currentFrame++;
    cutsceneTimer = 0;
    if (cs.currentFrame >= cs.frames.length) {
      endCutscene();
    }
  }

  function endCutscene() {
    const cs = state._cutscene;
    if (!cs) return;
    const afterState = cutsceneAfterState;
    const afterAction = cutsceneAfterAction;
    state._cutscene = null;
    cutsceneTimer = 0;
    cutsceneAfterState = null;
    cutsceneAfterAction = null;
    if (typeof afterAction === 'function') afterAction();
    if (afterState) engine.transition(afterState).catch(() => {});
  }

  function skipCutscene() {
    endCutscene();
  }

  // Adventure log helper
  function logAdventure(text, type = 'event') {
    state.adventureLog = state.adventureLog ?? [];
    state.adventureLog.push({ text, type, time: Date.now() });
    // Cap at 200 entries
    if (state.adventureLog.length > 200) state.adventureLog = state.adventureLog.slice(-200);
  }

  // Apply shop buffs to team for combat
  function applyShopBuffs() {
    const buffs = state.shopBuffs ?? {};
    if (!buffs.atk && !buffs.def && !buffs.lck) return;
    for (const m of (state.team ?? []).filter(m => m.currentHp > 0)) {
      if (buffs.atk) m.stats.atk += buffs.atk;
      if (buffs.def) m.stats.def += buffs.def;
      if (buffs.lck) m.stats.lck += buffs.lck;
    }
  }

  function removeShopBuffs() {
    const buffs = state.shopBuffs ?? {};
    if (!buffs.atk && !buffs.def && !buffs.lck) return;
    for (const m of (state.team ?? [])) {
      if (buffs.atk) m.stats.atk -= buffs.atk;
      if (buffs.def) m.stats.def -= buffs.def;
      if (buffs.lck) m.stats.lck -= buffs.lck;
    }
    state.shopBuffs = {};
  }

  function applyTalismanCombatBuffs() {
    const b = getTalismanBonuses(state.talisman?.level ?? 1);
    if (b.atkBonus > 0 || b.defBonus > 0) {
      for (const m of (state.team ?? []).filter(m => m.currentHp > 0)) {
        m.stats.atk += b.atkBonus;
        m.stats.def += b.defBonus;
      }
    }
  }

  function removeTalismanCombatBuffs() {
    const b = getTalismanBonuses(state.talisman?.level ?? 1);
    if (b.atkBonus > 0 || b.defBonus > 0) {
      for (const m of (state.team ?? [])) {
        m.stats.atk -= b.atkBonus;
        m.stats.def -= b.defBonus;
      }
    }
  }

  function applyVillageCombatBuffs() {
    const vb = getVillageBonuses(state);
    if (vb.atkBonus > 0 || vb.defBonus > 0) {
      for (const m of (state.team ?? []).filter(m => m.currentHp > 0)) {
        m.stats.atk += vb.atkBonus;
        m.stats.def += vb.defBonus;
      }
    }
  }

  function removeVillageCombatBuffs() {
    const vb = getVillageBonuses(state);
    if (vb.atkBonus > 0 || vb.defBonus > 0) {
      for (const m of (state.team ?? [])) {
        m.stats.atk -= vb.atkBonus;
        m.stats.def -= vb.defBonus;
      }
    }
  }

  /** Apply village training ground bonus to a tavern roster */
  function applyVillageRecruitBonus(roster) {
    const bonus = getVillageBonuses(state).recruitStatBonus;
    if (bonus > 0) {
      for (const m of roster) {
        m.stats.atk += bonus;
        m.stats.def += bonus;
        m.stats.hp += bonus;
        m.stats.spd += bonus;
        m.maxHp += bonus * 2;
        m.currentHp += bonus * 2;
      }
    }
    return roster;
  }

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
    state.tavernRoster = applyVillageRecruitBonus(generateTavernRoster(rng));
  }

  // ── Work mode auto-loop ──────────────────────────────────────────
  let workModeLastCookieClick = 0;
  let workModeLastRecruit = 0;
  let workModeLastRoomAdvance = 0;
  let workModeLastDeathRecover = 0;
  let workModeLastLootAction = 0;

  let workModePaused = false;
  function isWorkMode() { return state.gameMode === 'work' && !workModePaused; }

  function workModeLog(msg) {
    state.passiveLog = state.passiveLog ?? [];
    state.passiveLog.push({ message: msg, time: Date.now() });
    if (state.passiveLog.length > 50) state.passiveLog.splice(0, state.passiveLog.length - 50);
  }

  async function workModeTick() {
    // Cutscenes auto-advance on their own timer — don't interfere
    if (state.currentState === GameState.CUTSCENE) return;
    // Security pause — stop auto-gameplay when unresolved security alerts exist
    if (isSecurityPaused()) return;
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
        // Crumbs are earned via AI interactions only — no auto-click in work mode

        // Auto recruit all affordable every 3s
        if (now - workModeLastRecruit >= 3000) {
          workModeLastRecruit = now;
          let recruited = 0;
          while (true) {
            const roster = state.tavernRoster ?? [];
            if (roster.length === 0) break;
            const affordable = roster
              .map((m, i) => ({ m, i, cost: economy.recruitCost(m) }))
              .filter(x => state.crumbs >= x.cost)
              .sort((a, b) => a.cost - b.cost);
            if (affordable.length === 0) break;
            const { m: member, i: idx } = affordable[0];
            if (economy.tryRecruit(member)) {
              state.team = state.team ?? [];
              state.team.push(member);
              roster.splice(idx, 1);
              recruited++;
            } else {
              break;
            }
          }
          if (recruited > 0) {
            workModeLog(`Auto: recruited ${recruited} member${recruited > 1 ? 's' : ''}`);
          }
        }

        // Auto-shop and auto-talisman in work mode too
        await autoShopTick();
        await autoTalismanTick();

        // Auto enter dungeon immediately if team and no dungeon in progress
        // Only enter if no more affordable recruits (buy all first)
        if ((state.team ?? []).length > 0 && !state.dungeonProgress && !dungeonTimer) {
          const roster = state.tavernRoster ?? [];
          const canAfford = roster.some(m => state.crumbs >= economy.recruitCost(m));
          if (!canAfford) {
            await enterDungeon();
            workModeLog('Auto: entering dungeon');
          }
        }
        return;
      }

      if (currentState === GameState.DUNGEON) {
        // Simulate enter key to interact every 4s
        if (now - workModeLastRoomAdvance >= 4000) {
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
              state.stats.dungeonsCleared = (state.stats.dungeonsCleared ?? 0) + 1;
              if (state._dungeonRunStats) state._dungeonRunStats.success = true;
              state.dungeonProgress = null;
              workModeLog('Auto: dungeon cleared!');
              try { await engine.transition(GameState.DUNGEON_SUMMARY); } catch { /* ignore */ }
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
            const defeatedEnemies = activeCombat.combatants.filter(c => c.side === 'enemy');
            const drops = [];
            const currentRoom = dp?.rooms?.find(r => r.id === dp?.currentRoom);
            const roomType = currentRoom?.type ?? 'monster';
            for (const enemy of defeatedEnemies) {
              const enemyDrops = generateEnemyDrops({ enemy, level, rng });
              for (const item of enemyDrops) {
                item.source = roomType === 'boss' ? 'boss' : roomType === 'miniboss' ? 'miniboss' : null;
              }
              drops.push(...enemyDrops);
            }
            state.pendingLoot = drops;
            for (const m of (state.team ?? []).filter(t => t.currentHp > 0)) {
              awardXP(m, level);
            }
            if (state._dungeonRunStats) {
              state._dungeonRunStats.monstersSlain += defeatedEnemies.length;
              state._dungeonRunStats.lootCollected.push(...drops);
            }
            if (dp) clearRoom(dp, dp.currentRoom);
            removeTalismanCombatBuffs();
            removeShopBuffs();
            activeCombat = null;
            rollBar = null;
            workModeLog('Auto: combat victory!');
            await engine.transition(GameState.LOOT);
          } else if (attackResult.outcome === 'defeat') {
            state.stats.deaths = (state.stats.deaths ?? 0) + 1;
            const dungeonLevel = state.dungeonProgress?.level ?? 1;
            const penalty = storyManager.applyDeathPenalty(dungeonLevel);
            const talismanDeathReward = awardDeathReward(state);
            state.lastTalismanDeathReward = talismanDeathReward;
            const salvaged = salvageLoot(state, rng);
            state.lastSalvagedLoot = salvaged;
            storyManager.addStoryEntry(`Your team has fallen! Lost ${penalty} crumbs.`, 'combat');
            graveyard.recordWipe(state.team, state.lastDungeonSeed ?? 0);
            economy.activateWipeDiscount();
            removeTalismanCombatBuffs();
            removeShopBuffs();
            activeCombat = null;
            rollBar = null;
            if (state._dungeonRunStats) {
              state._dungeonRunStats.success = false;
              state._dungeonRunStats.deathPenalty = penalty;
              state._dungeonRunStats.alliesLost += (state.team ?? []).length;
              state._dungeonRunStats.fallenNames.push(...(state.team ?? []).map(m => `${m.name} the ${m.class}`));
            }
            workModeLog(`Auto: team defeated, salvaged ${salvaged.length} items`);
            await engine.transition(GameState.DUNGEON_SUMMARY);
          } else if (attackResult.error) {
            // Combat stuck — force recovery
            removeTalismanCombatBuffs();
            activeCombat = null;
            rollBar = null;
            workModeLog('Auto: combat error, recovering');
            if (state.dungeonProgress) {
              try { await engine.transition(GameState.DUNGEON); } catch { /* ignore */ }
            } else {
              try { await engine.transition(GameState.TAVERN); } catch { /* ignore */ }
            }
          }
        } else {
          // No active combat but stuck in COMBAT state — recover
          removeTalismanCombatBuffs();
          activeCombat = null;
          rollBar = null;
          if (state.dungeonProgress) {
            try { await engine.transition(GameState.DUNGEON); } catch {
              try { await engine.transition(GameState.TAVERN); } catch { /* stuck */ }
            }
          } else {
            try { await engine.transition(GameState.TAVERN); } catch { /* stuck */ }
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

        if (now - workModeLastLootAction >= 1000) {
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
        if (now - workModeLastDeathRecover >= 4000) {
          workModeLastDeathRecover = now;
          // Clear team and recover
          state.team = [];
          state.dungeonProgress = null;
          // Regenerate tavern roster
          state.tavernRoster = applyVillageRecruitBonus(generateTavernRoster(rng));
          workModeLog('Auto: recovering from death, new roster generated');
          try { await engine.transition(GameState.TAVERN); } catch { /* ignore */ }
        }
        return;
      }

      if (currentState === GameState.DUNGEON_SUMMARY) {
        if (now - workModeLastDeathRecover >= 3000) {
          workModeLastDeathRecover = now;
          const wasDefeat = state._dungeonRunStats && !state._dungeonRunStats.success;
          state._dungeonRunStats = null;
          if (wasDefeat) {
            state.team = [];
            state.dungeonProgress = null;
            state.tavernRoster = applyVillageRecruitBonus(generateTavernRoster(rng));
            workModeLog('Auto: summary done, recovering from death');
          } else {
            state.dungeonProgress = null;
            state.tavernRoster = applyVillageRecruitBonus(generateTavernRoster(rng));
            workModeLog('Auto: summary done, returning to tavern');
          }
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

  // ── Auto-dungeon for default mode ────────────────────────────────
  // When game.autoDungeon setting is on (default), dungeon/combat/loot
  // auto-resolve like work mode — the player only manages the tavern manually.

  let autoDungeonLastRoomAdvance = 0;
  let autoDungeonLastLootAction = 0;
  let autoDungeonLastDeathRecover = 0;

  /** Check if security alerts should pause auto-gameplay and cutscenes. */
  function isSecurityPaused() {
    const aiMonitorEnabled = settings.get('security.aiMonitor') ?? true;
    if (!aiMonitorEnabled) return false;
    const alerts = state.securityAlerts ?? [];
    if (alerts.length === 0) return false;
    // Only pause on unresolved (non-dismissed) alerts
    const unresolved = alerts.filter(a => !a.dismissed);
    return unresolved.length > 0;
  }

  function isAutoDungeon() {
    return !isWorkMode() && (settings.get('game.autoDungeon') ?? true);
  }

  async function autoDungeonTick() {
    if (!isAutoDungeon()) return;
    // Cutscenes auto-advance on their own timer — don't interfere
    if (state.currentState === GameState.CUTSCENE) return;
    // Security pause — stop auto-gameplay when unresolved security alerts exist
    if (isSecurityPaused()) return;
    const now = Date.now();
    const currentState = state.currentState;

    try {
      if (currentState === GameState.DUNGEON) {
        if (now - autoDungeonLastRoomAdvance >= 4000) {
          autoDungeonLastRoomAdvance = now;
          const dp = state.dungeonProgress;
          if (dp) {
            const room = dp.rooms?.find(r => r.id === dp.currentRoom);
            const conns = room?.connections ?? [];
            if (conns.length > 1) {
              const uiState = getUIState();
              uiState.dungeonChoice = rng.int(0, conns.length - 1);
            }
            if (conns.length === 0 && !room?.content) {
              state.stats.dungeonsCleared = (state.stats.dungeonsCleared ?? 0) + 1;
              if (state._dungeonRunStats) state._dungeonRunStats.success = true;
              const completeBiome = dp.biome ?? 'cave';
              const completeSeed = dp.dungeonSeed ?? 0;
              state.dungeonProgress = null;
              const frames = [...getDungeonCompleteCutscene(completeBiome, completeSeed), ...getVictoryEndingCutscene(completeBiome, completeSeed + 7)];
              startCutscene(frames, GameState.DUNGEON_SUMMARY);
              return;
            }
          }
          await handleKey({ key: 'enter' });
        }
        return;
      }

      if (currentState === GameState.COMBAT) {
        // Auto-combat already runs via combatAutoTimer in gameLoop — no extra action needed
        // But if combat is finished and stuck, recover
        if (activeCombat && activeCombat.isFinished) {
          activeCombat = null;
          rollBar = null;
          if (state.dungeonProgress) {
            try { await engine.transition(GameState.DUNGEON); } catch { /* ignore */ }
          } else {
            try { await engine.transition(GameState.TAVERN); } catch { /* ignore */ }
          }
        } else if (!activeCombat) {
          if (state.dungeonProgress) {
            try { await engine.transition(GameState.DUNGEON); } catch {
              try { await engine.transition(GameState.TAVERN); } catch { /* stuck */ }
            }
          } else {
            try { await engine.transition(GameState.TAVERN); } catch { /* stuck */ }
          }
        }
        return;
      }

      if (currentState === GameState.LOOT) {
        // Auto-resolve spin wheel
        if (state.spinWheel) {
          if (state.spinWheel.selectedIdx < 0) {
            const prizes = state.spinWheel.prizes;
            state.spinWheel.selectedIdx = rng.int(0, prizes.length - 1);
          }
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

        if (now - autoDungeonLastLootAction >= 1000) {
          autoDungeonLastLootAction = now;
          const loot = state.pendingLoot ?? [];
          if (loot.length > 0) {
            const item = loot[0];
            const slot = item.slot ?? 'weapon';
            const member = (state.team ?? []).find(m => m.currentHp > 0 && !m.equipment?.[slot]);
            if (member) {
              member.equipment = member.equipment ?? {};
              member.equipment[slot] = item;
            } else {
              economy.sellItem(item);
            }
            loot.splice(0, 1);
          } else {
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
        if (now - autoDungeonLastDeathRecover >= 4000) {
          autoDungeonLastDeathRecover = now;
          state.team = [];
          state.dungeonProgress = null;
          state.tavernRoster = applyVillageRecruitBonus(generateTavernRoster(rng));
          try { await engine.transition(GameState.TAVERN); } catch { /* ignore */ }
        }
        return;
      }

      if (currentState === GameState.DUNGEON_SUMMARY) {
        if (now - autoDungeonLastDeathRecover >= 3000) {
          autoDungeonLastDeathRecover = now;
          const wasDefeat = state._dungeonRunStats && !state._dungeonRunStats.success;
          state._dungeonRunStats = null;
          if (wasDefeat) {
            state.team = [];
            state.dungeonProgress = null;
            state.tavernRoster = applyVillageRecruitBonus(generateTavernRoster(rng));
          } else {
            state.dungeonProgress = null;
            state.tavernRoster = applyVillageRecruitBonus(generateTavernRoster(rng));
          }
          try { await engine.transition(GameState.TAVERN); } catch { /* ignore */ }
        }
        return;
      }
    } catch (err) {
      if (debug) process.stderr.write(`[auto-dungeon] ${err.message}\n`);
    }
  }

  // ── Auto-recruit & Auto-equip for default mode ───────────────────
  let autoRecruitLast = 0;
  let autoEquipLast = 0;
  let autoShopLast = 0;
  let autoTalismanLast = 0;

  /**
   * Auto-recruit: buy ALL affordable members from the roster each tick.
   * Runs every 2s on the tavern screen when game.autoRecruit is enabled.
   * Only starts the dungeon timer once no more affordable recruits remain.
   */
  async function autoRecruitTick() {
    if (isWorkMode()) return; // work mode has its own recruit
    if (!(settings.get('game.autoRecruit') ?? false)) return;
    if (state.currentState !== GameState.TAVERN) return;

    const now = Date.now();
    if (now - autoRecruitLast < 2000) return;
    autoRecruitLast = now;

    const roster = state.tavernRoster ?? [];
    if (roster.length === 0) {
      // No recruits left — start dungeon timer if we have a team
      if ((state.team ?? []).length > 0 && !dungeonTimer) {
        if (state.dungeonProgress) state.dungeonProgress = null;
        startDungeonTimer();
      }
      return;
    }

    // Find affordable members, sort by chosen strategy
    const sortMode = settings.get('game.recruitSort') ?? 'totalStats';
    let recruited = 0;

    // Keep buying the best affordable recruit until none remain or can't afford
    while (true) {
      const currentRoster = state.tavernRoster ?? [];
      if (currentRoster.length === 0) break;

      const affordable = currentRoster
        .map((m, i) => {
          const total = m.stats.hp + m.stats.atk + m.stats.def + m.stats.spd + m.stats.lck;
          const cost = economy.recruitCost(m);
          const primary = CLASSES[m.class]?.primary ?? 'atk';
          return { m, i, cost, total, primary, primaryVal: m.stats[primary] ?? 0 };
        })
        .filter(x => state.crumbs >= x.cost)
        .sort((a, b) => {
          switch (sortMode) {
            case 'atk': return b.m.stats.atk - a.m.stats.atk;
            case 'def': return b.m.stats.def - a.m.stats.def;
            case 'hp': return b.m.stats.hp - a.m.stats.hp;
            case 'spd': return b.m.stats.spd - a.m.stats.spd;
            case 'lck': return b.m.stats.lck - a.m.stats.lck;
            case 'primary': return b.primaryVal - a.primaryVal;
            case 'efficiency': return (b.total / b.cost) - (a.total / a.cost);
            default: return b.total - a.total; // totalStats
          }
        });

      if (affordable.length === 0) break;

      const { m: member, i: idx } = affordable[0];
      if (economy.tryRecruit(member)) {
        state.team = state.team ?? [];
        state.team.push(member);
        currentRoster.splice(idx, 1);
        logAdventure(`Auto-recruited ${member.name} the ${member.race} ${member.class}`, 'recruit');
        state.stats.totalRecruits = (state.stats.totalRecruits ?? 0) + 1;
        recruited++;
        tutorial.advance('recruit');
      } else {
        break; // Can't afford — stop
      }
    }

    if (recruited > 0) {
      renderer.showNotification(`Auto: recruited ${recruited} member${recruited > 1 ? 's' : ''}!`, 'info');
    }

    // Only start dungeon timer after buying all we can afford
    if ((state.team ?? []).length > 0 && !dungeonTimer) {
      if (state.dungeonProgress) state.dungeonProgress = null;
      startDungeonTimer();
    }
  }

  /**
   * Auto-equip: equip best gear from inventory to team.
   * Runs every 3s when game.autoEquip is enabled.
   */
  async function autoEquipTick() {
    if (!(settings.get('game.autoEquip') ?? true)) return;
    if (state.currentState !== GameState.TAVERN) return;

    const now = Date.now();
    if (now - autoEquipLast < 3000) return;
    autoEquipLast = now;

    const team = state.team ?? [];
    const inv = state.inventory ?? [];
    if (team.length === 0) return;

    const equipMode = settings.get('game.equipStrategy') ?? 'power';
    const RARITY_ORDER = { Common: 0, Uncommon: 1, Rare: 2, Epic: 3, Legendary: 4 };

    for (const slot of ['weapon', 'armor', 'accessory']) {
      const slotItems = inv
        .map((item, i) => ({ item, i }))
        .filter(x => x.item.slot === slot)
        .sort((a, b) => {
          switch (equipMode) {
            case 'rarity': {
              const rd = (RARITY_ORDER[b.item.rarity] ?? 0) - (RARITY_ORDER[a.item.rarity] ?? 0);
              return rd !== 0 ? rd : (b.item.power ?? 0) - (a.item.power ?? 0);
            }
            case 'primaryStat': {
              const aSum = Object.values(a.item.statBonus ?? {}).reduce((s, v) => s + v, 0);
              const bSum = Object.values(b.item.statBonus ?? {}).reduce((s, v) => s + v, 0);
              return bSum - aSum;
            }
            case 'value':
              return (b.item.value ?? 0) - (a.item.value ?? 0);
            case 'teamNeed': {
              const teamAvg = stat => {
                const vals = team.filter(m => m.alive).map(m => m.stats[stat] ?? 0);
                return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
              };
              const aScore = Object.entries(a.item.statBonus ?? {})
                .reduce((s, [stat, val]) => s + val * (1 / Math.max(1, teamAvg(stat))), 0);
              const bScore = Object.entries(b.item.statBonus ?? {})
                .reduce((s, [stat, val]) => s + val * (1 / Math.max(1, teamAvg(stat))), 0);
              return bScore - aScore;
            }
            default: // power
              return (b.item.power ?? 0) - (a.item.power ?? 0);
          }
        });

      for (const { item } of slotItems) {
        const alive = team.filter(m => m.alive && m.currentHp > 0 && canEquip(m, item));
        let bestMember = alive.find(m => !m.equipment?.[slot]);
        if (!bestMember) {
          bestMember = alive.find(m => {
            const current = m.equipment?.[slot];
            if (!current) return true;
            if (equipMode === 'rarity') {
              return (RARITY_ORDER[item.rarity] ?? 0) > (RARITY_ORDER[current.rarity] ?? 0);
            }
            return (item.power ?? 0) > (current.power ?? 0);
          });
        }
        if (bestMember) {
          const prev = equipItem(bestMember, item);
          const actualIdx = inv.indexOf(item);
          if (actualIdx >= 0) inv.splice(actualIdx, 1);
          if (prev) inv.push(prev);
          logAdventure(`Auto-equipped ${item.name} on ${bestMember.name}`, 'loot');
          renderer.showNotification(`Auto: ${bestMember.name} equipped ${item.name}`, 'info');
        }
      }
    }
  }

  /**
   * Auto-shop: buy heal potions, combat buffs, and enchant scrolls.
   * Runs every 3s when game.autoShop is enabled. Budget-capped.
   */
  async function autoShopTick() {
    if (!(settings.get('game.autoShop') ?? true)) return;
    if (state.currentState !== GameState.TAVERN) return;

    const now = Date.now();
    if (now - autoShopLast < 3000) return;
    autoShopLast = now;

    const team = state.team ?? [];
    if (team.length === 0) return;

    const budgetPct = settings.get('game.shopBudget') ?? 10;
    const budget = Math.floor(state.crumbs * (budgetPct / 100));
    let spent = 0;
    const canSpend = (cost) => cost <= (budget - spent) && state.crumbs >= cost;
    const doSpend = (cost) => { state.crumbs -= cost; spent += cost; state._lastCrumbSpend = Date.now(); state._lastCrumbSpendAmount = cost; };

    // Heal potions when any team member is below 50% HP
    const needsHeal = team.some(m => m.alive && m.currentHp > 0 && m.currentHp < m.maxHp * 0.5);
    if (needsHeal && canSpend(15)) {
      doSpend(15);
      for (const m of team.filter(m => m.currentHp > 0)) {
        m.currentHp = Math.min(m.maxHp, m.currentHp + 20);
      }
      logAdventure('Auto-bought Healing Potion: team healed +20 HP', 'shop');
      renderer.showNotification('Auto: team healed +20 HP!', 'success');
    }

    // Combat buffs (only if team alive)
    const buffs = state.shopBuffs ?? {};
    const aliveCount = team.filter(m => m.alive && m.currentHp > 0).length;
    if (aliveCount > 0) {
      if (!buffs.atk && canSpend(25)) {
        doSpend(25);
        state.shopBuffs = state.shopBuffs ?? {};
        state.shopBuffs.atk = (state.shopBuffs.atk ?? 0) + 3;
        logAdventure('Auto-bought Whetstone: +3 ATK for next combat', 'shop');
      }
      if (!buffs.def && canSpend(25)) {
        doSpend(25);
        state.shopBuffs = state.shopBuffs ?? {};
        state.shopBuffs.def = (state.shopBuffs.def ?? 0) + 3;
        logAdventure('Auto-bought Iron Shield Oil: +3 DEF for next combat', 'shop');
      }
      if (!buffs.lck && canSpend(40)) {
        doSpend(40);
        state.shopBuffs = state.shopBuffs ?? {};
        state.shopBuffs.lck = (state.shopBuffs.lck ?? 0) + 5;
        logAdventure('Auto-bought Lucky Charm: +5 LCK for next combat', 'shop');
      }
      // Enchant a random inventory item
      const enchantableInv = (state.inventory ?? []).filter(i => i.slot !== 'consumable');
      if (enchantableInv.length > 0 && canSpend(50)) {
        const target = enchantableInv[rng.int(0, enchantableInv.length - 1)];
        doSpend(50);
        enchantItem(target, 1);
        state.stats.highestEnchant = Math.max(state.stats.highestEnchant ?? 0, target.enchantLevel ?? 1);
        logAdventure(`Auto-enchanted ${target.name} with scroll (+2 power)`, 'enchant');
      }
    }
  }

  /**
   * Auto-talisman: upgrade talisman when affordable within budget.
   * Runs every 5s when game.autoTalisman is enabled. Budget-capped.
   */
  async function autoTalismanTick() {
    if (!(settings.get('game.autoTalisman') ?? true)) return;
    if (state.currentState !== GameState.TAVERN) return;

    const now = Date.now();
    if (now - autoTalismanLast < 5000) return;
    autoTalismanLast = now;

    const budgetPct = settings.get('game.talismanBudget') ?? 10;
    const budget = Math.floor(state.crumbs * (budgetPct / 100));
    const cost = getUpgradeCost(state.talisman?.level ?? 1);
    if (cost > 0 && cost <= budget && canUpgrade(state.talisman, state.crumbs)) {
      const result = upgradeTalisman(state);
      if (result.success) {
        logAdventure(`Auto-upgraded Talisman to level ${result.newLevel} (${result.cost}c)`, 'shop');
        renderer.showNotification(`Auto: Talisman -> Lv${result.newLevel}!`, 'success');
      }
    }
  }

  /** Handle combat end (victory or defeat) — shared logic for all combat paths. */
  async function handleCombatEnd(attackResult) {
    if (attackResult.outcome === 'victory') {
      state.stats.monstersSlain = (state.stats.monstersSlain ?? 0) + 1;
      const dp = state.dungeonProgress;
      const level = dp?.level ?? 1;
      const defeatedEnemies = activeCombat.combatants.filter(c => c.side === 'enemy');
      const drops = [];
      for (const enemy of defeatedEnemies) {
        const enemyDrops = generateEnemyDrops({ enemy, level, rng });
        // Tag loot with source for display
        const currentRoom = dp?.rooms?.find(r => r.id === dp?.currentRoom);
        const roomType = currentRoom?.type ?? 'monster';
        for (const item of enemyDrops) {
          item.source = roomType === 'boss' ? 'boss' : roomType === 'miniboss' ? 'miniboss' : null;
        }
        drops.push(...enemyDrops);
      }
      state.pendingLoot = drops;

      // Track boss kills and flawless victories
      const bossDefeated = defeatedEnemies.some(e => e.isBoss);
      if (bossDefeated) {
        state.stats.bossesDefeated = (state.stats.bossesDefeated ?? 0) + 1;
        if (state._dungeonRunStats) state._dungeonRunStats.bossesSlain++;
        const teamFallen = (state.team ?? []).filter(m => m.currentHp <= 0);
        if (teamFallen.length === 0) {
          state.stats.flawlessBossKills = (state.stats.flawlessBossKills ?? 0) + 1;
          if (!hasTrophy(state, 'flawless')) {
            const t = awardTrophy(state, 'flawless');
            if (t) {
              renderer.showNotification(`Trophy: ${t.name} — ${t.desc}`, 'success');
              logAdventure(`Trophy: ${t.name} — ${t.desc}`, 'trophy');
            }
          }
        }
      }

      // Track legendary loot finds
      for (const item of drops) {
        if (item.rarity === 'Legendary') {
          state.stats.legendariesFound = (state.stats.legendariesFound ?? 0) + 1;
        }
      }
      const vbXp = getVillageBonuses(state);
      for (const m of (state.team ?? []).filter(t => t.currentHp > 0)) {
        awardXP(m, level);
        // Village training ground XP bonus
        if (vbXp.xpMultiplier > 0) {
          const bonusXp = Math.floor(10 * level * vbXp.xpMultiplier);
          m.xp += bonusXp;
        }
      }

      // Track run stats
      if (state._dungeonRunStats) {
        state._dungeonRunStats.monstersSlain += defeatedEnemies.length;
        state._dungeonRunStats.lootCollected.push(...drops);
      }

      // Permanent death: remove fallen team members after victory
      const fallen = (state.team ?? []).filter(m => m.currentHp <= 0);
      if (fallen.length > 0) {
        if (state._dungeonRunStats) {
          state._dungeonRunStats.alliesLost += fallen.length;
          state._dungeonRunStats.fallenNames.push(...fallen.map(m => `${m.name} the ${m.class}`));
        }
        for (const dead of fallen) {
          // Return equipped items to inventory
          const eq = dead.equipment ?? {};
          for (const slot of ['weapon', 'armor', 'accessory']) {
            if (eq[slot]) {
              state.inventory = state.inventory ?? [];
              state.inventory.push(eq[slot]);
            }
          }
          logAdventure(`${dead.name} the ${dead.class} has fallen permanently`, 'death');
        }
        state.team = (state.team ?? []).filter(m => m.currentHp > 0);
        graveyard.recordWipe(fallen, state.lastDungeonSeed ?? 0);
        state.stats.permanentDeaths = (state.stats.permanentDeaths ?? 0) + fallen.length;
      }

      if (dp) clearRoom(dp, dp.currentRoom);
      removeTalismanCombatBuffs();
      removeShopBuffs();
      removeVillageCombatBuffs();
      logAdventure(`Victory! Slain enemies, found ${drops.length} loot${fallen.length > 0 ? ` (lost ${fallen.length} ally)` : ''}`, 'combat');

      // Determine room type for post-combat cutscene before clearing
      const currentRoom = dp?.rooms?.find(r => r.id === dp?.currentRoom);
      const wasBossRoom = currentRoom?.type === 'boss';
      const wasMinibossRoom = currentRoom?.type === 'miniboss';
      const biome = dp?.biome ?? 'cave';
      const roomSeed = (dp?.dungeonSeed ?? 0) + (currentRoom?.id ?? 0);

      activeCombat = null;
      rollBar = null;
      state._lastCombatRoll = null;

      // Post-boss/miniboss cutscenes before showing loot
      if (wasBossRoom) {
        const frames = getPostBossCutscene(biome, roomSeed);
        startCutscene(frames, GameState.LOOT);
      } else if (wasMinibossRoom) {
        const frames = getPostMinibossCutscene(biome, roomSeed);
        startCutscene(frames, GameState.LOOT);
      } else {
        await engine.transition(GameState.LOOT);
      }
    } else if (attackResult.outcome === 'defeat') {
      state.stats.deaths = (state.stats.deaths ?? 0) + 1;
      const dungeonLevel = state.dungeonProgress?.level ?? 1;
      const penalty = storyManager.applyDeathPenalty(dungeonLevel);
      const talismanDeathReward = awardDeathReward(state);
      state.lastTalismanDeathReward = talismanDeathReward;
      const salvaged = salvageLoot(state, rng);
      state.lastSalvagedLoot = salvaged;
      storyManager.addStoryEntry(`Your team has fallen! Lost ${penalty} crumbs.`, 'combat');
      graveyard.recordWipe(state.team, state.lastDungeonSeed ?? 0);
      economy.activateWipeDiscount();
      removeTalismanCombatBuffs();
      removeShopBuffs();
      removeVillageCombatBuffs();
      logAdventure(`Defeat! Team wiped, lost ${penalty} crumbs`, 'death');
      activeCombat = null;
      rollBar = null;
      state._lastCombatRoll = null;
      if (state._dungeonRunStats) {
        state._dungeonRunStats.success = false;
        state._dungeonRunStats.deathPenalty = penalty;
        state._dungeonRunStats.alliesLost += (state.team ?? []).length;
        state._dungeonRunStats.fallenNames.push(...(state.team ?? []).map(m => `${m.name} the ${m.class}`));
      }
      // Play comedic defeat ending cutscene before summary
      const defeatBiome = state.dungeonProgress?.biome ?? 'cave';
      const defeatSeed = state.lastDungeonSeed ?? 0;
      const defeatFrames = getDefeatEndingCutscene(defeatBiome, defeatSeed);
      startCutscene(defeatFrames, GameState.DUNGEON_SUMMARY);
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
    // Initialize run summary for this dungeon
    state._dungeonRunStats = {
      crumbsBefore: state.crumbs ?? 0,
      roomsCleared: 0,
      monstersSlain: 0,
      bossesSlain: 0,
      lootCollected: [],
      lootSold: 0,
      xpEarned: 0,
      alliesLost: 0,
      fallenNames: [],
    };
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
          const biome = state.dungeonProgress.biome ?? 'cave';
          const enemies = generateRoomEnemies({ biome, level: roomLevel, rng, roomType: isBoss ? 'boss' : 'monster' });
          room.enemy = enemies[0] ?? generateEnemy({ biome, level: roomLevel, rng });
          room.enemies = enemies;
        } else if (room.type === 'loot') {
          room.content = 'loot';
          const bonuses = settings.getBonuses();
          const talismanLoot = getTalismanBonuses(state.talisman?.level ?? 1).lootQuality;
          const villageLoot = getVillageBonuses(state).lootQuality;
          room.loot = [generateLoot({ level: dungeonLevel, rng, qualityBonus: bonuses.lootFindBonus + talismanLoot + villageLoot, usedSignatures })].filter(Boolean);
          for (const item of room.loot) { item.source = 'chest'; }
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
      logAdventure(`Entered dungeon level ${dungeonLevel} (biome: ${state.dungeonProgress.biome ?? 'cave'})`, 'dungeon');
      // Play dungeon intro cutscene
      const introFrames = getDungeonIntroCutscene(state.dungeonProgress.biome ?? 'cave', dungeonSeed);
      startCutscene(introFrames, GameState.DUNGEON);
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
    // Work mode: Q key returns to menu (pauses auto-play)
    if (state.gameMode === 'work' && event.key === 'q') {
      workModePaused = true;
      removeTalismanCombatBuffs();
      removeShopBuffs();
      removeVillageCombatBuffs();
      activeCombat = null;
      rollBar = null;
      state._lastCombatRoll = null;
      state.dungeonProgress = null;
      dungeonTimer = null;
      saveGame(slot, engine.getState());
      await engine.transition(GameState.MENU);
      return;
    }

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
      const talismanCrumb = getTalismanBonuses(state.talisman?.level ?? 1).crumbBonus;
      const earned = cookie.click();
      const boosted = Math.floor(earned * (bonuses.crumbMultiplier + talismanCrumb));
      state.crumbs += (boosted - earned); // add bonus portion
      tutorial.advance('click_cookie');
    } else if (result === 'village_unlock') {
      if (unlockVillage(state)) {
        renderer.showNotification('Village founded! Bakery built for free.', 'success');
        logAdventure('Founded a village! Bakery built.', 'village');
      }
    } else if (result?.action === 'village_build') {
      const buildingIds = getBuildingIds();
      const buildingId = buildingIds[result.buildingIndex];
      if (buildingId) {
        const res = upgradeBuilding(state, buildingId);
        if (res.success) {
          renderer.showNotification(`${buildingId} upgraded to Lv${res.newLevel}! Cost: ${res.cost} crumbs`, 'success');
          logAdventure(`Village: upgraded ${buildingId} to level ${res.newLevel} for ${res.cost} crumbs`, 'village');
        } else {
          renderer.showNotification(res.error || 'Cannot build!', 'warn');
        }
      }
    } else if (result === 'talisman_upgrade') {
      const upgraded = upgradeTalisman(state);
      if (upgraded.success) {
        renderer.showNotification(`Talisman upgraded to level ${upgraded.newLevel}! Cost: ${upgraded.cost} crumbs`, 'success');
      } else {
        renderer.showNotification('Cannot upgrade talisman — not enough crumbs or already max level.', 'warn');
      }
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
          logAdventure(`Recruited ${member.name} the ${member.race} ${member.class} for ${cost} crumbs`, 'recruit');
          state.stats.totalRecruits = (state.stats.totalRecruits ?? 0) + 1;
          tutorial.advance('recruit');
          // Start dungeon auto-timer after first recruit (if not already running)
          if (!dungeonTimer) {
            if (state.dungeonProgress) state.dungeonProgress = null;
            startDungeonTimer();
          }
        }
      }
    } else if (result === 'roll_stop') {
      // Legacy roll_stop: treat as speed-up
      if (activeCombat && !activeCombat.isFinished) {
        const attackResult = activeCombat.autoAttack();
        if (attackResult.roll) {
          state._lastCombatRoll = { ...attackResult.roll, attacker: attackResult.attacker, target: attackResult.target, damage: attackResult.damage ?? attackResult.selfDamage ?? 0, modifier: Math.floor((activeCombat.currentTurn()?.stats?.atk ?? 5) / 4) };
        }
        if (attackResult.outcome === 'victory' || attackResult.outcome === 'defeat') {
          await handleCombatEnd(attackResult);
        }
      }
    } else if (result === 'attack' && activeCombat && !activeCombat.isFinished) {
      // Instant resolve entire combat
      const resolution = activeCombat.autoResolveAll();
      state._lastCombatRoll = null;
      await handleCombatEnd(resolution);
    } else if (result === 'loot_equip' || result === 'loot_sell' || result === 'loot_discard') {
      const ui = getUIState();
      const loot = state.pendingLoot ?? [];
      const item = loot[ui.lootIndex];
      if (item) {
        if (result === 'loot_sell') {
          const earned = economy.sellItem(item);
          if (state._dungeonRunStats) state._dungeonRunStats.lootSold += (earned || 0);
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
    } else if (result === 'combat_speed_up') {
      // Speed up: do one immediate auto-attack
      if (activeCombat && !activeCombat.isFinished) {
        const attackResult = activeCombat.autoAttack();
        if (attackResult.roll) {
          state._lastCombatRoll = { ...attackResult.roll, attacker: attackResult.attacker, target: attackResult.target, damage: attackResult.damage ?? attackResult.selfDamage ?? 0, modifier: Math.floor((activeCombat.currentTurn()?.stats?.atk ?? 5) / 4) };
        }
        if (attackResult.outcome === 'victory' || attackResult.outcome === 'defeat') {
          await handleCombatEnd(attackResult);
        }
      }
    } else if (result?.action === 'shop_buy') {
      const SHOP_ITEMS = [
        { id: 'heal_potion',   cost: 15 },
        { id: 'whetstone',     cost: 25 },
        { id: 'iron_shield',   cost: 25 },
        { id: 'lucky_charm',   cost: 40 },
        { id: 'enchant_scroll',cost: 50 },
        { id: 'reroll_roster', cost: 30 },
      ];
      const shopItem = SHOP_ITEMS[result.index];
      if (shopItem && state.crumbs >= shopItem.cost) {
        state.crumbs -= shopItem.cost;
        state._lastCrumbSpend = Date.now();
        state._lastCrumbSpendAmount = shopItem.cost;
        if (shopItem.id === 'heal_potion') {
          for (const m of (state.team ?? []).filter(m => m.currentHp > 0)) {
            m.currentHp = Math.min(m.maxHp, m.currentHp + 20);
          }
          logAdventure('Used Healing Potion: team healed +20 HP', 'shop');
          renderer.showNotification('Team healed +20 HP each!', 'success');
        } else if (shopItem.id === 'whetstone') {
          state.shopBuffs = state.shopBuffs ?? {};
          state.shopBuffs.atk = (state.shopBuffs.atk ?? 0) + 3;
          logAdventure('Bought Whetstone: +3 ATK for next combat', 'shop');
          renderer.showNotification('+3 ATK buff for next combat!', 'success');
        } else if (shopItem.id === 'iron_shield') {
          state.shopBuffs = state.shopBuffs ?? {};
          state.shopBuffs.def = (state.shopBuffs.def ?? 0) + 3;
          logAdventure('Bought Iron Shield Oil: +3 DEF for next combat', 'shop');
          renderer.showNotification('+3 DEF buff for next combat!', 'success');
        } else if (shopItem.id === 'lucky_charm') {
          state.shopBuffs = state.shopBuffs ?? {};
          state.shopBuffs.lck = (state.shopBuffs.lck ?? 0) + 5;
          logAdventure('Bought Lucky Charm: +5 LCK for next combat', 'shop');
          renderer.showNotification('+5 LCK buff for next combat!', 'success');
        } else if (shopItem.id === 'enchant_scroll') {
          const inv = state.inventory ?? [];
          const equipable = inv.filter(i => i.slot !== 'consumable');
          if (equipable.length > 0) {
            const target = equipable[rng.int(0, equipable.length - 1)];
            enchantItem(target, 1);
            state.stats.highestEnchant = Math.max(state.stats.highestEnchant ?? 0, target.enchantLevel ?? 1);
            logAdventure(`Enchanted ${target.name} with scroll (+2 power)`, 'enchant');
            renderer.showNotification(`Enchanted ${target.name}!`, 'success');
          } else {
            renderer.showNotification('No items to enchant! Find loot first.', 'warn');
            state.crumbs += shopItem.cost; // refund
          }
        } else if (shopItem.id === 'reroll_roster') {
          state.tavernRoster = applyVillageRecruitBonus(generateTavernRoster(rng));
          logAdventure('Refreshed tavern recruit roster', 'shop');
          renderer.showNotification('New recruits available!', 'success');
        }
      } else {
        renderer.showNotification('Not enough crumbs!', 'warn');
      }
    } else if (result?.action === 'trophy_buy') {
      const buyable = getBuyableTrophies(state);
      const trophy = buyable[result.index];
      if (trophy && state.crumbs >= trophy.cost) {
        state.crumbs -= trophy.cost;
        state._lastCrumbSpend = Date.now();
        state._lastCrumbSpendAmount = trophy.cost;
        awardTrophy(state, trophy.id);
        logAdventure(`Bought trophy: ${trophy.name} for ${trophy.cost.toLocaleString()} crumbs`, 'trophy');
        renderer.showNotification(`Trophy acquired: ${trophy.name}!`, 'success');
      } else if (trophy) {
        renderer.showNotification(`Not enough crumbs! Need ${trophy.cost.toLocaleString()}`, 'warn');
      }
    } else if (result?.action === 'inv_enchant') {
      const inv = state.inventory ?? [];
      const item = inv[result.index];
      if (item && item.slot !== 'consumable') {
        const rawCost = enchantCost(item);
        const villageDisc = getVillageBonuses(state).enchantDiscount;
        const cost = Math.max(1, Math.round(rawCost * (1 - villageDisc)));
        if (state.crumbs >= cost) {
          state.crumbs -= cost;
          state._lastCrumbSpend = Date.now();
          state._lastCrumbSpendAmount = cost;
          enchantItem(item, 1);
          state.stats.highestEnchant = Math.max(state.stats.highestEnchant ?? 0, item.enchantLevel ?? 1);
          logAdventure(`Enchanted ${item.name} for ${cost} crumbs`, 'enchant');
          renderer.showNotification(`Enchanted ${item.name}! (+2 power)`, 'success');
        } else {
          renderer.showNotification(`Need ${cost} crumbs to enchant (have ${state.crumbs})`, 'warn');
        }
      }
    } else if (result?.action === 'inv_equip_to') {
      // Equip to a specific team member (from picker)
      const inv = state.inventory ?? [];
      const item = inv[result.index];
      const team = state.team ?? [];
      const member = team[result.memberIndex];
      if (item && member && item.slot !== 'consumable') {
        const prev = equipItem(member, item);
        inv.splice(result.index, 1);
        if (prev) inv.push(prev);
        logAdventure(`Equipped ${item.name} on ${member.name}`, 'loot');
        renderer.showNotification(`${member.name} equipped ${item.name}!`, 'success');
      } else if (item && item.slot === 'consumable') {
        renderer.showNotification('Cannot equip consumables!', 'warn');
      } else if (!member) {
        renderer.showNotification('No team member selected!', 'warn');
      }
    } else if (result?.action === 'inv_equip') {
      const inv = state.inventory ?? [];
      const item = inv[result.index];
      if (item && item.slot !== 'consumable') {
        // Equip to first team member who benefits or has empty slot
        const team = state.team ?? [];
        let bestMember = team.find(m => m.currentHp > 0 && !m.equipment?.[item.slot]);
        if (!bestMember) bestMember = team.find(m => m.currentHp > 0);
        if (bestMember) {
          const prev = equipItem(bestMember, item);
          inv.splice(result.index, 1);
          if (prev) inv.push(prev);
          logAdventure(`Equipped ${item.name} on ${bestMember.name}`, 'loot');
          renderer.showNotification(`${bestMember.name} equipped ${item.name}!`, 'success');
        } else {
          renderer.showNotification('No team members to equip!', 'warn');
        }
      }
    } else if (result?.action === 'party_unequip') {
      // Unequip an item from a specific team member's slot
      const team = state.team ?? [];
      const member = team[result.memberIndex];
      const slots = ['weapon', 'armor', 'accessory'];
      const slotName = slots[result.slot];
      if (member && slotName) {
        const eq = member.equipment ?? {};
        const item = eq[slotName];
        if (item) {
          // Remove stat bonuses
          for (const [stat, val] of Object.entries(item.statBonus || {})) {
            if (member.stats[stat] !== undefined) {
              member.stats[stat] -= val;
            }
          }
          delete eq[slotName];
          state.inventory = state.inventory ?? [];
          state.inventory.push(item);
          logAdventure(`${member.name} unequipped ${item.name}`, 'loot');
          renderer.showNotification(`${member.name} unequipped ${item.name} → inventory`, 'info');
        } else {
          renderer.showNotification('Nothing equipped in that slot!', 'warn');
        }
      }
    } else if (result?.action === 'inv_sell') {
      const inv = state.inventory ?? [];
      const item = inv[result.index];
      if (item) {
        const earned = economy.sellItem(item);
        // Village merchant guild sell bonus
        const sellMul = getVillageBonuses(state).sellMultiplier;
        const bonus = sellMul > 0 ? Math.max(1, Math.floor(earned * sellMul)) : 0;
        if (bonus > 0) { state.crumbs += bonus; state.stats.crumbsEarned = (state.stats.crumbsEarned ?? 0) + bonus; }
        inv.splice(result.index, 1);
        const totalEarned = earned + bonus;
        logAdventure(`Sold ${item.name} for ${totalEarned} crumbs`, 'shop');
        renderer.showNotification(`Sold ${item.name} for ${totalEarned} crumbs${bonus > 0 ? ` (+${bonus} guild)` : ''}`, 'info');
      }
    } else if (result?.action === 'inv_drop') {
      const inv = state.inventory ?? [];
      const item = inv[result.index];
      if (item) {
        inv.splice(result.index, 1);
        renderer.showNotification(`Dropped ${item.name}`, 'info');
      }
    } else if (result === 'cutscene_skip') {
      skipCutscene();
    } else if (result === 'dismiss_security') {
      // Mark all security alerts as dismissed — resumes auto-gameplay and cutscenes
      const alerts = state.securityAlerts ?? [];
      for (const a of alerts) a.dismissed = true;
      renderer.showNotification('Security alerts dismissed', 'info');
    } else if (result === 'summary_continue') {
      // From dungeon summary → tavern (success path)
      state._dungeonRunStats = null;
      state.dungeonProgress = null;
      state.tavernRoster = applyVillageRecruitBonus(generateTavernRoster(rng));
      await engine.transition(GameState.TAVERN);
    } else if (result === 'summary_death_continue') {
      // From dungeon summary → tavern (death path — clear team, regenerate roster)
      state._dungeonRunStats = null;
      state.team = [];
      state.dungeonProgress = null;
      state.tavernRoster = applyVillageRecruitBonus(generateTavernRoster(rng));
      await engine.transition(GameState.TAVERN);
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
          const isBossRoom = room.type === 'boss';
          const isMinibossRoom = room.type === 'miniboss';
          const biome = dp.biome ?? 'cave';
          const roomSeed = (dp.dungeonSeed ?? 0) + (room.id ?? 0);

          // Prepare combat start as a callback after cutscene
          const beginCombat = () => {
            applyTalismanCombatBuffs();
            applyShopBuffs();
            applyVillageCombatBuffs();
            activeCombat = createCombat({
              team: state.team,
              enemies,
              rng,
            });
            combatAutoTimer = 0;
            rollBar = null;
            logAdventure(`Combat! Facing ${enemies.map(e => e.name).join(', ')}`, 'combat');
          };

          // Boss/miniboss get pre-combat cutscenes
          if (isBossRoom) {
            const frames = getPreBossCutscene(biome, roomSeed);
            startCutscene(frames, GameState.COMBAT, beginCombat);
          } else if (isMinibossRoom) {
            const frames = getPreMinibossCutscene(biome, roomSeed);
            startCutscene(frames, GameState.COMBAT, beginCombat);
          } else {
            // Regular enemy — maybe random encounter cutscene
            if (shouldTriggerRandomEncounter(roomSeed)) {
              const frames = getRandomEncounterCutscene(roomSeed);
              startCutscene(frames, GameState.COMBAT, beginCombat);
            } else {
              beginCombat();
              await engine.transition(GameState.COMBAT);
            }
          }
        } else if (room?.content === 'loot') {
          const roomLoot = room.loot ?? [];
          for (const item of roomLoot) { item.source = 'chest'; }
          state.pendingLoot = roomLoot;
          clearRoom(dp, dp.currentRoom);
          // 30% chance of spin wheel instead of normal loot
          if (rng.chance(0.3)) {
            const level = dp?.level ?? 1;
            const bonuses = settings.getBonuses();
            const talismanLoot = getTalismanBonuses(state.talisman?.level ?? 1).lootQuality;
            const prizes = [];
            const rarities = ['common', 'common', 'uncommon', 'uncommon', 'rare', 'legendary'];
            for (let i = 0; i < 6; i++) {
              const item = generateLoot({ level, rng, qualityBonus: bonuses.lootFindBonus + talismanLoot });
              if (item) {
                item.rarity = rarities[i];
                item.source = 'chest';
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
                const actualCost = Math.min(state.crumbs, offer.cost);
                state.crumbs = Math.max(0, state.crumbs - offer.cost);
                state._lastCrumbSpend = Date.now();
                state._lastCrumbSpendAmount = actualCost;
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
            applyTalismanRegen(state);
            // Village bonuses per room
            const vb = getVillageBonuses(state);
            if (vb.crumbsPerRoom > 0) {
              state.crumbs += vb.crumbsPerRoom;
              state.stats.crumbsEarned = (state.stats.crumbsEarned ?? 0) + vb.crumbsPerRoom;
            }
            if (vb.healPerRoom > 0) {
              for (const m of (state.team ?? []).filter(t => t.currentHp > 0)) {
                m.currentHp = Math.min(m.maxHp, m.currentHp + vb.healPerRoom);
              }
            }
            state.stats.roomsCleared = (state.stats.roomsCleared ?? 0) + 1;
            if (state._dungeonRunStats) state._dungeonRunStats.roomsCleared++;
          } else {
            // Dead end or dungeon complete — show summary with cutscene
            state.stats.dungeonsCleared = (state.stats.dungeonsCleared ?? 0) + 1;
            if (state._dungeonRunStats) state._dungeonRunStats.success = true;
            const completeBiome = dp.biome ?? 'cave';
            const completeSeed = dp.dungeonSeed ?? 0;
            state.dungeonProgress = null;
            const frames = [...getDungeonCompleteCutscene(completeBiome, completeSeed), ...getVictoryEndingCutscene(completeBiome, completeSeed + 7)];
            startCutscene(frames, GameState.DUNGEON_SUMMARY);
          }
        }
      }
    } else if (typeof result === 'object' && result?.action === 'cycle_setting') {
      const current = settings.get(result.key) ?? result.options[0];
      const idx = result.options.indexOf(current);
      const nextIdx = (idx + result.dir + result.options.length) % result.options.length;
      settings.set(result.key, result.options[nextIdx]);
      settings.save();
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
      // Handle focus setting toggles
      if (result.key === 'focus.stickyTop') {
        if (platform.canSticky) setAlwaysOnTop(settings.get('focus.stickyTop'), platform);
      }
      if (result.key === 'focus.autoFocus') {
        if (settings.get('focus.autoFocus') && platform.canFocus) summonWindow(platform);
      }
      if (result.key === 'focus.bell') {
        if (settings.get('focus.bell')) bell();
      }
    } else if (result === 'reset_settings') {
      settings.reset();
      settings.save();
    } else if (result === 'save_game') {
      saveGame(slot, engine.getState());
      renderer.showNotification('Game saved!', 'success');
    } else if (result === 'save_and_quit') {
      saveGame(slot, engine.getState());
      await engine.shutdown();
    } else if (result === 'go_to_menu') {
      // Clean up combat/dungeon state and return to menu
      removeTalismanCombatBuffs();
      removeShopBuffs();
      removeVillageCombatBuffs();
      activeCombat = null;
      rollBar = null;
      state._lastCombatRoll = null;
      state.dungeonProgress = null;
      state._dungeonRunStats = null;
      dungeonTimer = null;
      saveGame(slot, engine.getState());
      renderer.showNotification('Game saved!', 'success');
      await engine.transition(GameState.MENU);
    } else if (result?.action === 'new_game_slot') {
      // Save current game before switching slots
      saveGame(slot, engine.getState());
      // Switch to chosen slot and start fresh
      slot = result.slot;
      engine.resetForNewGame();
      // Clear transient cutscene state
      cutsceneAfterState = null;
      cutsceneAfterAction = null;
      cutsceneTimer = 0;
      activeCombat = null;
      rollBar = null;
      const st = engine.getStateRef();
      st.gameMode = result.mode;
      st.currentState = GameState.MENU;
      activeCombat = null;
      rollBar = null;
      dungeonTimer = null;
      workModePaused = false;
      if (result.mode === 'work') {
        st.passiveConfig = st.passiveConfig ?? {};
        st.passiveConfig.autoLoot = true;
        st.passiveConfig.autoSell = true;
      }
      // Generate fresh tavern roster for the new game
      st.tavernRoster = applyVillageRecruitBonus(generateTavernRoster(rng));
      // Write fresh state to live.json immediately so stale data doesn't bleed back
      liveState.write();
      await engine.transition(GameState.TAVERN);
    } else if (result?.action === 'load_game_slot') {
      // Save current game before switching
      saveGame(slot, engine.getState());
      // Load the chosen slot
      slot = result.slot;
      const loaded = loadGame(slot);
      if (loaded.success && loaded.data) {
        const staleKeys = ['securityAlerts', 'securityLog', '_tavernRoster', 'activeNPC', 'skillModifiers', '_cutscene'];
        // Clear transient cutscene state on load
        cutsceneAfterState = null;
        cutsceneAfterAction = null;
        cutsceneTimer = 0;
        for (const key of staleKeys) delete state[key];
        for (const key of Object.keys(state)) delete state[key];
        Object.assign(state, loaded.data);
        // Set a newGameId so live-state grace window blocks stale merges
        state.newGameId = Date.now();
        activeCombat = null;
        rollBar = null;
        dungeonTimer = null;
        workModePaused = false;
        if (state.gameMode === 'work') {
          state.passiveConfig = state.passiveConfig ?? {};
          state.passiveConfig.autoLoot = true;
          state.passiveConfig.autoSell = true;
        }
        if (!state.tavernRoster || state.tavernRoster.length === 0) {
          state.tavernRoster = applyVillageRecruitBonus(generateTavernRoster(rng));
        }
        // Write loaded state to live.json immediately so stale data doesn't bleed back
        liveState.write();
        await engine.transition(GameState.TAVERN);
      } else {
        renderer.showNotification('Failed to load save!', 'warn');
      }
    }

    // Reset UI state on screen transition
    const newState = engine.getState().currentState;
    if (newState !== prevState) {
      resetUIState();
      // Unpause work mode when leaving menu (user chose to continue/load/new game)
      if (prevState === GameState.MENU && workModePaused) {
        workModePaused = false;
      }
      // Ensure tavern roster exists when entering tavern (covers new game / load game)
      if (newState === GameState.TAVERN && (!state.tavernRoster || state.tavernRoster.length === 0)) {
        state.tavernRoster = applyVillageRecruitBonus(generateTavernRoster(rng));
      }
      // Restart dungeon timer when returning to tavern with a team
      if (newState === GameState.TAVERN && (state.team ?? []).length > 0 && !dungeonTimer) {
        // Clear stale dungeon progress from previous run (e.g., crash mid-dungeon)
        if (state.dungeonProgress) state.dungeonProgress = null;
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

    // Track play time
    state.playTime = (state.playTime ?? 0) + FRAME_MS;

    // Periodic trophy checks (every 5s to avoid overhead)
    trophyCheckTimer += FRAME_MS;
    if (trophyCheckTimer >= 5000) {
      trophyCheckTimer = 0;
      const newTrophies = checkTrophies(state);
      for (const t of newTrophies) {
        renderer.showNotification(`Trophy unlocked: ${t.name} — ${t.desc}`, 'success');
        logAdventure(`Trophy: ${t.name} — ${t.desc}`, 'trophy');
        // Queue trophy cutscene if not in combat or another cutscene
        if (state.currentState !== GameState.COMBAT && state.currentState !== GameState.CUTSCENE) {
          const trophyFrames = getTrophyCutscene(t.id, t.name);
          const returnTo = state.currentState;
          startCutscene(trophyFrames, returnTo);
          break; // One trophy cutscene at a time
        }
      }
    }

    // Auto-advance cutscene frames (paused during security alerts)
    if (state.currentState === GameState.CUTSCENE && state._cutscene && !isSecurityPaused()) {
      cutsceneTimer += FRAME_MS;
      const frame = state._cutscene.frames[state._cutscene.currentFrame];
      const baseDuration = frame?.duration ?? 1200;
      const frameDuration = (isWorkMode() || isAutoDungeon()) ? baseDuration * 2 : baseDuration;
      if (cutsceneTimer >= frameDuration) {
        advanceCutscene();
      }
    }

    // Auto-combat tick — auto-attack every 780ms (paused during security alerts)
    if (activeCombat && !activeCombat.isFinished && state.currentState === GameState.COMBAT && !isSecurityPaused()) {
      combatAutoTimer += FRAME_MS;
      if (combatAutoTimer >= 780) {
        combatAutoTimer = 0;
        const attackResult = activeCombat.autoAttack();
        if (attackResult.roll) {
          const currentTurn = activeCombat.currentTurn();
          state._lastCombatRoll = { ...attackResult.roll, attacker: attackResult.attacker, target: attackResult.target, damage: attackResult.damage ?? attackResult.selfDamage ?? 0, modifier: Math.floor((currentTurn?.stats?.atk ?? 5) / 4) };
        }
        // Track highest single-hit damage
        if (attackResult.damage > 0) {
          state.stats.highestDamage = Math.max(state.stats.highestDamage ?? 0, attackResult.damage);
        }
        if (attackResult.outcome === 'victory' || attackResult.outcome === 'defeat') {
          await handleCombatEnd(attackResult);
        }
        renderCurrentScreen();
      }
    }

    // Dungeon auto-start timer tick
    if (dungeonTimer && state.currentState === GameState.TAVERN) {
      dungeonTimer.remaining -= FRAME_MS;
      if (dungeonTimer.remaining <= 0) {
        if ((state.team ?? []).length > 0) {
          await enterDungeon();
        } else {
          // Timer expired with no team — clear so it can restart on next recruit
          dungeonTimer = null;
        }
      }
    }

    // Work mode auto-loop
    if (isWorkMode()) {
      await workModeTick();
    }

    // Auto-dungeon in default mode (dungeon/combat/loot only)
    if (!isWorkMode()) {
      await autoDungeonTick();
      await autoRecruitTick();
      await autoEquipTick();
      await autoShopTick();
      await autoTalismanTick();
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
    if (settings.get('focus.stickyTop') && platform.canSticky) {
      setAlwaysOnTop(false, platform);
    }
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
