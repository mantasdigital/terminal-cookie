// Context-aware prompt routing
// Routes prompts to appropriate widgets based on classification + context

import { classifyPrompt } from './classifier.js';
import { getWidget } from './widgets.js';

export function createAdapter(history) {
  let promptCounter = 0;
  const recentPrompts = []; // { source, type, promptId }

  return {
    route(promptText, context = {}) {
      const promptId = ++promptCounter;
      const { securityScannerActive, source } = context;

      // Get base classification
      const biasMap = history ? history.getBias(source, promptText) : null;
      const classification = classifyPrompt(promptText, biasMap);

      let { type, confidence } = classification;

      // Context bias: security scanner active boosts code_review
      if (securityScannerActive && type !== 'code_review') {
        const codeReviewConf = confidence + 0.2;
        // Only override if the boosted code_review beats current
        if (codeReviewConf > confidence && classification.context?.hint?.suggestedType === 'code_review') {
          type = 'code_review';
          confidence = codeReviewConf;
        }
        // If already code_review, just boost confidence
        if (type === 'code_review') {
          confidence = Math.min(confidence + 0.2, 1.0);
        }
      }

      // Source repetition bias: if last 3 from same source were same type, boost
      const recentFromSource = recentPrompts
        .filter(p => p.source === source)
        .slice(-3);

      if (recentFromSource.length >= 3) {
        const allSame = recentFromSource.every(p => p.type === recentFromSource[0].type);
        if (allSame && recentFromSource[0].type === type) {
          confidence = Math.min(confidence + 0.1, 1.0);
        }
      }

      // Record this prompt
      recentPrompts.push({ source, type, promptId });
      if (recentPrompts.length > 50) recentPrompts.shift();

      if (history) {
        history.record(source, promptText, type);
      }

      const widget = getWidget(type);

      return {
        promptId,
        type,
        widget,
        confidence,
        parsedOptions: classification.parsedOptions,
        context: classification.context,
      };
    },

    override(promptId, newType) {
      const recent = recentPrompts.find(p => p.promptId === promptId);
      if (recent && history) {
        history.correct(recent.source, '', recent.type, newType);
        recent.type = newType;
      }

      const widget = getWidget(newType);
      return { type: newType, widget };
    },

    getRecentPrompts() {
      return [...recentPrompts];
    },
  };
}
