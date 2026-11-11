// 영상 빈칸 딕테이션: 대본 전체를 보여 주고 일부 단어를 빈칸으로 뚫어, 영상을 들으며 채운다.
// 대본은 비공개 저장소에서 사용자 토큰으로 실행 중에 불러온다 (js/scripts.js).
import { getIndex, getWeek, weekVideoId } from './data.js';
import { createPlayer, ytLink, isEmbedBlocked } from './yt.js';
import { fetchScript, getToken, setToken, testToken } from './scripts.js';
import { findSpan } from './match.js';
import { esc, toast, weekLabel } from './ui.js';
import * as S from './store.js';

const NUMS = { zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12', twenty: '20', hundred: '100' };
export const normWord = w => {
  const x = w.toLowerCase().replace(/[’‘`]/g, "'").replace(/[^a-z0-9']/g, '').replace(/'/g, '');
  return NUMS[x] || x;
};
// 빈칸으로 내기엔 너무 쉬운 짧은 기능어
const EASY = new Set(['a', 'an', 'the', 'i', 'to', 'of', 'and', 'in', 'on', 'it', 'is', 'so', 'or', 'at', 'be', 'um', 'uh', 'oh', 'ah', 'mm']);

export const LEVELS = [
  { id: 'expr', name: '표현만', ratio: 0 },
  { id: 'easy', name: '쉬움', ratio: 0.15 },
  { id: 'normal', name: '보통', ratio: 0.3 },
  { id: 'hard', name: '어려움', ratio: 0.5 },
  { id: 'all', name: '모든 단어', ratio: 1 },
];

const fmt = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

// 한 줄을 단어 조각으로: { pre, core, post, s, e } (core 가 빈칸 후보)
function splitRow(text) {
  const parts = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(text))) {
    const raw = m[0];
    const mm = raw.match(/^([^A-Za-z0-9]*)(.*?)([^A-Za-z0-9]*)$/);
    parts.push({ pre: mm[1], core: mm[2], post: mm[3], s: m.index, e: m.index + raw.length });
  }
  return parts;
}

// 빈칸 만들기. 배운 표현이 나오는 단어는 항상 빈칸
function buildBlanks(rows, expressions, ratio) {
  const lines = rows.map(r => ({ ...r, parts: splitRow(r.text) }));
  const candidates = [];
  lines.forEach((ln, li) => {
    const spans = expressions.map(e => findSpan(ln.text, e)).filter(Boolean);
    ln.parts.forEach((p, pi) => {
      if (!p.core || !/[A-Za-z0-9]/.test(p.core)) return;
      const inExpr = spans.some(([s, e]) => p.s < e && p.e > s);
      if (inExpr) { p.blank = true; p.expr = true; return; }
      if (ratio >= 1) { p.blank = true; return; }
      if (EASY.has(normWord(p.core))) return;
      candidates.push(p);
    });
  });
  if (ratio > 0 && ratio < 1) {
    // 골고루 흩어지도록: 후보를 섞고 비율만큼 뽑기
    const want = Math.round(candidates.length * ratio);
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    candidates.slice(0, want).forEach(p => { p.blank = true; });
  }
  return lines;
}

/* ---------------- 회차 고르기 ---------------- */
export function viewDictationList(app) {
  const results = S.getState().dictation || [];
  app.innerHTML = `
    <a class="small" href="#/practice">‹ 연습하기</a>
    <h1 style="margin-top:8px">⌨️ 영상 빈칸 딕테이션</h1>
    <p class="muted">대본 전체가 빈칸이 뚫린 채로 나와요. 영상을 들으면서 빈칸을 채우고 채점해 보세요.</p>
    ${getToken() ? '' : tokenCardHtml()}
    ${getIndex().slice().reverse().map(i => {
      const w = getWeek(i.week);
      const mine = results.filter(r => r.week === i.week);
      const best = mine.filter(r => r.range === 'full').reduce((a, r) => Math.max(a, r.score), -1);
      return `<a class="card week-card" href="#/dictation/${i.week}">
        <div class="row between"><span class="num">${esc(weekLabel(w))}</span>
          ${best >= 0 ? `<span class="chip good">최고 ${best}%</span>` : ''}</div>
        <h3 style="margin-top:6px">${esc(w.title)}</h3>
        <div class="small muted">${mine.length ? `${mine.length}번 채점함 · 마지막 ${new Date(mine[0].ts).toLocaleDateString('ko-KR')}` : '아직 안 함'}</div>
      </a>`;
    }).join('')}`;
  bindTokenCard(app, () => viewDictationList(app));
}

/* ---------------- 토큰(열쇠) 설정 ---------------- */
export function tokenCardHtml(compact = false) {
  return `<div class="card token-card">
    <b>🔑 대본 불러오기 열쇠 ${getToken() ? '<span class="chip good">저장됨</span>' : ''}</b>
    ${compact ? '' : `<p class="small muted mt">딕테이션 대본은 비공개 저장소에 있어서, 읽기 전용 열쇠(GitHub 토큰)가 한 번 필요해요. 이 브라우저에만 저장돼요.</p>
    <details class="small"><summary>열쇠 만드는 방법</summary>
      <ol style="padding-left:18px;margin:8px 0">
        <li>GitHub 로그인 후 <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">새 토큰 만들기 ↗</a> 열기</li>
        <li><b>Token name</b>: 아무 이름 (예: speakup) · <b>Expiration</b>: 기간 선택 (예: 1년)</li>
        <li><b>Repository access</b>: <b>Only select repositories</b> → <code>english-study-pdfs</code> 선택</li>
        <li><b>Permissions → Repository permissions → Contents</b>: <b>Read-only</b></li>
        <li>맨 아래 <b>Generate token</b> → 나온 <code>github_pat_…</code> 를 복사해서 아래에 붙여 넣기</li>
      </ol>
    </details>`}
    <div class="row mt" style="flex-wrap:nowrap">
      <input type="password" data-token placeholder="${getToken() ? '새 열쇠로 바꾸려면 붙여 넣기' : 'github_pat_… 붙여 넣기'}" autocomplete="off" spellcheck="false">
      <button class="btn sm primary" data-token-save>저장</button>
    </div>
    ${getToken() ? '<button class="btn sm ghost mt" data-token-del>열쇠 지우기</button>' : ''}
  </div>`;
}

export function bindTokenCard(root, onDone) {
  const save = root.querySelector('[data-token-save]');
  if (save) save.onclick = async () => {
    const v = root.querySelector('[data-token]').value.trim();
    if (!v) { toast('열쇠를 붙여 넣어 주세요'); return; }
    save.disabled = true; save.textContent = '확인 중…';
    let status = 0;
    try { status = await testToken(v); } catch (e) { status = -1; }
    save.disabled = false; save.textContent = '저장';
    if (status === 200) { setToken(v); toast('열쇠를 저장했어요 🔑'); onDone && onDone(); }
    else if (status === 401) toast('열쇠가 틀렸거나 만료됐어요');
    else if (status === 404 || status === 403) toast('이 열쇠로는 english-study-pdfs 를 볼 수 없어요. 저장소 선택을 확인해 주세요');
    else toast('확인하지 못했어요. 인터넷 연결을 확인해 주세요');
  };
  const del = root.querySelector('[data-token-del]');
  if (del) del.onclick = () => { setToken(''); toast('열쇠를 지웠어요'); onDone && onDone(); };
}

/* ---------------- 딕테이션 화면 ---------------- */
export function viewDictation(app, n) {
  const w = getWeek(n);
  if (!w) { app.innerHTML = '<div class="empty">없는 회차예요.</div>'; return () => {}; }
  const back = '<a class="small" href="#/dictation">‹ 회차 목록</a>';
  if (!getToken()) {
    app.innerHTML = `${back}<h1 style="margin-top:8px">${esc(w.title)}</h1>${tokenCardHtml()}`;
    bindTokenCard(app, () => viewDictation(app, n));
    return () => {};
  }
  app.innerHTML = `${back}<h1 style="margin-top:8px">${esc(w.title)}</h1><div class="empty">대본 불러오는 중…</div>`;
  let player = null, alive = true, dirty = false, timer = null;
  const onLeave = e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', onLeave);

  fetchScript(w.week).then(script => {
    if (!alive) return;
    const vid = weekVideoId(w.week) || (w.video.match(/(?:youtu\.be\/|v=)([\w-]{11})/) || [])[1];
    const level = S.getState().settings.dictLevel || 'normal';
    app.innerHTML = `
      ${back}
      <h1 style="margin-top:8px">${esc(w.title)}</h1>
      <div class="row mb"><span class="chip accent">${esc(weekLabel(w))}</span>
        <span class="small muted">대본 ${script.rows.length}줄 · ${fmt(script.rows[script.rows.length - 1].t)}</span></div>
      <div class="dict-layout">
        <div class="dict-video">
          <div class="video-wrap"><div class="video-box"></div></div>
          <div class="video-error hide feedback info">이 영상은 사이트 안에서 재생이 막혀 있어요. <a href="${ytLink(vid)}" target="_blank" rel="noopener">유튜브에서 보기 ↗</a></div>
          <div class="video-ctrls">
            <button class="btn sm" data-k="toggle">⏯</button>
            <button class="btn sm" data-k="back">⏪ 3초</button>
            <button class="btn sm" data-k="line">🔁 이 줄</button>
            <select class="btn sm" data-k="rate"><option value="0.5">0.5배</option><option value="0.75">0.75배</option><option value="1" selected>1배</option></select>
          </div>
          <div class="row mt" style="gap:6px">
            <span class="small muted">빈칸</span>
            ${LEVELS.map(l => `<button class="chip-toggle ${l.id === level ? 'on' : ''}" data-level="${l.id}">${l.name}</button>`).join('')}
          </div>
          <label class="row small muted mt" style="cursor:pointer"><input type="checkbox" data-follow checked> 영상 따라 대본 자동 스크롤</label>
          <p class="small muted kbd-help">⌨️ 빈칸에서 <kbd>Enter</kbd> 확인·다음 빈칸 · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> 이 줄 다시 듣기 · <kbd>Esc</kbd> 재생/멈춤 · <kbd>Ctrl</kbd>+<kbd>←</kbd>/<kbd>→</kbd> 3초 이동 · <kbd>Ctrl</kbd>+<kbd>↓</kbd> 속도</p>
          <div class="row between small mt"><span data-progress class="muted"></span><span data-pos class="muted">0:00</span></div>
          <div class="grid2 mt">
            <button class="btn" data-score="partial">지금까지 채점</button>
            <button class="btn primary" data-score="full">전체 채점</button>
          </div>
          <div data-result></div>
        </div>
        <div class="card dict-script" data-script></div>
      </div>
      <div data-history></div>`;

    const scriptBox = app.querySelector('[data-script]');
    const rateSel = app.querySelector('[data-k=rate]');
    const followBox = app.querySelector('[data-follow]');
    player = createPlayer(app.querySelector('.video-box'), vid, {
      onError: code => { if (isEmbedBlocked(code)) app.querySelector('.video-error').classList.remove('hide'); },
    });
    let lines = [], inputs = [], focusedRow = 0;

    const render = lvl => {
      const ratio = LEVELS.find(l => l.id === lvl).ratio;
      lines = buildBlanks(script.rows, w.expressions, ratio);
      inputs = [];
      scriptBox.innerHTML = lines.map((ln, li) => `<div class="dict-line" data-row="${li}">
        <button class="dict-t" data-t="${ln.t}">${fmt(ln.t)}</button>
        <span>${ln.parts.map(p => p.blank
          ? `${esc(p.pre)}<input class="blank-in ${p.expr ? 'expr' : ''}" data-row="${li}" style="width:${Math.max(3, p.core.length + 1.5)}ch" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">${esc(p.post)}`
          : esc(p.pre + p.core + p.post)).join(' ')}</span></div>`).join('');
      let k = 0;
      lines.forEach(ln => ln.parts.forEach(p => { if (p.blank) { p.input = scriptBox.querySelectorAll('.blank-in')[k++]; inputs.push(p); } }));
      inputs.forEach((p, idx) => bindInput(p, idx));
      app.querySelector('[data-result]').innerHTML = '';
      updateProgress();
      dirty = false;
    };

    const check = p => {
      const v = p.input.value.trim();
      p.input.classList.remove('right', 'wrong');
      if (!v) return null;
      const ok = normWord(v) === normWord(p.core);
      p.input.classList.add(ok ? 'right' : 'wrong');
      return ok;
    };
    const updateProgress = () => {
      const done = inputs.filter(p => p.input.classList.contains('right')).length;
      const expr = inputs.filter(p => p.expr).length;
      app.querySelector('[data-progress]').textContent = `빈칸 ${inputs.length}개 (표현 ${expr}) · 맞힘 ${done}`;
    };
    const playRow = li => {
      const ln = lines[li], next = lines[li + 1];
      player.playSegment(Math.max(0, ln.t - 0.5), next ? next.t + 0.5 : null);
    };

    function bindInput(p, idx) {
      const el = p.input;
      el.addEventListener('focus', () => { focusedRow = Number(el.dataset.row); });
      el.addEventListener('input', () => { dirty = true; el.classList.remove('right', 'wrong', 'revealed'); });
      el.addEventListener('blur', () => { check(p); updateProgress(); });
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); playRow(Number(el.dataset.row)); return; }
        if (e.key === 'Enter') {
          e.preventDefault();
          check(p); updateProgress();
          const nextP = inputs[idx + 1];
          if (nextP) nextP.input.focus();
        }
      });
    }

    // 공통 단축키 (빈칸 안에서도 동작)
    scriptBox.addEventListener('keydown', e => {
      if (e.key === 'Escape' || (e.ctrlKey && (e.code === 'Space' || e.key === ' '))) { e.preventDefault(); player.toggle(); }
      else if (e.ctrlKey && e.key === 'ArrowLeft') { e.preventDefault(); player.seekBy(-3); }
      else if (e.ctrlKey && e.key === 'ArrowRight') { e.preventDefault(); player.seekBy(3); }
      else if (e.ctrlKey && e.key === 'ArrowDown') {
        e.preventDefault();
        const opts = ['1', '0.75', '0.5'];
        rateSel.value = opts[(opts.indexOf(rateSel.value) + 1) % opts.length];
        player.setRate(Number(rateSel.value)); toast(`속도 ${rateSel.value}배`);
      }
    });
    scriptBox.addEventListener('click', e => {
      const t = e.target.closest('[data-t]');
      if (t) playRow(Number(t.closest('.dict-line').dataset.row));
    });

    app.querySelector('[data-k=toggle]').onclick = () => player.toggle();
    app.querySelector('[data-k=back]').onclick = () => player.seekBy(-3);
    app.querySelector('[data-k=line]').onclick = () => playRow(focusedRow);
    rateSel.onchange = () => player.setRate(Number(rateSel.value));
    app.querySelectorAll('[data-level]').forEach(b => b.onclick = () => {
      if (dirty && !confirm('빈칸을 새로 만들면 지금 채운 내용이 지워져요. 바꿀까요?')) return;
      S.setSetting('dictLevel', b.dataset.level);
      app.querySelectorAll('[data-level]').forEach(x => x.classList.toggle('on', x === b));
      render(b.dataset.level);
    });

    // 지금 나오는 줄 강조 + 자동 스크롤
    const posEl = app.querySelector('[data-pos]');
    let lastRow = -1;
    timer = setInterval(() => {
      if (!scriptBox.isConnected) return clearInterval(timer);
      const t = player.time();
      posEl.textContent = '영상 위치 ' + fmt(t);
      let cur = -1;
      for (let i = 0; i < lines.length && lines[i].t <= t + 0.2; i++) cur = i;
      if (cur !== lastRow) {
        scriptBox.querySelector('.dict-line.now')?.classList.remove('now');
        const rowEl = scriptBox.querySelector(`.dict-line[data-row="${cur}"]`);
        if (rowEl) {
          rowEl.classList.add('now');
          if (followBox.checked) {
            const top = rowEl.offsetTop - scriptBox.clientHeight / 3;
            scriptBox.scrollTo({ top, behavior: 'smooth' });
          }
        }
        lastRow = cur;
      }
    }, 300);

    app.querySelectorAll('[data-score]').forEach(b => b.onclick = () => {
      const range = b.dataset.score;
      const upTo = player.time();
      const pool = range === 'full' ? inputs : inputs.filter(p => lines[Number(p.input.dataset.row)].t < upTo);
      if (!pool.length) { toast('영상을 조금 재생한 뒤에 채점해 주세요'); return; }
      scriptBox.querySelectorAll('.answer-tip').forEach(x => x.remove());
      let right = 0, exprRight = 0, exprTotal = 0;
      const missed = [];
      pool.forEach(p => {
        const ok = check(p) === true;
        if (ok) right++;
        if (p.expr) { exprTotal++; if (ok) exprRight++; }
        if (!ok) {
          missed.push(p.core);
          p.input.classList.add('wrong');
          p.input.title = '정답: ' + p.core;
          p.input.insertAdjacentHTML('afterend', `<span class="answer-tip">${esc(p.core)}</span>`);
        }
      });
      const dedup = arr => [...new Set(arr)];
      const score = Math.round(right / pool.length * 100);
      S.saveDictation({
        week: w.week, range, level: LEVELS.find(l => l.id === (S.getState().settings.dictLevel || 'normal')).name,
        score, total: pool.length, matched: right, missed: dedup(missed).slice(0, 20),
        upTo: range === 'full' ? null : Math.round(upTo),
      });
      dirty = false;
      updateProgress();
      const grade = score >= 90 ? '🏆 거의 완벽해요!' : score >= 75 ? '👏 아주 잘했어요' : score >= 50 ? '👍 절반 넘게 맞혔어요' : '💪 다음엔 더 잘 들릴 거예요';
      app.querySelector('[data-result]').innerHTML = `
        <div class="card mt">
          <div class="row between"><b>${grade}</b><span class="chip accent">${range === 'full' ? '전체' : `0:00 ~ ${fmt(upTo)}`}</span></div>
          <div class="grid3 mt">
            <div class="stat"><b>${score}%</b><span>정답률</span></div>
            <div class="stat"><b>${right}/${pool.length}</b><span>맞힌 빈칸</span></div>
            <div class="stat"><b>${exprTotal ? `${exprRight}/${exprTotal}` : '-'}</b><span>표현 빈칸</span></div>
          </div>
          ${missed.length ? `<p class="small muted mt" style="margin-bottom:4px">틀린 단어 (대본에 정답이 빨간색으로 표시돼요)</p>
            <div class="checklist">${dedup(missed).slice(0, 20).map(m => `<span class="chip bad">${esc(m)}</span>`).join('')}</div>` : ''}
          <button class="btn sm mt" data-retry>🔄 새 빈칸으로 다시 하기</button>
        </div>`;
      app.querySelector('[data-retry]').onclick = () => render(S.getState().settings.dictLevel || 'normal');
      renderHistory(app.querySelector('[data-history]'), w.week);
    });

    render(level);
    renderHistory(app.querySelector('[data-history]'), w.week);
  }).catch(err => {
    if (!alive) return;
    app.innerHTML = `${back}<h1 style="margin-top:8px">${esc(w.title)}</h1>
      <div class="feedback bad">${esc(err.message)}</div>
      ${['bad-token', 'forbidden', 'not-found'].includes(err.kind) ? tokenCardHtml() : '<button class="btn mt" data-retry>다시 시도</button>'}`;
    bindTokenCard(app, () => viewDictation(app, n));
    app.querySelector('[data-retry]')?.addEventListener('click', () => viewDictation(app, n));
  });

  return () => {
    alive = false;
    clearInterval(timer);
    window.removeEventListener('beforeunload', onLeave);
    if (player) player.destroy();
  };
}

function renderHistory(box, week) {
  const list = (S.getState().dictation || []).filter(d => d.week === week).slice(0, 8);
  if (!list.length) { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="card mt"><b>📒 이 회차 딕테이션 기록</b>
    <ul class="list-plain mt">${list.map(d => `<li class="row between">
      <span>${new Date(d.ts).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        <span class="chip">${d.range === 'full' ? '전체' : `~${fmt(d.upTo || 0)}`}</span>${d.level ? ` <span class="chip">${esc(d.level)}</span>` : ''}</span>
      <b>${d.score}% <span class="small muted">(${d.matched}/${d.total})</span></b></li>`).join('')}</ul></div>`;
}
