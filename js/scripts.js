// 비공개 저장소(english-study-pdfs)의 대본을 읽기 전용 토큰으로 불러온다.
// 토큰은 이 브라우저에만 저장되고 동기화되지 않는다.
import { parseTranscript } from './transcript.js';

const REPO = 'drklife22/english-study-pdfs';
const KEY = 'speakup:ghtoken';
const cache = new Map();

export function getToken() { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } }
export function setToken(t) {
  try { t ? localStorage.setItem(KEY, t.trim()) : localStorage.removeItem(KEY); } catch (e) { /* noop */ }
  cache.clear();
}

export class ScriptError extends Error {
  constructor(kind, msg) { super(msg); this.kind = kind; }
}

export async function fetchScript(week) {
  if (cache.has(week)) return cache.get(week);
  const token = getToken();
  if (!token) throw new ScriptError('no-token', '대본을 불러오려면 GitHub 열쇠(토큰)가 필요해요.');
  const file = encodeURIComponent(`대본_${week}회차`);
  let res;
  try {
    res = await fetch(`https://api.github.com/repos/${REPO}/contents/${file}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.raw' },
      cache: 'no-store',
    });
  } catch (e) {
    throw new ScriptError('network', '인터넷 연결을 확인해 주세요.');
  }
  if (res.status === 401) throw new ScriptError('bad-token', '열쇠(토큰)가 틀렸거나 만료됐어요. 새로 만들어 붙여 넣어 주세요.');
  if (res.status === 403) throw new ScriptError('forbidden', '열쇠에 이 저장소를 읽을 권한이 없어요. 토큰 설정에서 english-study-pdfs 의 Contents: Read 권한을 확인해 주세요.');
  if (res.status === 404) throw new ScriptError('not-found', `english-study-pdfs 에 '대본_${week}회차' 파일이 없거나, 열쇠가 이 저장소를 볼 수 없어요.`);
  if (!res.ok) throw new ScriptError('other', `대본을 불러오지 못했어요 (${res.status}).`);
  const parsed = parseTranscript(await res.text());
  if (!parsed.rows.length) throw new ScriptError('empty', '대본 파일 형식을 읽을 수 없어요.');
  cache.set(week, parsed);
  return parsed;
}

// 토큰이 맞는지 확인 (저장소 정보 읽기)
export async function testToken(token) {
  const res = await fetch(`https://api.github.com/repos/${REPO}`, {
    headers: { Authorization: `Bearer ${token.trim()}` }, cache: 'no-store',
  });
  return res.status;
}
