// Слухає контейнер субтитрів Meet і зберігає репліки в chrome.storage.local.
(() => {
  let rec = null, key = null, saveTimer = null, scanTimer = null, observer = null, tick = null;
  let byBlock = new WeakMap();
  let ccTries = 0, ccLast = 0, ccPanel = null;

  // Після оновлення розширення стара копія скрипта лишається у вкладці без доступу до chrome.* —
  // така копія тихо зупиняється, нова вже працює замість неї.
  const alive = () => {
    if (chrome.runtime?.id) return true;
    observer?.disconnect(); clearInterval(tick); clearTimeout(saveTimer); clearTimeout(scanTimer);
    return false;
  };

  const save = () => {
    saveTimer = null;
    if (!alive() || !rec || !rec.entries.length) return;
    chrome.storage.local.set({ [key]: rec });
    chrome.runtime.sendMessage({ type: 'count', n: rec.entries.length });
  };

  // Лише role=region: поруч є combobox «Тип субтитрів», кнопки тощо з тим самим словом.
  const findRegion = () => [...document.querySelectorAll('[role="region"][aria-label]')]
    .find(el => /caption|субтитр/i.test(el.getAttribute('aria-label')));

  // Адреса буває і /abc-defg-hij, і /meet/abc-defg-hij.
  const meetingCode = () => (location.pathname.match(/\/([a-z]{3}-[a-z]{4}-[a-z]{3})(?:\/|$)/) || [])[1];

  // Назва зустрічі з календаря стоїть у заголовку внизу ліворуч; у зустрічі без назви там код.
  const meetingTitle = code => {
    const t = (document.querySelector('[aria-level="1"]')?.innerText || '').split('\n')[0].trim();
    return t && t !== code && t.length < 150 ? t : '';
  };

  // «Ви»/«You» → справжнє ім'я: плитка учасника з тією самою аватаркою, ім'я в .notranslate.
  // ponytail: якщо свою плитку приховано (немає на екрані) — лишиться «Ви»
  const nameByAvatar = img => {
    const base = (img.getAttribute('src') || '').split('=')[0];
    if (!base) return '';
    const twin = [...document.querySelectorAll('[data-participant-id] img')]
      .find(i => (i.getAttribute('src') || '').split('=')[0] === base);
    // span, не i: значки Material (frame_person тощо) теж мають клас notranslate
    const name = twin?.closest('[data-participant-id]').querySelector('span.notranslate')?.textContent.trim() || '';
    // Тезка в дзвінку (10.11: другий акаунт з тим самим ім'ям) — лишаємо «Ви», інакше репліки зливаються.
    const ids = new Set([...document.querySelectorAll('[data-participant-id]')]
      .filter(t => t.querySelector('span.notranslate')?.textContent.trim() === name)
      .map(t => t.getAttribute('data-participant-id')));
    return ids.size > 1 ? '' : name;
  };

  // Субтитри вимкнені → вмикаємо самі: кнопка «Увімкнути субтитри», або спершу панель «Субтитри й переклад».
  // Кілька спроб на сторінку — якщо людина свідомо вимкнула, не воюємо.
  function ensureCaptions() {
    if (findRegion()) { if (ccPanel) { ccPanel.click(); ccPanel = null; } return; }
    if (ccTries >= 4 || Date.now() - ccLast < 1500) return;
    const label = b => ((b.getAttribute('aria-label') || '') + ' ' + b.textContent).trim();
    const btns = [...document.querySelectorAll('button')];
    const on = btns.find(b => /turn on (live )?captions|увімкн\S* субтитр/i.test(label(b)));
    const panel = btns.find(b => /^(captions and translation|субтитри й переклад)/i.test(b.getAttribute('aria-label') || ''));
    if (on) { ccTries++; ccLast = Date.now(); on.click(); }
    else if (panel && !ccPanel) { ccTries++; ccLast = Date.now(); panel.click(); ccPanel = panel; }
  }

  // Блок репліки = найбільший предок аватарки, у якому лише одна аватарка.
  // Не залежить від обфускованих класів Meet.
  // ponytail: якщо Meet колись прибере аватарки з субтитрів — тут шукати інший якір
  function blockOf(img, region) {
    let el = img;
    while (el.parentElement && el.parentElement !== region &&
           el.parentElement.querySelectorAll('img').length === 1) el = el.parentElement;
    return el;
  }

  function scan() {
    scanTimer = null;
    const code = meetingCode();
    if (!code || !alive()) return;
    if (!rec || rec.code !== code) { // Meet — SPA: нова зустріч може початись без перезавантаження
      save();
      rec = { code, title: '', start: Date.now(), entries: [], saved: false };
      key = `t:${code}:${rec.start}`;
      byBlock = new WeakMap();
      ccTries = 0;
      chrome.runtime.sendMessage({ type: 'start', key });
    }
    ensureCaptions();
    const region = findRegion();
    if (!region) return;
    rec.title ||= meetingTitle(code);
    for (const img of region.querySelectorAll('img')) {
      const block = blockOf(img, region);
      let [speaker, ...rest] = block.innerText.split('\n').map(s => s.trim()).filter(Boolean);
      const text = rest.join(' ');
      if (!speaker || !text) continue;
      if (/^(you|ви)$/i.test(speaker)) speaker = nameByAvatar(img) || speaker;
      let e = byBlock.get(block);
      if (!e) { e = { t: Date.now(), speaker, text: '' }; rec.entries.push(e); byBlock.set(block, e); }
      const merged = mergeCaption(e.text, text);
      if (merged !== e.text) { e.text = merged; saveTimer ??= setTimeout(save, 1000); }
    }
  }

  observer = new MutationObserver(() => { scanTimer ??= setTimeout(scan, 250); });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true });
  // Без субтитрів і без мови сторінка майже не змінюється — тож ще й перевірка за таймером
  // (інакше ніхто не прокинеться, щоб увімкнути субтитри).
  tick = setInterval(() => { scanTimer ??= setTimeout(scan, 0); }, 2000);
  addEventListener('pagehide', save);
})();
