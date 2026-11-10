// Чисті функції: їх спільно використовують content.js, background.js і test.js.

// Meet переписує хвіст субтитра (уточнює слова) і обрізає голову довгої репліки.
// Шукаємо, де видимий зараз текст починається всередині вже зібраного.
function mergeCaption(old, cur) {
  if (!old) return cur;
  // Голова cur може захоплювати ще не "застиглий" хвіст old — пробуємо коротші префікси.
  const max = Math.min(30, old.length, cur.length);
  for (let n = max; n >= Math.min(8, max); n--) {
    const head = cur.slice(0, n);
    // Фраза може повторюватись — беремо входження, з якого збіг із cur найдовший.
    let best = -1, bestLen = -1;
    for (let i = old.indexOf(head); i >= 0; i = old.indexOf(head, i + 1)) {
      let k = n;
      while (i + k < old.length && k < cur.length && old[i + k] === cur[k]) k++;
      if (k > bestLen) { bestLen = k; best = i; }
    }
    if (best >= 0) return old.slice(0, best) + cur;
  }
  // Коротку фразу Meet переписує цілком («Let us.» → «Let us meet again») — нова версія замінює стару.
  // Обрізає голову Meet лише в довгих блоках, тож для короткого old це завжди уточнення.
  if (old.length < 60) return cur;
  // ponytail: якщо Meet переписав навіть початок видимого тексту довгого блоку — буде невеликий дубль
  return old + ' ' + cur;
}

function formatTranscript(rec) {
  const turns = [];
  for (const e of rec.entries) {
    const last = turns[turns.length - 1];
    if (last && last.speaker === e.speaker) last.text += ' ' + e.text;
    else turns.push({ ...e });
  }
  const time = t => new Date(t).toLocaleTimeString('uk-UA', { hour12: false });
  const body = turns
    .filter(x => x.text.trim())
    .map(x => `[${time(x.t)}] ${x.speaker}: ${x.text.trim()}`)
    .join('\n\n');
  const name = rec.title ? `${rec.title} (${rec.code})` : rec.code;
  return `Google Meet: ${name} — ${new Date(rec.start).toLocaleString('uk-UA')}\n\n${body}\n`;
}

const day = t => { const d = new Date(t), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

function fileName(rec) {
  const d = new Date(rec.start), p = n => String(n).padStart(2, '0');
  const title = (rec.title || '').replace(/[\\/:*?"<>|\s]+/g, ' ').trim().slice(0, 60).trim();
  return `meet-transcripts/${day(rec.start)}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}_${title ? title + '_' : ''}${rec.code}.txt`;
}

// Один дзвінок буває кількома шматками (перепідключення, F5, оновлення розширення) —
// склеюємо в один запис. Перший блок нового шматка — це той самий блок субтитрів, що був на екрані.
function combine(recs) {
  const [first, ...more] = [...recs].sort((a, b) => a.start - b.start);
  const out = { ...first, entries: first.entries.map(e => ({ ...e })) };
  for (const r of more) {
    out.title ||= r.title;
    r.entries.forEach((e, i) => {
      const last = out.entries[out.entries.length - 1];
      if (i === 0 && last && last.speaker === e.speaker) last.text = mergeCaption(last.text, e.text);
      else out.entries.push({ ...e });
    });
  }
  return out;
}

// Шматки одного дзвінка: той самий код і той самий день (регулярні зустрічі мають один код).
const meetingGroup = rec => `${rec.code}|${day(rec.start)}`;

if (typeof module !== 'undefined') module.exports = { mergeCaption, formatTranscript, fileName, combine, meetingGroup };
