import { loadAll, getIndex, getWeek, getExpr, allExprs, exprsOfWeeks, paragraphsOf, stripBrackets, pick, getScene, weekVideoId } from './data.js';
import { createPlayer, ytLink, isEmbedBlocked } from './yt.js';
import * as S from './store.js';
import { esc, hl, toast, el, bindSay, sayBtn, answerBox, weekLabel } from './ui.js';
import { MODES, runMode, runReview, buildReviewQueue } from './games.js';
import { setSpeechSettings, speak, stopListening, listen, canListen } from './speech.js';
import { usesExpr } from './match.js';
import * as Sync from './sync.js';
import { viewDictationList, viewDictation, tokenCardHtml, bindTokenCard } from './dictation.js';

const app = document.getElementById('app');
let cleanup = () => {};

const TOPICS = [
  '지난 주말에 있었던 일', '요즘 나의 고민', '내가 요즘 빠져 있는 것', '나에게 힘이 되는 사람', '최근에 본 영상이나 드라마',
  '올해 꼭 이루고 싶은 목표', '회사(학교)에서 있었던 일', '내가 좋아하는 장소', '스트레스 푸는 방법', '기억에 남는 여행',
  '최근에 새로 배운 것', '친구에게 해 주고 싶은 조언', '나의 하루 루틴', '요즘 가장 감사한 일', '다음 스터디 모임 자기소개',
];

