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
      'Click cookies to earn crumbs, recruit heroes, and delve into dungeons.',
    ],
    action: 'continue',
  },
  {
    id: 'click_cookie',
    text: [
      'Step 1: Click the Cookie',
      '',
      'Press [SPACE] or [ENTER] to click the cookie and earn crumbs.',
      'Try clicking a few times now.',
    ],
    action: 'click_cookie',
    target: 5, // Need 5 clicks to proceed
  },
  {
    id: 'recruit',
    text: [
      'Step 2: Recruit a Hero',
      '',
      'Head to the Tavern and recruit your first team member.',
      'Each hero has unique stats, race, and class.',
    ],
    action: 'recruit',
    target: 1,
  },
  {
    id: 'dungeon',
    text: [
      'Step 3: Enter the Tutorial Dungeon',
      '',
      'Your first dungeon is a safe training ground.',
      '3 rooms, 1 weak enemy. You cannot lose.',
    ],
    action: 'enter_dungeon',
  },
  {
    id: 'combat',
    text: [
      'Step 4: Combat!',
      '',
      'When you encounter an enemy, the roll bar appears.',
      'Press any key to stop the bar — that is your attack roll.',
      'Higher rolls deal more damage!',
    ],
    action: 'complete_combat',
  },
  {
    id: 'complete',
    text: [
      'Tutorial Complete!',
      '',
      'You are ready to explore on your own.',
      'Recruit more heroes, delve deeper, and collect loot!',
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
