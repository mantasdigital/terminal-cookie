/**
 * Save-file version migration system.
 * Allows forward-migrating old saves to the current schema.
 */

/** Current save format version. */
export const CURRENT_VERSION = 1;

/** @type {Map<string, {toVersion: number, fn: function}>} */
const migrations = new Map();

/**
 * Register a migration function for a specific version transition.
 * @param {number} fromVersion
 * @param {number} toVersion
 * @param {(data: object) => object} migrateFn - Returns new data object
 */
export function registerMigration(fromVersion, toVersion, migrateFn) {
  migrations.set(String(fromVersion), { toVersion, fn: migrateFn });
}

/**
 * Check whether save data requires migration.
 * @param {object} saveData
 * @returns {boolean}
 */
export function needsMigration(saveData) {
  if (!saveData) return false;
  const version = saveData.version ?? 0;
  return version < CURRENT_VERSION;
}

/**
 * Migrate save data to CURRENT_VERSION by chaining registered migrations.
 * Returns a new object — does not mutate the input.
 * @param {object} saveData
 * @returns {object} Migrated save data
 */
export function migrate(saveData) {
  let data = { ...saveData };
  let version = data.version ?? 0;

  while (version < CURRENT_VERSION) {
    const step = migrations.get(String(version));
    if (!step) {
      throw new Error(`No migration registered from version ${version}`);
    }
    data = step.fn(data);
    version = step.toVersion;
    data.version = version;
  }

  return data;
}

// ── Built-in migrations ─────────────────────────────────────────────

/** v0 → v1: normalise unversioned saves with default fields. */
registerMigration(0, 1, (data) => {
  return {
    version: 1,
    team: data.team ?? [],
    inventory: data.inventory ?? [],
    crumbs: data.crumbs ?? 0,
    dungeonProgress: data.dungeonProgress ?? null,
    settings: {
      soundEnabled: true,
      animationSpeed: 1,
      ...(data.settings ?? {}),
    },
    stats: {
      runs: 0,
      deaths: 0,
      crumbsEarned: 0,
      monstersSlain: 0,
      ...(data.stats ?? {}),
    },
  };
});
