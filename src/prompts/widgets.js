// Cookie widget renderers for all 10 prompt types
// Each widget: render(data, width), handleInput(key, state), getInitialState(data)

function centerText(text, width) {
  const pad = Math.max(0, Math.floor((width - text.length) / 2));
  return ' '.repeat(pad) + text;
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 1) + '\u2026' : str;
}

// ── 1. BinaryWidget ──────────────────────────────────────────────────

export const BinaryWidget = {
  render(data, width = 60) {
    const accept = data.acceptLabel || 'Accept';
    const deny = data.denyLabel || 'Deny';
    const prompt = data.prompt || '';
    const boxW = 17;
    const gap = '     ';

    const lines = [];
    if (prompt) {
      lines.push(centerText(truncate(prompt, width - 4), width));
      lines.push('');
    }
    lines.push(centerText(`\u250C${'─'.repeat(boxW)}\u2510${gap}\u250C${'─'.repeat(boxW)}\u2510`, width));
    lines.push(centerText(`\u2502   (::::::::)  \u2502${gap}\u2502   (xxxxxxxx)  \u2502`, width));
    lines.push(centerText(`\u2502  (::::::::::) \u2502${gap}\u2502  (xxxxxxxxxx) \u2502`, width));
    lines.push(centerText(`\u2502   (::::::::)  \u2502${gap}\u2502   (xxxxxxxx)  \u2502`, width));
    lines.push(centerText(`\u2502  [A] ${accept.padEnd(9)} \u2502${gap}\u2502  [D] ${deny.padEnd(9)} \u2502`, width));
    lines.push(centerText(`\u2514${'─'.repeat(boxW)}\u2518${gap}\u2514${'─'.repeat(boxW)}\u2518`, width));
    return lines.join('\n');
  },

  handleInput(key, state) {
    if (key === 'a' || key === 'A' || key === 'return') {
      return { done: true, value: true, state: { ...state, selected: 'accept' } };
    }
    if (key === 'd' || key === 'D' || key === 'escape') {
      return { done: true, value: false, state: { ...state, selected: 'deny' } };
    }
    return { done: false, value: null, state };
  },

  getInitialState(data) {
    return { selected: null, acceptLabel: data.acceptLabel || 'Accept', denyLabel: data.denyLabel || 'Deny' };
  },
};

// ── 2. MultipleChoiceWidget ──────────────────────────────────────────

export const MultipleChoiceWidget = {
  render(data, width = 60) {
    const opts = data.choices || [];
    const idx = data._selectedIndex ?? 0;
    const lines = [];
    if (data.prompt) {
      lines.push(centerText(truncate(data.prompt, width - 4), width));
      lines.push('');
    }

    // Cookie carousel
    const cookieRows = [];
    for (let i = 0; i < opts.length; i++) {
      const sel = i === idx;
      const label = truncate(opts[i].label || opts[i], 12);
      const key = opts[i].key || (i + 1);
      const top    = sel ? ' \u250F\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2513 ' : ' \u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510 ';
      const c1     = sel ? ' \u2503  (@@@@@@)  \u2503 ' : ' \u2502  (::::::)  \u2502 ';
      const c2     = sel ? ' \u2503 (@@@@@@@@) \u2503 ' : ' \u2502 (::::::::) \u2502 ';
      const c3     = sel ? ' \u2503  (@@@@@@)  \u2503 ' : ' \u2502  (::::::)  \u2502 ';
      const lb     = sel
        ? ` \u2503 [${String(key)}] ${label.padEnd(7)}\u2503 `
        : ` \u2502 [${String(key)}] ${label.padEnd(7)}\u2502 `;
      const bot    = sel ? ' \u2517\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u251B ' : ' \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518 ';
      cookieRows.push([top, c1, c2, c3, lb, bot]);
    }

    // Render side by side (max 4 per row)
    const perRow = Math.min(opts.length, Math.floor(width / 16) || 1);
    for (let row = 0; row < Math.ceil(opts.length / perRow); row++) {
      const slice = cookieRows.slice(row * perRow, (row + 1) * perRow);
      for (let line = 0; line < 6; line++) {
        lines.push(slice.map(c => c[line]).join(''));
      }
    }

    lines.push('');
    lines.push(centerText('\u2190/\u2192 Navigate   Enter=Select', width));
    return lines.join('\n');
  },

  handleInput(key, state) {
    const max = state.options.length - 1;
    if (key === 'left') {
      return { done: false, value: null, state: { ...state, selectedIndex: Math.max(0, state.selectedIndex - 1) } };
    }
    if (key === 'right') {
      return { done: false, value: null, state: { ...state, selectedIndex: Math.min(max, state.selectedIndex + 1) } };
    }
    if (key === 'return') {
      return { done: true, value: state.options[state.selectedIndex], state };
    }
    // Direct number key selection
    const num = parseInt(key, 10);
    if (num >= 1 && num <= state.options.length) {
      return { done: true, value: state.options[num - 1], state: { ...state, selectedIndex: num - 1 } };
    }
    return { done: false, value: null, state };
  },

  getInitialState(data) {
    return { selectedIndex: 0, options: data.choices || [] };
  },
};

