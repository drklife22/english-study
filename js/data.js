// 회차 데이터 로딩과 표현 풀(pool) 도우미
let index = null;
const weeks = new Map();
const exprById = new Map();

export async function loadAll() {
  if (index) return;
  const res = await fetch('data/index.json', { cache: 'no-cache' });
  index = (await res.json()).weeks;
  const all = await Promise.all(index.map(w =>
    fetch('data/' + w.file, { cache: 'no-cache' }).then(r => r.json())));
  for (const w of all) {
    weeks.set(w.week, w);
    for (const e of w.expressions) exprById.set(e.id, e);
  }
}

export const getIndex = () => index || [];
export const getWeek = n => weeks.get(Number(n));
export const getExpr = id => exprById.get(id);
export const allExprs = () => [...exprById.values()];
export const allWeeks = () => [...weeks.values()].sort((a, b) => a.week - b.week);

export function exprsOfWeeks(nums) {
  if (!nums || !nums.length) return allExprs();
  const set = new Set(nums.map(Number));
  return allExprs().filter(e => set.has(e.week));
}

export function roleplaysOf(nums) {
  const list = [];
  for (const w of allWeeks()) {
    if (nums && nums.length && !nums.includes(w.week)) continue;
    w.roleplays.forEach((r, i) => list.push({ ...r, week: w.week, key: `w${w.week}-r${i}` }));
  }
  return list;
}

export function paragraphsOf(nums) {
  const list = [];
  for (const w of allWeeks()) {
    if (nums && nums.length && !nums.includes(w.week)) continue;
    w.paragraphs.forEach((p, i) => list.push({ ...p, week: w.week, key: `w${w.week}-p${i}` }));
  }
  return list;
}

// "[blew up]" 같은 대괄호 표시를 다루는 도우미
export const bracketText = s => (s.match(/\[([^\]]+)\]/) || [, ''])[1];
export const stripBrackets = s => s.replace(/\[([^\]]+)\]/g, '$1');

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export function sample(arr, n) { return shuffle(arr).slice(0, n); }
