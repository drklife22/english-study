// 영상 전체 딕테이션: 영상을 들으며 전체 대본을 받아 적고 대본과 비교해 채점한다.
import { getIndex, getWeek, weekVideoId } from './data.js';
import { createPlayer, ytLink, isEmbedBlocked } from './yt.js';
import { fetchScript, getToken, setToken, testToken } from './scripts.js';
import { esc, toast, weekLabel } from './ui.js';
import * as S from './store.js';

const FILLERS = new Set(['um', 'uh', 'umm', 'uhm', 'erm', 'er', 'ah', 'hmm', 'mm', 'mhm', 'mmhmm', 'oh']);
const NUMS = { zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12', twenty: '20', hundred: '100' };
const normWord = w => {
  const x = w.toLowerCase().replace(/[’‘`]/g, "'").replace(/[^a-z0-9']/g, '').replace(/'/g, '');
  return NUMS[x] || x;
};

function tokenize(text, row) {
  return text.split(/\s+/).map(raw => ({ raw, w: normWord(raw), row })).filter(t => t.w && !FILLERS.has(t.w));
}

// 대본 단어와 입력 단어를 순서대로 맞춰 본다 (최장 공통 부분열)
export function scoreDictation(rows, typed) {
  const ref = rows.flatMap((r, i) => tokenize(r.text, i));
  const got = tokenize(typed, -1);
  const m = ref.length, n = got.length, W = n + 1;
  const dp = new Uint16Array((m + 1) * (n + 1));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i * W + j] = ref[i].w === got[j].w ? dp[(i + 1) * W + j + 1] + 1
        : Math.max(dp[(i + 1) * W + j], dp[i * W + j + 1]);
    }
  }
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (ref[i].w === got[j].w) { ref[i].ok = true; i++; j++; }
    else if (dp[(i + 1) * W + j] >= dp[i * W + j + 1]) i++;
    else j++;
  }
  const matched = dp[0];
  // 연속으로 놓친 부분을 묶어서 자주 놓친 구간 목록 만들기
  const runs = [];
  let cur = [];
  for (const t of ref) {
    if (!t.ok) cur.push(t.raw.replace(/[^\w'’-]/g, ''));
    else if (cur.length) { runs.push(cur.join(' ')); cur = []; }
  }
  if (cur.length) runs.push(cur.join(' '));
  // 아예 안 쓴 긴 구간은 빼고, 듣다가 놓친 짧은 부분만 (등장 순서대로)
  const missed = [...new Set(runs.filter(x => x && x.split(' ').length <= 6))].slice(0, 15);
  return {
    ref, total: m, matched, extra: n - matched,
    score: m ? Math.round(matched / m * 100) : 0, missed,
  };
}

const fmt = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/* ---------------- 회차 고르기 ---------------- */
export function viewDictationList(app) {
  const results = S.getState().dictation || [];
  app.innerHTML = `
    <a class="small" href="#/practice">‹ 연습하기</a>
    <h1 style="margin-top:8px">⌨️ 영상 전체 딕테이션</h1>
    <p class="muted">영상을 들으면서 전체 대본을 받아 적고, 대본과 비교해 채점해요. 회차를 고르세요.</p>
    ${getToken() ? '' : tokenCardHtml()}
    ${getIndex().slice().reverse().map(i => {
      const w = getWeek(i.week);
      const mine = results.filter(r => r.week === i.week);
      const best = mine.filter(r => r.range === 'full').reduce((a, r) => Math.max(a, r.score), -1);
      return `<a class="card week-card" href="#/dictation/${i.week}">
        <div class="row between"><span class="num">${esc(weekLabel(w))}</span>
          ${best >= 0 ? `<span class="chip good">최고 ${best}%</span>` : mine.length ? '<span class="chip">진행 중</span>' : ''}</div>
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
    ${compact ? '' : `<p class="small muted mt">딕테이션 정답 대본은 비공개 저장소에 있어서, 읽기 전용 열쇠(GitHub 토큰)가 한 번 필요해요. 이 브라우저에만 저장돼요.</p>
    <details class="small"><summary>열쇠 만드는 방법</summary>
      <ol style="padding-left:18px;margin:8px 0">
        <li>GitHub 로그인 후 <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">새 토큰 만들기 ↗</a> 열기</li>
        <li><b>Token name</b>: 아무 이름 (예: speakup) · <b>Expiration</b>: 원하는 기간 (예: 1년)</li>
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
  let player = null, alive = true, dirty = false;
  const onLeave = e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', onLeave);

  fetchScript(w.week).then(script => {
    if (!alive) return;
    const vid = weekVideoId(w.week) || (w.video.match(/(?:youtu\.be\/|v=)([\w-]{11})/) || [])[1];
    const total = script.rows.flatMap(r => tokenize(r.text, 0)).length;
    app.innerHTML = `
      ${back}
      <h1 style="margin-top:8px">${esc(w.title)}</h1>
      <div class="row mb"><span class="chip accent">${esc(weekLabel(w))}</span>
        <span class="small muted">대본 ${script.rows.length}줄 · 약 ${total}단어 · ${fmt(script.rows[script.rows.length - 1].t)}</span></div>
      <div class="dict-layout">
        <div class="dict-video">
          <div class="video-wrap"><div class="video-box"></div></div>
          <div class="video-error hide feedback info">이 영상은 사이트 안에서 재생이 막혀 있어요. <a href="${ytLink(vid)}" target="_blank" rel="noopener">유튜브에서 보기 ↗</a></div>
          <div class="video-ctrls">
            <button class="btn sm" data-k="toggle">⏯</button>
            <button class="btn sm" data-k="back">⏪ 3초</button>
            <button class="btn sm" data-k="fwd">3초 ⏩</button>
            <select class="btn sm" data-k="rate"><option value="0.5">0.5배</option><option value="0.75">0.75배</option><option value="1" selected>1배</option></select>
          </div>
          <p class="small muted kbd-help">⌨️ 입력창에서 <kbd>Esc</kbd> 또는 <kbd>Ctrl</kbd>+<kbd>Space</kbd> 재생/멈춤 · <kbd>Ctrl</kbd>+<kbd>←</kbd>/<kbd>→</kbd> 3초 이동 · <kbd>Ctrl</kbd>+<kbd>↓</kbd> 속도 바꾸기</p>
        </div>
        <div class="dict-input">
          <textarea data-typed rows="14" placeholder="영상을 재생하고 들리는 대로 쭉 받아 적으세요. 문장부호와 대소문자는 채점에 영향이 없어요." spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off"></textarea>
          <div class="row between small muted mt"><span data-count>0단어</span><span data-pos>0:00</span></div>
          <div class="grid2 mt">
            <button class="btn" data-score="partial">지금까지 채점</button>
            <button class="btn primary" data-score="full">전체 채점</button>
          </div>
        </div>
      </div>
      <div data-result></div>
      <div data-history></div>`;

    const ta = app.querySelector('[data-typed]');
    const rateSel = app.querySelector('[data-k=rate]');
    player = createPlayer(app.querySelector('.video-box'), vid, {
      onError: code => { if (isEmbedBlocked(code)) app.querySelector('.video-error').classList.remove('hide'); },
    });
    const cycleRate = () => {
      const opts = ['1', '0.75', '0.5'];
      rateSel.value = opts[(opts.indexOf(rateSel.value) + 1) % opts.length];
      player.setRate(Number(rateSel.value));
      toast(`속도 ${rateSel.value}배`);
    };
    app.querySelector('[data-k=toggle]').onclick = () => player.toggle();
    app.querySelector('[data-k=back]').onclick = () => player.seekBy(-3);
    app.querySelector('[data-k=fwd]').onclick = () => player.seekBy(3);
    rateSel.onchange = () => player.setRate(Number(rateSel.value));
    ta.addEventListener('keydown', e => {
      const ctrl = e.ctrlKey;
      if (e.key === 'Escape' || (ctrl && (e.code === 'Space' || e.key === ' '))) { e.preventDefault(); player.toggle(); }
      else if (ctrl && e.key === 'ArrowLeft') { e.preventDefault(); player.seekBy(-3); }
      else if (ctrl && e.key === 'ArrowRight') { e.preventDefault(); player.seekBy(3); }
      else if (ctrl && e.key === 'ArrowDown') { e.preventDefault(); cycleRate(); }
    });
    const countEl = app.querySelector('[data-count]');
    ta.addEventListener('input', () => {
      dirty = ta.value.trim().length > 0;
      countEl.textContent = `${ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0}단어`;
    });
    const posEl = app.querySelector('[data-pos]');
    const posTimer = setInterval(() => {
      if (!posEl.isConnected) return clearInterval(posTimer);
      posEl.textContent = '영상 위치 ' + fmt(player.time());
    }, 500);

    app.querySelectorAll('[data-score]').forEach(b => b.onclick = () => {
      if (!ta.value.trim()) { toast('먼저 받아 적어 주세요'); return; }
      const range = b.dataset.score;
      const upTo = player.time();
      const rows = range === 'full' ? script.rows : script.rows.filter(r => r.t < upTo);
      if (!rows.length) { toast('영상을 조금 재생한 뒤에 채점해 주세요'); return; }
      const r = scoreDictation(rows, ta.value);
      S.saveDictation({ week: w.week, range, score: r.score, total: r.total, matched: r.matched, missed: r.missed, upTo: range === 'full' ? null : Math.round(upTo) });
      dirty = false;
      renderResult(app.querySelector('[data-result]'), r, rows, range, upTo, player);
      renderHistory(app.querySelector('[data-history]'), w.week);
      app.querySelector('[data-result]').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    renderHistory(app.querySelector('[data-history]'), w.week);
    setTimeout(() => ta.focus(), 100);
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
    window.removeEventListener('beforeunload', onLeave);
    if (player) player.destroy();
  };
}

function renderResult(box, r, rows, range, upTo, player) {
  const byRow = rows.map(() => []);
  r.ref.forEach(t => byRow[t.row].push(t));
  const grade = r.score >= 90 ? '🏆 거의 완벽해요!' : r.score >= 75 ? '👏 아주 잘했어요' : r.score >= 50 ? '👍 절반 넘게 들렸어요' : '💪 다음엔 더 잘 들릴 거예요';
  box.innerHTML = `
    <div class="card mt">
      <div class="row between"><h2 style="margin:0">${grade}</h2><span class="chip accent">${range === 'full' ? '전체' : `0:00 ~ ${fmt(upTo)}`}</span></div>
      <div class="grid3 mt">
        <div class="stat"><b>${r.score}%</b><span>정확도</span></div>
        <div class="stat"><b>${r.matched}/${r.total}</b><span>맞은 단어</span></div>
        <div class="stat"><b>${r.extra}</b><span>틀리거나 더 쓴 단어</span></div>
      </div>
      ${r.missed.length ? `<p class="small muted mt" style="margin-bottom:4px">놓친 부분</p>
        <div class="checklist">${r.missed.map(m => `<span class="chip bad">${esc(m)}</span>`).join('')}</div>` : ''}
    </div>
    <div class="card">
      <div class="row between"><b>대본과 비교</b><span class="small muted"><span class="ok-sample">초록</span> 맞음 · <span class="miss-sample">빨강</span> 놓침 · 시간을 누르면 그 부분 재생</span></div>
      <div class="dict-script mt">
        ${byRow.map((toks, i) => toks.length ? `<div class="dict-line"><button class="dict-t" data-t="${rows[i].t}">${fmt(rows[i].t)}</button>
          <span>${toks.map(t => `<span class="${t.ok ? 'ok' : 'miss'}">${esc(t.raw)}</span>`).join(' ')}</span></div>` : '').join('')}
      </div>
    </div>`;
  box.querySelectorAll('[data-t]').forEach(b => b.onclick = () => {
    const t = Number(b.dataset.t);
    player.playSegment(t, null);
    document.querySelector('.video-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

function renderHistory(box, week) {
  const list = (S.getState().dictation || []).filter(d => d.week === week).slice(0, 8);
  if (!list.length) { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="card"><b>📒 이 회차 딕테이션 기록</b>
    <ul class="list-plain mt">${list.map(d => `<li class="row between">
      <span>${new Date(d.ts).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        <span class="chip">${d.range === 'full' ? '전체' : `~${fmt(d.upTo || 0)}`}</span></span>
      <b>${d.score}% <span class="small muted">(${d.matched}/${d.total})</span></b></li>`).join('')}</ul></div>`;
}