// ── 3. TextInputWidget ───────────────────────────────────────────────

export const TextInputWidget = {
  render(data, width = 60) {
    const text = data._text ?? '';
    const crumbs = Math.min(text.length, 20);
    const lines = [];
    if (data.prompt) {
      lines.push(truncate(data.prompt, width));
      lines.push('');
    }
    // Cookie opens up to reveal text field
    lines.push(centerText('     .:::::::::::.', width));
    lines.push(centerText('   .::\' crumbs: ' + String(crumbs).padStart(2) + ' \'::. ', width));
    lines.push(centerText('  /________________________\\', width));
    lines.push(centerText(' |  ' + (text || ' ').padEnd(22) + '|', width));
    lines.push(centerText(' |' + '_'.repeat(24) + '|  ', width));
    lines.push(centerText('  \\.::::::::::::::::::::::./', width));
    lines.push('');
    lines.push(centerText('Type your response. Enter=Submit  Esc=Cancel', width));
    return lines.join('\n');
  },

  handleInput(key, state) {
    if (key === 'return') {
      return { done: true, value: state.text, state };
    }
    if (key === 'escape') {
      return { done: true, value: null, state };
    }
    if (key === 'backspace') {
      const newText = state.text.slice(0, state.cursorPos - 1) + state.text.slice(state.cursorPos);
      return { done: false, value: null, state: { ...state, text: newText, cursorPos: Math.max(0, state.cursorPos - 1) } };
    }
    if (key.length === 1) {
      const newText = state.text.slice(0, state.cursorPos) + key + state.text.slice(state.cursorPos);
      return { done: false, value: null, state: { ...state, text: newText, cursorPos: state.cursorPos + 1 } };
    }
    if (key === 'left') {
      return { done: false, value: null, state: { ...state, cursorPos: Math.max(0, state.cursorPos - 1) } };
    }
    if (key === 'right') {
      return { done: false, value: null, state: { ...state, cursorPos: Math.min(state.text.length, state.cursorPos + 1) } };
    }
    return { done: false, value: null, state };
  },

  getInitialState(data) {
    return { text: data.defaultValue || '', cursorPos: (data.defaultValue || '').length };
  },
};

// ── 4. FilePickerWidget ──────────────────────────────────────────────

