// Prompt type classifier using regex + heuristics
// Detects prompt type from text and returns classification with confidence

const TYPES = [
  'permission', 'code_review', 'file_picker', 'rating', 'chain',
  'multi_select', 'multiple_choice', 'binary', 'text_input', 'freeform'
];

const patterns = {
  permission: {
    primary: /\b(sudo|admin|root|escalat|privileged|superuser|elevated)\b/i,
    secondary: /\?|allow|grant|permit|authorize/i,
  },
  code_review: {
    primary: /(```[\s\S]*?```|(?:^|\n)(?: {4}|\t)\S.*(?:\n(?: {4}|\t)\S.*){2,})/m,
    secondary: /\b(approve|review|look\s+right|correct|merge|diff|commit|patch)\b/i,
  },
  file_picker: {
    primary: /\b(file|path|directory|folder|\.\/|~\/|\/usr|\.txt|\.js|\.json)\b/i,
    secondary: /\b(select|choose|which|pick|browse|open|navigate)\b/i,
  },
  rating: {
    primary: /\b(rate|score|scale|rating|rank)\b/i,
    secondary: /\b\d+\s*[-–to]+\s*\d+\b|\b(out of \d+|stars?|points?)\b/i,
  },
  chain: {
    primary: /\b(step|phase|stage|pipeline|workflow)\b/i,
    secondary: /\b(\d+|first|second|third|next)\b.*\b(approve|confirm|proceed|continue)\b/i,
  },
  multi_select: {
    primary: /\b(all that apply|checkboxes?|select\s+multiple|pick\s+(any|all|several))\b/i,
    secondary: /(\[[ x✓]\]|☐|☑|✓|✗)/i,
  },
  multiple_choice: {
    primary: /((?:^|\n)\s*(?:[1-9]\.|[a-e]\)|[A-E]\.))\s*\S/m,
    secondary: /\b(which|choose|option|select one|pick one)\b/i,
  },
  binary: {
    primary: /\b(yes|no|y\/n|allow|deny|approve|reject|accept|decline|true|false|confirm|cancel)\b/i,
    secondary: /\?|\b(or not|should I|do you|would you|will you|can I)\b/i,
  },
  text_input: {
    primary: /\b(enter|type|provide|input|describe|specify|write|fill\s*in)\b/i,
    secondary: /\b(name|value|what\s+is|what's|email|password|username|url|address)\b/i,
  },
};

function computeConfidence(primaryMatch, secondaryMatch, textLength) {
  let confidence = 0;
  if (primaryMatch) confidence += 0.5;
  if (secondaryMatch) confidence += 0.3;
  // Short prompts with clear signals get a bonus
  if (textLength < 80 && primaryMatch) confidence += 0.1;
  // Both patterns matching strongly boosts confidence
  if (primaryMatch && secondaryMatch) confidence += 0.1;
  return Math.min(confidence, 1.0);
}

