/**
 * First-launch onboarding tutorial — guided flow through core mechanics.
 */

/** Tutorial dungeon parameters. */
const TUTORIAL_DUNGEON = {
  level: 0,
  rooms: 3,
  enemies: 1,
  guaranteedWin: true,
};

/** Tutorial step definitions. */
const STEPS = [
  {
    id: 'welcome',
    text: [
      'Welcome to Terminal Cookie!',
      '',
      'You run a guild of cookie-powered adventurers.',
      'Click cookies to earn crumbs, recruit heroes, and explore dungeons.',
      '',
      'Press ENTER to continue.',
    ],
    action: 'continue',
  },
  {
    id: 'click_cookie',
    text: [
      'Step 1 of 4: Click the Cookie',
      '',
      'Press the C key or SPACE BAR to click the cookie.',
      'Each click earns you crumbs (the in-game money).',
      '',
      'Try clicking 5 times now!',
    ],
    action: 'click_cookie',
    target: 5, // Need 5 clicks to proceed
  },
  {
    id: 'recruit',
    text: [
      'Step 2 of 4: Recruit a Hero',
      '',
      'Press R to see available recruits.',
      'Use the UP and DOWN arrow keys to pick a hero.',
      'Press ENTER to hire them.',
      '',
      'You need at least one hero before entering a dungeon.',
    ],
    action: 'recruit',
    target: 1,
  },
  {
    id: 'dungeon',
    text: [
      'Step 3 of 4: Enter the Dungeon',
      '',
      'Press E to send your team into a dungeon.',
      'This first dungeon is a safe training ground:',
      '3 rooms, 1 weak enemy. You cannot lose!',
    ],
    action: 'enter_dungeon',
  },
  {
    id: 'combat',
    text: [
      'Step 4 of 4: Combat!',
      '',
      'An enemy appeared! A roll bar is moving across the screen.',
      'Press SPACE or ENTER to stop the bar -- that sets your attack power.',
      'The higher you stop it, the more damage you deal!',
    ],
    action: 'complete_combat',
  },
  {
    id: 'complete',
    text: [
      'Tutorial Complete!',
      '',
      'You are ready to explore on your own.',
      'Recruit more heroes, explore deeper dungeons, collect loot!',
      '',
      'Tip: Press ? at any time to see the controls for the current screen.',
    ],
    action: 'finish',
  },
];

/**
 * Create a tutorial manager.
 * @param {object} gameState
 * @returns {object} Tutorial instance
 */
export function createTutorial(gameState) {
  let stepIndex = 0;
  let progress = 0;
  let skipped = false;
  let completed = gameState.stats?.tutorialDone ?? false;

  const tutorial = {
    /**
     * Whether the tutorial should be shown.
     * @returns {boolean}
     */
    shouldShow() {
      return !completed;
    },

    /**
     * Get the current tutorial step.
     * @returns {object|null} Step definition or null if done
     */
    currentStep() {
      if (completed || skipped) return null;
      if (stepIndex >= STEPS.length) return null;
      return { ...STEPS[stepIndex], progress };
    },

    /**
     * Advance progress on the current step.
     * @param {string} action - The action the player performed
     * @returns {{ advanced: boolean, stepComplete: boolean, tutorialDone: boolean }}
     */
    advance(action) {
      if (completed || skipped) return { advanced: false, stepComplete: false, tutorialDone: true };

      const step = STEPS[stepIndex];
      if (!step) return { advanced: false, stepComplete: false, tutorialDone: true };

      let stepComplete = false;

      if (step.action === 'continue') {
        stepComplete = true;
      } else if (step.action === action) {
        progress++;
        if (!step.target || progress >= step.target) {
          stepComplete = true;
        }
      } else if (step.action === 'finish') {
        stepComplete = true;
      }

      if (stepComplete) {
        stepIndex++;
        progress = 0;
        if (stepIndex >= STEPS.length) {
          completed = true;
          if (gameState.stats) gameState.stats.tutorialDone = true;
          return { advanced: true, stepComplete: true, tutorialDone: true };
        }
      }

      return { advanced: true, stepComplete, tutorialDone: false };
    },

    /** Skip the tutorial entirely. */
    skip() {
      skipped = true;
      completed = true;
      if (gameState.stats) gameState.stats.tutorialDone = true;
    },

    /** Get tutorial dungeon config. */
    get dungeonConfig() {
      return { ...TUTORIAL_DUNGEON };
    },

    /** @returns {boolean} */
    get isComplete() { return completed; },

    /** @returns {number} Current step index */
    get stepNumber() { return stepIndex; },

    /** @returns {number} Total steps */
    get totalSteps() { return STEPS.length; },
  };

  return tutorial;
}