export const FilePickerWidget = {
  render(data, width = 60) {
    const entries = data._entries || [];
    const idx = data._selectedIndex ?? 0;
    const currentPath = data._currentPath || '.';
    const lines = [];

    lines.push(`\u250C${'─'.repeat(width - 2)}\u2510`);
    lines.push(`\u2502 \uD83D\uDCC2 ${truncate(currentPath, width - 8).padEnd(width - 6)} \u2502`);
    lines.push(`\u251C${'─'.repeat(width - 2)}\u2524`);

    const visible = 8;
    const start = Math.max(0, idx - Math.floor(visible / 2));
    const end = Math.min(entries.length, start + visible);

    for (let i = start; i < end; i++) {
      const e = entries[i];
      const icon = e.isDir ? '\uD83D\uDCC1' : (e.sensitive ? '\u26A0\uFE0F ' : '\uD83C\uDF6A');
      const sel = i === idx ? ' \u25B6 ' : '   ';
      const name = truncate(e.name, width - 12);
      lines.push(`\u2502${sel}${icon} ${name.padEnd(width - 9)}\u2502`);
    }

    // Pad remaining rows
    for (let i = end - start; i < visible; i++) {
      lines.push(`\u2502${' '.repeat(width - 2)}\u2502`);
    }

    lines.push(`\u251C${'─'.repeat(width - 2)}\u2524`);
    lines.push(`\u2502 \u2191\u2193 Navigate  \u2192 Open  \u2190 Back  Enter=Select${' '.repeat(Math.max(0, width - 47))}\u2502`);
    lines.push(`\u2514${'─'.repeat(width - 2)}\u2518`);
    return lines.join('\n');
  },

  handleInput(key, state) {
    if (key === 'up') {
      return { done: false, value: null, state: { ...state, selectedIndex: Math.max(0, state.selectedIndex - 1) } };
    }
    if (key === 'down') {
      return { done: false, value: null, state: { ...state, selectedIndex: Math.min(state.entries.length - 1, state.selectedIndex + 1) } };
    }
    if (key === 'return') {
      const entry = state.entries[state.selectedIndex];
      if (entry) return { done: true, value: entry, state };
      return { done: false, value: null, state };
    }
    if (key === 'right') {
      const entry = state.entries[state.selectedIndex];
      if (entry?.isDir) {
        return {
          done: false, value: null,
          state: { ...state, currentPath: state.currentPath + '/' + entry.name, selectedIndex: 0, needsRefresh: true },
        };
      }
      return { done: false, value: null, state };
    }
    if (key === 'left') {
      const parent = state.currentPath.split('/').slice(0, -1).join('/') || '.';
      return { done: false, value: null, state: { ...state, currentPath: parent, selectedIndex: 0, needsRefresh: true } };
    }
    if (key === 'escape') {
      return { done: true, value: null, state };
    }
    return { done: false, value: null, state };
  },

  getInitialState(data) {
    return {
      currentPath: data.initialPath || '.',
      entries: data.entries || [],
      selectedIndex: 0,
      needsRefresh: false,
    };
  },
};

// ── 5. CodeReviewWidget ──────────────────────────────────────────────

