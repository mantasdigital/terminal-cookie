/**
 * Story state management — narrative log, NPC encounters, skill modifiers, death penalty.
 */

/**
 * Create a story manager for a game session.
 * @param {object} state - Game state (mutated in place)
 * @returns {object} Story manager
 */
export function createStoryManager(state) {
  // Initialize story state on the game state object
  if (!state.storyLog) state.storyLog = [];
  if (!state.storyChoices) state.storyChoices = {};
  if (!state.skillModifiers) state.skillModifiers = [];
  if (!state.activeNPC) state.activeNPC = null;

  const story = {
    /**
     * Add a narrative entry to the story log.
     * @param {string} text - Narrative text
     * @param {string} [type='room'] - Entry type: room|npc|event|combat|lore
     */
    addStoryEntry(text, type = 'room') {
      state.storyLog.push({
        text,
        type,
        time: Date.now(),
      });
      // Cap at 50 entries
      if (state.storyLog.length > 50) {
        state.storyLog = state.storyLog.slice(-50);
      }
    },

    /**
     * Get the latest N story entries.
     * @param {number} [count=3]
     * @returns {Array}
     */
    getRecentEntries(count = 3) {
      return (state.storyLog || []).slice(-count);
    },

    /**
     * Record a story choice made by the player.
     * @param {string} choiceId
     * @param {string} choice - The chosen option
     */
    recordChoice(choiceId, choice) {
      state.storyChoices[choiceId] = {
        choice,
        time: Date.now(),
      };
    },

    /**
     * Check if a previous choice was made.
     * @param {string} choiceId
     * @returns {string|null} The choice value, or null
     */
    getChoice(choiceId) {
      return state.storyChoices[choiceId]?.choice ?? null;
    },

    /**
     * Set the active NPC encounter.
     * @param {object|null} npc - NPC data or null to clear
     */
    setActiveNPC(npc) {
      state.activeNPC = npc;
    },

    /**
     * Get the active NPC encounter.
     * @returns {object|null}
     */
    getActiveNPC() {
      return state.activeNPC;
    },

    /**
     * Apply a skill modifier to the team.
     * @param {object} modifier
     * @param {string} modifier.stat - Stat to modify (atk, def, spd, lck, hp)
     * @param {number} modifier.amount - Modifier amount (positive = buff, negative = debuff)
     * @param {number} modifier.duration - Rooms remaining (-1 = permanent for dungeon)
     * @param {string} modifier.source - Description of source
     */
    applySkillModifier({ stat, amount, duration, source }) {
      state.skillModifiers.push({ stat, amount, duration, source });
    },

    /**
     * Tick all modifiers (call on room change). Removes expired ones.
     */
    tickModifiers() {
      if (!state.skillModifiers) return;
      state.skillModifiers = state.skillModifiers.filter(mod => {
        if (mod.duration === -1) return true; // permanent
        mod.duration--;
        return mod.duration > 0;
      });
    },

    /**
     * Get all active skill modifiers.
     * @returns {Array}
     */
    getActiveModifiers() {
      return state.skillModifiers || [];
    },

    /**
     * Get total modifier for a specific stat.
     * @param {string} stat
     * @returns {number}
     */
    getStatModifier(stat) {
      return (state.skillModifiers || [])
        .filter(m => m.stat === stat || m.stat === 'all')
        .reduce((sum, m) => sum + m.amount, 0);
    },

    /**
     * Calculate death penalty — crumbs lost on death.
     * @param {number} crumbs - Current crumb balance
     * @param {number} dungeonLevel - Current dungeon level
     * @returns {number} Amount of crumbs to lose
     */
    calculateDeathPenalty(crumbs, dungeonLevel) {
      const rate = Math.min(0.50, 0.20 + dungeonLevel * 0.02);
      return Math.floor(crumbs * rate);
    },

    /**
     * Apply death penalty — deducts crumbs and returns amount lost.
     * @param {number} dungeonLevel
     * @returns {number} Crumbs lost
     */
    applyDeathPenalty(dungeonLevel) {
      const penalty = story.calculateDeathPenalty(state.crumbs, dungeonLevel);
      state.crumbs = Math.max(0, state.crumbs - penalty);
      state.lastDeathPenalty = penalty;
      return penalty;
    },

    /**
     * Clear story state for a new dungeon run.
     */
    resetForDungeon() {
      state.storyLog = [];
      state.storyChoices = {};
      state.skillModifiers = [];
      state.activeNPC = null;
      state.lastDeathPenalty = 0;
    },
  };

  return story;
}
