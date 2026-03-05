/**
 * Main game engine — state machine, central game state, and integration hub.
 */

import { createRNG, generateSeed } from './rng.js';
import { createScheduler } from './timer.js';
import { createMutex } from './mutex.js';
import { migrate, needsMigration, CURRENT_VERSION } from './migration.js';

/** Valid game states. */
export const GameState = Object.freeze({
  MENU: 'MENU',
  TAVERN: 'TAVERN',
  DUNGEON: 'DUNGEON',
  COMBAT: 'COMBAT',
  LOOT: 'LOOT',
  DEATH: 'DEATH',
  SETTINGS: 'SETTINGS',
  HELP: 'HELP',
});

/**
 * Legal state transitions. Each key lists the states reachable from it.
 * @type {Record<string, string[]>}
 */
const TRANSITIONS = {
  [GameState.MENU]:     [GameState.TAVERN, GameState.DUNGEON, GameState.SETTINGS, GameState.HELP],
  [GameState.TAVERN]:   [GameState.DUNGEON, GameState.COMBAT, GameState.SETTINGS, GameState.MENU],
  [GameState.DUNGEON]:  [GameState.COMBAT, GameState.LOOT, GameState.TAVERN, GameState.DEATH, GameState.MENU],
  [GameState.COMBAT]:   [GameState.LOOT, GameState.DEATH, GameState.DUNGEON, GameState.TAVERN],
  [GameState.LOOT]:     [GameState.DUNGEON, GameState.TAVERN, GameState.COMBAT],
  [GameState.DEATH]:    [GameState.MENU, GameState.TAVERN],
  [GameState.SETTINGS]: [GameState.MENU, GameState.TAVERN, GameState.DUNGEON],
  [GameState.HELP]:     [GameState.MENU, GameState.TAVERN, GameState.DUNGEON],
};

/**
 * Build a fresh default game state object.
 * @param {number} seed
 * @returns {object}
 */
function defaultGameState(seed) {
  return {
    version: CURRENT_VERSION,
    seed,
    currentState: GameState.MENU,
    team: [],
    inventory: [],
    crumbs: 50,
    dungeonProgress: null,
    settings: {
      soundEnabled: true,
      animationSpeed: 1,
    },
    stats: {
      runs: 0,
      deaths: 0,
      crumbsEarned: 0,
      monstersSlain: 0,
    },
    // Passive mode fields (used by MCP server)
    passiveConfig: {
      tickIntervalMs: 15000,
      autoLoot: true,
      autoSell: false,
    },
    pendingActions: [],
    passiveLog: [],
    totalToolCalls: 0,
    gameMode: 'default',
  };
}

/**
 * Create the main game engine.
 * @param {object} [options]
 * @param {number} [options.seed] - RNG seed (auto-generated if omitted)
 * @param {object} [options.saveData] - Previously saved game state to restore
 * @param {function} [options.onSave] - Callback to persist state: (state) => void
 * @param {function} [options.onRender] - Called after state changes: (state) => void
 * @returns {object} Engine instance
 */
export function createEngine(options = {}) {
  const seed = options.seed ?? generateSeed();

  // Hydrate or create fresh state
  let state;
  if (options.saveData) {
    state = needsMigration(options.saveData)
      ? migrate(options.saveData)
      : { ...options.saveData };
  } else {
    state = defaultGameState(seed);
  }

  const rng = createRNG(state.seed ?? seed);
  const scheduler = createScheduler(state);
  const mutex = createMutex();
  const onSave = options.onSave ?? (() => {});
  const onRender = options.onRender ?? (() => {});

  let running = false;

  const engine = {
    /** Start the engine loop. */
    async start() {
      await mutex.withLock(() => {
        running = true;
        state.currentState = GameState.MENU;
      });
      onRender(state);
    },

    /**
     * Transition to a new game state with validation.
     * @param {string} newState - One of GameState values
     */
    async transition(newState) {
      await mutex.withLock(() => {
        const current = state.currentState;
        const allowed = TRANSITIONS[current];
        if (!allowed || !allowed.includes(newState)) {
          throw new Error(`Invalid transition: ${current} → ${newState}`);
        }
        state.currentState = newState;
      });
      onRender(state);
    },

    /**
     * Get a shallow copy of the current game state.
     * @returns {object}
     */
    getState() {
      return { ...state };
    },

    /**
     * Per-frame update tick.
     * @param {number} deltaMs - Milliseconds since last update
     */
    async update(deltaMs) {
      if (!running) return;
      scheduler.tick();
    },

    /**
     * Handle a raw key/input event. Submodules will extend this.
     * @param {string} key
     */
    async handleInput(key) {
      if (!running) return;
      // Input routing will be extended by UI and gameplay modules.
      // Base engine handles universal shortcuts.
      if (key === 'q' && state.currentState === GameState.MENU) {
        await engine.shutdown();
      }
    },

    /**
     * Gracefully shut down: save state and stop.
     */
    async shutdown() {
      await mutex.withLock(() => {
        running = false;
        scheduler.clear();
      });
      try {
        await onSave(state);
      } catch {
        // Best-effort save on shutdown
      }
    },

    /**
     * Get the actual mutable state reference. Used by MCP server for direct mutation.
     * @returns {object}
     */
    getStateRef() {
      return state;
    },

    /** Expose sub-systems for modules that need them. */
    get rng() { return rng; },
    get scheduler() { return scheduler; },
    get mutex() { return mutex; },
    get running() { return running; },
  };

  return engine;
}