/* ---------------- 공통 ---------------- */
function applySettings() {
  const st = S.getState().settings;
  setSpeechSettings({ accent: st.accent, rate: st.rate });
  if (st.theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = st.theme;
}

function currentPool() {
  const st = S.getState().settings;
  let pool = exprsOfWeeks(st.scope);
  if (st.weakOnly) {
    const weak = pool.filter(e => { const l = S.levelOf(e.id); return l === 1 || l === 2; });
    if (weak.length >= 4) pool = weak;
  }
  return pool;
}
function scopeLabel() {
  const st = S.getState().settings;
  const base = !st.scope?.length ? '전체 회차' : st.scope.length <= 3 ? st.scope.map(n => n + '회차').join(', ') : `${st.scope.length}개 회차`;
  return base + (st.weakOnly ? ' · 약한 표현만' : '');
}

function weekProgress(w) {
  const ids = w.expressions.map(e => e.id);
  const known = ids.filter(id => S.levelOf(id) === 3).length;
  const seen = ids.filter(id => S.levelOf(id) > 0).length;
  return { known, seen, total: ids.length, pct: Math.round(known / ids.length * 100) };
}

/* ---------------- 홈 ---------------- */
function viewHome() {
  const pool = allExprs();
  const queue = buildReviewQueue(pool, S.getState().settings.newPerDay);
  const todayCount = S.getState().days[S.today()] || 0;
  const known = pool.filter(e => S.levelOf(e.id) === 3).length;
  const idx = getIndex();
  const latest = idx[idx.length - 1];
  app.innerHTML = `
    <section class="hero">
      <h1>오늘도 한 문장 더 말해 봐요 🗣️</h1>
      <div class="hero-stats">
        <div><b>${S.streak()}일</b><span>연속 학습</span></div>
        <div><b>${todayCount}</b><span>오늘 푼 문제</span></div>
        <div><b>${known}/${pool.length}</b><span>익힌 표현</span></div>
      </div>
      <a class="btn" href="#/review">📅 오늘의 복습 시작 · ${queue.length}장</a>
    </section>

    <div class="section-title"><h2>바로 연습하기</h2><a class="small" href="#/practice">전체 보기</a></div>
    <div class="grid2">
      ${['speak', 'cloze', 'roleplay', 'boss'].map(id => modeCard(MODES.find(m => m.id === id))).join('')}
    </div>
    <a class="card flat row between" href="#/paragraph" style="margin-top:10px;color:var(--text)">
      <div><b>✍️ 표현 여러 개로 문단 만들기</b><div class="small muted">랜덤 표현 3~5개를 넣어 말하거나 써 보기</div></div><span>›</span>
    </a>

    ${latest ? `
    <div class="section-title"><h2>이번 회차</h2></div>
    ${weekCard(getWeek(latest.week))}` : ''}

    <div class="section-title"><h2>회차별 진도</h2><a class="small" href="#/weeks">표현 보기</a></div>
    <div class="card">
      ${idx.map(i => { const p = weekProgress(getWeek(i.week)); return `
        <a class="row between" href="#/week/${i.week}" style="color:var(--text);padding:6px 0">
          <span class="small" style="width:56px">${i.week}회차</span>
          <div class="progress" style="flex:1"><i style="width:${p.pct}%"></i></div>
          <span class="small muted" style="width:52px;text-align:right">${p.known}/${p.total}</span>
        </a>`; }).join('')}
    </div>`;
}

function modeCard(m) {
  return `<a class="mode-card" href="#/play/${m.id}" style="color:var(--text)">
    <span class="emoji">${m.emoji}</span><b>${esc(m.name)}</b><span>${esc(m.desc)}</span>
    <span class="tag"><span class="chip ${m.tag === 'output' ? 'accent' : m.tag === '게임' ? 'warn' : ''}">${m.tag}</span></span></a>`;
}

function weekCard(w) {
  const p = weekProgress(w);
  return `<a class="card week-card" href="#/week/${w.week}">
    <div class="row between"><span class="num">${esc(weekLabel(w))}</span><span class="chip">${p.total}개 표현</span></div>
    <h3 style="margin-top:6px">${esc(w.title)}</h3>
    ${w.subtitle ? `<div class="small muted">${esc(w.subtitle)}</div>` : ''}
    <div class="progress mt"><i style="width:${p.pct}%"></i></div>
    <div class="small muted" style="margin-top:4px">익힘 ${p.known} · 본 표현 ${p.seen}</div>
  </a>`;
}

/* ---------------- 회차 목록/상세 ---------------- */
function viewWeeks() {
  const ws = getIndex().slice().reverse().map(i => getWeek(i.week));
  app.innerHTML = `<h1>회차별 표현</h1><p class="muted">회차를 눌러 표현과 예문을 보고, 들어 보고, 내 문장을 만들어 보세요.</p>
    ${ws.map(weekCard).join('')}`;
}

let weekPlayer = null;
function viewWeek(n) {
  const w = getWeek(n);
  if (!w) { app.innerHTML = '<div class="empty">없는 회차예요.</div>'; return; }
  const vid = weekVideoId(w.week);
  const sceneCount = w.expressions.filter(e => getScene(e.id)).length;
  app.innerHTML = `
    <a class="small" href="#/weeks">‹ 회차 목록</a>
    <h1 style="margin-top:8px">${esc(w.title)}</h1>
    <div class="row mb"><span class="chip accent">${esc(weekLabel(w))}</span>${w.subtitle ? `<span class="small muted">${esc(w.subtitle)}</span>` : ''}</div>
    <div class="grid2 mb">
      <button class="btn primary" data-practice>🎮 이 회차 연습하기</button>
      ${sceneCount ? '<button class="btn" data-scene>🎬 영상 섀도잉</button>' : '<button class="btn" data-openall>모두 펼치기</button>'}
    </div>
    ${vid ? `<a class="btn block mb" href="#/dictation/${w.week}">⌨️ 영상 전체 딕테이션</a>` : ''}
    ${vid ? `
    <div class="card" style="padding:12px">
      <div class="video-wrap"><div class="video-box"></div></div>
      <div class="video-error hide feedback info">이 영상은 사이트 안에서 재생이 막혀 있어요. <a href="${ytLink(vid)}" target="_blank" rel="noopener">유튜브에서 보기 ↗</a></div>
      <div class="video-ctrls">
        <button class="btn sm" data-back="5">⏪ 5초</button>
        <button class="btn sm" data-back="3">⏪ 3초</button>
        <button class="btn sm" data-toggle>⏯</button>
        <select class="btn sm" data-rate>
          <option value="0.5">0.5배</option><option value="0.75">0.75배</option><option value="1" selected>1배</option>
        </select>
        <button class="btn sm" data-a>A</button><button class="btn sm" data-b>B</button>
        <button class="btn sm ghost hide" data-unloop>🔁 반복 끄기</button>
      </div>
      <p class="small muted" style="margin:8px 0 0">A·B를 눌러 구간을 잡으면 그 부분만 반복돼요. 표현 옆 🎬를 누르면 그 장면으로 가요.</p>
      ${canListen() ? `<button class="btn sm block mt" data-say>🎤 들은 문장 따라 말해 보기</button><div class="interim mt"></div>` : ''}
    </div>` : ''}
    <div class="list"></div>`;
  app.querySelector('[data-practice]').onclick = () => {
    S.setSetting('scope', [w.week]); S.setSetting('weakOnly', false);
    location.hash = '#/practice';
  };
  app.querySelector('[data-scene]')?.addEventListener('click', () => {
    S.setSetting('scope', [w.week]); S.setSetting('weakOnly', false);
    location.hash = '#/play/scene';
  });
  if (vid) {
    weekPlayer = createPlayer(app.querySelector('.video-box'), vid, {
      onError: code => { if (isEmbedBlocked(code)) app.querySelector('.video-error')?.classList.remove('hide'); },
      onPlaying: () => app.querySelector('.video-error')?.classList.add('hide'),
    });
    const P = weekPlayer;
    let A = null;
    app.querySelectorAll('[data-back]').forEach(b => b.onclick = () => P.seekBy(-Number(b.dataset.back)));
    app.querySelector('[data-toggle]').onclick = () => P.toggle();
    app.querySelector('[data-rate]').onchange = ev => P.setRate(Number(ev.target.value));
    const aBtn = app.querySelector('[data-a]'), bBtn = app.querySelector('[data-b]'), un = app.querySelector('[data-unloop]');
    const fmt = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    aBtn.onclick = () => { A = P.time(); aBtn.textContent = 'A ' + fmt(A); aBtn.classList.add('warn'); };
    bBtn.onclick = () => {
      const B = P.time();
      if (A == null || B <= A) { toast('먼저 A를 누르고, 조금 뒤에 B를 눌러 주세요'); return; }
      P.setLoop(A, B); bBtn.textContent = 'B ' + fmt(B); bBtn.classList.add('warn'); un.classList.remove('hide');
      P.playSegment(A, null);
      P.setLoop(A, B);
    };
    un.onclick = () => {
      P.setLoop(null, null); A = null;
      aBtn.textContent = 'A'; bBtn.textContent = 'B';
      aBtn.classList.remove('warn'); bBtn.classList.remove('warn'); un.classList.add('hide');
    };
    const sayB = app.querySelector('[data-say]');
    if (sayB) sayB.onclick = async () => {
      if (sayB.dataset.on) { stopListening(); return; }
      P.pause();
      sayB.dataset.on = 1; sayB.textContent = '⏹ 그만 말하기';
      const out = app.querySelector('.interim');
      let said = '';
      try { said = await listen({ onInterim: t => { out.textContent = t; } }); } catch (e) { toast('음성 인식 오류: ' + e.message); }
      delete sayB.dataset.on; sayB.textContent = '🎤 들은 문장 따라 말해 보기';
      const used = w.expressions.filter(e => usesExpr(said, e)).map(e => e.en);
      out.innerHTML = said ? `"${esc(said)}"${used.length ? `<br><span class="chip good">✓ ${used.map(esc).join(', ')}</span>` : ''}` : '잘 안 들렸어요';
    };
  }
  const list = app.querySelector('.list');
  w.expressions.forEach(e => list.append(exprCard(e)));
  app.querySelector('[data-openall]')?.addEventListener('click', () =>
    list.querySelectorAll('.expr-head').forEach(h => h.click()));
}

function exprCard(e) {
  const lv = S.levelOf(e.id);
  const card = el(`
    <div class="card expr">
      <div class="expr-head">
        <span class="status-dot s${lv}"></span>
        <div style="flex:1"><div class="expr-en">${esc(e.en)}</div><div class="expr-ko">${esc(e.ko)}</div></div>
        ${getScene(e.id) && weekPlayer ? '<button class="icon-btn" type="button" data-scene aria-label="영상 장면">🎬</button>' : ''}
        ${sayBtn(e.en)}
      </div>
      <div class="expr-body hide"></div>
    </div>`);
  const body = card.querySelector('.expr-body');
  const renderBody = () => {
    const mine = S.getState().sentences[e.id] || [];
    const sc = getScene(e.id);
    body.innerHTML = `
      ${e.note ? `<div class="note">💡 ${esc(e.note)}</div>` : ''}
      ${sc ? `<div class="note scene-note"><span class="small muted">🎬 영상 속 문장</span><br>${hl(sc.text)}</div>` : ''}
      ${e.examples.map(x => `<div class="ex">${sayBtn(stripBrackets(x.en))}<div><div class="ex-en">${hl(x.en)}</div><div class="ex-ko">${esc(x.ko)}</div></div></div>`).join('')}
      <div class="status-row">
        <button class="btn sm ${lv === 1 ? 'bad' : ''}" data-l="1">몰라요</button>
        <button class="btn sm ${lv === 2 ? 'warn' : ''}" data-l="2">헷갈려요</button>
        <button class="btn sm ${lv === 3 ? 'good' : ''}" data-l="3">알아요</button>
      </div>
      <details class="mt" ${mine.length ? 'open' : ''}><summary>✍️ 내 문장 만들기 ${mine.length ? `(${mine.length})` : ''}</summary>
        <p class="small muted mt">내 이야기로 문장을 만들어 말하거나 써 보세요. 스터디에서 바로 써먹을 수 있어요.</p>
        <div class="mine-in"></div>
        <button class="btn sm primary mt" data-save>저장</button>
        <ul class="list-plain mt">${mine.map(m => `<li class="row between"><span>${esc(m.text)}</span>
          <span class="row">${sayBtn(m.text)}<button class="icon-btn" data-del="${m.ts}" aria-label="삭제">✕</button></span></li>`).join('')}</ul>
      </details>`;
    const input = answerBox({ placeholder: `${e.en} 를 넣어서 문장 만들기`, rows: 2 });
    body.querySelector('.mine-in').append(input.node);
    body.querySelector('[data-save]').onclick = () => {
      const t = input.value.trim();
      if (!t) return;
      if (!usesExpr(t, e)) toast(`'${e.en}' 표현이 안 보여요. 그래도 저장했어요!`);
      else toast('저장했어요 ✨');
      S.addSentence(e.id, t);
      S.review(e.id, true);
      renderBody();
    };
    body.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { S.removeSentence(e.id, Number(b.dataset.del)); renderBody(); });
    body.querySelectorAll('[data-l]').forEach(b => b.onclick = () => {
      S.setLevel(e.id, Number(b.dataset.l));
      const nl = S.levelOf(e.id);
      card.querySelector('.status-dot').className = 'status-dot s' + nl;
      body.querySelectorAll('[data-l]').forEach(x => {
        const l = Number(x.dataset.l);
        x.className = 'btn sm ' + (l === nl ? ['', 'bad', 'warn', 'good'][l] : '');
      });
    });
    bindSay(body);
  };
  card.querySelector('.expr-head').onclick = () => {
    if (body.classList.toggle('hide')) return;
    if (!body.innerHTML) renderBody();
  };
  bindSay(card.querySelector('.expr-head'));
  const playScene = ev => {
    ev.stopPropagation();
    const sc = getScene(e.id);
    if (!weekPlayer || !sc) return;
    weekPlayer.playSegment(sc.start, sc.end);
    document.querySelector('.video-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  card.querySelector('[data-scene]')?.addEventListener('click', playScene);
  card.addEventListener('click', ev => { if (ev.target.closest('.scene-note')) playScene(ev); });
  return card;
}

/* ---------------- 연습 고르기 ---------------- */
function viewPractice() {
  const st = S.getState().settings;
  const idx = getIndex();
  const scope = new Set(st.scope || []);
  const pool = currentPool();
  app.innerHTML = `
    <h1>연습하기</h1>
    <p class="muted">범위를 고르고 원하는 방식으로 끝없이 연습하세요. 모르는 표현일수록 더 자주 나와요.</p>
    <div class="card">
      <div class="row between"><b>연습 범위</b><span class="chip accent">${pool.length}개 표현</span></div>
      <div class="row mt">
        <button class="chip-toggle ${scope.size === 0 ? 'on' : ''}" data-all>전체</button>
        ${idx.map(i => `<button class="chip-toggle ${scope.has(i.week) ? 'on' : ''}" data-w="${i.week}">${i.week}회차</button>`).join('')}
      </div>
      <label class="row mt small" style="cursor:pointer"><input type="checkbox" data-weak ${st.weakOnly ? 'checked' : ''}> 약한 표현만 (몰라요·헷갈려요)</label>
    </div>
    <div class="section-title"><h2>연습 방식</h2></div>
    <div class="grid2 wide">${MODES.map(modeCard).join('')}</div>
    <a class="card flat row between mt" href="#/dictation" style="color:var(--text)">
      <div><b>⌨️ 영상 전체 딕테이션</b><div class="small muted">영상을 들으며 전체 대본 받아 적고 채점하기</div></div><span>›</span></a>
    <a class="card flat row between" href="#/paragraph" style="color:var(--text)">
      <div><b>✍️ 문단 만들기</b><div class="small muted">여러 표현을 한 번에 엮어 말하기·쓰기</div></div><span>›</span></a>`;
  app.querySelector('[data-all]').onclick = () => { S.setSetting('scope', []); viewPractice(); };
  app.querySelectorAll('[data-w]').forEach(b => b.onclick = () => {
    const n = Number(b.dataset.w);
    scope.has(n) ? scope.delete(n) : scope.add(n);
    S.setSetting('scope', [...scope].sort((a, c) => a - c));
    viewPractice();
  });
  app.querySelector('[data-weak]').onchange = ev => {
    S.setSetting('weakOnly', ev.target.checked);
    if (ev.target.checked) {
      const weak = exprsOfWeeks(S.getState().settings.scope).filter(e => [1, 2].includes(S.levelOf(e.id)));
      if (weak.length < 4) toast('약한 표현이 아직 4개 미만이라 전체에서 출제돼요');
    }
    viewPractice();
  };
}

function viewPlay(mode) {
  if (!MODES.find(m => m.id === mode)) { location.hash = '#/practice'; return; }
  const st = S.getState().settings;
  app.innerHTML = `<p class="small muted" style="margin:0 0 8px">범위: ${esc(scopeLabel())}</p><div id="game"></div>`;
  cleanup = runMode(mode, app.querySelector('#game'), {
    pool: currentPool(), weeks: st.scope, exit: () => { location.hash = '#/practice'; },
  });
}

function viewReview() {
  const pool = allExprs();
  const queue = buildReviewQueue(pool, S.getState().settings.newPerDay);
  if (!queue.length) {
    app.innerHTML = `<div class="card center"><div style="font-size:2.5rem">✅</div><h2>오늘 복습할 카드가 없어요</h2>
      <p class="muted">대신 게임이나 말하기 연습을 해 볼까요?</p><a class="btn primary" href="#/practice">연습하러 가기</a></div>`;
    return;
  }
  app.innerHTML = '<div id="game"></div>';
  cleanup = runReview(app.querySelector('#game'), { pool, exit: () => { location.hash = '#/'; } }, queue);
}

/* ---------------- 문단 만들기 ---------------- */
let paraState = null;
function viewParagraph(tab = 'random') {
  app.innerHTML = `
    <h1>문단 만들기</h1>
    <p class="muted">여러 표현을 한 이야기 안에 엮어 보세요. 말하기(🎤)로 해도 되고, 써도 돼요.</p>
    <div class="row mb">
      <button class="chip-toggle ${tab === 'random' ? 'on' : ''}" data-t="random">🎲 랜덤 챌린지</button>
      <button class="chip-toggle ${tab === 'mission' ? 'on' : ''}" data-t="mission">🎯 회차 미션</button>
      <button class="chip-toggle ${tab === 'mine' ? 'on' : ''}" data-t="mine">📒 내 문단 (${S.getState().paragraphs.length})</button>
    </div>
    <div id="pbody"></div>`;
  app.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { paraState = null; viewParagraph(b.dataset.t); });
  const body = app.querySelector('#pbody');
  if (tab === 'mine') return paraMine(body);
  if (!paraState || paraState.tab !== tab) paraState = tab === 'random' ? newRandomChallenge() : newMission();
  if (!paraState) { body.innerHTML = '<div class="empty">미션이 없어요.</div>'; return; }
  paraEditor(body, paraState);
}

function newRandomChallenge(n) {
  const pool = currentPool();
  const count = n || paraState?.n || 3;
  const picks = [];
  const avail = pool.slice();
  while (picks.length < Math.min(count, avail.length)) {
    const e = S.weightedPick(avail.filter(x => !picks.includes(x)));
    picks.push(e);
  }
  return { tab: 'random', n: count, topic: pick(TOPICS), ids: picks.map(e => e.id), text: '' };
}
function newMission() {
  const st = S.getState().settings;
  const list = paragraphsOf(st.scope);
  if (!list.length) return null;
  const m = pick(list);
  return { tab: 'mission', topic: m.topic, ids: m.use, model: m.text, week: m.week, text: '' };
}

function paraEditor(body, ps) {
  const exprs = ps.ids.map(getExpr).filter(Boolean);
  body.innerHTML = `
    <div class="card">
      <div class="row between"><span class="chip">${ps.tab === 'mission' ? ps.week + '회차 미션' : '주제'}</span>
        ${ps.tab === 'random' ? `<div class="row">${[3, 4, 5].map(k => `<button class="chip-toggle ${ps.n === k ? 'on' : ''}" data-n="${k}">${k}개</button>`).join('')}</div>` : ''}</div>
      <h2 class="mt">${esc(ps.topic)}</h2>
      <p class="small muted" style="margin-bottom:4px">아래 표현을 모두 넣어 보세요 (넣으면 초록색으로 바뀌어요)</p>
      <div class="checklist">${exprs.map(e => `<button class="chip" data-id="${e.id}" type="button">${esc(e.en)}</button>`).join('')}</div>
      <div class="hint-box small"></div>
    </div>
    <div class="row between mb"><span class="small muted">🎤 버튼을 누르면 계속 듣고, 다시 누르면 멈춰요</span><span class="chip" id="ptimer">⏱ 1분 말하기</span></div>
    <div class="in"></div>
    <div class="grid2 mt">
      <button class="btn" data-new>🎲 ${ps.tab === 'random' ? '다른 표현 뽑기' : '다른 미션'}</button>
      <button class="btn primary" data-save>💾 저장하기</button>
    </div>
    <div class="grid2 mt">
      <button class="btn" data-listen>🔊 내 문단 듣기</button>
      ${ps.model ? '<button class="btn" data-model>📖 모범 문단 보기</button>' : '<button class="btn" data-ex>💡 예문 보기</button>'}
    </div>
    <div class="after mt"></div>`;
  const input = answerBox({ placeholder: '여기에 말하거나 써 보세요…', rows: 7, continuous: true });
  input.value = ps.text;
  body.querySelector('.in').append(input.node);
  const chips = body.querySelectorAll('.checklist .chip');
  const update = () => {
    ps.text = input.value;
    let used = 0;
    chips.forEach(c => {
      const ok = usesExpr(input.value, getExpr(c.dataset.id));
      used += ok;
      c.className = 'chip ' + (ok ? 'good' : '');
      c.textContent = (ok ? '✓ ' : '') + getExpr(c.dataset.id).en;
    });
    return used;
  };
  input.textarea.addEventListener('input', update);
  update();
  chips.forEach(c => c.onclick = () => {
    const e = getExpr(c.dataset.id);
    const x = e.examples[0];
    body.querySelector('.hint-box').innerHTML = `<div class="note" style="margin:8px 0 0"><b>${esc(e.en)}</b> — ${esc(e.ko)}<br>${hl(x.en)}</div>`;
  });
  body.querySelectorAll('[data-n]').forEach(b => b.onclick = () => { paraState = newRandomChallenge(Number(b.dataset.n)); paraEditor(body, paraState); });
  body.querySelector('[data-new]').onclick = () => { paraState = ps.tab === 'random' ? newRandomChallenge() : newMission(); paraEditor(body, paraState); };
  body.querySelector('[data-listen]').onclick = () => input.value.trim() ? speak(input.value) : toast('먼저 문단을 만들어 보세요');
  body.querySelector('[data-model]')?.addEventListener('click', () => {
    body.querySelector('.after').innerHTML = `<div class="card"><div class="row between"><b>모범 문단</b>${sayBtn(ps.model)}</div><p class="mt" style="margin-bottom:0">${esc(ps.model)}</p></div>`;
    bindSay(body.querySelector('.after'));
  });
  body.querySelector('[data-ex]')?.addEventListener('click', () => {
    body.querySelector('.after').innerHTML = `<div class="card">${exprs.map(e => `<div class="ex">${sayBtn(stripBrackets(e.examples[0].en))}<div><div class="ex-en">${hl(e.examples[0].en)}</div><div class="ex-ko">${esc(e.examples[0].ko)}</div></div></div>`).join('')}</div>`;
    bindSay(body.querySelector('.after'));
  });
  body.querySelector('[data-save]').onclick = () => {
    const t = input.value.trim();
    if (!t) { toast('먼저 문단을 만들어 보세요'); return; }
    const used = update();
    exprs.forEach(e => S.review(e.id, usesExpr(t, e) ? true : 'hard'));
    S.saveParagraph({ id: ps.savedId, topic: ps.topic, use: ps.ids, text: t });
    ps.savedId = ps.savedId || S.getState().paragraphs[0].id;
    toast(used === exprs.length ? `🎉 표현 ${used}개 모두 사용! 저장했어요` : `저장했어요 (표현 ${used}/${exprs.length}개 사용)`);
  };
  // 1분 타이머
  const tbtn = body.querySelector('#ptimer');
  let tleft = 0, tint;
  tbtn.style.cursor = 'pointer';
  tbtn.onclick = () => {
    if (tint) { clearInterval(tint); tint = null; tbtn.textContent = '⏱ 1분 말하기'; tbtn.className = 'chip'; return; }
    tleft = 60; tbtn.className = 'chip warn';
    const mic = body.querySelector('.mic');
    if (mic && !mic.classList.contains('rec')) mic.click();
    tint = setInterval(() => {
      if (!tbtn.isConnected) return clearInterval(tint);
      tbtn.textContent = `⏱ ${tleft}초`;
      if (--tleft < 0) {
        clearInterval(tint); tint = null; stopListening();
        tbtn.textContent = '⏱ 끝! 다시 하기'; tbtn.className = 'chip good';
      }
    }, 1000);
  };
}

function paraMine(body) {
  const list = S.getState().paragraphs;
  if (!list.length) { body.innerHTML = '<div class="empty">아직 저장한 문단이 없어요.<br>랜덤 챌린지로 첫 문단을 만들어 보세요!</div>'; return; }
  body.innerHTML = list.map(p => {
    const exprs = (p.use || []).map(getExpr).filter(Boolean);
    return `<div class="card">
      <div class="row between"><b>${esc(p.topic)}</b><span class="small muted">${new Date(p.ts).toLocaleDateString('ko-KR')}</span></div>
      <div class="checklist">${exprs.map(e => `<span class="chip ${usesExpr(p.text, e) ? 'good' : ''}">${esc(e.en)}</span>`).join('')}</div>
      <p style="white-space:pre-wrap">${esc(p.text)}</p>
      <div class="row">${sayBtn(p.text)}<button class="btn sm" data-edit="${p.id}">고쳐 쓰기</button><button class="btn sm ghost" data-del="${p.id}">삭제</button></div>
    </div>`;
  }).join('');
  bindSay(body);
  body.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    if (confirm('이 문단을 삭제할까요?')) { S.removeParagraph(b.dataset.del); viewParagraph('mine'); }
  });
  body.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => {
    const p = list.find(x => x.id === b.dataset.edit);
    paraState = { tab: 'random', n: p.use.length, topic: p.topic, ids: p.use, text: p.text, savedId: p.id };
    viewParagraph('random');
  });
}

