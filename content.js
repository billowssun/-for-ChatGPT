(() => {
  'use strict';

  const EXT_ID = 'conversation-navigator';
  const DEFAULTS = {
    enabled: true,
    hideOfficialNav: true,
    officialNavSelector: 'div.fixed.top-1\\/2.z-20.-translate-y-1\\/2.inset-e-4',
    navOffset: 64,
    aiCollapseEnabled: true,
    filter: 'all',
    side: 'right',
    collapseHeight: 360,
    performanceMode: true
  };

  const state = {
    settings: { ...DEFAULTS },
    root: null,
    track: null,
    dots: null,
    thumb: null,
    preview: null,
    filterBtn: null,
    foldBtn: null,
    count: null,
    messages: [],
    visible: [],
    expanded: new Set(),
    drag: false,
    timer: 0,
    observer: null
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
  const OFFICIAL_NAV_SELECTORS = [
    DEFAULTS.officialNavSelector,
    '[data-testid*="conversation"][data-testid*="nav"]',
    '[aria-label*="previous" i], [aria-label*="next" i], [aria-label*="上一" i], [aria-label*="下一" i]',
    '.fixed.top-1\\/2, .fixed.-translate-y-1\\/2, [class*="top-1/2"], [class*="-translate-y-1/2"]'
  ];

  function readSettings() {
    chrome.storage.sync.get(DEFAULTS, (items) => {
      state.settings = { ...DEFAULTS, ...items };
      if (typeof items.aiFoldEnabled === 'boolean' && typeof items.aiCollapseEnabled !== 'boolean') {
        state.settings.aiCollapseEnabled = items.aiFoldEnabled;
      }
      applySettings();
      rebuild();
    });
  }

  function saveSettings(patch) {
    state.settings = { ...state.settings, ...patch };
    chrome.storage.sync.set(patch, () => {
      applySettings();
      rebuildSoon(80);
    });
  }

  function roleName(role) {
    return role === 'assistant' ? 'AI' : role === 'user' ? '我' : '消息';
  }

  function getReadableText(el, limit = 220) {
    if (!el) return '';
    const raw = text(el.innerText || el.textContent || '');
    return raw.replace(/^(ChatGPT|Assistant|You|用户|助手|你|我)\s*[:：]?\s*/i, '').slice(0, limit);
  }

  function detectRole(root) {
    const roleNode = root.matches?.('[data-message-author-role]') ? root : root.querySelector?.('[data-message-author-role]');
    const role = roleNode?.getAttribute('data-message-author-role');
    return role === 'assistant' || role === 'user' ? { role, content: roleNode } : { role: 'message', content: root };
  }

  function collectMessages() {
    const main = document.querySelector('main') || document.body;
    const roots = [];
    const seen = new Set();
    const add = (node) => {
      const root = closest(node, 'article[data-testid^="conversation-turn-"]') || closest(node, '[data-testid^="conversation-turn-"]') || closest(node, 'article') || node;
      if (!root || seen.has(root) || isOur(root)) return;
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
      return { root, content, role, index, number: index + 1, text: getReadableText(content || root, 240) };
    }).filter(x => x.text.length > 1);
  }

  function ensureUi() {
    if (state.root?.isConnected) return;
    const root = document.createElement('aside');
    root.id = EXT_ID;
    root.innerHTML = `
      <button class="cn-filter-btn" type="button" title="切换导航视图：全部 / AI / 我">全</button>
      <div class="cn-track" title="点击或拖动，快速跳到对应消息"><div class="cn-line"></div><div class="cn-dots"></div><div class="cn-thumb"></div></div>
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
    state.filterBtn = root.querySelector('.cn-filter-btn');
    state.foldBtn = root.querySelector('.cn-fold-btn');
    state.count = root.querySelector('.cn-count');

    state.filterBtn.addEventListener('click', () => {
      const order = ['all', 'assistant', 'user'];
      const next = order[(order.indexOf(state.settings.filter) + 1) % order.length];
      saveSettings({ filter: next });
    });
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
      const i = clamp(Math.round(p * (state.visible.length - 1)), 0, Math.max(0, state.visible.length - 1));
      return state.visible[i];
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
      if (state.drag && item) scrollTo(item);
    });
    state.track.addEventListener('pointerup', (e) => {
      state.drag = false;
      state.track.releasePointerCapture?.(e.pointerId);
      hidePreview(160);
    });
    state.track.addEventListener('pointerleave', () => { if (!state.drag) hidePreview(100); });
  }

  function visibleMessages() {
    if (state.settings.filter === 'assistant') return state.messages.filter(m => m.role === 'assistant');
    if (state.settings.filter === 'user') return state.messages.filter(m => m.role === 'user');
    return [...state.messages];
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
      dot.style.top = `${count <= 1 ? 0 : (i / (count - 1)) * 100}%`;
      dot.title = `${roleName(item.role)} · ${item.text.slice(0, 60)}`;
      dot.addEventListener('mouseenter', (e) => showPreview(item, e.clientX, e.clientY));
      dot.addEventListener('mousemove', (e) => showPreview(item, e.clientX, e.clientY));
      dot.addEventListener('mouseleave', () => hidePreview(100));
      dot.addEventListener('click', (e) => { e.preventDefault(); scrollTo(item); });
      state.dots.appendChild(dot);
    });
    state.count.textContent = String(state.messages.length);
    state.filterBtn.dataset.filter = state.settings.filter;
    state.filterBtn.textContent = state.settings.filter === 'assistant' ? 'AI' : state.settings.filter === 'user' ? '我' : '全';
    state.foldBtn.classList.toggle('is-on', state.settings.aiCollapseEnabled);
    state.foldBtn.textContent = state.settings.aiCollapseEnabled ? '折叠' : '展开';
    state.foldBtn.title = state.settings.aiCollapseEnabled ? '关闭 AI 长回复折叠' : '开启 AI 长回复折叠';
    state.foldBtn.setAttribute('aria-label', state.foldBtn.title);
    updateActive();
  }

  function showPreview(item, x, y) {
    const p = state.preview;
    if (!p) return;
    p.dataset.role = item.role;
    p.querySelector('.cn-preview-badge').textContent = roleName(item.role);
    p.querySelector('.cn-preview-index').textContent = `${item.number}/${state.messages.length}`;
    p.querySelector('.cn-preview-body').textContent = item.text.length > 160 ? `${item.text.slice(0, 160)}…` : item.text;
    const width = 348;
    const left = clamp(x - width - 14, 14, window.innerWidth - width - 14);
    const top = clamp(y, 90, window.innerHeight - 90);
    p.style.left = `${left}px`;
    p.style.top = `${top}px`;
    p.classList.add('is-visible');
  }

  function hidePreview(delay = 0) {
    setTimeout(() => { if (!state.drag) state.preview?.classList.remove('is-visible'); }, delay);
  }

  function scrollTo(item) {
    item?.root?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    setTimeout(updateActive, 180);
  }

  function updateActive() {
    if (!state.visible.length || !state.thumb) return;
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

    const vi = previousVisibleIndex >= 0 ? previousVisibleIndex : nearestVisibleIndex;
    const active = state.visible[vi];
    const pct = state.visible.length <= 1 ? 0 : (vi / (state.visible.length - 1)) * 100;
    state.thumb.style.top = `${pct}%`;
    state.dots?.querySelectorAll('.cn-dot').forEach((dot) => {
      dot.classList.toggle('is-active', Number(dot.dataset.globalIndex) === active?.index);
    });
  }

  function findFoldTarget(item) {
    if (item.role !== 'assistant') return null;
    return item.root.querySelector('.markdown, .prose, [class*="markdown"], [class*="prose"], [class*="text-message"]') || item.content || item.root;
  }

  function applyFolds() {
    document.querySelectorAll('[data-cn-more-button="true"]').forEach(btn => btn.remove());
    document.querySelectorAll('.cn-fold-target').forEach(el => {
      el.classList.remove('cn-fold-target', 'cn-collapsed', 'cn-expanded');
      el.style.removeProperty('--cn-fold-height');
    });
    if (!state.settings.aiCollapseEnabled) return;
    const h = clamp(Number(state.settings.collapseHeight || 360), 260, 900);
    state.messages.forEach(item => {
      const target = findFoldTarget(item);
      if (!target || target.scrollHeight < h + 40 && getReadableText(target, 1200).length < 520) return;
      const key = `cn-${item.index}-${getReadableText(target, 40).replace(/\W+/g, '-')}`;
      target.classList.add('cn-fold-target', 'cn-collapsed');
      target.classList.toggle('cn-expanded', state.expanded.has(key));
      target.style.setProperty('--cn-fold-height', `${h}px`);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cn-more-button';
      btn.setAttribute('data-cn-more-button', 'true');
      btn.textContent = state.expanded.has(key) ? '折叠' : '展开';
      btn.setAttribute('aria-label', state.expanded.has(key) ? '折叠这条 AI 回复' : '展开这条 AI 回复');
      btn.addEventListener('click', () => {
        if (state.expanded.has(key)) state.expanded.delete(key); else state.expanded.add(key);
        applyFolds();
      });
      target.insertAdjacentElement('afterend', btn);
    });
  }

  function isOfficialNavCandidate(el) {
    if (!el || isOur(el) || closest(el, 'main, article, form, textarea, [contenteditable="true"]')) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    if (rect.height > window.innerHeight * 0.38 || rect.width > 140) return false;
    const style = getComputedStyle(el);
    if (style.position !== 'fixed' && style.position !== 'sticky') return false;
    const nearSide = rect.left <= 96 || window.innerWidth - rect.right <= 160;
    const nearMiddle = rect.top < window.innerHeight * 0.72 && rect.bottom > window.innerHeight * 0.18;
    const hasNavControl = !!el.querySelector('button, a, [role="button"]') || /previous|next|上一|下一/i.test(el.getAttribute('aria-label') || '');
    return nearSide && nearMiddle && hasNavControl;
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
    $all(document, 'body > div, body > nav, body > aside, [role="navigation"]').forEach((el) => {
      if (isOfficialNavCandidate(el)) found.add(el);
    });
    return [...found];
  }

  function hideOfficialNav() {
    if (!state.settings.hideOfficialNav) {
      document.querySelectorAll('[data-cn-hidden-official-nav="true"]').forEach(el => {
        if (el.dataset.cnPreviousDisplay) el.style.display = el.dataset.cnPreviousDisplay;
        else el.style.removeProperty('display');
        delete el.dataset.cnPreviousDisplay;
        el.removeAttribute('data-cn-hidden-official-nav');
      });
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

  function applySettings() {
    ensureUi();
    state.root.classList.toggle('cn-disabled', !state.settings.enabled);
    state.root.classList.toggle('cn-left', state.settings.side === 'left');
    state.root.style.setProperty('--cn-side-offset', `${clamp(Number(state.settings.navOffset || 64), 6, 140)}px`);
    hideOfficialNav();
  }

  function rebuild() {
    ensureUi();
    state.messages = collectMessages();
    applySettings();
    applyFolds();
    render();
  }

  function rebuildSoon(delay = 250) {
    clearTimeout(state.timer);
    state.timer = setTimeout(rebuild, delay);
  }

  function observe() {
    state.observer?.disconnect();
    state.observer = new MutationObserver(() => rebuildSoon(state.settings.performanceMode ? 600 : 220));
    state.observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.addEventListener('scroll', updateActive, true);
    window.addEventListener('resize', () => rebuildSoon(200));
  }

  document.addEventListener('keydown', (e) => {
    if (!e.altKey) return;
    if (e.key.toLowerCase() === 'j') saveSettings({ enabled: !state.settings.enabled });
    if (e.key.toLowerCase() === 'c') saveSettings({ aiCollapseEnabled: !state.settings.aiCollapseEnabled, aiFoldEnabled: !state.settings.aiCollapseEnabled });
    if (e.key.toLowerCase() === 'n') scrollTo(state.visible[Math.min(state.visible.length - 1, Math.max(0, state.visible.findIndex(m => m.root.getBoundingClientRect().top > 10)))]);
    if (e.key.toLowerCase() === 'p') scrollTo(state.visible[Math.max(0, Math.max(0, state.visible.findIndex(m => m.root.getBoundingClientRect().top > 10)) - 1)]);
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