export const CodeReviewWidget = {
  render(data, width = 60) {
    const codeLines = data._lines || [];
    const approvals = data._lineApprovals || {};
    const mode = data._mode || 'overview';
    const currentLine = data._currentLine ?? 0;
    const findings = data.findings || [];
    const lines = [];

    lines.push(`\u250C${'─'.repeat(width - 2)}\u2510`);
    lines.push(`\u2502 \uD83C\uDF6A Code Review ${mode === 'line' ? '(line-by-line)' : '(overview)'}${' '.repeat(Math.max(0, width - (mode === 'line' ? 36 : 28)))}\u2502`);
    lines.push(`\u251C${'─'.repeat(width - 2)}\u2524`);

    const visible = 12;
    const start = mode === 'line' ? Math.max(0, currentLine - Math.floor(visible / 2)) : 0;
    const end = Math.min(codeLines.length, start + visible);

    for (let i = start; i < end; i++) {
      const num = String(i + 1).padStart(3);
      const approval = approvals[i] === true ? '\u2713' : approvals[i] === false ? '\u2717' : ' ';
      const pointer = (mode === 'line' && i === currentLine) ? '\u25B6' : ' ';
      const finding = findings.find(f => f.line === i + 1);
      let codeLine = truncate(codeLines[i] || '', width - 12);
      if (finding) {
        codeLine = `${codeLine}  \u26A0 ${truncate(finding.message || '', 20)}`;
      }
      codeLine = truncate(codeLine, width - 12);
      lines.push(`\u2502${pointer}${approval} ${num}\u2502 ${codeLine.padEnd(width - 10)}\u2502`);
    }

    for (let i = end - start; i < visible; i++) {
      lines.push(`\u2502${' '.repeat(width - 2)}\u2502`);
    }

    lines.push(`\u251C${'─'.repeat(width - 2)}\u2524`);
    if (mode === 'overview') {
      lines.push(`\u2502 [A] Approve All  [D] Deny All  [L] Line-by-Line${' '.repeat(Math.max(0, width - 50))}\u2502`);
    } else {
      lines.push(`\u2502 \u2191\u2193 Navigate  [A] Approve  [D] Deny  [Esc] Back${' '.repeat(Math.max(0, width - 48))}\u2502`);
    }
    lines.push(`\u2514${'─'.repeat(width - 2)}\u2518`);
    return lines.join('\n');
  },

  handleInput(key, state) {
    if (state.mode === 'overview') {
      if (key === 'a' || key === 'A') {
        const allApproved = {};
        state.lines.forEach((_, i) => { allApproved[i] = true; });
        return { done: true, value: { approved: true, lineApprovals: allApproved }, state: { ...state, lineApprovals: allApproved } };
      }
      if (key === 'd' || key === 'D') {
        return { done: true, value: { approved: false, lineApprovals: {} }, state };
      }
      if (key === 'l' || key === 'L') {
        return { done: false, value: null, state: { ...state, mode: 'line', currentLine: 0 } };
      }
    }

    if (state.mode === 'line') {
      if (key === 'up') {
        return { done: false, value: null, state: { ...state, currentLine: Math.max(0, state.currentLine - 1) } };
      }
      if (key === 'down') {
        return { done: false, value: null, state: { ...state, currentLine: Math.min(state.lines.length - 1, state.currentLine + 1) } };
      }
      if (key === 'a' || key === 'A') {
        const approvals = { ...state.lineApprovals, [state.currentLine]: true };
        const nextLine = Math.min(state.currentLine + 1, state.lines.length - 1);
        return { done: false, value: null, state: { ...state, lineApprovals: approvals, currentLine: nextLine } };
      }
      if (key === 'd' || key === 'D') {
        const approvals = { ...state.lineApprovals, [state.currentLine]: false };
        const nextLine = Math.min(state.currentLine + 1, state.lines.length - 1);
        return { done: false, value: null, state: { ...state, lineApprovals: approvals, currentLine: nextLine } };
      }
      if (key === 'escape') {
        return { done: false, value: null, state: { ...state, mode: 'overview' } };
      }
      if (key === 'return') {
        return { done: true, value: { approved: true, lineApprovals: state.lineApprovals }, state };
      }
    }
    return { done: false, value: null, state };
  },

  getInitialState(data) {
    const code = data.code || '';
    const codeLines = code.split('\n');
    return { lines: codeLines, lineApprovals: {}, mode: 'overview', currentLine: 0 };
  },
};

// ── 6. RatingWidget ──────────────────────────────────────────────────

export const RatingWidget = {
  render(data, width = 60) {
    const value = data._value ?? 5;
    const max = data.max || 10;
    const lines = [];

    if (data.prompt) {
      lines.push(truncate(data.prompt, width));
      lines.push('');
    }

    // Cookie stack visualization
    const stackHeight = Math.ceil(value / 2);
    for (let i = stackHeight; i > 0; i--) {
      lines.push(centerText(i === stackHeight ? ' (@@@@@@) ' : ' (::::::) ', width));
    }
    lines.push(centerText('============', width));
    lines.push('');

    // Progress bar
    const barWidth = Math.min(width - 10, 40);
    const filled = Math.round((value / max) * barWidth);
    const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(barWidth - filled);
    lines.push(centerText(`[${bar}] ${value}/${max}`, width));
    lines.push('');
    lines.push(centerText('\u2190/\u2192 Adjust   Enter=Submit', width));
    return lines.join('\n');
  },

  handleInput(key, state) {
    if (key === 'left') {
      return { done: false, value: null, state: { ...state, value: Math.max(1, state.value - 1) } };
    }
    if (key === 'right') {
      return { done: false, value: null, state: { ...state, value: Math.min(state.max, state.value + 1) } };
    }
    if (key === 'return') {
      return { done: true, value: state.value, state };
    }
    if (key === 'escape') {
      return { done: true, value: null, state };
    }
    // Direct number input
    const num = parseInt(key, 10);
    if (!isNaN(num) && num >= 0 && num <= state.max) {
      return { done: false, value: null, state: { ...state, value: num === 0 ? 10 : num } };
    }
    return { done: false, value: null, state };
  },

  getInitialState(data) {
    return { value: data.defaultValue || Math.ceil((data.max || 10) / 2), max: data.max || 10 };
  },
};

