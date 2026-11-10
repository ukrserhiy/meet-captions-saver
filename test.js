// node test.js
const assert = require('assert');
const { mergeCaption: m, formatTranscript, fileName } = require('./lib.js');

assert.strictEqual(m('', 'Привіт'), 'Привіт');
assert.strictEqual(m('Привіт', 'Привіт, як справи'), 'Привіт, як справи');           // росте
assert.strictEqual(m('Привіт, як спра', 'Привіт, як справи?'), 'Привіт, як справи?'); // уточнення хвоста
const long = 'Перше речення досить довге щоб його обрізали. Друге речення теж довге.';
const trimmed = 'Друге речення теж довге. Третє нове.';                                 // Meet обрізав голову
assert.strictEqual(m(long, trimmed), 'Перше речення досить довге щоб його обрізали. Друге речення теж довге. Третє нове.');

// Коротка фраза переписана Meet (живий дзвінок 09.11): без дубля.
assert.strictEqual(m('Let us.', 'Let us meet again on Monday morning.'), 'Let us meet again on Monday morning.');
assert.strictEqual(m('Third.', 'Third, please send me the report.'), 'Third, please send me the report.');
assert.strictEqual(m('Hello, everyone.', 'Hello everyone! This is a test.'), 'Hello everyone! This is a test.');

// Повторювана фраза: видиме вікно містить кілька однакових шматків (баг 09.11 — текст розростався в 50 разів).
const L = 'First we finish the page. Then we meet on Monday. ';
const seen = L + L + L;                        // уже зібрано
const vis = L + L + L + 'Then';                // Meet показує те саме вікно + нове слово
assert.strictEqual(m(seen, vis), L + L + L + 'Then');
let acc = '';
for (let i = 1; i <= 40; i++) acc = m(acc, (L.repeat(i) + 'x').slice(-120)); // ковзне вікно на 120 символів
assert.ok(acc.length < L.length * 42, 'склейка не повинна множити текст: ' + acc.length);

const txt = formatTranscript({ code: 'abc-defg-hij', start: 0, entries: [
  { t: 0, speaker: 'Сергій', text: 'Раз' }, { t: 1, speaker: 'Сергій', text: 'два' }, { t: 2, speaker: 'Оля', text: 'Так' },
]});
assert.match(txt, /\] Сергій: Раз два\n\n\[.*\] Оля: Так\n$/);
assert.match(fileName({ code: 'abc-defg-hij', start: 0 }), /^meet-transcripts\/\d{4}-\d\d-\d\d_\d{6}_abc-defg-hij\.txt$/);
// Шматки одного дзвінка склеюються, перекриття на межі не дублюється.
const { combine, meetingGroup } = require('./lib.js');
const c = combine([
  { code: 'abc-defg-hij', title: '', start: 2000, entries: [{ t: 2000, speaker: 'Оля', text: 'Так, і ще одне важливе питання' }] },
  { code: 'abc-defg-hij', title: '', start: 1000, entries: [{ t: 1000, speaker: 'Сергій', text: 'Привіт' }, { t: 1500, speaker: 'Оля', text: 'Так, і ще одне' }] },
  { code: 'abc-defg-hij', title: 'Планерка', start: 3000, entries: [{ t: 3000, speaker: 'Сергій', text: 'Добре' }] },
]);
assert.deepStrictEqual(c.entries.map(e => e.speaker + ':' + e.text), ['Сергій:Привіт', 'Оля:Так, і ще одне важливе питання', 'Сергій:Добре']);
assert.strictEqual(c.title, 'Планерка');
assert.match(fileName({ code: 'abc-defg-hij', title: 'Планерка: Q4/план', start: 0 }), /_\d{6}_Планерка Q4 план_abc-defg-hij\.txt$/);
assert.notStrictEqual(meetingGroup({ code: 'abc-defg-hij', start: 0 }), meetingGroup({ code: 'abc-defg-hij', start: 7 * 864e5 }));

console.log('ok');
