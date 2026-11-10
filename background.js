importScripts('lib.js');

// Вкладки Meet, відкриті до встановлення/оновлення, Chrome сам не підхоплює — вставляємо скрипт.
chrome.runtime.onInstalled.addListener(async () => {
  for (const tab of await chrome.tabs.query({ url: 'https://meet.google.com/*' }))
    chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['lib.js', 'content.js'] }).catch(() => {});
  chrome.alarms.create('selfupdate', { periodInMinutes: 0.5 });
  chrome.storage.local.remove('diag'); // залишок налагодження v1.1
});

// Розпаковане розширення не перечитує файли з диска саме — раз на 30 с порівнюємо і перезапускаємось.
chrome.alarms.onAlarm.addListener(async () => {
  const src = (await Promise.all(['manifest.json', 'lib.js', 'content.js', 'background.js']
    .map(f => fetch(chrome.runtime.getURL(f)).then(r => r.text())))).join('\n');
  // Зберігаємо лише відбиток, не весь код: інакше сховище росте на ~15 КБ кожні 30 с.
  const hash = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(src));
  const sig = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
  const { sig: old } = await chrome.storage.local.get('sig');
  await chrome.storage.local.set({ sig });
  if (old && old !== sig) chrome.runtime.reload();
});

// Вивантажує всі дзвінки, де є невивантажені шматки; кожен дзвінок — один файл.
// Без невивантажених (клік по іконці) — повторно останній дзвінок.
async function downloadUnsaved() {
  const all = await chrome.storage.local.get(null);
  const keys = Object.keys(all).filter(k => k.startsWith('t:') && all[k].entries?.length);
  const groups = {};
  for (const k of keys) (groups[meetingGroup(all[k])] ||= []).push(k);
  let todo = Object.values(groups).filter(g => g.some(k => !all[k].saved));
  if (!todo.length && keys.length) {
    const last = keys.reduce((a, b) => all[a].start > all[b].start ? a : b);
    todo = [groups[meetingGroup(all[last])]];
  }
  for (const g of todo) {
    const rec = combine(g.map(k => all[k]));
    await chrome.downloads.download({
      url: 'data:text/plain;charset=utf-8,' + encodeURIComponent('﻿' + formatTranscript(rec)),
      filename: fileName(rec),
      conflictAction: 'overwrite', // той самий дзвінок вивантажено ще раз — повніша версія замінює стару
    });
    await chrome.storage.local.set(Object.fromEntries(g.map(k => [k, { ...all[k], saved: true }])));
  }
}
chrome.action.onClicked.addListener(downloadUnsaved);

// Яка вкладка пише стенограму (service worker засинає — тримаємо в session storage).
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!sender.tab) return;
  // Лічильник реплік на іконці — видно, що запис іде.
  if (msg.type === 'count') chrome.action.setBadgeText({ tabId: sender.tab.id, text: String(msg.n) });
  if (msg.type === 'start') chrome.storage.session.set({ ['tab:' + sender.tab.id]: msg.key });
});

// Закрили вкладку Meet → файл у Завантаження/meet-transcripts/.
chrome.tabs.onRemoved.addListener(async id => {
  const tab = 'tab:' + id;
  const { [tab]: key } = await chrome.storage.session.get(tab);
  if (!key) return;
  await chrome.storage.session.remove(tab);
  // ponytail: чекаємо останній запис із вкладки; при різкому закритті можна втратити ~1 с тексту
  setTimeout(downloadUnsaved, 700);
});