// ── 7. MultiSelectWidget ─────────────────────────────────────────────

export const MultiSelectWidget = {
  render(data, width = 60) {
    const items = data._items || data.items || [];
    const selected = data._selected || new Set();
    const idx = data._selectedIndex ?? 0;
    const lines = [];

    if (data.prompt) {
      lines.push(truncate(data.prompt, width));
      lines.push('');
    }

    lines.push(centerText('\uD83C\uDF6A Cookie Jar \uD83C\uDF6A', width));
    lines.push(`\u250C${'─'.repeat(width - 2)}\u2510`);

    for (let i = 0; i < items.length; i++) {
      const item = typeof items[i] === 'string' ? items[i] : items[i].label || items[i];
      const check = selected.has(i) ? '\u2713' : ' ';
      const pointer = i === idx ? ' \u25B6 ' : '   ';
      lines.push(`\u2502${pointer}[${check}] \uD83C\uDF6A ${truncate(String(item), width - 14).padEnd(width - 12)}\u2502`);
    }

    lines.push(`\u251C${'─'.repeat(width - 2)}\u2524`);
    lines.push(`\u2502 Space=Toggle  A=All  N=None  Enter=Confirm${' '.repeat(Math.max(0, width - 46))}\u2502`);
    lines.push(`\u2514${'─'.repeat(width - 2)}\u2518`);
    return lines.join('\n');
  },

  handleInput(key, state) {
    if (key === 'up') {
      return { done: false, value: null, state: { ...state, selectedIndex: Math.max(0, state.selectedIndex - 1) } };
    }
    if (key === 'down') {
      return { done: false, value: null, state: { ...state, selectedIndex: Math.min(state.options.length - 1, state.selectedIndex + 1) } };
    }
    if (key === 'space' || key === ' ') {
      const newSelected = new Set(state.selected);
      if (newSelected.has(state.selectedIndex)) {
        newSelected.delete(state.selectedIndex);
      } else {
        newSelected.add(state.selectedIndex);
      }
      return { done: false, value: null, state: { ...state, selected: newSelected } };
    }
    if (key === 'a' || key === 'A') {
      const allSelected = new Set(state.options.map((_, i) => i));
      return { done: false, value: null, state: { ...state, selected: allSelected } };
    }
    if (key === 'n' || key === 'N') {
      return { done: false, value: null, state: { ...state, selected: new Set() } };
    }
    if (key === 'return') {
      const selectedItems = [...state.selected].map(i => state.options[i]);
      return { done: true, value: selectedItems, state };
    }
    if (key === 'escape') {
      return { done: true, value: null, state };
    }
    return { done: false, value: null, state };
  },

  getInitialState(data) {
    return { options: data.items || [], selected: new Set(), selectedIndex: 0 };
  },
};

// ── 8. ChainWidget ───────────────────────────────────────────────────

