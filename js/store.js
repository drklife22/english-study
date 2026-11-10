// 학습 기록 저장 (브라우저 + 선택적으로 Firebase 동기화)
const KEY = 'speakup:v1';
const DAY = 86400000;
// 박스별 다음 복습까지 간격(일)
const INTERVALS = [0, 1, 2, 4, 7, 15, 30];
export const MAX_BOX = INTERVALS.length - 1;

const blank = () => ({
  v: 1,
  items: {},        // id -> { box, due, seen, ok, ng, upd }
  sentences: {},    // id -> [{ text, ts }]
  paragraphs: [],   // [{ id, ts, topic, use, text }]
  best: {},         // mode -> score
  days: {},         // 'YYYY-MM-DD' -> 답한 문제 수
  settings: { accent: 'en-US', rate: 0.95, scope: [], theme: 'auto', newPerDay: 10 },
  updatedAt: 0,
});

let state = load();
const listeners = new Set();
export const onChange = fn => listeners.add(fn);

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      const b = blank();
      return { ...b, ...s, settings: { ...b.settings, ...(s.settings || {}) } };
    }
  } catch (e) { /* 저장소를 쓸 수 없는 환경 */ }
  return blank();
}

function persist() {
  state.updatedAt = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* noop */ }
  listeners.forEach(fn => fn(state));
}

export const getState = () => state;
export function replaceState(s) {
  const b = blank();
  state = { ...b, ...s, settings: { ...b.settings, ...(s.settings || {}) } };
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* noop */ }
  listeners.forEach(fn => fn(state));
}

export const today = (d = new Date()) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};

export const item = id => state.items[id];

// 문제를 풀 때마다 호출. ok: true(정답) / false(오답) / 'hard'(헷갈림)
export function review(id, ok) {
  const now = Date.now();
  const it = state.items[id] || { box: 0, due: 0, seen: 0, ok: 0, ng: 0 };
  it.seen++;
  if (ok === true) {
    it.ok++;
    it.box = Math.min(MAX_BOX, it.box + 1);
    it.due = now + INTERVALS[it.box] * DAY;
  } else if (ok === 'hard') {
    it.box = Math.max(1, it.box);
    it.due = now + DAY;
  } else {
    it.ng++;
    it.box = 0;
    it.due = now;
  }
  it.upd = now;
  state.items[id] = it;
  const t = today();
  state.days[t] = (state.days[t] || 0) + 1;
  persist();
}

// 표현 카드의 알아요/헷갈려요/몰라요 버튼
export function setLevel(id, level) {
  const now = Date.now();
  const it = state.items[id] || { box: 0, due: 0, seen: 0, ok: 0, ng: 0 };
  if (level === 3) { it.box = Math.max(it.box, 4); it.due = now + INTERVALS[it.box] * DAY; }
  if (level === 2) { it.box = 1; it.due = now + DAY; }
  if (level === 1) { it.box = 0; it.due = now; }
  it.seen = Math.max(1, it.seen);
  it.upd = now;
  state.items[id] = it;
  persist();
}

// 0: 처음, 1: 몰라요, 2: 헷갈려요, 3: 알아요
export function levelOf(id) {
  const it = state.items[id];
  if (!it || !it.seen) return 0;
  if (it.box >= 4) return 3;
  if (it.box >= 1) return 2;
  return 1;
}

export function isDue(id, now = Date.now()) {
  const it = state.items[id];
  return !!it && it.seen > 0 && it.due <= now;
}

// 출제 가중치: 모르는 것·오래된 것일수록 자주
export function weight(id) {
  const it = state.items[id];
  if (!it || !it.seen) return 3;
  const overdue = Date.now() >= it.due ? 2 : 0;
  return 1 + (MAX_BOX - it.box) + overdue + Math.min(3, it.ng * 0.5);
}
export function weightedPick(list, avoidId) {
  const pool = list.length > 1 ? list.filter(e => e.id !== avoidId) : list;
  const ws = pool.map(e => weight(e.id));
  let r = Math.random() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) { r -= ws[i]; if (r <= 0) return pool[i]; }
  return pool[pool.length - 1];
}

export function addSentence(id, text) {
  (state.sentences[id] = state.sentences[id] || []).push({ text, ts: Date.now() });
  persist();
}
export function removeSentence(id, ts) {
  state.sentences[id] = (state.sentences[id] || []).filter(s => s.ts !== ts);
  persist();
}

export function saveParagraph(p) {
  const id = p.id || 'p' + Date.now().toString(36);
  const i = state.paragraphs.findIndex(x => x.id === id);
  const rec = { ...p, id, ts: Date.now() };
  if (i >= 0) state.paragraphs[i] = rec; else state.paragraphs.unshift(rec);
  persist();
  return id;
}
export function removeParagraph(id) {
  state.paragraphs = state.paragraphs.filter(p => p.id !== id);
  persist();
}

export function setBest(mode, score, lowerIsBetter = false) {
  const prev = state.best[mode];
  const better = prev == null || (lowerIsBetter ? score < prev : score > prev);
  if (better) { state.best[mode] = score; persist(); }
  return better;
}

export function setSetting(k, v) { state.settings[k] = v; persist(); }

export function streak() {
  let n = 0;
  const d = new Date();
  if (!state.days[today(d)]) d.setDate(d.getDate() - 1); // 오늘 아직 안 했으면 어제부터
  while (state.days[today(d)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

// 두 기기의 기록 합치기
export function merge(a, b) {
  const out = blank();
  out.items = { ...a.items };
  for (const [id, it] of Object.entries(b.items || {})) {
    if (!out.items[id] || (it.upd || 0) > (out.items[id].upd || 0)) out.items[id] = it;
  }
  const ids = new Set([...Object.keys(a.sentences || {}), ...Object.keys(b.sentences || {})]);
  for (const id of ids) {
    const m = new Map();
    for (const s of [...(a.sentences?.[id] || []), ...(b.sentences?.[id] || [])]) m.set(s.ts, s);
    out.sentences[id] = [...m.values()].sort((x, y) => x.ts - y.ts);
  }
  const pm = new Map();
  for (const p of [...(b.paragraphs || []), ...(a.paragraphs || [])]) {
    if (!pm.has(p.id) || p.ts > pm.get(p.id).ts) pm.set(p.id, p);
  }
  out.paragraphs = [...pm.values()].sort((x, y) => y.ts - x.ts);
  out.best = { ...a.best };
  for (const [k, v] of Object.entries(b.best || {})) {
    const lower = k.startsWith('match');
    if (out.best[k] == null || (lower ? v < out.best[k] : v > out.best[k])) out.best[k] = v;
  }
  out.days = { ...a.days };
  for (const [k, v] of Object.entries(b.days || {})) out.days[k] = Math.max(out.days[k] || 0, v);
  out.settings = (a.updatedAt || 0) >= (b.updatedAt || 0)
    ? { ...out.settings, ...a.settings } : { ...out.settings, ...b.settings };
  out.updatedAt = Math.max(a.updatedAt || 0, b.updatedAt || 0);
  return out;
}

export function exportJson() { return JSON.stringify(state, null, 1); }
export function resetAll() { replaceState(blank()); }
