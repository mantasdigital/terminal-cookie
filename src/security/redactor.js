const BUILTIN_PATTERNS = {
  'openai-key': {
    name: 'OpenAI API Key',
    regex: /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/g
  },
  'anthropic-key': {
    name: 'Anthropic API Key',
    regex: /sk-ant-[A-Za-z0-9_-]{20,}/g
  },
  'aws-key': {
    name: 'AWS Access Key',
    regex: /AKIA[0-9A-Z]{16}/g
  },
  'github-token': {
    name: 'GitHub Token',
    regex: /gh[pousr]_[A-Za-z0-9]{36}/g
  },
  'stripe-key': {
    name: 'Stripe Key',
    regex: /[sr]k_live_[A-Za-z0-9]{24,}/g
  },
  'pk-stripe': {
    name: 'Stripe Publishable Key',
    regex: /pk_live_[A-Za-z0-9]{24,}/g
  },
  'generic-api-key': {
    name: 'Generic API Key',
    regex: /(?:rk_|pk_)[A-Za-z0-9_-]{20,}/g
  },
  'email': {
    name: 'Email Address',
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
  },
  'ipv4': {
    name: 'IP Address',
    regex: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g
  },
  'jwt': {
    name: 'JWT Token',
    regex: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g
  },
  'credit-card': {
    name: 'Credit Card Number',
    regex: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g
  }
};

function redactMatch(match) {
  if (match.length <= 4) {
    return '****';
  }
  const visibleSuffix = match.slice(-4);
  const prefix = match.slice(0, Math.min(match.indexOf('-') + 1, 6));
  if (prefix.length > 0 && prefix.includes('-')) {
    return `${prefix}****${visibleSuffix}`;
  }
  return `${match.slice(0, 3)}****${visibleSuffix}`;
}

function redactEmail(email) {
  const [local, domain] = email.split('@');
  if (local.length <= 2) {
    return `**@${domain}`;
  }
  return `${local[0]}****${local[local.length - 1]}@${domain}`;
}

function redactIP(ip) {
  const parts = ip.split('.');
  return `${parts[0]}.***.***.${parts[3]}`;
}

function redactCreditCard(cc) {
  return `****-****-****-${cc.slice(-4)}`;
}

function getRedactionFn(patternName) {
  if (patternName === 'email') return redactEmail;
  if (patternName === 'ipv4') return redactIP;
  if (patternName === 'credit-card') return redactCreditCard;
  return redactMatch;
}

export function createRedactor(rules) {
  // Clone built-in patterns and apply active rules
  const activePatterns = new Map();
  const customPatterns = new Map();

  // Initialize with built-in patterns
  for (const [id, pattern] of Object.entries(BUILTIN_PATTERNS)) {
    activePatterns.set(id, { ...pattern });
  }

  // If rules specify which patterns are active, filter
  if (rules && rules.activePatterns) {
    const activeSet = new Set(rules.activePatterns);
    for (const id of activePatterns.keys()) {
      if (!activeSet.has(id)) {
        activePatterns.delete(id);
      }
    }
  }

  function getAllPatterns() {
    const all = new Map(activePatterns);
    for (const [id, p] of customPatterns) {
      all.set(id, p);
    }
    return all;
  }

  return {
    redact(text) {
      let result = text;
      for (const [id, pattern] of getAllPatterns()) {
        const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
        const redactFn = getRedactionFn(id);
        result = result.replace(regex, (match) => redactFn(match));
      }
      return result;
    },

    redactForDisplay(text) {
      let result = text;
      for (const [id, pattern] of getAllPatterns()) {
        const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
        const redactFn = getRedactionFn(id);
        result = result.replace(regex, (match) => {
          const redacted = redactFn(match);
          // ANSI: red background for redacted parts
          return `\x1b[41m\x1b[37m${redacted}\x1b[0m`;
        });
      }
      return result;
    },

    addPattern(name, regex) {
      if (!name || !regex) throw new Error('Pattern name and regex are required');
      const r = regex instanceof RegExp ? regex : new RegExp(regex, 'g');
      customPatterns.set(name, {
        name,
        regex: r
      });
    }
  };
}
