(() => {
  'use strict';

  const EXT_ID = 'conversation-navigator';
  const DEFAULTS = {
    enabled: true,
    hideOfficialNav: false,
    officialNavSelector: 'div.fixed.top-1\\/2.z-20.-translate-y-1\\/2.inset-e-4',
    navOffset: 64,
    aiCollapseEnabled: true,
    filter: 'user',
    side: 'right',
    collapseHeight: 360,
    autoScrollToBottom: true,
    performanceMode: true
  };

  const state = {
    settings: { ...DEFAULTS },
    root: null,
    track: null,
    dots: null,
    thumb: null,
    preview: null,
    foldBtn: null,
    count: null,
    messages: [],
    visible: [],
    expanded: new Set(),
    textCache: new Map(),
    drag: false,
    lastScrollKey: '',
    timer: 0,
    foldTimer: 0,
    observer: null,
    locationKey: '',
    bottomScrollTimer: 0,
    bottomScrollInterval: 0,
    bottomScrollUntil: 0,
    bottomLastHeight: 0,
    bottomStableTicks: 0
  };

  const $all = (root, selector) => {
    try { return [...root.querySelectorAll(selector)]; } catch { return []; }
  };
  const closest = (el, selector) => {
    try { return el && el.closest ? el.closest(selector) : null; } catch { return null; }
  };
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const text = (s) => String(s || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  const isOur = (el) => !!(el && (el.id === EXT_ID || closest(el, `#${EXT_ID}`) || closest(el, '[data-cn-more-button="true"]')));
  const isEditableTarget = (el) => !!closest(el, 'input, textarea, select, [contenteditable="true"], [role="textbox"]');
  const MESSAGE_CONTENT_SELECTORS = [
    '[data-message-author-role] .markdown',
    '[data-message-author-role] [data-message-id]',
    '[data-message-author-role] [data-testid="conversation-turn-content"]',
    '[data-message-author-role] [class*="whitespace-pre-wrap"]',
    '[data-message-author-role]'
  ];

  const OFFICIAL_NAV_SELECTORS = [
    DEFAULTS.officialNavSelector,
    '[data-testid*="conversation"][data-testid*="nav"]',
    '[aria-label*="previous" i], [aria-label*="next" i], [aria-label*="上一" i], [aria-label*="下一" i]',
    '[class*="top-1/2"], [class*="-translate-y-1/2"], .fixed.top-1\\/2, .fixed.-translate-y-1\\/2'
  ];

  function readSettings() {
    chrome.storage.sync.get(DEFAULTS, (items) => {
      state.settings = { ...DEFAULTS, ...items };
      if (typeof items.aiFoldEnabled === 'boolean' && typeof items.aiCollapseEnabled !== 'boolean') {
        state.settings.aiCollapseEnabled = items.aiFoldEnabled;
      }
      if (state.settings.filter !== 'user') {
        state.settings.filter = 'user';
        chrome.storage.sync.set({ filter: 'user' });
      }
      applySettings();
      rebuild();
    });
  }

  function saveSettings(patch) {
    if ('filter' in patch) patch.filter = 'user';
    state.settings = { ...state.settings, ...patch };
    chrome.storage.sync.set(patch, () => {
      applySettings();
      rebuildSoon(80);
    });
  }

  function roleName(role) {
    return role === 'assistant' ? 'AI' : role === 'user' ? '我' : '消息';
  }

  function displayFilterName() {
    return '我';
  }

  function previewIndex(item) {
    const visibleIndex = state.visible.findIndex(m => m.key === item.key);
    const visibleNumber = visibleIndex >= 0 ? visibleIndex + 1 : item.number;
    return `${displayFilterName()} ${visibleNumber}/${state.visible.length} · 全部 ${item.number}/${state.messages.length}`;
  }

  function contentNodeFor(root, roleNode) {
    if (!root) return roleNode || root;
    for (const selector of MESSAGE_CONTENT_SELECTORS) {
      const node = root.querySelector?.(selector);
      if (node && !isOur(node)) return node;
    }
    return roleNode || root;
  }

  function getReadableText(el, limit = 220) {
    if (!el) return '';
    const clone = el.cloneNode(true);
    clone.querySelectorAll?.([
      'button',
      'svg',
      'img',
      'pre .hljs-copy-button',
      '[aria-hidden="true"]',
      '[data-cn-more-button="true"]',
      '[data-testid*="copy"]',
      '[data-testid*="feedback"]',
      '[data-testid*="share"]',
      '[data-testid*="voice"]'
    ].join(',')).forEach(node => node.remove());
    const raw = text(clone.innerText || clone.textContent || '');
    return raw
      .replace(/^(ChatGPT|Assistant|You|用户|助手|我)\s*[:：]?\s*/i, '')
      .replace(/\b(Copy|Copied|Good response|Bad response|Read aloud|Edit message)\b|复制|已复制|朗读|编辑|赞|踩/gi, '')
      .trim()
      .slice(0, limit);
  }

  function ensureItemText(item, limit = 240) {
    if (!item) return '';
    const cached = state.textCache.get(item.key);
    if (cached) {
      item.text = cached;
      return cached.slice(0, limit);
    }
    const value = getReadableText(item.content || item.root, Math.max(limit, 240));
    if (value) state.textCache.set(item.key, value);
    item.text = value;
    return value.slice(0, limit);
  }

  function detectRole(root) {
    const roleNode = root.matches?.('[data-message-author-role]') ? root : root.querySelector?.('[data-message-author-role]');
    const role = roleNode?.getAttribute('data-message-author-role');
    return role === 'assistant' || role === 'user'
      ? { role, content: contentNodeFor(root, roleNode) }
      : { role: 'message', content: root };
  }

  function messageKey(root, role, index) {
    const node = root.matches?.('[data-message-id]') ? root : root.querySelector?.('[data-message-id]');
    const id = node?.getAttribute('data-message-id') || root.getAttribute('data-testid') || '';
    if (id) return `${role}:${id}`;
    return `${role}:${index}`;
  }

  function collectMessages() {
    const main = document.querySelector('main') || document.body;
    const roots = [];
    const seen = new Set();
    const add = (node) => {
      const root = closest(node, 'article[data-testid^="conversation-turn-"]') || closest(node, '[data-testid^="conversation-turn-"]') || closest(node, 'article') || node;
      if (!root || seen.has(root) || isOur(root)) return;
      if (root.querySelector?.('[data-cn-hidden-official-nav="true"]')) return;
      const rect = root.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      seen.add(root);
      roots.push(root);
    };
    $all(main, '[data-message-author-role="assistant"], [data-message-author-role="user"]').forEach(add);
    if (roots.length < 2) $all(main, 'article').forEach(add);
    roots.sort((a, b) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    return roots.map((root, index) => {
      const { role, content } = detectRole(root);
      const key = messageKey(root, role, index);
      const cachedText = state.textCache.get(key) || '';
      return { root, content, role, index, number: index + 1, key, text: cachedText };
    }).filter(x => x.role === 'assistant' || x.role === 'user' || ensureItemText(x, 80).length > 1);
  }

  function ensureUi() {
    if (state.root?.isConnected) return;
    const root = document.createElement('aside');
    root.id = EXT_ID;
    root.innerHTML = `
      <div class="cn-track" title="点击或拖动，快速跳到我的输入"><div class="cn-line"></div><div class="cn-dots"></div><div class="cn-thumb"></div></div>
      <div class="cn-count">0</div>
      <button class="cn-fold-btn" type="button" title="开启或关闭 AI 长回复折叠">折叠</button>
      <div class="cn-preview" aria-hidden="true"><div class="cn-preview-meta"><span class="cn-preview-badge"></span><span class="cn-preview-index"></span></div><div class="cn-preview-body"></div><div class="cn-preview-hint">点击节点即可跳转</div></div>
    `;
    document.body.appendChild(root);
    state.root = root;
    state.track = root.querySelector('.cn-track');
    state.dots = root.querySelector('.cn-dots');
    state.thumb = root.querySelector('.cn-thumb');
    state.preview = root.querySelector('.cn-preview');
    state.foldBtn = root.querySelector('.cn-fold-btn');
    state.count = root.querySelector('.cn-count');

    state.track.setAttribute('role', 'slider');
    state.track.setAttribute('tabindex', '0');
    state.track.setAttribute('aria-label', 'ThreadPilot 我的输入导航');
    state.track.setAttribute('aria-orientation', 'vertical');
    state.track.setAttribute('aria-valuemin', '1');
    state.track.setAttribute('aria-valuemax', '1');
    state.track.setAttribute('aria-valuenow', '1');

    state.foldBtn.addEventListener('click', () => {
      const next = !state.settings.aiCollapseEnabled;
      saveSettings({ aiCollapseEnabled: next, aiFoldEnabled: next });
    });
    bindTrack();
  }

  function bindTrack() {
    const at = (event) => {
      const rect = state.track.getBoundingClientRect();
      const p = clamp((event.clientY - rect.top) / Math.max(1, rect.height), 0, 1);
      const targetIndex = p * Math.max(0, state.messages.length - 1);
      return state.visible.reduce((nearest, item) => {
        if (!nearest) return item;
        return Math.abs(item.index - targetIndex) < Math.abs(nearest.index - targetIndex) ? item : nearest;
      }, null);
    };
    state.track.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      state.drag = true;
      state.track.setPointerCapture?.(e.pointerId);
      const item = at(e);
      if (item) scrollTo(item);
    });
    state.track.addEventListener('pointermove', (e) => {
      const item = at(e);
      if (item) showPreview(item, e.clientX, e.clientY);
      if (state.drag && item) scrollTo(item, 'auto');
    });
    state.track.addEventListener('pointerup', (e) => {
      state.drag = false;
      state.lastScrollKey = '';
      state.track.releasePointerCapture?.(e.pointerId);
      hidePreview(160);
    });
    state.track.addEventListener('pointerleave', () => { if (!state.drag) hidePreview(100); });
    state.track.addEventListener('keydown', (e) => {
      if (!state.visible.length) return;
      const current = currentVisibleIndex();
      const keyMap = {
        ArrowDown: current + 1,
        ArrowRight: current + 1,
        PageDown: current + 3,
        ArrowUp: current - 1,
        ArrowLeft: current - 1,
        PageUp: current - 3,
        Home: 0,
        End: state.visible.length - 1
      };
      if (!(e.key in keyMap)) return;
      e.preventDefault();
      jumpToVisibleIndex(keyMap[e.key]);
    });
  }

  function visibleMessages() {
    return state.messages.filter(m => m.role === 'user');
  }

  function itemPosition(item, fallbackIndex = 0, fallbackCount = state.visible.length) {
    const total = state.messages.length;
    if (total > 1 && Number.isFinite(item?.index)) return (item.index / (total - 1)) * 100;
    return fallbackCount <= 1 ? 0 : (fallbackIndex / (fallbackCount - 1)) * 100;
  }

  function render() {
    ensureUi();
    state.visible = visibleMessages();
    state.dots.replaceChildren();
    const count = state.visible.length;
    const step = Math.max(1, Math.ceil(count / 150));
    state.visible.forEach((item, i) => {
      if (i % step) return;
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = `cn-dot cn-${item.role}`;
      dot.dataset.globalIndex = String(item.index);
      dot.style.top = `${itemPosition(item, i, count)}%`;
      const itemText = ensureItemText(item, 80);
      const dotLabel = `${roleName(item.role)} ${i + 1}/${count}${itemText ? ` - ${itemText.slice(0, 60)}` : ''}`;
      dot.title = dotLabel;
      dot.setAttribute('aria-label', `跳到${dotLabel}`);
      dot.addEventListener('mouseenter', (e) => showPreview(item, e.clientX, e.clientY));
      dot.addEventListener('mousemove', (e) => showPreview(item, e.clientX, e.clientY));
      dot.addEventListener('mouseleave', () => hidePreview(100));
      dot.addEventListener('focus', () => showPreviewForElement(item, dot));
      dot.addEventListener('blur', () => hidePreview(80));
      dot.addEventListener('click', (e) => { e.preventDefault(); scrollTo(item); });
      state.dots.appendChild(dot);
    });
    state.count.textContent = String(state.visible.length);
    state.count.title = `我的输入 ${state.visible.length} 条 · 全部 ${state.messages.length} 条`;
    state.foldBtn.classList.toggle('is-on', state.settings.aiCollapseEnabled);
    state.foldBtn.textContent = state.settings.aiCollapseEnabled ? '折叠' : '展开';
    state.foldBtn.title = state.settings.aiCollapseEnabled ? '关闭 AI 长回复折叠' : '开启 AI 长回复折叠';
    state.foldBtn.setAttribute('aria-label', state.foldBtn.title);
    updateActive();
  }

  function showPreview(item, x, y) {
    const p = state.preview;
    if (!p) return;
    const body = ensureItemText(item, 240);
    p.dataset.role = item.role;
    p.querySelector('.cn-preview-badge').textContent = roleName(item.role);
    p.querySelector('.cn-preview-index').textContent = previewIndex(item);
    p.querySelector('.cn-preview-body').textContent = body.length > 160 ? `${body.slice(0, 160)}…` : body;
    const width = 348;
    const left = clamp(x - width - 14, 14, window.innerWidth - width - 14);
    const top = clamp(y, 90, window.innerHeight - 90);
    p.style.left = `${left}px`;
    p.style.top = `${top}px`;
    p.classList.add('is-visible');
  }

  function showPreviewForElement(item, el) {
    const rect = el?.getBoundingClientRect?.();
    if (!rect) return;
    showPreview(item, rect.left, rect.top + rect.height / 2);
  }

  function hidePreview(delay = 0) {
    setTimeout(() => { if (!state.drag) state.preview?.classList.remove('is-visible'); }, delay);
  }

  function scrollTo(item, behavior = 'smooth') {
    if (!item?.root) return;
    if (state.drag && state.lastScrollKey === item.key) return;
    state.lastScrollKey = item.key;
    item.root.scrollIntoView({ block: 'start', behavior });
    setTimeout(updateActive, 180);
  }

  function currentVisibleIndex() {
    if (!state.visible.length) return 0;
    const y = window.innerHeight * 0.28;
    let previousVisibleIndex = -1;
    let nearestVisibleIndex = 0;
    let nearestDistance = Infinity;

    state.visible.forEach((m, i) => {
      if (!m.root?.isConnected) return;
      const r = m.root.getBoundingClientRect();
      const d = Math.abs(r.top - y);
      if (r.bottom >= 0 && r.top <= window.innerHeight && d < nearestDistance) {
        nearestDistance = d;
        nearestVisibleIndex = i;
      }
      if (r.top <= y) previousVisibleIndex = i;
    });

    return previousVisibleIndex >= 0 ? previousVisibleIndex : nearestVisibleIndex;
  }

  function jumpToVisibleIndex(index, behavior = 'smooth') {
    if (!state.visible.length) return;
    const target = state.visible[clamp(index, 0, state.visible.length - 1)];
    if (target) scrollTo(target, behavior);
  }

  function updateActive() {
    if (!state.visible.length || !state.thumb) return;
    const vi = currentVisibleIndex();
    const active = state.visible[vi];
    const pct = itemPosition(active, vi, state.visible.length);
    state.thumb.style.top = `${pct}%`;
    state.track?.setAttribute('aria-valuemax', String(Math.max(1, state.visible.length)));
    state.track?.setAttribute('aria-valuenow', String(Math.max(1, vi + 1)));
    state.track?.setAttribute('aria-valuetext', `${roleName(active?.role)} ${vi + 1}/${state.visible.length}`);
    state.dots?.querySelectorAll('.cn-dot').forEach((dot) => {
      dot.classList.toggle('is-active', Number(dot.dataset.globalIndex) === active?.index);
    });
  }

  function foldableAssistantItems() {
    const main = document.querySelector('main') || document.body;
    return $all(main, '[data-message-author-role="assistant"]').map((content, index) => {
      const root = closest(content, '[data-testid^="conversation-turn-"]') || closest(content, 'article') || content;
      const id = content.getAttribute('data-message-id') || root?.getAttribute?.('data-testid') || '';
      const blockIndex = $all(root || main, '[data-message-author-role="assistant"]').indexOf(content);
      return {
        root,
        content,
        role: 'assistant',
        index,
        key: id ? `assistant:${id}:${blockIndex}` : `assistant:${index}`
      };
    }).filter(item => item.root && item.content && !isOur(item.content));
  }

  function findFoldTarget(item) {
    return item?.content || item?.root || null;
  }

  function clearFold(target) {
    target.classList.remove('cn-fold-target', 'cn-collapsed', 'cn-expanded');
    target.style.removeProperty('--cn-fold-height');
  }

  function foldButtonFor(target, key) {
    const existing = target.querySelector(`:scope > [data-cn-more-button="true"][data-cn-fold-key="${CSS.escape(key)}"]`);
    if (existing) {
      return existing;
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cn-more-button';
    btn.dataset.cnMoreButton = 'true';
    btn.dataset.cnFoldKey = key;
    btn.addEventListener('click', () => {
      if (state.expanded.has(key)) state.expanded.delete(key);
      else state.expanded.add(key);
      applyFolds();
    });
    target.appendChild(btn);
    return btn;
  }

  function applyFolds() {
    const activeTargets = new Set();
    const activeKeys = new Set();
    const activeButtons = new Set();
    if (!state.settings.aiCollapseEnabled) {
      document.querySelectorAll('.cn-fold-target').forEach(clearFold);
      document.querySelectorAll('[data-cn-more-button="true"]').forEach(btn => btn.remove());
      return;
    }

    const h = clamp(Number(state.settings.collapseHeight || 360), 260, 900);
    foldableAssistantItems().forEach(item => {
      const target = findFoldTarget(item);
      if (!target) return;
      const bodyText = getReadableText(target, 2000);
      const shouldFold = target.scrollHeight >= h + 40 || bodyText.length >= 520;
      if (!shouldFold) {
        clearFold(target);
        target.querySelectorAll(':scope > [data-cn-more-button="true"]').forEach(btn => btn.remove());
        return;
      }

      activeTargets.add(target);
      const key = item.key;
      activeKeys.add(key);
      target.classList.add('cn-fold-target', 'cn-collapsed');
      target.classList.toggle('cn-expanded', state.expanded.has(key));
      target.style.setProperty('--cn-fold-height', `${h}px`);
      const btn = foldButtonFor(target, key);
      if (!btn) return;
      activeButtons.add(btn);
      const expanded = state.expanded.has(key);
      btn.textContent = expanded ? '收起' : '展开';
      btn.setAttribute('aria-label', expanded ? '收起这条 AI 回复' : '展开这条 AI 回复');
    });

    document.querySelectorAll('.cn-fold-target').forEach(el => {
      if (!activeTargets.has(el)) clearFold(el);
    });
    document.querySelectorAll('[data-cn-more-button="true"]').forEach(btn => {
      if (!activeKeys.has(btn.dataset.cnFoldKey) || !activeButtons.has(btn)) btn.remove();
    });
  }

  function scheduleFolds(delay) {
    clearTimeout(state.foldTimer);
    if (!state.settings.aiCollapseEnabled) {
      applyFolds();
      return;
    }
    state.foldTimer = setTimeout(applyFolds, delay);
  }

  function isOfficialNavCandidate(el) {
    if (!el || isOur(el) || closest(el, `#${EXT_ID}, form, textarea, [contenteditable="true"]`)) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    if (rect.height > window.innerHeight * 0.45 || rect.width > 180) return false;
    const style = getComputedStyle(el);
    if (style.position !== 'fixed' && style.position !== 'sticky') return false;

    const label = text(el.getAttribute('aria-label') || el.textContent || '');
    const hasPrevNext = /previous|next|上一|下一|向上|向下/i.test(label);
    const hasControl = !!el.querySelector('button, a, [role="button"]');
    const nearSide = rect.left <= 120 || window.innerWidth - rect.right <= 180;
    const nearMiddle = rect.top < window.innerHeight * 0.78 && rect.bottom > window.innerHeight * 0.14;
    return nearSide && nearMiddle && (hasPrevNext || hasControl);
  }

  function officialNavCandidates() {
    const found = new Set();
    const add = (el) => {
      const root = closest(el, 'div.fixed, nav, aside, [role="navigation"]') || el;
      if (isOfficialNavCandidate(root)) found.add(root);
    };

    const selectors = [
      state.settings.officialNavSelector || DEFAULTS.officialNavSelector,
      ...OFFICIAL_NAV_SELECTORS
    ];
    selectors.forEach(selector => $all(document, selector).forEach(add));
    $all(document, 'body > div, body > nav, body > aside, [role="navigation"], [aria-label]').forEach((el) => {
      if (isOfficialNavCandidate(el)) found.add(el);
    });
    return [...found];
  }

  function restoreOfficialNav() {
    document.querySelectorAll('[data-cn-hidden-official-nav="true"]').forEach(el => {
      if (el.dataset.cnPreviousDisplay) el.style.display = el.dataset.cnPreviousDisplay;
      else el.style.removeProperty('display');
      delete el.dataset.cnPreviousDisplay;
      el.removeAttribute('data-cn-hidden-official-nav');
    });
  }

  function hideOfficialNav() {
    if (!state.settings.hideOfficialNav) {
      restoreOfficialNav();
      return;
    }
    officialNavCandidates().forEach(el => {
      if (!el.dataset.cnHiddenOfficialNav) {
        el.dataset.cnPreviousDisplay = el.style.display || '';
      }
      el.style.setProperty('display', 'none', 'important');
      el.setAttribute('data-cn-hidden-official-nav', 'true');
    });
  }

  function currentLocationKey() {
    return `${location.pathname}${location.search}`;
  }

  function scrollConversationToBottom() {
    if (!state.settings.autoScrollToBottom || !state.messages.length) return;
    const last = state.messages[state.messages.length - 1];
    requestAnimationFrame(() => {
      last?.root?.scrollIntoView({ block: 'end', behavior: 'auto' });
      setTimeout(updateActive, 80);
    });
  }

  function stopBottomLock() {
    clearTimeout(state.bottomScrollTimer);
    clearInterval(state.bottomScrollInterval);
    state.bottomScrollTimer = 0;
    state.bottomScrollInterval = 0;
    state.bottomScrollUntil = 0;
    state.bottomLastHeight = 0;
    state.bottomStableTicks = 0;
  }

  function bottomLockTick() {
    if (!state.settings.autoScrollToBottom || Date.now() > state.bottomScrollUntil) {
      stopBottomLock();
      return;
    }
    const scroller = document.scrollingElement || document.documentElement;
    const height = scroller.scrollHeight;
    state.bottomStableTicks = Math.abs(height - state.bottomLastHeight) <= 2 ? state.bottomStableTicks + 1 : 0;
    state.bottomLastHeight = height;
    scrollConversationToBottom();
    if (state.bottomStableTicks >= 5) stopBottomLock();
  }

  function startBottomLock() {
    stopBottomLock();
    if (!state.settings.autoScrollToBottom) return;
    const scroller = document.scrollingElement || document.documentElement;
    state.bottomLastHeight = scroller.scrollHeight;
    state.bottomScrollUntil = Date.now() + (state.settings.performanceMode ? 6200 : 4200);
    state.bottomScrollTimer = setTimeout(bottomLockTick, 260);
    state.bottomScrollInterval = setInterval(bottomLockTick, 520);
  }

  function maybeScrollNewConversationToBottom() {
    startBottomLock();
  }

  function applySettings() {
    ensureUi();
    state.root.classList.toggle('cn-disabled', !state.settings.enabled);
    state.root.classList.toggle('cn-left', state.settings.side === 'left');
    state.root.style.setProperty('--cn-side-offset', `${clamp(Number(state.settings.navOffset || 64), 6, 140)}px`);
    hideOfficialNav();
  }

  function rebuild() {
    ensureUi();
    const key = currentLocationKey();
    const locationChanged = state.locationKey !== key;
    if (locationChanged) {
      state.locationKey = key;
      state.textCache.clear();
    }
    state.messages = collectMessages();
    applySettings();
    render();
    if (locationChanged) maybeScrollNewConversationToBottom();
    scheduleFolds(state.settings.performanceMode ? 900 : 420);
  }

  function rebuildSoon(delay = 250) {
    clearTimeout(state.timer);
    state.timer = setTimeout(rebuild, delay);
  }

  function observe() {
    state.observer?.disconnect();
    state.observer = new MutationObserver((mutations) => {
      if (mutations.every(m => isOur(m.target))) return;
      rebuildSoon(state.settings.performanceMode ? 900 : 320);
    });
    state.observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.addEventListener('scroll', updateActive, true);
    window.addEventListener('resize', () => rebuildSoon(200));
    window.addEventListener('popstate', () => rebuildSoon(120));
    setInterval(() => {
      if (state.locationKey !== currentLocationKey()) rebuildSoon(120);
    }, 800);
  }

  document.addEventListener('keydown', (e) => {
    if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.defaultPrevented || isEditableTarget(e.target)) return;
    const key = e.key.toLowerCase();
    if (!['j', 'c', 'n', 'p'].includes(key)) return;
    e.preventDefault();
    e.stopPropagation();
    if (key === 'j') saveSettings({ enabled: !state.settings.enabled });
    if (key === 'c') saveSettings({ aiCollapseEnabled: !state.settings.aiCollapseEnabled, aiFoldEnabled: !state.settings.aiCollapseEnabled });
    if (key === 'n') jumpToVisibleIndex(currentVisibleIndex() + 1);
    if (key === 'p') jumpToVisibleIndex(currentVisibleIndex() - 1);
  });

  function init() {
    if (!document.body) return setTimeout(init, 100);
    ensureUi();
    readSettings();
    observe();
    setInterval(hideOfficialNav, 1800);
  }

  init();
})();
