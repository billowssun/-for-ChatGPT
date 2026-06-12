(() => {
  const root = document.documentElement;
  const enButton = document.getElementById('lang-en');
  const zhButton = document.getElementById('lang-zh');

  function setLang(lang) {
    const next = lang === 'zh' ? 'zh' : 'en';
    root.dataset.lang = next;
    root.lang = next === 'zh' ? 'zh-CN' : 'en';
    try {
      localStorage.setItem('threadpilot-lang', next);
    } catch {
      // Language preference is optional; the page still works without storage.
    }
    enButton?.classList.toggle('active', next === 'en');
    zhButton?.classList.toggle('active', next === 'zh');
  }

  enButton?.addEventListener('click', () => setLang('en'));
  zhButton?.addEventListener('click', () => setLang('zh'));

  let preferred = '';
  try {
    preferred = localStorage.getItem('threadpilot-lang') || '';
  } catch {
    preferred = '';
  }
  if (!preferred) {
    preferred = (navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
  }
  setLang(preferred);
})();