function extractParsedOptions(text, type) {
  const opts = {};

  if (type === 'multiple_choice') {
    const numbered = [...text.matchAll(/(?:^|\n)\s*(\d+)\.\s*(.+)/gm)];
    const lettered = [...text.matchAll(/(?:^|\n)\s*([a-eA-E])\)\s*(.+)/gm)];
    const matches = numbered.length > 0 ? numbered : lettered;
    if (matches.length > 0) {
      opts.choices = matches.map(m => ({ key: m[1], label: m[2].trim() }));
    }
  }

  if (type === 'binary') {
    const pairs = [
      ['yes', 'no'], ['allow', 'deny'], ['approve', 'reject'],
      ['accept', 'decline'], ['y', 'n'], ['true', 'false'], ['confirm', 'cancel']
    ];
    for (const [a, b] of pairs) {
      const re = new RegExp(`\\b(${a}|${b})\\b`, 'i');
      if (re.test(text)) {
        opts.acceptLabel = a.charAt(0).toUpperCase() + a.slice(1);
        opts.denyLabel = b.charAt(0).toUpperCase() + b.slice(1);
        break;
      }
    }
  }

  if (type === 'rating') {
    const rangeMatch = text.match(/(\d+)\s*[-–to]+\s*(\d+)/);
    if (rangeMatch) {
      opts.min = parseInt(rangeMatch[1], 10);
      opts.max = parseInt(rangeMatch[2], 10);
    }
    const outOfMatch = text.match(/out of (\d+)/i);
    if (outOfMatch) {
      opts.min = 1;
      opts.max = parseInt(outOfMatch[1], 10);
    }
  }

  if (type === 'chain') {
    const stepMatches = [...text.matchAll(/\b(?:step|phase|stage)\s*(\d+)[:\s]*([^\n]*)/gi)];
    if (stepMatches.length > 0) {
      opts.steps = stepMatches.map(m => ({ number: parseInt(m[1], 10), label: m[2].trim() }));
    }
  }

  if (type === 'multi_select') {
    const items = [...text.matchAll(/(?:^|\n)\s*(?:\[[ x✓]\]|☐|☑|[-*])\s*(.+)/gm)];
    if (items.length > 0) {
      opts.items = items.map(m => m[1].trim());
    }
  }

  if (type === 'file_picker') {
    const pathMatch = text.match(/((?:~|\.)?\/[\w./-]+)/);
    if (pathMatch) opts.initialPath = pathMatch[1];
  }

  if (type === 'permission') {
    const actionMatch = text.match(/\b(sudo|admin|root|elevated|superuser)\b/i);
    if (actionMatch) opts.level = actionMatch[1].toLowerCase();
  }

  if (type === 'code_review') {
    const codeBlock = text.match(/```(\w*)\n?([\s\S]*?)```/);
    if (codeBlock) {
      opts.language = codeBlock[1] || 'unknown';
      opts.code = codeBlock[2];
    }
  }

  return opts;
}

function extractContext(text) {
  const ctx = {};
  const questionMark = text.includes('?');
  if (questionMark) ctx.isQuestion = true;
  const exclamation = text.includes('!');
  if (exclamation) ctx.isUrgent = true;
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  ctx.lineCount = lines.length;
  ctx.wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
  return ctx;
}

export function classifyPrompt(text, biasMap = null) {
  if (!text || typeof text !== 'string') {
    return { type: 'freeform', confidence: 0, parsedOptions: {}, context: {} };
  }

  const trimmed = text.trim();
  const context = extractContext(trimmed);
  const results = [];

  // Check each type in specificity order
  const typeOrder = [
    'permission', 'code_review', 'file_picker', 'rating', 'chain',
    'multi_select', 'multiple_choice', 'binary', 'text_input'
  ];

  for (const type of typeOrder) {
    const p = patterns[type];
    const primaryMatch = p.primary.test(trimmed);
    const secondaryMatch = p.secondary.test(trimmed);

    if (primaryMatch || secondaryMatch) {
      let confidence = computeConfidence(primaryMatch, secondaryMatch, trimmed.length);

      // Apply bias from history if available
      if (biasMap && biasMap[type]) {
        confidence = Math.min(confidence + biasMap[type], 1.0);
      }

      results.push({ type, confidence });
    }
  }

  // Apply bias for types not yet in results
  if (biasMap) {
    for (const [type, bias] of Object.entries(biasMap)) {
      if (!results.find(r => r.type === type) && bias > 0.3) {
        results.push({ type, confidence: bias });
      }
    }
  }

  // Sort by confidence descending
  results.sort((a, b) => b.confidence - a.confidence);

  if (results.length === 0 || results[0].confidence < 0.6) {
    const hint = results.length > 0 ? results[0] : null;
    return {
      type: 'freeform',
      confidence: hint ? hint.confidence : 0,
      parsedOptions: {},
      context: {
        ...context,
        hint: hint ? { suggestedType: hint.type, confidence: hint.confidence } : null,
      },
    };
  }

  const winner = results[0];
  return {
    type: winner.type,
    confidence: winner.confidence,
    parsedOptions: extractParsedOptions(trimmed, winner.type),
    context,
  };
}

export { TYPES };