/* ---------------- 내 기록 ---------------- */
function viewMe() {
  const st = S.getState();
  const pool = allExprs();
  const lv = [0, 0, 0, 0];
  pool.forEach(e => lv[S.levelOf(e.id)]++);
  const sentences = Object.values(st.sentences).reduce((a, l) => a + l.length, 0);
  const totalAnswered = Object.values(st.days).reduce((a, b) => a + b, 0);
  const last14 = [...Array(14)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - 13 + i); return st.days[S.today(d)] || 0; });
  const maxDay = Math.max(1, ...last14);
  app.innerHTML = `
    <h1>내 기록</h1>
    <div class="card" id="syncCard"></div>
    <div class="grid3">
      <div class="card stat"><b>${S.streak()}일</b><span>연속 학습</span></div>
      <div class="card stat"><b>${totalAnswered}</b><span>푼 문제</span></div>
      <div class="card stat"><b>${st.paragraphs.length + sentences}</b><span>만든 문장·문단</span></div>
    </div>
    <div class="card">
      <b>최근 2주</b>
      <div class="row mt" style="align-items:flex-end;gap:4px;height:70px;flex-wrap:nowrap">
        ${last14.map(v => `<div title="${v}문제" style="flex:1;background:${v ? 'var(--accent)' : 'var(--surface-2)'};height:${Math.max(6, v / maxDay * 64)}px;border-radius:4px"></div>`).join('')}
      </div>
    </div>
    <div class="card">
      <b>표현 상태</b>
      <div class="row mt">
        <span class="chip good">알아요 ${lv[3]}</span><span class="chip warn">헷갈려요 ${lv[2]}</span>
        <span class="chip bad">몰라요 ${lv[1]}</span><span class="chip">아직 안 봄 ${lv[0]}</span>
      </div>
      <div class="row mt small muted">최고 기록 · 보스전 ${st.best.boss ?? '-'}점 · 매칭 ${st.best.match ? st.best.match.toFixed(1) + '초' : '-'} · 빈칸 연속 ${st.best.cloze ?? '-'}</div>
    </div>
    ${(st.dictation || []).length ? `<div class="card"><b>⌨️ 딕테이션 기록</b>
      <ul class="list-plain mt">${st.dictation.slice(0, 5).map(d => `<li class="row between"><a href="#/dictation/${d.week}">${d.week}회차 ${d.range === 'full' ? '전체' : '일부'}</a>
        <span><b>${d.score}%</b> <span class="small muted">${new Date(d.ts).toLocaleDateString('ko-KR')}</span></span></li>`).join('')}</ul></div>` : ''}
    ${tokenCardHtml(true)}
    <div class="card stack">
      <b>설정</b>
      <label class="small">발음 억양
        <select data-s="accent">
          ${[['en-US', '미국식'], ['en-GB', '영국식'], ['en-AU', '호주식']].map(([v, l]) => `<option value="${v}" ${st.settings.accent === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select></label>
      <label class="small">말하기 속도
        <select data-s="rate">
          ${[[0.75, '느리게'], [0.95, '보통'], [1.1, '빠르게']].map(([v, l]) => `<option value="${v}" ${Number(st.settings.rate) === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select></label>
      <label class="small">하루 새 표현 수 (오늘의 복습)
        <select data-s="newPerDay">
          ${[5, 10, 15, 20].map(v => `<option value="${v}" ${Number(st.settings.newPerDay) === v ? 'selected' : ''}>${v}개</option>`).join('')}
        </select></label>
      <label class="small">화면 테마
        <select data-s="theme">
          ${[['auto', '시스템 따라가기'], ['light', '밝게'], ['dark', '어둡게']].map(([v, l]) => `<option value="${v}" ${st.settings.theme === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select></label>
      <button class="btn sm" data-test>🔊 발음 들어 보기</button>
    </div>
    <div class="card stack">
      <b>백업</b>
      <p class="small muted" style="margin:0">동기화를 안 쓸 때는 가끔 백업 파일을 받아 두세요.</p>
      <div class="grid2"><button class="btn sm" data-export>⬇️ 백업 받기</button><label class="btn sm">⬆️ 백업 불러오기<input type="file" accept=".json" hidden data-import></label></div>
      <button class="btn sm ghost" data-reset>기록 전체 초기화</button>
    </div>`;
  renderSyncCard();
  bindTokenCard(app, () => viewMe());
  app.querySelectorAll('[data-s]').forEach(s => s.onchange = () => {
    const k = s.dataset.s;
    S.setSetting(k, ['rate', 'newPerDay'].includes(k) ? Number(s.value) : s.value);
    applySettings();
  });
  app.querySelector('[data-test]').onclick = () => speak("Long story short, I can't wait to see you in person!");
  app.querySelector('[data-export]').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([S.exportJson()], { type: 'application/json' }));
    a.download = `speakup-backup-${S.today()}.json`;
    a.click();
  };
  app.querySelector('[data-import]').onchange = async ev => {
    const f = ev.target.files[0]; if (!f) return;
    try { S.replaceState(S.merge(S.getState(), JSON.parse(await f.text()))); toast('백업을 합쳐서 불러왔어요'); viewMe(); }
    catch (e) { toast('파일을 읽을 수 없어요'); }
  };
  app.querySelector('[data-reset]').onclick = () => {
    if (confirm('모든 학습 기록을 지울까요? 되돌릴 수 없어요.')) { S.resetAll(); toast('초기화했어요'); viewMe(); }
  };
}

function renderSyncCard() {
  const c = document.getElementById('syncCard');
  if (!c) return;
  const u = Sync.currentUser();
  if (!Sync.isConfigured()) {
    c.innerHTML = `<b>☁️ 기기 간 동기화</b><p class="small muted mt" style="margin-bottom:0">아직 동기화가 설정되지 않아서 기록이 이 브라우저에만 저장돼요. 설정 방법은 저장소 README의 "동기화 설정"을 참고하세요.</p>`;
  } else if (!u) {
    c.innerHTML = `<b>☁️ 기기 간 동기화</b><p class="small muted mt">Google 계정으로 로그인하면 휴대폰과 PC의 기록이 합쳐져요.</p><button class="btn primary block" data-login>Google로 로그인</button>`;
    c.querySelector('[data-login]').onclick = () => Sync.signIn();
  } else {
    c.innerHTML = `<div class="row between"><b>☁️ 동기화 켜짐</b><span class="chip good">${esc(u.name || u.email || '로그인됨')}</span></div>
      <div class="grid2 mt"><button class="btn sm" data-sync>지금 동기화</button><button class="btn sm ghost" data-logout>로그아웃</button></div>`;
    c.querySelector('[data-sync]').onclick = () => Sync.syncNow().then(() => toast('동기화했어요'));
    c.querySelector('[data-logout]').onclick = () => Sync.signOut();
  }
}

/* ---------------- 라우터 ---------------- */
function route() {
  cleanup(); cleanup = () => {};
  if (weekPlayer) { weekPlayer.destroy(); weekPlayer = null; }
  stopListening();
  if (window.speechSynthesis) speechSynthesis.cancel();
  const [, page = '', arg] = location.hash.split('/');
  const tab = { '': 'home', weeks: 'weeks', week: 'weeks', practice: 'practice', play: 'practice', review: 'home', paragraph: 'paragraph', me: 'me', dictation: 'practice' }[page] || 'home';
  document.querySelectorAll('.tabbar a').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
  window.scrollTo(0, 0);
  switch (page) {
    case 'weeks': return viewWeeks();
    case 'week': return viewWeek(arg);
    case 'practice': return viewPractice();
    case 'play': return viewPlay(arg);
    case 'review': return viewReview();
    case 'paragraph': return viewParagraph();
    case 'me': return viewMe();
    case 'dictation':
      if (arg) { cleanup = viewDictation(app, arg); return; }
      return viewDictationList(app);
    default: return viewHome();
  }
}

async function start() {
  applySettings();
  app.innerHTML = '<div class="empty">불러오는 중…</div>';
  try { await loadAll(); }
  catch (e) { app.innerHTML = `<div class="empty">표현 데이터를 불러오지 못했어요.<br>${esc(e.message)}</div>`; return; }
  window.addEventListener('hashchange', route);
  route();
  const badge = document.getElementById('syncBadge');
  badge.onclick = () => { location.hash = '#/me'; };
  Sync.onStatus(s => {
    badge.classList.toggle('on', !!s.user);
    badge.textContent = !s.configured ? '로컬 저장' : s.syncing ? '동기화 중…' : s.user ? '☁️ 동기화됨' : '로그인 필요';
    if (s.error) badge.textContent = '⚠️ 동기화 오류';
    renderSyncCard();
    if (s.user && !s.syncing && location.hash.match(/^#\/?$|^$/)) route();
  });
  Sync.initSync();
}
start();