export const ChainWidget = {
  render(data, width = 60) {
    const steps = data._steps || data.steps || [];
    const currentStep = data._currentStep ?? 0;
    const results = data._results || {};
    const lines = [];

    if (data.prompt) {
      lines.push(truncate(data.prompt, width));
      lines.push('');
    }

    // Conveyor belt
    lines.push(centerText('='.repeat(Math.min(steps.length * 14, width - 4)), width));

    const beltRow = [];
    const labelRow = [];
    const statusRow = [];

    for (let i = 0; i < steps.length; i++) {
      const step = typeof steps[i] === 'string' ? steps[i] : steps[i].label || `Step ${i + 1}`;
      let cookie, status;

      if (results[i] === 'approved') {
        cookie = '(\u2713\u2713\u2713\u2713)';
        status = ' done  ';
      } else if (results[i] === 'denied') {
        cookie = '(xxxx)';
        status = ' deny  ';
      } else if (results[i] === 'skipped') {
        cookie = '(----)';
        status = ' skip  ';
      } else if (i === currentStep) {
        cookie = '(::??)';
        status = '\u25B6 curr ';
      } else {
        cookie = '(    )';
        status = '  --  ';
      }

      beltRow.push(cookie);
      labelRow.push(truncate(step, 10).padEnd(10));
      statusRow.push(status.padEnd(10));
    }

    lines.push(centerText(beltRow.join('  \u2192  '), width));
    lines.push(centerText(labelRow.join('     '), width));
    lines.push(centerText(statusRow.join('     '), width));
    lines.push(centerText('='.repeat(Math.min(steps.length * 14, width - 4)), width));
    lines.push('');
    lines.push(centerText('[A] Approve  [D] Deny  [S] Skip  [Esc] Abort', width));
    return lines.join('\n');
  },

  handleInput(key, state) {
    const cs = state.currentStep;

    if (key === 'a' || key === 'A') {
      const results = { ...state.results, [cs]: 'approved' };
      const next = cs + 1;
      if (next >= state.steps.length) {
        return { done: true, value: results, state: { ...state, results, currentStep: next } };
      }
      return { done: false, value: null, state: { ...state, results, currentStep: next } };
    }
    if (key === 'd' || key === 'D') {
      const results = { ...state.results, [cs]: 'denied' };
      return { done: true, value: results, state: { ...state, results } };
    }
    if (key === 's' || key === 'S') {
      const results = { ...state.results, [cs]: 'skipped' };
      const next = cs + 1;
      if (next >= state.steps.length) {
        return { done: true, value: results, state: { ...state, results, currentStep: next } };
      }
      return { done: false, value: null, state: { ...state, results, currentStep: next } };
    }
    if (key === 'escape') {
      return { done: true, value: { ...state.results, aborted: true }, state };
    }
    return { done: false, value: null, state };
  },

  getInitialState(data) {
    return { steps: data.steps || [], currentStep: 0, results: {} };
  },
};

// ── 9. PermissionWidget ──────────────────────────────────────────────

export const PermissionWidget = {
  render(data, width = 60) {
    const holdStart = data._holdStartTime;
    const holdDuration = data._holdDuration || 2000;
    const now = data._now || Date.now();
    const elapsed = holdStart ? now - holdStart : 0;
    const progress = Math.min(elapsed / holdDuration, 1);
    const lines = [];

    if (data.prompt) {
      lines.push(truncate(data.prompt, width));
      lines.push('');
    }

    // Big dramatic Master Cookie
    lines.push(centerText('\u26A0\uFE0F  PERMISSION REQUIRED  \u26A0\uFE0F', width));
    lines.push('');
    lines.push(centerText('       .:::::::::::::::.', width));
    lines.push(centerText('     .:::::::::::::::::::::.',  width));
    lines.push(centerText('    :::: MASTER  COOKIE ::::',  width));
    lines.push(centerText('    ::::  (@@) (@@) (@@) ::::',  width));
    lines.push(centerText('    ::::    (@@) (@@)    ::::',  width));
    lines.push(centerText('    ::::  (@@) (@@) (@@) ::::',  width));
    lines.push(centerText('     \'::::::::::::::::::::\'',  width));
    lines.push(centerText('       \':::::::::::::::\'',  width));
    lines.push('');

    if (holdStart && progress < 1) {
      const barW = 30;
      const filled = Math.round(progress * barW);
      const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(barW - filled);
      const remaining = ((holdDuration - elapsed) / 1000).toFixed(1);
      lines.push(centerText(`HOLD Enter: [${bar}] ${remaining}s`, width));
    } else if (progress >= 1) {
      lines.push(centerText('\u2713 PERMISSION GRANTED', width));
    } else {
      lines.push(centerText('HOLD Enter for 2s to grant  |  Esc=Deny', width));
    }

    return lines.join('\n');
  },

  handleInput(key, state) {
    const now = Date.now();

    if (key === 'escape') {
      return { done: true, value: false, state: { ...state, granted: false, holdStartTime: null } };
    }

    if (key === 'return' || key === 'enter_down') {
      if (!state.holdStartTime) {
        // Start holding
        return { done: false, value: null, state: { ...state, holdStartTime: now } };
      }
      // Check if held long enough
      const elapsed = now - state.holdStartTime;
      if (elapsed >= state.holdDuration) {
        return { done: true, value: true, state: { ...state, granted: true } };
      }
      // Still holding
      return { done: false, value: null, state };
    }

    if (key === 'enter_up' || key === 'key_up') {
      // Released too early
      if (state.holdStartTime) {
        const elapsed = now - state.holdStartTime;
        if (elapsed >= state.holdDuration) {
          return { done: true, value: true, state: { ...state, granted: true } };
        }
        return { done: false, value: null, state: { ...state, holdStartTime: null } };
      }
    }

    return { done: false, value: null, state };
  },

  getInitialState(data) {
    return { holdStartTime: null, holdDuration: data.holdDuration || 2000, granted: false };
  },
};

