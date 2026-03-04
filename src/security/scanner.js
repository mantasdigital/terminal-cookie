import { loadRules, matchRules } from './rules.js';

const RISK_ORDER = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

function hasBinaryContent(text) {
  // Check for null bytes indicating binary content
  return text.includes('\0');
}

function highlightCode(line, matchStart, matchLength) {
  const before = line.substring(0, matchStart);
  const matched = line.substring(matchStart, matchStart + matchLength);
  const after = line.substring(matchStart + matchLength);
  return `${before}>>> ${matched} <<<${after}`;
}

function formatFindings(ruleMatches) {
  return ruleMatches.map(result => {
    const highlightedCode = result.matches.map(m => {
      return {
        line: m.line,
        column: m.column,
        code: highlightCode(m.match, 0, m.match.length),
        raw: m.match
      };
    });

    return {
      rule_id: result.rule,
      name: result.description.split('.')[0],
      risk_level: result.riskLevel,
      matches: result.matches,
      description: result.description,
      recommendation: result.recommendation,
      highlighted_code: highlightedCode
    };
  });
}

function getHighestRisk(findings) {
  if (findings.length === 0) return 'NONE';
  let highest = -1;
  for (const f of findings) {
    const idx = RISK_ORDER.indexOf(f.risk_level);
    if (idx > highest) highest = idx;
  }
  return highest >= 0 ? RISK_ORDER[highest] : 'NONE';
}

function buildSummary(findings, highestRisk) {
  if (findings.length === 0) {
    return 'No security issues detected.';
  }
  const totalMatches = findings.reduce((sum, f) => sum + f.matches.length, 0);
  const riskCounts = {};
  for (const f of findings) {
    riskCounts[f.risk_level] = (riskCounts[f.risk_level] || 0) + 1;
  }
  const parts = [`Found ${totalMatches} potential security issue(s) across ${findings.length} rule(s).`];
  parts.push(`Highest risk: ${highestRisk}.`);
  for (const level of [...RISK_ORDER].reverse()) {
    if (riskCounts[level]) {
      parts.push(`${level}: ${riskCounts[level]} rule(s) matched.`);
    }
  }
  return parts.join(' ');
}

export function createScanner() {
  loadRules();

  return {
    scan(text) {
      if (hasBinaryContent(text)) {
        return {
          findings: [],
          summary: 'Skipped: binary content detected.',
          highest_risk: 'NONE'
        };
      }

      const ruleMatches = matchRules(text);
      const findings = formatFindings(ruleMatches);
      const highest_risk = getHighestRisk(findings);
      const summary = buildSummary(findings, highest_risk);

      return { findings, summary, highest_risk };
    },

    async scanStream(readableStream) {
      const chunks = [];
      for await (const chunk of readableStream) {
        chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf-8'));
      }
      const text = chunks.join('');
      return this.scan(text);
    }
  };
}
