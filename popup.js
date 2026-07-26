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
let statusTimer = 0;
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

function load() {
  storage.get(null, (items) => render(normalizeSettings(items)));
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

load();
