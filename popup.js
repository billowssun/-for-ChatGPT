const DEFAULTS = {
  timelineEnabled: true,
  autoCollapse: true,
  foldPreset: 'balanced'
};

const PRESET_HINTS = {
  compact: '更早收起长回答',
  balanced: '平衡阅读空间与上下文',
  relaxed: '尽量保留完整回答'
};

const timelineEnabled = document.querySelector('#timelineEnabled');
const autoCollapse = document.querySelector('#autoCollapse');
const presetHint = document.querySelector('#presetHint');
const status = document.querySelector('#status');
const connectionCard = document.querySelector('#connectionCard');
const connectionTitle = document.querySelector('#connectionTitle');
const connectionDetail = document.querySelector('#connectionDetail');
const reconnectPage = document.querySelector('#reconnectPage');
let statusTimer = 0;
let activeChatTabId = null;
const previewStore = {};
const storage = globalThis.chrome?.storage?.sync || {
  get(_keys, callback) { callback({ ...previewStore }); },
  set(patch, callback) {
    Object.assign(previewStore, patch);
    callback?.();
  }
};

function setStatus(message) {
  clearTimeout(statusTimer);
  status.textContent = message;
  statusTimer = window.setTimeout(() => {
    status.textContent = '设置自动保存';
  }, 1400);
}

function normalizeSettings(items) {
  return {
    timelineEnabled: typeof items.timelineEnabled === 'boolean'
      ? items.timelineEnabled
      : items.enabled !== false,
    autoCollapse: typeof items.autoCollapse === 'boolean'
      ? items.autoCollapse
      : items.aiCollapseEnabled !== false,
    foldPreset: PRESET_HINTS[items.foldPreset] ? items.foldPreset : DEFAULTS.foldPreset
  };
}

function render(settings) {
  timelineEnabled.checked = settings.timelineEnabled;
  autoCollapse.checked = settings.autoCollapse;
  const preset = document.querySelector(`input[name="foldPreset"][value="${settings.foldPreset}"]`);
  if (preset) preset.checked = true;
  presetHint.textContent = PRESET_HINTS[settings.foldPreset];
}

function renderConnection(state, title, detail, reconnect = false) {
  connectionCard.dataset.state = state;
  connectionTitle.textContent = title;
  connectionDetail.textContent = detail;
  reconnectPage.hidden = !reconnect;
  reconnectPage.disabled = state === 'checking';
}

function isChatGPTUrl(url) {
  return /^https:\/\/chatgpt\.com\//.test(String(url || ''));
}

function checkConnection() {
  const tabs = globalThis.chrome?.tabs;
  if (!tabs?.query || !tabs?.sendMessage) {
    renderConnection('preview', '预览模式', '请在 Chrome 中打开 ChatGPT');
    return;
  }

  renderConnection('checking', '正在检查页面', '确认 ThreadPilot 是否已连接');
  tabs.query({ active: true, currentWindow: true }, (results) => {
    const active = results?.[0];
    if (!active?.id || !isChatGPTUrl(active.url)) {
      activeChatTabId = null;
      renderConnection('idle', '当前不是 ChatGPT', '打开 ChatGPT 后可检查运行状态');
      return;
    }

    activeChatTabId = active.id;
    tabs.sendMessage(active.id, { type: 'threadpilot:ping' }, (health) => {
      if (globalThis.chrome?.runtime?.lastError || !health?.connected) {
        renderConnection('error', '页面未连接', '点击后重新加载当前 ChatGPT 页面', true);
        return;
      }

      const foldSummary = health.completedAnswers
        ? `${health.collapsedAnswers}/${health.completedAnswers} 条回答已折叠`
        : '等待对话内容';
      renderConnection(
        'connected',
        `已连接 · ${health.turns} 轮`,
        `v${health.version} · ${foldSummary}`
      );
    });
  });
}

function load() {
  storage.get(null, (items) => render(normalizeSettings(items)));
  checkConnection();
}

function save(patch) {
  storage.set(patch, () => setStatus('已保存'));
}

timelineEnabled.addEventListener('change', () => {
  save({ timelineEnabled: timelineEnabled.checked });
});

autoCollapse.addEventListener('change', () => {
  save({ autoCollapse: autoCollapse.checked });
});

document.querySelectorAll('input[name="foldPreset"]').forEach((input) => {
  input.addEventListener('change', () => {
    if (!input.checked) return;
    presetHint.textContent = PRESET_HINTS[input.value];
    save({ foldPreset: input.value });
  });
});

reconnectPage.addEventListener('click', () => {
  if (!activeChatTabId || !globalThis.chrome?.tabs?.reload) return;
  renderConnection('checking', '正在重新连接', '页面重新加载后会自动恢复');
  globalThis.chrome.tabs.reload(activeChatTabId, () => {
    if (globalThis.chrome?.runtime?.lastError) {
      renderConnection('error', '重新连接失败', '请手动刷新 ChatGPT 页面', true);
      return;
    }
    window.setTimeout(checkConnection, 1400);
  });
});

load();