// ── 10. FreeformWidget ───────────────────────────────────────────────

export const FreeformWidget = {
  render(data, width = 60) {
    const text = data._text ?? '';
    const label = data.contextLabel || data.prompt || 'Your response';
    const lines = [];

    lines.push(truncate(label, width));
    lines.push('');
    lines.push(centerText('    .::::::::::::.', width));
    lines.push(centerText('  .::  open cookie  ::.', width));
    lines.push(centerText(' /________________________\\', width));
    lines.push(centerText('|  ' + (text || ' ').padEnd(22) + ' |', width));
    lines.push(centerText('|' + '_'.repeat(25) + '|', width));
    lines.push(centerText(' \\.::::::::::::::::::::::./', width));
    lines.push('');
    lines.push(centerText('Enter=Submit  Esc=Cancel', width));
    return lines.join('\n');
  },

  handleInput(key, state) {
    if (key === 'return') {
      return { done: true, value: state.text, state };
    }
    if (key === 'escape') {
      return { done: true, value: null, state };
    }
    if (key === 'backspace') {
      const newText = state.text.slice(0, state.cursorPos - 1) + state.text.slice(state.cursorPos);
      return { done: false, value: null, state: { ...state, text: newText, cursorPos: Math.max(0, state.cursorPos - 1) } };
    }
    if (key.length === 1) {
      const newText = state.text.slice(0, state.cursorPos) + key + state.text.slice(state.cursorPos);
      return { done: false, value: null, state: { ...state, text: newText, cursorPos: state.cursorPos + 1 } };
    }
    if (key === 'left') {
      return { done: false, value: null, state: { ...state, cursorPos: Math.max(0, state.cursorPos - 1) } };
    }
    if (key === 'right') {
      return { done: false, value: null, state: { ...state, cursorPos: Math.min(state.text.length, state.cursorPos + 1) } };
    }
    return { done: false, value: null, state };
  },

  getInitialState(data) {
    return { text: '', cursorPos: 0, contextLabel: data.contextLabel || '' };
  },
};

// Widget registry mapping type → widget
export const widgetRegistry = {
  binary: BinaryWidget,
  multiple_choice: MultipleChoiceWidget,
  text_input: TextInputWidget,
  file_picker: FilePickerWidget,
  code_review: CodeReviewWidget,
  rating: RatingWidget,
  multi_select: MultiSelectWidget,
  chain: ChainWidget,
  permission: PermissionWidget,
  freeform: FreeformWidget,
};

export function getWidget(type) {
  return widgetRegistry[type] || FreeformWidget;
}
