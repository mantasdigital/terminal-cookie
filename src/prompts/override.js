// Tab-to-switch widget cycling
// Allows cycling through widget types and logging overrides for training

import { TYPES } from './classifier.js';

export function createOverrideHandler(adapter, history) {
  return {
    cycleWidget(currentType) {
      const idx = TYPES.indexOf(currentType);
      const nextIdx = (idx + 1) % TYPES.length;
      return TYPES[nextIdx];
    },

    applyOverride(promptId, newType) {
      const result = adapter.override(promptId, newType);

      if (history) {
        // The adapter.override already calls history.correct,
        // but we also record the new type as a fresh classification
        history.record('_override', String(promptId), newType);
      }

      return result;
    },

    getAvailableTypes() {
      return [...TYPES];
    },
  };
}
