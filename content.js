(() => {
  'use strict';

  const VERSION = '3.0.1';
  const RUNTIME_KEY = '__THREADPILOT_RUNTIME__';
  const existingRuntime = globalThis[RUNTIME_KEY];
  if (existingRuntime?.version === VERSION) {
    existingRuntime.refresh?.('reinjected');
    return;
  }

  const runtimeBridge = {
    version: VERSION,
    refresh: () => {}
  };
  globalThis[RUNTIME_KEY] = runtimeBridge;

  const ROOT_ID = 'threadpilot';
  const FOLD_ACTIONS_ID = 'threadpilot-fold-actions';
  const CONTROL_ATTR = 'data-threadpilot-control';
  const DEFAULTS = {
    timelineEnabled: true,
    autoCollapse: true,
    foldPreset: 'balanced'
  };
  const FOLD_PRESETS = {
    compact: { height: 300, chars: 700 },
    balanced: { height: 420, chars: 1000 },
    relaxed: { height: 620, chars: 1800 }
  };
  const MESSAGE_SELECTORS = [
    '[data-message-author-role]',
    '[data-testid^="conversation-turn-"] [data-message-author-role]'
  ];
  const MESSAGE_ROLE_SELECTOR = '[data-message-author-role="user"], [data-message-author-role="assistant"]';
  const TURN_SELECTOR = '[data-testid^="conversation-turn-"]';
  const STOP_SELECTOR = [
    'button[data-testid="stop-button"]',
    'button[aria-label*="Stop generating"]',
    'button[aria-label*="停止生成"]'
  ].join(',');
  const CONTENT_SELECTORS = [
    '.markdown',
    '[data-message-id] .markdown',
    '[data-message-id]',
    '.whitespace-pre-wrap'
  ];

  const state = {
    settings: { ...DEFAULTS },
    root: null,
    foldRoot: null,
    viewport: null,
    track: null,
    position: null,
    foldAllToggle: null,
    preview: null,
    previewTurn: null,
    turns: [],
    manualFold: new Map(),
    autoEvaluated: new Set(),
    activeIndex: -1,
    routeKey: '',
    turnSignature: '',
    rebuildTimer: 0,
    streamTimer: 0,
    scrollFrame: 0,
    geometryFrame: 0,
    highlightTimer: 0,
    navigationUnlockTimer: 0,
    observer: null,
    dragging: false,
    dragIndex: -1,
    pointerActive: false,
    pointerStartY: 0,
    suppressNodeClickUntil: 0,
    scrollContainer: null,
    turnRatios: [],
    navigationLockIndex: -1,
    navigationLockUntil: 0,
    messageCache: new Map(),
    metrics: {
      observerBatches: 0,
      structuralRefreshes: 0,
      streamRefreshes: 0,
      ignoredMutations: 0,
      lastRefreshMs: 0
    }
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const normalizeText = (value) => String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  function queryAll(root, selector) {
    try {
      return [...root.querySelectorAll(selector)];
    } catch {
      return [];
    }
  }

  function closest(root, selector) {
    try {
      return root?.closest?.(selector) || null;
    } catch {
      return null;
    }
  }

  function isThreadPilotNode(node) {
    if (!(node instanceof Element)) return false;
    return node.id === ROOT_ID
      || node.id === FOLD_ACTIONS_ID
      || Boolean(closest(node, `#${ROOT_ID}`))
      || Boolean(closest(node, `#${FOLD_ACTIONS_ID}`))
      || node.hasAttribute(CONTROL_ATTR)
      || Boolean(closest(node, `[${CONTROL_ATTR}]`));
  }

  function hash(value) {
    let result = 2166136261;
    const input = String(value || '');
    for (let index = 0; index < input.length; index += 1) {
      result ^= input.charCodeAt(index);
      result = Math.imul(result, 16777619);
    }
    return (result >>> 0).toString(36);
  }

  function currentConversationKey() {
    return `${location.pathname}${location.search}`;
  }

  function assetUrl(path) {
    return globalThis.chrome?.runtime?.getURL
      ? globalThis.chrome.runtime.getURL(path)
      : `../${path}`;
  }

  function isDocumentScroller(scroller) {
    return !scroller
      || scroller === document.scrollingElement
      || scroller === document.documentElement
      || scroller === document.body;
  }

  function findScrollContainer(element) {
    let parent = element?.parentElement;
    while (parent && parent !== document.body && parent !== document.documentElement) {
      const style = getComputedStyle(parent);
      const scrollable = /(auto|scroll|overlay)/.test(style.overflowY)
        && parent.scrollHeight > parent.clientHeight + 8;
      if (scrollable) return parent;
      parent = parent.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }

  function scrollerViewport(scroller) {
    if (isDocumentScroller(scroller)) {
      return { top: 0, bottom: window.innerHeight, height: window.innerHeight };
    }
    const rect = scroller.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      height: rect.height
    };
  }

  function scrollerTop(scroller) {
    return isDocumentScroller(scroller)
      ? window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0
      : scroller.scrollTop;
  }

  function scrollerMax(scroller) {
    if (isDocumentScroller(scroller)) {
      const page = document.scrollingElement || document.documentElement;
      return Math.max(0, page.scrollHeight - window.innerHeight);
    }
    return Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  }

  function scrollScroller(scroller, top, behavior = 'smooth') {
    const next = clamp(top, 0, scrollerMax(scroller));
    if (isDocumentScroller(scroller)) {
      window.scrollTo({ top: next, behavior });
    } else {
      scroller.scrollTo({ top: next, behavior });
    }
  }

  function navigationAnchor(scroller) {
    const viewport = scrollerViewport(scroller);
    return viewport.top + clamp(viewport.height * 0.14, 84, 112);
  }

  function readSettings() {
    const storage = globalThis.chrome?.storage?.sync;
    if (!storage) {
      rebuild('storage-unavailable', true);
      return;
    }
    storage.get(null, (items) => {
      state.settings = {
        timelineEnabled: typeof items.timelineEnabled === 'boolean'
          ? items.timelineEnabled
          : items.enabled !== false,
        autoCollapse: typeof items.autoCollapse === 'boolean'
          ? items.autoCollapse
          : items.aiCollapseEnabled !== false,
        foldPreset: FOLD_PRESETS[items.foldPreset] ? items.foldPreset : DEFAULTS.foldPreset
      };
      rebuild('settings-loaded', true);
    });
  }

  function saveSettings(patch) {
    state.settings = { ...state.settings, ...patch };
    globalThis.chrome?.storage?.sync?.set(patch);
    applySettings();
  }

  function messageRoot(roleNode) {
    return closest(roleNode, '[data-testid^="conversation-turn-"]')
      || closest(roleNode, 'article')
      || closest(roleNode, '[data-message-id]')
      || roleNode;
  }

  function contentNode(roleNode, root) {
    for (const selector of CONTENT_SELECTORS) {
      const node = roleNode.matches?.(selector)
        ? roleNode
        : roleNode.querySelector?.(selector) || root.querySelector?.(selector);
      if (node && !isThreadPilotNode(node)) return node;
    }
    return roleNode;
  }

  function readableText(node, limit = 2400) {
    if (!node) return '';
    const clone = node.cloneNode(true);
    queryAll(clone, [
      `#${ROOT_ID}`,
      `[${CONTROL_ATTR}]`,
      'button',
      'nav',
      'textarea',
      'input',
      '[contenteditable="true"]',
      '[data-testid*="copy"]',
      '[data-testid*="feedback"]'
    ].join(',')).forEach((item) => item.remove());
    const value = normalizeText(clone.innerText || clone.textContent);
    return value.length > limit ? `${value.slice(0, limit)}…` : value;
  }

  function stableMessageKey(roleNode, root, role, index) {
    const messageId = root.getAttribute?.('data-message-id')
      || roleNode.getAttribute?.('data-message-id')
      || root.querySelector?.('[data-message-id]')?.getAttribute('data-message-id');
    if (messageId) return messageId;

    const testId = root.getAttribute?.('data-testid');
    if (testId) return `${testId}:${role}`;

    return `${currentConversationKey()}:${role}:${index}`;
  }

  function collectMessages({ refreshKeys = null, refreshAll = false } = {}) {
    const main = document.querySelector('main') || document.body;
    const seen = new Set();
    const roleNodes = [];

    for (const selector of MESSAGE_SELECTORS) {
      queryAll(main, selector).forEach((node) => {
        if (!seen.has(node) && !isThreadPilotNode(node)) {
          seen.add(node);
          roleNodes.push(node);
        }
      });
    }

    roleNodes.sort((a, b) => {
      if (a === b) return 0;
      const relation = a.compareDocumentPosition(b);
      return relation & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });

    return roleNodes.map((roleNode, index) => {
      const role = roleNode.getAttribute('data-message-author-role');
      const root = messageRoot(roleNode);
      const content = contentNode(roleNode, root);
      const key = stableMessageKey(roleNode, root, role, index);
      const cached = state.messageCache.get(key);
      const shouldRefresh = refreshAll
        || refreshKeys?.has(key)
        || !cached
        || cached.root !== root
        || cached.content !== content;
      const message = {
        role,
        root,
        roleNode,
        content,
        text: shouldRefresh ? readableText(content) : cached.text,
        key
      };
      state.messageCache.set(key, message);
      return message;
    }).filter((message) => (
      (message.role === 'user' || message.role === 'assistant')
      && message.root?.isConnected
      && !isThreadPilotNode(message.root)
    ));
  }

  function collectTurns(options) {
    const messages = collectMessages(options);
    const turns = [];

    for (const message of messages) {
      if (message.role === 'user') {
        turns.push({
          id: `turn-${message.key}`,
          user: message,
          assistant: null,
          promptPreview: message.text || '未命名提问',
          answerPreview: '',
          answerLength: 0
        });
        continue;
      }

      const current = turns.at(-1);
      if (current && !current.assistant) {
        current.assistant = message;
        current.answerPreview = message.text;
        current.answerLength = message.text.length;
      } else {
        turns.push({
          id: `turn-orphan-${message.key}`,
          user: {
            ...message,
            role: 'synthetic',
            text: '较早的对话'
          },
          assistant: message,
          promptPreview: '较早的回答',
          answerPreview: message.text,
          answerLength: message.text.length,
          syntheticPrompt: true
        });
      }
    }

    return turns;
  }

  function isStreaming(turn) {
    const root = turn.assistant?.root;
    if (!root) return true;
    const rootStreaming = Boolean(
      root.matches?.('.result-streaming')
      || root.querySelector?.('.result-streaming')
      || root.querySelector?.('[data-is-streaming="true"]')
      || root.querySelector?.('[data-testid*="stop"]')
    );
    if (rootStreaming) return true;

    if (state.turns.at(-1)?.id !== turn.id) return false;
    const globalStopControl = document.querySelector(STOP_SELECTOR);
    return Boolean(globalStopControl);
  }

  function preset() {
    return FOLD_PRESETS[state.settings.foldPreset] || FOLD_PRESETS.balanced;
  }

  function isLongAnswer(turn) {
    const content = turn.assistant?.content;
    if (!content) return false;
    const threshold = preset();
    return turn.answerLength >= threshold.chars
      || content.scrollHeight > threshold.height + 24;
  }

  function answerState(turn) {
    if (!turn.assistant) return 'pending';
    const manual = state.manualFold.get(turn.id);
    if (manual) return manual;
    if (!state.settings.autoCollapse || isStreaming(turn)) return 'expanded';
    return isLongAnswer(turn) ? 'collapsed' : 'expanded';
  }

  function formatLength(length) {
    return new Intl.NumberFormat(document.documentElement.lang || 'zh-CN').format(length || 0);
  }

  function ensureAnswerId(turn) {
    const content = turn.assistant?.content;
    if (!content) return '';
    if (!content.id) content.id = `threadpilot-answer-${hash(turn.id)}`;
    return content.id;
  }

  function foldControl(turn) {
    const assistant = turn.assistant;
    if (!assistant?.content) return null;

    let control = assistant.root.querySelector?.(
      `:scope [${CONTROL_ATTR}="fold"][data-turn-id="${CSS.escape(turn.id)}"]`
    );
    if (control) return control;

    control = document.createElement('div');
    control.className = 'tp-fold-control';
    control.setAttribute(CONTROL_ATTR, 'fold');
    control.dataset.turnId = turn.id;

    const status = document.createElement('span');
    status.className = 'tp-fold-status';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tp-fold-toggle';
    button.addEventListener('click', () => {
      const currentTurn = state.turns.find((item) => item.id === control.dataset.turnId);
      if (!currentTurn) return;
      const viewportAnchor = captureViewportAnchor();
      const collapsed = answerState(currentTurn) === 'collapsed';
      state.manualFold.set(currentTurn.id, collapsed ? 'expanded' : 'collapsed');
      applyFold(currentTurn);
      restoreViewportAnchor(viewportAnchor);
      renderTimelineState();
      scheduleTimelineGeometry();
    });

    control.append(status, button);
    assistant.content.insertAdjacentElement('afterend', control);
    return control;
  }

  function applyFold(turn) {
    const assistant = turn.assistant;
    if (!assistant?.content) return;

    if (isStreaming(turn)) {
      assistant.root.classList.add('tp-assistant-turn');
      assistant.content.classList.remove('tp-answer-collapsed');
      const existingControl = assistant.root.querySelector?.(
        `:scope [${CONTROL_ATTR}="fold"][data-turn-id="${CSS.escape(turn.id)}"]`
      );
      existingControl?.remove();
      return;
    }

    const contentId = ensureAnswerId(turn);
    const control = foldControl(turn);
    const status = answerState(turn);
    const collapsed = status === 'collapsed';
    const longAnswer = isLongAnswer(turn);

    assistant.root.classList.add('tp-assistant-turn');
    assistant.content.classList.toggle('tp-answer-collapsed', collapsed);
    assistant.content.style.setProperty('--tp-fold-height', `${preset().height}px`);

    if (control) {
      control.dataset.collapsed = String(collapsed);
      control.dataset.long = String(longAnswer);
      const label = control.querySelector('.tp-fold-status');
      const button = control.querySelector('.tp-fold-toggle');
      label.textContent = collapsed
        ? `已折叠 · ${formatLength(turn.answerLength)} 字`
        : `${formatLength(turn.answerLength)} 字`;
      button.textContent = collapsed ? '展开' : '收起';
      button.setAttribute('aria-expanded', String(!collapsed));
      button.setAttribute('aria-controls', contentId);
      button.setAttribute(
        'aria-label',
        collapsed ? `展开第 ${state.turns.indexOf(turn) + 1} 轮回答` : `收起第 ${state.turns.indexOf(turn) + 1} 轮回答`
      );
    }

    state.autoEvaluated.add(turn.id);
  }

  function clearOrphanedControls() {
    const turnIds = new Set(state.turns.map((turn) => turn.id));
    queryAll(document, `[${CONTROL_ATTR}="fold"]`).forEach((control) => {
      if (!turnIds.has(control.dataset.turnId)) control.remove();
    });
    queryAll(document, '.tp-answer-collapsed').forEach((content) => {
      const control = content.nextElementSibling;
      if (!control?.matches?.(`[${CONTROL_ATTR}="fold"]`)) {
        content.classList.remove('tp-answer-collapsed');
      }
    });
  }

  function applyAllFolds() {
    state.turns.forEach(applyFold);
    clearOrphanedControls();
  }

  function setAllFolds(mode) {
    const viewportAnchor = captureViewportAnchor();
    state.turns.forEach((turn) => {
      if (turn.assistant && !isStreaming(turn)) {
        state.manualFold.set(turn.id, mode);
      }
    });
    applyAllFolds();
    restoreViewportAnchor(viewportAnchor);
    renderTimelineState();
    scheduleTimelineGeometry();
  }

  function captureViewportAnchor() {
    if (!state.turns.length) return null;
    const index = clamp(state.activeIndex < 0 ? activeTurnIndex() : state.activeIndex, 0, state.turns.length - 1);
    const root = state.turns[index]?.user?.root;
    if (!root?.isConnected) return null;
    const scroller = findScrollContainer(root);
    const viewport = scrollerViewport(scroller);
    return {
      index,
      root,
      offset: root.getBoundingClientRect().top - viewport.top
    };
  }

  function restoreViewportAnchor(anchor) {
    if (!anchor?.root?.isConnected) return;
    const scroller = findScrollContainer(anchor.root);
    const viewport = scrollerViewport(scroller);
    const nextOffset = anchor.root.getBoundingClientRect().top - viewport.top;
    const delta = nextOffset - anchor.offset;
    state.scrollContainer = scroller;
    if (Math.abs(delta) > 0.5) {
      scrollScroller(scroller, scrollerTop(scroller) + delta, 'auto');
    }
    lockNavigation(anchor.index, 180);
  }

  function createRoot() {
    if (state.root?.isConnected) {
      createFoldRoot();
      return state.root;
    }

    const root = document.createElement('aside');
    root.id = ROOT_ID;
    root.dataset.version = VERSION;
    root.setAttribute('aria-label', '对话时间线');
    root.innerHTML = `
      <div class="tp-rail-head">
        <button class="tp-boundary-button" type="button" data-action="jump-top" aria-label="回到对话顶部">
          <img src="${assetUrl('icons/ui/arrow-bar-to-up.svg')}" alt="">
        </button>
        <span class="tp-position" aria-live="polite">0 / 0</span>
      </div>
      <div class="tp-viewport">
        <nav class="tp-track" aria-label="对话轮次">
          <span class="tp-progress" aria-hidden="true"></span>
        </nav>
      </div>
      <div class="tp-rail-foot">
        <button class="tp-boundary-button" type="button" data-action="jump-bottom" aria-label="跳到对话底部">
          <img src="${assetUrl('icons/ui/arrow-bar-to-down.svg')}" alt="">
        </button>
      </div>
      <div class="tp-preview" role="tooltip" aria-hidden="true">
        <div class="tp-preview-meta">
          <strong class="tp-preview-index"></strong>
          <span class="tp-preview-state"></span>
        </div>
        <div class="tp-preview-prompt"></div>
        <div class="tp-preview-answer"></div>
        <div class="tp-preview-hint">点击跳转</div>
      </div>
    `;

    document.body.append(root);
    state.root = root;
    state.viewport = root.querySelector('.tp-viewport');
    state.track = root.querySelector('.tp-track');
    state.position = root.querySelector('.tp-position');
    state.preview = root.querySelector('.tp-preview');

    createFoldRoot();
    root.querySelector('[data-action="jump-top"]').addEventListener('click', () => {
      jumpToBoundary('top');
    });
    root.querySelector('[data-action="jump-bottom"]').addEventListener('click', () => {
      jumpToBoundary('bottom');
    });

    bindTrackScrubber();
    return root;
  }

  function createFoldRoot() {
    if (state.foldRoot?.isConnected) return state.foldRoot;

    const foldRoot = document.createElement('div');
    foldRoot.id = FOLD_ACTIONS_ID;
    foldRoot.dataset.version = VERSION;
    foldRoot.setAttribute('aria-label', '批量折叠控制');
    foldRoot.innerHTML = `
      <button class="tp-fold-all-toggle" type="button" data-action="toggle-all-folds">
        <img src="${assetUrl('icons/ui/arrows-minimize.svg')}" alt="">
        <span class="tp-control-tooltip" aria-hidden="true">折叠全部回答</span>
      </button>
    `;
    document.body.append(foldRoot);
    state.foldRoot = foldRoot;
    state.foldAllToggle = foldRoot.querySelector('.tp-fold-all-toggle');
    state.foldAllToggle.addEventListener('click', (event) => {
      event.stopPropagation();
      const eligible = state.turns.filter((turn) => turn.assistant && !isStreaming(turn));
      const allCollapsed = eligible.length > 0
        && eligible.every((turn) => answerState(turn) === 'collapsed');
      setAllFolds(allCollapsed ? 'expanded' : 'collapsed');
    });
    return foldRoot;
  }

  function previewText(value, limit) {
    const normalized = normalizeText(value);
    if (!normalized) return '暂无内容';
    return normalized.length > limit ? `${normalized.slice(0, limit)}…` : normalized;
  }

  function showPreview(turn, anchor) {
    if (!state.preview || !turn) return;
    state.previewTurn = turn;
    const index = state.turns.indexOf(turn);
    const foldState = answerState(turn);
    const stateLabel = foldState === 'pending'
      ? '正在生成'
      : foldState === 'collapsed'
        ? '已折叠'
        : '已展开';

    state.preview.querySelector('.tp-preview-index').textContent = `第 ${index + 1} 轮`;
    state.preview.querySelector('.tp-preview-state').textContent = stateLabel;
    state.preview.querySelector('.tp-preview-prompt').textContent = previewText(turn.promptPreview, 100);
    state.preview.querySelector('.tp-preview-answer').textContent = turn.assistant
      ? previewText(turn.answerPreview, 150)
      : '等待 ChatGPT 回复';

    const rect = anchor?.getBoundingClientRect?.();
    const y = rect
      ? clamp(rect.top + rect.height / 2, 120, window.innerHeight - 120)
      : window.innerHeight / 2;
    state.preview.style.setProperty('--tp-preview-y', `${y}px`);
    state.preview.setAttribute('aria-hidden', 'false');
  }

  function hidePreview() {
    if (!state.preview || state.dragging) return;
    state.preview.setAttribute('aria-hidden', 'true');
    state.previewTurn = null;
  }

  function jumpToTurn(turn, behavior = 'smooth') {
    const root = turn?.user?.root;
    if (!root?.isConnected) return;
    const index = state.turns.indexOf(turn);
    const scroller = findScrollContainer(root);
    const viewport = scrollerViewport(scroller);
    const destination = scrollerTop(scroller)
      + root.getBoundingClientRect().top
      - navigationAnchor(scroller);
    state.scrollContainer = scroller;
    lockNavigation(index, behavior === 'smooth' ? 2200 : 80);
    scrollScroller(scroller, destination, behavior);
    root.classList.add('tp-jump-target');
    clearTimeout(state.highlightTimer);
    state.highlightTimer = window.setTimeout(() => {
      root.classList.remove('tp-jump-target');
    }, 1300);
  }

  function jumpToBoundary(boundary, behavior = 'smooth') {
    if (!state.turns.length) return;
    const index = boundary === 'top' ? 0 : state.turns.length - 1;
    const scroller = findScrollContainer(state.turns[index].user.root);
    state.scrollContainer = scroller;
    lockNavigation(index, behavior === 'smooth' ? 2200 : 80);
    scrollScroller(scroller, boundary === 'top' ? 0 : scrollerMax(scroller), behavior);
  }

  function lockNavigation(index, duration) {
    clearTimeout(state.navigationUnlockTimer);
    state.navigationLockIndex = index;
    state.navigationLockUntil = performance.now() + duration;
    state.activeIndex = index;
    renderTimelineState();
    state.navigationUnlockTimer = window.setTimeout(() => {
      state.navigationLockIndex = -1;
      state.navigationLockUntil = 0;
      updateActiveTurn(true);
    }, duration);
  }

  function nodeForTurn(turn, index) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tp-node';
    button.dataset.turnId = turn.id;
    button.dataset.index = String(index);
    button.setAttribute('aria-label', `第 ${index + 1} 轮：${previewText(turn.promptPreview, 70)}`);
    button.innerHTML = '<span class="tp-tick" aria-hidden="true"></span>';

    button.addEventListener('mouseenter', () => showPreview(turn, button));
    button.addEventListener('mouseleave', hidePreview);
    button.addEventListener('focus', () => showPreview(turn, button));
    button.addEventListener('blur', hidePreview);
    button.addEventListener('click', (event) => {
      if (performance.now() < state.suppressNodeClickUntil) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      jumpToTurn(turn);
    });
    return button;
  }

  function renderTimeline() {
    const root = createRoot();
    const progress = document.createElement('span');
    progress.className = 'tp-progress';
    progress.setAttribute('aria-hidden', 'true');
    state.track.replaceChildren(progress, ...state.turns.map(nodeForTurn));
    root.hidden = !state.settings.timelineEnabled || state.turns.length <= 1;
    updateTimelineGeometry();
    updateActiveTurn(true);
  }

  function renderTimelineState() {
    if (!state.root?.isConnected) return;
    const nodes = queryAll(state.track, '.tp-node');
    nodes.forEach((node, index) => {
      const turn = state.turns[index];
      node.classList.toggle('is-active', index === state.activeIndex);
      node.classList.toggle('is-collapsed', answerState(turn) === 'collapsed');
      node.setAttribute('aria-current', index === state.activeIndex ? 'step' : 'false');
    });
    const ratio = state.turnRatios[state.activeIndex] ?? 0;
    state.track?.style.setProperty('--tp-progress', `${clamp(ratio, 0, 1) * 100}%`);
    state.position.textContent = state.turns.length
      ? `${Math.max(0, state.activeIndex) + 1} / ${state.turns.length}`
      : '0 / 0';
    renderFoldAllToggle();
    updateDiagnostics();
  }

  function healthSnapshot() {
    const completedAnswers = state.turns.filter((turn) => turn.assistant && !isStreaming(turn));
    return {
      type: 'threadpilot:health',
      connected: true,
      version: VERSION,
      conversation: currentConversationKey(),
      turns: state.turns.length,
      completedAnswers: completedAnswers.length,
      collapsedAnswers: completedAnswers.filter((turn) => answerState(turn) === 'collapsed').length,
      timelineEnabled: state.settings.timelineEnabled,
      autoCollapse: state.settings.autoCollapse,
      metrics: { ...state.metrics }
    };
  }

  function updateDiagnostics() {
    if (!state.root?.isConnected) return;
    const health = healthSnapshot();
    state.root.dataset.version = VERSION;
    state.root.dataset.turns = String(health.turns);
    state.root.dataset.collapsed = String(health.collapsedAnswers);
    state.root.dataset.refreshMs = String(Math.round(state.metrics.lastRefreshMs * 10) / 10);
    state.root.dataset.observerBatches = String(state.metrics.observerBatches);
    state.root.dataset.structuralRefreshes = String(state.metrics.structuralRefreshes);
    state.root.dataset.streamRefreshes = String(state.metrics.streamRefreshes);
    state.root.dataset.ignoredMutations = String(state.metrics.ignoredMutations);
    if (state.foldRoot?.isConnected) {
      state.foldRoot.dataset.version = VERSION;
    }
  }

  function renderFoldAllToggle() {
    if (!state.foldAllToggle?.isConnected) return;
    const eligible = state.turns.filter((turn) => turn.assistant && !isStreaming(turn));
    const allCollapsed = eligible.length > 0
      && eligible.every((turn) => answerState(turn) === 'collapsed');
    const label = allCollapsed ? '展开全部回答' : '折叠全部回答';
    const icon = allCollapsed ? 'arrows-maximize.svg' : 'arrows-minimize.svg';
    state.foldRoot.hidden = eligible.length <= 1;
    state.foldAllToggle.disabled = eligible.length === 0;
    state.foldAllToggle.dataset.mode = allCollapsed ? 'expand' : 'collapse';
    state.foldAllToggle.setAttribute('aria-label', label);
    state.foldAllToggle.setAttribute('title', label);
    state.foldAllToggle.querySelector('img').src = assetUrl(`icons/ui/${icon}`);
    state.foldAllToggle.querySelector('.tp-control-tooltip').textContent = label;
  }

  function updateTimelineGeometry() {
    if (!state.track?.isConnected || !state.turns.length) {
      state.turnRatios = [];
      return;
    }

    const scroller = findScrollContainer(state.turns[0].user.root);
    const viewport = scrollerViewport(scroller);
    const scrollTop = scrollerTop(scroller);
    const points = state.turns.map((turn) => (
      scrollTop + turn.user.root.getBoundingClientRect().top - viewport.top
    ));
    const first = points[0];
    const span = Math.max(1, points[points.length - 1] - first);
    state.scrollContainer = scroller;
    state.turnRatios = points.map((point) => clamp((point - first) / span, 0, 1));

    queryAll(state.track, '.tp-node').forEach((node, index) => {
      const ratio = state.turnRatios[index];
      const start = index === 0
        ? 0
        : (state.turnRatios[index - 1] + ratio) / 2;
      const end = index === state.turnRatios.length - 1
        ? 1
        : (ratio + state.turnRatios[index + 1]) / 2;
      const localPoint = end === start ? 0.5 : (ratio - start) / (end - start);
      node.style.top = `${start * 100}%`;
      node.style.height = `${Math.max(0.001, end - start) * 100}%`;
      node.style.setProperty('--tp-node-point', `${clamp(localPoint, 0, 1) * 100}%`);
    });
    renderTimelineState();
  }

  function scheduleTimelineGeometry() {
    if (state.geometryFrame) cancelAnimationFrame(state.geometryFrame);
    state.geometryFrame = requestAnimationFrame(() => {
      state.geometryFrame = 0;
      updateTimelineGeometry();
    });
  }

  function nearestTurnIndex(clientY) {
    const rect = state.track?.getBoundingClientRect();
    if (!rect || !state.turns.length) return -1;
    const ratio = clamp((clientY - rect.top) / rect.height, 0, 1);
    let nearest = 0;
    let distance = Number.POSITIVE_INFINITY;
    state.turnRatios.forEach((turnRatio, index) => {
      const nextDistance = Math.abs(turnRatio - ratio);
      if (nextDistance < distance) {
        distance = nextDistance;
        nearest = index;
      }
    });
    return nearest;
  }

  function previewDragIndex(index) {
    if (index < 0 || index === state.dragIndex) return;
    state.dragIndex = index;
    const node = state.track.querySelector(`.tp-node[data-index="${index}"]`);
    showPreview(state.turns[index], node);
    queryAll(state.track, '.tp-node').forEach((item, itemIndex) => {
      item.classList.toggle('is-scrubbed', itemIndex === index);
    });
  }

  function bindTrackScrubber() {
    state.track.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      state.pointerActive = true;
      state.dragging = false;
      state.pointerStartY = event.clientY;
      state.dragIndex = nearestTurnIndex(event.clientY);
      state.track.setPointerCapture?.(event.pointerId);
    });

    state.track.addEventListener('pointermove', (event) => {
      if (!state.pointerActive) return;
      if (!state.dragging && Math.abs(event.clientY - state.pointerStartY) < 5) return;
      state.dragging = true;
      event.preventDefault();
      previewDragIndex(nearestTurnIndex(event.clientY));
    });

    state.track.addEventListener('pointerup', (event) => {
      if (!state.pointerActive) return;
      const completedDrag = state.dragging;
      state.pointerActive = false;
      state.track.releasePointerCapture?.(event.pointerId);
      if (completedDrag && state.dragIndex >= 0) {
        event.preventDefault();
        state.suppressNodeClickUntil = performance.now() + 160;
        jumpToTurn(state.turns[state.dragIndex]);
      }
      state.dragging = false;
      state.dragIndex = -1;
      queryAll(state.track, '.tp-node').forEach((item) => item.classList.remove('is-scrubbed'));
      hidePreview();
    });

    state.track.addEventListener('pointercancel', () => {
      state.pointerActive = false;
      state.dragging = false;
      state.dragIndex = -1;
      hidePreview();
    });
  }

  function activeTurnIndex() {
    if (!state.turns.length) return -1;
    if (
      state.navigationLockIndex >= 0
      && performance.now() < state.navigationLockUntil
    ) {
      return state.navigationLockIndex;
    }
    const scroller = findScrollContainer(state.turns[0].user.root);
    const top = scrollerTop(scroller);
    const max = scrollerMax(scroller);
    if (top <= 2) return 0;
    if (top >= max - 2) return state.turns.length - 1;
    const anchor = navigationAnchor(scroller) + 2;
    let active = 0;
    for (let index = 0; index < state.turns.length; index += 1) {
      const rect = state.turns[index].user.root.getBoundingClientRect();
      if (rect.top <= anchor) active = index;
      else break;
    }
    return active;
  }

  function updateActiveTurn(force = false) {
    const next = activeTurnIndex();
    if (!force && next === state.activeIndex) return;
    state.activeIndex = next;
    renderTimelineState();
  }

  function scheduleActiveUpdate() {
    if (state.scrollFrame) return;
    state.scrollFrame = requestAnimationFrame(() => {
      state.scrollFrame = 0;
      updateActiveTurn();
    });
  }

  function applySettings() {
    createRoot();
    state.root.hidden = !state.settings.timelineEnabled || state.turns.length <= 1;
    applyAllFolds();
    renderTimelineState();
  }

  function routeChanged() {
    const route = currentConversationKey();
    if (route === state.routeKey) return false;
    state.routeKey = route;
    state.manualFold.clear();
    state.autoEvaluated.clear();
    state.messageCache.clear();
    state.turnSignature = '';
    state.activeIndex = -1;
    state.turnRatios = [];
    state.navigationLockIndex = -1;
    clearTimeout(state.navigationUnlockTimer);
    return true;
  }

  function turnSignature(turns) {
    return turns.map((turn) => `${turn.id}:${turn.assistant?.key || ''}`).join('|');
  }

  function rebuild(reason = 'structural', refreshAll = false) {
    const startedAt = performance.now();
    const changedRoute = routeChanged();
    const previousTurns = state.turns;
    const nextTurns = collectTurns({ refreshAll: refreshAll || changedRoute });
    const nextSignature = turnSignature(nextTurns);
    const rootsChanged = nextTurns.length !== previousTurns.length
      || nextTurns.some((turn, index) => (
        turn.user?.root !== previousTurns[index]?.user?.root
        || turn.assistant?.root !== previousTurns[index]?.assistant?.root
      ));
    const structureChanged = nextSignature !== state.turnSignature || rootsChanged;
    state.turns = nextTurns;
    state.turnSignature = nextSignature;
    applyAllFolds();
    if (structureChanged || !state.track?.isConnected) {
      renderTimeline();
    } else {
      renderTimelineState();
      scheduleTimelineGeometry();
    }
    state.metrics.structuralRefreshes += 1;
    state.metrics.lastRefreshMs = performance.now() - startedAt;
    updateDiagnostics();
    runtimeBridge.lastReason = reason;
  }

  function scheduleRebuild(delay = 80, reason = 'mutation') {
    if (state.rebuildTimer) return;
    state.rebuildTimer = window.setTimeout(() => {
      state.rebuildTimer = 0;
      rebuild(reason);
    }, delay);
  }

  function scheduleStreamingRefresh(delay = 420) {
    if (state.streamTimer) return;
    state.streamTimer = window.setTimeout(() => {
      state.streamTimer = 0;
      refreshStreamingTurn();
    }, delay);
  }

  function refreshStreamingTurn() {
    const startedAt = performance.now();
    const main = document.querySelector('main') || document.body;
    const assistantNodes = queryAll(main, '[data-message-author-role="assistant"]');
    const roleNode = assistantNodes.at(-1);
    if (!roleNode) {
      scheduleRebuild(0, 'stream-without-assistant');
      return;
    }

    const root = messageRoot(roleNode);
    const content = contentNode(roleNode, root);
    const key = stableMessageKey(roleNode, root, 'assistant', assistantNodes.length - 1);
    const message = {
      role: 'assistant',
      root,
      roleNode,
      content,
      text: readableText(content),
      key
    };
    state.messageCache.set(key, message);

    const turn = state.turns.find((item) => item.assistant?.key === key);
    if (!turn) {
      scheduleRebuild(0, 'new-streaming-turn');
      return;
    }

    turn.assistant = message;
    turn.answerPreview = message.text;
    turn.answerLength = message.text.length;
    applyFold(turn);
    renderTimelineState();
    scheduleTimelineGeometry();
    state.metrics.streamRefreshes += 1;
    state.metrics.lastRefreshMs = performance.now() - startedAt;
    updateDiagnostics();
  }

  function elementFromMutationNode(node) {
    if (node instanceof Element) return node;
    return node?.parentElement || null;
  }

  function matchesOrContains(element, selector) {
    return Boolean(
      element
      && (element.matches?.(selector) || element.querySelector?.(selector))
    );
  }

  function mutationTouchesStructure(mutation) {
    if (isThreadPilotNode(elementFromMutationNode(mutation.target))) return false;
    return [...mutation.addedNodes, ...mutation.removedNodes].some((node) => {
      const element = elementFromMutationNode(node);
      if (!element || isThreadPilotNode(element)) return false;
      return matchesOrContains(element, MESSAGE_ROLE_SELECTOR)
        || matchesOrContains(element, TURN_SELECTOR);
    });
  }

  function mutationTouchesStreaming(mutation) {
    const target = elementFromMutationNode(mutation.target);
    if (!target || isThreadPilotNode(target)) return false;
    if (closest(target, '[data-message-author-role="assistant"]')) return true;
    return [...mutation.addedNodes, ...mutation.removedNodes].some((node) => {
      const element = elementFromMutationNode(node);
      return matchesOrContains(element, STOP_SELECTOR);
    });
  }

  function observe() {
    state.observer?.disconnect();
    state.observer = new MutationObserver((mutations) => {
      state.metrics.observerBatches += 1;
      if (currentConversationKey() !== state.routeKey) {
        scheduleRebuild(40, 'route-change');
        return;
      }
      if (mutations.some(mutationTouchesStructure)) {
        scheduleRebuild(60, 'message-structure');
        return;
      }
      if (mutations.some(mutationTouchesStreaming)) {
        scheduleStreamingRefresh();
        return;
      }
      state.metrics.ignoredMutations += mutations.length;
    });
    state.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    window.addEventListener('scroll', scheduleActiveUpdate, { capture: true, passive: true });
    window.addEventListener('resize', () => {
      scheduleTimelineGeometry();
      scheduleActiveUpdate();
    }, { passive: true });
    window.addEventListener('popstate', () => scheduleRebuild(40, 'popstate'));

    globalThis.chrome?.storage?.onChanged?.addListener((changes, area) => {
      if (area !== 'sync') return;
      const patch = {};
      if (changes.timelineEnabled) patch.timelineEnabled = Boolean(changes.timelineEnabled.newValue);
      if (changes.autoCollapse) patch.autoCollapse = Boolean(changes.autoCollapse.newValue);
      if (changes.foldPreset && FOLD_PRESETS[changes.foldPreset.newValue]) {
        patch.foldPreset = changes.foldPreset.newValue;
      }
      state.settings = { ...state.settings, ...patch };
      applySettings();
    });
  }

  function jumpRelative(offset) {
    if (!state.turns.length) return;
    const start = state.activeIndex < 0 ? 0 : state.activeIndex;
    jumpToTurn(state.turns[clamp(start + offset, 0, state.turns.length - 1)]);
  }

  document.addEventListener('keydown', (event) => {
    const editable = closest(event.target, 'input, textarea, select, [contenteditable="true"], [role="textbox"]');
    if (editable || !event.altKey || event.ctrlKey || event.metaKey) return;

    const key = event.key.toLowerCase();
    if (key === 'j') {
      event.preventDefault();
      saveSettings({ timelineEnabled: !state.settings.timelineEnabled });
    } else if (key === 'c') {
      event.preventDefault();
      const hasExpanded = state.turns.some((turn) => turn.assistant && answerState(turn) !== 'collapsed');
      setAllFolds(hasExpanded ? 'collapsed' : 'expanded');
    } else if (key === 'n') {
      event.preventDefault();
      jumpRelative(1);
    } else if (key === 'p') {
      event.preventDefault();
      jumpRelative(-1);
    }
  });

  function cleanupStaleDom() {
    queryAll(document, `#${ROOT_ID}, #${FOLD_ACTIONS_ID}`).forEach((node) => node.remove());
    queryAll(document, `[${CONTROL_ATTR}]`).forEach((node) => node.remove());
    queryAll(document, '.tp-answer-collapsed').forEach((node) => {
      node.classList.remove('tp-answer-collapsed');
      node.style.removeProperty('--tp-fold-height');
    });
    queryAll(document, '.tp-assistant-turn').forEach((node) => {
      node.classList.remove('tp-assistant-turn');
    });
  }

  function registerRuntimeMessaging() {
    globalThis.chrome?.runtime?.onMessage?.addListener((message, _sender, sendResponse) => {
      if (message?.type === 'threadpilot:ping') {
        sendResponse(healthSnapshot());
        return false;
      }
      if (message?.type === 'threadpilot:refresh') {
        scheduleRebuild(0, 'popup-refresh');
        sendResponse(healthSnapshot());
        return false;
      }
      return false;
    });
  }

  function init() {
    try {
      cleanupStaleDom();
      state.routeKey = currentConversationKey();
      createRoot();
      observe();
      registerRuntimeMessaging();
      runtimeBridge.refresh = (reason = 'runtime-refresh') => {
        scheduleRebuild(0, reason);
      };
      runtimeBridge.health = healthSnapshot;
      runtimeBridge.ready = true;
      readSettings();
    } catch (error) {
      runtimeBridge.ready = false;
      runtimeBridge.error = String(error?.message || error);
      console.error('[ThreadPilot] initialization failed', error);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
