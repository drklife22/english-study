// 문장 비교, 표현 사용 여부 체크
import { bracketText } from './data.js';

export function norm(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^a-z0-9'\- ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
export const words = s => norm(s).split(' ').filter(Boolean);

const IRREGULAR = {
  blew: 'blow', blown: 'blow', lit: 'light', took: 'take', taken: 'take', went: 'go', gone: 'go',
  came: 'come', got: 'get', gotten: 'get', made: 'make', ran: 'run', stood: 'stand', held: 'hold',
  fell: 'fall', found: 'find', gave: 'give', given: 'give', brought: 'bring', built: 'build',
  felt: 'feel', kept: 'keep', left: 'leave', sat: 'sit', struck: 'strike', thought: 'think',
  told: 'tell', saw: 'see', seen: 'see', said: 'say', rode: 'ride', ridden: 'ride', did: 'do',
  done: 'do', had: 'have', has: 'have', was: 'be', were: 'be', is: 'be', are: 'be', am: 'be',
  been: 'be', "i'm": 'be', "'m": 'be', caught: 'catch', dove: 'dive', flew: 'fly', flies: 'fly',
  knew: 'know', known: 'know', burnt: 'burn', leant: 'lean', unlearnt: 'unlearn', bent: 'bend',
};

export function lemma(w) {
  w = w.replace(/^'+|'+$/g, '');
  if (IRREGULAR[w]) return IRREGULAR[w];
  if (w.length > 5 && w.endsWith('ying')) return w.slice(0, -4) + 'y';
  if (w.length > 4 && w.endsWith('ing')) {
    let b = w.slice(0, -3);
    if (/(.)\1$/.test(b) && !/(ll|ss)$/.test(b)) b = b.slice(0, -1);
    return b;
  }
  if (w.length > 4 && w.endsWith('ied')) return w.slice(0, -3) + 'y';
  if (w.length > 3 && w.endsWith('ed')) {
    let b = w.slice(0, -2);
    if (/(.)\1$/.test(b) && !/(ll|ss)$/.test(b)) b = b.slice(0, -1);
    return b;
  }
  if (w.length > 3 && w.endsWith('es') && /(sh|ch|x|ss)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}
const sameWord = (a, b) => {
  if (a === b) return true;
  const la = lemma(a), lb = lemma(b);
  if (la === lb) return true;
  // "make"/"mak" 같은 e 탈락 처리
  return la.replace(/e$/, '') === lb.replace(/e$/, '');
};

const SKIP = new Set(['someone', "someone's", "one's", 'oneself', 'sth', 'sb', 'a', 'b',
  'an', 'the', 'be', '~', 'still', 'ing', 'doing']);

// 한 단어만 남으면 너무 흔해서 오탐이 나는 단어들
const COMMON = new Set(['like', 'up', 'in', 'on', 'to', 'go', 'get', 'time', 'it', 'out', 'off', 'into', 'way', 'or', 'find', 'have', 'take', 'make', 'come', 'feel', 'look']);

// 표현 머리말에서 체크용 핵심 단어 목록 만들기
function headwordVariants(en) {
  return en.split('/').map(part => {
    const cleaned = part.replace(/\([^)]*\)/g, ' ').replace(/~[a-z-]*/gi, ' ');
    return words(cleaned).filter(w => !SKIP.has(w));
  }).filter(v => v.length && !(v.length === 1 && COMMON.has(v[0])));
}

function seqMatch(textWords, keys, maxGap = 3) {
  for (let start = 0; start < textWords.length; start++) {
    if (!sameWord(textWords[start], keys[0])) continue;
    let pos = start, ok = true;
    for (let k = 1; k < keys.length; k++) {
      let found = -1;
      for (let j = pos + 1; j <= Math.min(textWords.length - 1, pos + 1 + maxGap); j++) {
        if (sameWord(textWords[j], keys[k])) { found = j; break; }
      }
      if (found < 0) { ok = false; break; }
      pos = found;
    }
    if (ok) return true;
  }
  return false;
}

export function usesExpr(text, expr) {
  const t = ' ' + norm(text) + ' ' + norm(text).replace(/-/g, ' ') + ' ';
  if (t.trim() === '') return false;
  const phrases = [...(expr.match || []), ...expr.examples.map(x => bracketText(x.en))];
  for (const p of phrases) {
    const n = norm(p);
    if (n && t.includes(' ' + n + ' ')) return true;
  }
  const tw = words(norm(text).replace(/-/g, ' '));
  for (const keys of headwordVariants(expr.en)) {
    if (seqMatch(tw, keys)) return true;
  }
  // match 목록 문구도 느슨하게 (어형 변화 허용)
  for (const p of expr.match || []) {
    const keys = words(p).filter(w => !SKIP.has(w));
    if (keys.length > 1 && seqMatch(tw, keys)) return true;
  }
  return false;
}

// 원문에서 표현이 있는 위치(글자 범위)를 찾는다. 하이라이트용. 못 찾으면 null
export function findSpan(text, expr) {
  const toks = [];
  const re = /[A-Za-z0-9'’]+/g;
  let m;
  while ((m = re.exec(text))) toks.push({ w: norm(m[0]), s: m.index, e: m.index + m[0].length });
  const tw = toks.map(t => t.w);
  const range = (keys, gap, exact) => {
    for (let st = 0; st < tw.length; st++) {
      const eq = (a, b) => (exact ? a === b : sameWord(a, b));
      if (!eq(tw[st], keys[0])) continue;
      let pos = st, ok = true;
      for (let k = 1; k < keys.length; k++) {
        let found = -1;
        for (let j = pos + 1; j <= Math.min(tw.length - 1, pos + 1 + gap); j++) if (eq(tw[j], keys[k])) { found = j; break; }
        if (found < 0) { ok = false; break; }
        pos = found;
      }
      if (ok) return [toks[st].s, toks[pos].e];
    }
    return null;
  };
  const phrases = [...(expr.match || []), ...expr.examples.map(x => bracketText(x.en))]
    .map(p => words(p.replace(/-/g, ' '))).filter(k => k.length);
  for (const k of phrases.sort((a, b) => b.length - a.length)) { const r = range(k, 0, true); if (r) return r; }
  for (const k of headwordVariants(expr.en)) { const r = range(k, 3, false); if (r) return r; }
  for (const k of phrases) { if (k.length > 1) { const r = range(k.filter(w => !SKIP.has(w)), 3, false); if (r) return r; } }
  return null;
}

// 단어 단위 LCS로 정확도(0~100)와 비교 결과 만들기
const plainWords = s => words(s).map(w => w.replace(/'/g, ''));
export function compare(target, said) {
  const a = plainWords(target), b = plainWords(said);
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = sameWord(a[i], b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const hit = new Array(m).fill(false);
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (sameWord(a[i], b[j])) { hit[i] = true; i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  const lcs = dp[0][0];
  const score = m === 0 ? 0 : Math.round((2 * lcs / (m + n || 1)) * 100);
  return { score, tokens: a.map((w, k) => ({ w, ok: hit[k] })) };
}

export function diffHtml(result) {
  return '<span class="diff">' + result.tokens.map(t =>
    `<span class="${t.ok ? 'ok' : 'miss'}">${t.w}</span>`).join(' ') + '</span>';
}

export function looseEqual(a, b) {
  const x = words(a), y = words(b);
  if (x.length !== y.length) return false;
  return x.every((w, i) => sameWord(w, y[i]));
}
