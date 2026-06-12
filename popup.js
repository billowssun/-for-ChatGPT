const DEFAULTS = {
  enabled: true,
  hideOfficialNav: true,
  officialNavSelector: 'div.fixed.top-1\\/2.z-20.-translate-y-1\\/2.inset-e-4',
  navOffset: 64,
  aiCollapseEnabled: true,
  filter: 'all',
  side: 'right',
  collapseHeight: 360,
  performanceMode: true,
  aiFoldEnabled: true
};

const controls = {
  enabled: document.querySelector('#enabled'),
  hideOfficialNav: document.querySelector('#hideOfficialNav'),
  aiCollapseEnabled: document.querySelector('#aiCollapseEnabled'),
  filter: document.querySelector('#filter'),
  side: document.querySelector('#side'),
  navOffset: document.querySelector('#navOffset'),
  collapseHeight: document.querySelector('#collapseHeight'),
  performanceMode: document.querySelector('#performanceMode')
};

const helpText = document.querySelector('#helpText');
const status = document.querySelector('#status');
const aboutBtn = document.querySelector('#aboutBtn');
const resetBtn = document.querySelector('#resetBtn');

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
    controls.filter.value = items.filter || 'all';
    controls.side.value = items.side || 'right';
    controls.navOffset.value = Number(items.navOffset || 64);
    controls.collapseHeight.value = Number(items.collapseHeight || 360);
    controls.performanceMode.checked = items.performanceMode !== false;
  });
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
controls.filter.addEventListener('change', () => save('filter', controls.filter.value));
controls.side.addEventListener('change', () => save('side', controls.side.value));
controls.performanceMode.addEventListener('change', () => save('performanceMode', controls.performanceMode.checked));
controls.navOffset.addEventListener('change', () => {
  const value = Math.max(6, Math.min(140, Number(controls.navOffset.value || 64)));
  controls.navOffset.value = value;
  save('navOffset', value);
});
controls.collapseHeight.addEventListener('change', () => {
  const value = Math.max(260, Math.min(900, Number(controls.collapseHeight.value || 360)));
  controls.collapseHeight.value = value;
  save('collapseHeight', value);
});

document.querySelectorAll('[data-tip]').forEach((row) => {
  row.addEventListener('mouseenter', () => {
    helpText.textContent = row.getAttribute('data-tip') || '';
  });
});

aboutBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('about.html') });
});

resetBtn.addEventListener('click', () => {
  saveMany({ ...DEFAULTS }, '已恢复推荐设置');
});

load();
