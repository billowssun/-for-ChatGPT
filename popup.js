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
  performanceMode: true,
  aiFoldEnabled: true
};

const controls = {
  enabled: document.querySelector('#enabled'),
  hideOfficialNav: document.querySelector('#hideOfficialNav'),
  aiCollapseEnabled: document.querySelector('#aiCollapseEnabled'),
  side: document.querySelector('#side'),
  navOffset: document.querySelector('#navOffset'),
  navOffsetRange: document.querySelector('#navOffsetRange'),
  collapseHeight: document.querySelector('#collapseHeight'),
  collapseHeightRange: document.querySelector('#collapseHeightRange'),
  autoScrollToBottom: document.querySelector('#autoScrollToBottom'),
  performanceMode: document.querySelector('#performanceMode')
};

const helpText = document.querySelector('#helpText');
const status = document.querySelector('#status');
const githubBtn = document.querySelector('#githubBtn');
const aboutBtn = document.querySelector('#aboutBtn');
const resetBtn = document.querySelector('#resetBtn');
const summary = {
  enabled: document.querySelector('#summaryEnabled'),
  fold: document.querySelector('#summaryFold'),
  perf: document.querySelector('#summaryPerf')
};

function setStatus(text) {
  status.textContent = text || '';
  if (text) setTimeout(() => {
    if (status.textContent === text) status.textContent = '';
  }, 1800);
}

function load() {
  chrome.storage.sync.get(DEFAULTS, (items) => {
    const aiCollapse = typeof items.aiCollapseEnabled === 'boolean' ? items.aiCollapseEnabled : Boolean(items.aiFoldEnabled);
    controls.enabled.checked = Boolean(items.enabled);
    controls.hideOfficialNav.checked = Boolean(items.hideOfficialNav);
    controls.aiCollapseEnabled.checked = aiCollapse;
    controls.side.value = items.side || 'right';
    controls.navOffset.value = Number(items.navOffset || 64);
    controls.navOffsetRange.value = Number(items.navOffset || 64);
    controls.collapseHeight.value = Number(items.collapseHeight || 360);
    controls.collapseHeightRange.value = Number(items.collapseHeight || 360);
    controls.autoScrollToBottom.checked = items.autoScrollToBottom !== false;
    controls.performanceMode.checked = items.performanceMode !== false;
    renderSummary(items, aiCollapse);
  });
}

function renderSummary(items, aiCollapse) {
  const enabled = items.enabled !== false;
  summary.enabled.textContent = enabled ? '导航开启' : '导航关闭';
  summary.fold.textContent = aiCollapse ? '折叠开启' : '折叠关闭';
  summary.perf.textContent = items.performanceMode !== false ? '流畅模式' : '即时刷新';
  summary.enabled.classList.toggle('is-on', enabled);
  summary.fold.classList.toggle('is-on', aiCollapse);
  summary.perf.classList.toggle('is-on', items.performanceMode !== false);
}

function save(key, value) {
  const payload = { [key]: value };
  if (key === 'aiCollapseEnabled') payload.aiFoldEnabled = value;
  chrome.storage.sync.set(payload, () => {
    load();
    setStatus('已保存');
  });
}

function saveMany(payload, message = '已保存') {
  chrome.storage.sync.set(payload, () => {
    load();
    setStatus(message);
  });
}

controls.enabled.addEventListener('change', () => save('enabled', controls.enabled.checked));
controls.hideOfficialNav.addEventListener('change', () => save('hideOfficialNav', controls.hideOfficialNav.checked));
controls.aiCollapseEnabled.addEventListener('change', () => save('aiCollapseEnabled', controls.aiCollapseEnabled.checked));
controls.side.addEventListener('change', () => save('side', controls.side.value));
controls.performanceMode.addEventListener('change', () => save('performanceMode', controls.performanceMode.checked));
controls.autoScrollToBottom.addEventListener('change', () => save('autoScrollToBottom', controls.autoScrollToBottom.checked));

function clampNumber(value, min, max, fallback) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(min, Math.min(max, next));
}

function saveNumberControl(key, value, min, max, fallback) {
  const next = clampNumber(value, min, max, fallback);
  controls[key].value = next;
  controls[`${key}Range`].value = next;
  save(key, next);
}

controls.navOffset.addEventListener('change', () => saveNumberControl('navOffset', controls.navOffset.value, 6, 140, 64));
controls.navOffsetRange.addEventListener('input', () => {
  controls.navOffset.value = clampNumber(controls.navOffsetRange.value, 6, 140, 64);
});
controls.navOffsetRange.addEventListener('change', () => saveNumberControl('navOffset', controls.navOffsetRange.value, 6, 140, 64));
controls.collapseHeight.addEventListener('change', () => saveNumberControl('collapseHeight', controls.collapseHeight.value, 260, 900, 360));
controls.collapseHeightRange.addEventListener('input', () => {
  controls.collapseHeight.value = clampNumber(controls.collapseHeightRange.value, 260, 900, 360);
});
controls.collapseHeightRange.addEventListener('change', () => saveNumberControl('collapseHeight', controls.collapseHeightRange.value, 260, 900, 360));

document.querySelectorAll('[data-tip]').forEach((row) => {
  row.addEventListener('mouseenter', () => {
    helpText.textContent = row.getAttribute('data-tip') || '';
  });
});

githubBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://github.com/billowssun/threadpilot-for-chatgpt' });
});

aboutBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('about.html') });
});

resetBtn.addEventListener('click', () => {
  saveMany({ ...DEFAULTS }, '已恢复推荐设置');
});

load();
