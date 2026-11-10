// 비공개 대본(시간 + 자막)에서 표현이 나오는 장면을 찾아 data/scenes.json 을 만든다.
// 대본 전체는 공개 저장소에 올리지 않고, 표현이 들어간 한 문장과 시간만 저장한다.
//
// 사용법: node tools/build_scenes.mjs <대본 폴더>   (예: ../english-study-pdfs)
// 대본 파일 이름: 대본_N회차  (첫 줄 제목, 둘째 줄 "Time\tSubtitle", 이후 "1:05\t자막")
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { usesExpr, findSpan } from '../js/match.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = process.argv[2];
if (!srcDir) { console.error('대본 폴더를 지정하세요'); process.exit(1); }

const toSec = t => {
  t = t.trim();
  if (/^\d+s$/.test(t)) return Number(t.slice(0, -1));
  const p = t.split(':').map(Number);
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
};
const clean = s => s
  .replace(/\[[^\]]*\]/g, ' ').replace(/\([^)]*\)/g, ' ').replace(/>>/g, ' ')
  .replace(/(^|\s)-\s/g, ' ').replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
const videoId = url => (url.match(/(?:youtu\.be\/|v=)([\w-]{11})/) || [])[1] || '';

function parseScript(file) {
  const rows = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n').slice(2)) {
    const [t, ...rest] = line.split('\t');
    if (!t || !rest.length) continue;
    const text = clean(rest.join(' '));
    if (text) rows.push({ t: toSec(t), text });
  }
  // 단어마다 줄 번호를 붙인 뒤 문장 단위로 나눈다
  const toks = [];
  rows.forEach((r, i) => r.text.split(' ').forEach(w => toks.push({ w, row: i })));
  const rowEnd = i => (rows[i + 1] ? rows[i + 1].t : rows[i].t + 4);
  const sentences = [];
  let cur = [];
  for (const tk of toks) {
    cur.push(tk);
    if (/[.?!]["')]*$/.test(tk.w) || cur.length >= 40) { sentences.push(cur); cur = []; }
  }
  if (cur.length) sentences.push(cur);
  const cands = sentences.map(s => ({
    text: s.map(x => x.w).join(' '), start: rows[s[0].row].t, end: rowEnd(s[s.length - 1].row), n: s.length,
  }));
  // 문장이 너무 길면 자막 두 줄 묶음도 후보로
  const pairs = rows.map((r, i) => ({
    text: r.text + (rows[i + 1] ? ' ' + rows[i + 1].text : ''), start: r.t, end: rowEnd(i + 1 < rows.length ? i + 1 : i),
    n: 99,
  }));
  return { title: fs.readFileSync(file, 'utf8').split('\n')[0].trim(), cands, pairs };
}

const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/index.json'))).weeks;
const out = {};
for (const w of index) {
  const file = path.join(srcDir, `대본_${w.week}회차`);
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', w.file)));
  if (!fs.existsSync(file)) { console.log(`${w.week}회차: 대본 없음`); continue; }
  const { cands, pairs } = parseScript(file);
  const scenes = {};
  for (const e of data.expressions) {
    const hit = cands.find(c => c.n <= 30 && usesExpr(c.text, e)) || pairs.find(c => usesExpr(c.text, e));
    if (!hit) continue;
    let text = hit.text;
    const span = findSpan(text, e);
    if (span) text = text.slice(0, span[0]) + '[' + text.slice(span[0], span[1]) + ']' + text.slice(span[1]);
    scenes[e.id] = { start: Math.max(0, hit.start - 1), end: hit.end + 1, text };
  }
  out[w.week] = { videoId: videoId(data.video), scenes };
  const miss = data.expressions.filter(e => !scenes[e.id]).map(e => e.en);
  console.log(`${w.week}회차: 장면 ${Object.keys(scenes).length}/${data.expressions.length}` + (miss.length ? `  (못 찾음: ${miss.join(', ')})` : ''));
}
fs.writeFileSync(path.join(ROOT, 'data/scenes.json'), JSON.stringify(out, null, 1));
