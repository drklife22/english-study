// 연습 모드 모음. 모든 모드는 끝없이 이어지며, 나가기를 누를 때까지 계속 출제한다.
import { esc, hl, blankOut, bindSay, sayBtn, answerBox, toast, el } from './ui.js';
import { bracketText, stripBrackets, shuffle, pick, sample, roleplaysOf, getExpr, getScene } from './data.js';
import { createPlayer, ytLink, isEmbedBlocked } from './yt.js';
import { review, weightedPick, setBest, getState, isDue, item } from './store.js';
import { speak, canListen, listen, stopListening } from './speech.js';
import { compare, diffHtml, usesExpr, looseEqual } from './match.js';

export const MODES = [
  { id: 'flash', emoji: '🃏', name: '플래시카드', desc: '뜻을 보고 표현 떠올리기', tag: 'input' },
  { id: 'match', emoji: '⚡', name: '스피드 매칭', desc: '표현과 뜻 빨리 짝짓기', tag: '게임' },
  { id: 'cloze', emoji: '🧩', name: '빈칸 러시', desc: '문맥 보고 빈칸 채우기, 연속 정답 도전', tag: '게임' },
  { id: 'dictation', emoji: '🎧', name: '듣고 받아쓰기', desc: '원어민 음성 듣고 문장 쓰기', tag: 'input' },
  { id: 'scene', emoji: '🎬', name: '영상 섀도잉', desc: '실제 영상 속 장면을 듣고 따라 말하기', tag: 'output' },
  { id: 'shadow', emoji: '🗣️', name: '섀도잉 챌린지', desc: '예문을 듣고 따라 말하면 정확도 채점', tag: 'output' },
  { id: 'speak', emoji: '🚀', name: '한→영 순간 말하기', desc: '한국어 보고 바로 영어로 말하기', tag: 'output' },
  { id: 'roleplay', emoji: '🎭', name: '상황 롤플레이', desc: '대화 상황에 배운 표현으로 대답', tag: 'output' },
  { id: 'boss', emoji: '👾', name: '표현 보스전', desc: '여러 문제 섞어서 목숨 3개로 버티기', tag: '게임' },
];

// 공통 상단바
function frame(root, mode, onExit) {
  root.innerHTML = '';
  const m = MODES.find(x => x.id === mode) || { emoji: '📅', name: '오늘의 복습' };
  const top = el(`
    <div class="game-top">
      <div><b>${m.emoji} ${esc(m.name)}</b></div>
      <div class="stats"><span class="chip" data-k="count">0문제</span><span class="chip good" data-k="streak">연속 0</span></div>
      <button class="btn sm ghost" type="button">나가기</button>
    </div>`);
  top.querySelector('button').onclick = onExit;
  const body = el('<div></div>');
  root.append(top, body);
  const st = { count: 0, correct: 0, streak: 0, best: 0 };
  const refresh = () => {
    top.querySelector('[data-k=count]').textContent = `${st.count}문제 · ${st.correct}정답`;
    top.querySelector('[data-k=streak]').textContent = `연속 ${st.streak}`;
  };
  const mark = ok => {
    st.count++;
    if (ok === true) { st.correct++; st.streak++; st.best = Math.max(st.best, st.streak); }
    else if (ok === false) st.streak = 0;
    refresh();
  };
  refresh();
  return { top, body, st, mark };
}

const exOf = e => pick(e.examples);
function otherBrackets(pool, exclude, n) {
  const opts = new Set();
  const answer = bracketText(exclude).toLowerCase();
  for (const e of shuffle(pool)) {
    for (const x of shuffle(e.examples)) {
      const b = bracketText(x.en);
      if (b.toLowerCase() !== answer) { opts.add(b); break; }
    }
    if (opts.size >= n) break;
  }
  return [...opts];
}

function rateButtons(onRate, labels = ['다시 볼래요', '헷갈려요', '알겠어요']) {
  const n = el(`
    <div class="status-row">
      <button class="btn bad" data-r="0">${labels[0]}</button>
      <button class="btn warn" data-r="1">${labels[1]}</button>
      <button class="btn good" data-r="2">${labels[2]}</button>
    </div>`);
  n.querySelectorAll('button').forEach(b => b.onclick = () => onRate([false, 'hard', true][b.dataset.r]));
  return n;
}

/* ---------------- 플래시카드 / 오늘의 복습 ---------------- */
function flash(root, ctx, { queue } = {}) {
  const f = frame(root, queue ? 'review' : 'flash', ctx.exit);
  let last = null;
  let dir = 'ko';
  const next = () => {
    let e;
    if (queue) {
      e = queue.shift();
      if (!e) return done();
    } else e = weightedPick(ctx.pool, last?.id);
    last = e;
    const x = exOf(e);
    f.body.innerHTML = '';
    const card = el(`
      <div>
        ${queue ? `<p class="muted small center">남은 카드 ${queue.length + 1}장</p>` : `
        <div class="row mb" style="justify-content:center">
          <button class="chip-toggle ${dir === 'ko' ? 'on' : ''}" data-d="ko">뜻 → 표현</button>
          <button class="chip-toggle ${dir === 'en' ? 'on' : ''}" data-d="en">표현 → 뜻</button>
        </div>`}
        <div class="card q-card flash">
          <div class="front">
            ${dir === 'ko'
              ? `<div class="q-ko">${esc(e.ko)}</div><p class="muted small mt">${blankOut(x.en)}</p>`
              : `<div class="q-big">${esc(e.en)}</div>`}
            <p class="muted small mt">탭해서 정답 보기 · 먼저 소리 내 말해 보세요</p>
          </div>
          <div class="back hide">
            <div class="q-big">${esc(e.en)}</div>
            <div class="expr-ko">${esc(e.ko)}</div>
            <div class="ex" style="justify-content:center;text-align:left;margin-top:12px">
              ${sayBtn(stripBrackets(x.en))}
              <div><div class="ex-en">${hl(x.en)}</div><div class="ex-ko">${esc(x.ko)}</div></div>
            </div>
          </div>
        </div>
        <div class="rate hide"></div>
      </div>`);
    f.body.append(card);
    card.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { dir = b.dataset.d; last = null; next(); });
    const fc = card.querySelector('.flash');
    fc.onclick = () => {
      if (!fc.querySelector('.back').classList.contains('hide')) return;
      fc.querySelector('.front').classList.add('hide');
      fc.querySelector('.back').classList.remove('hide');
      card.querySelector('.rate').classList.remove('hide');
      speak(e.en);
    };
    bindSay(card);
    card.querySelector('.rate').append(rateButtons(ok => {
      review(e.id, ok);
      f.mark(ok);
      if (queue && ok === false) queue.push(e); // 모르면 이번 복습 끝에 한 번 더
      next();
    }));
  };
  const done = () => {
    f.body.innerHTML = `
      <div class="card center">
        <div style="font-size:2.5rem">🎉</div>
        <h2>오늘의 복습 완료!</h2>
        <p class="muted">${f.st.count}장 복습 · ${f.st.correct}장 알겠어요</p>
        <div class="grid2 mt">
          <a class="btn" href="#/practice">다른 연습 하기</a>
          <a class="btn primary" href="#/paragraph">문단 만들기</a>
        </div>
      </div>`;
  };
  next();
}

/* ---------------- 스피드 매칭 ---------------- */
function match(root, ctx) {
  const f = frame(root, 'match', ctx.exit);
  let timer;
  const round = () => {
    const picks = sample(ctx.pool, Math.min(6, ctx.pool.length));
    const tiles = shuffle([
      ...picks.map(e => ({ id: e.id, side: 'en', text: e.en })),
      ...picks.map(e => ({ id: e.id, side: 'ko', text: e.ko.split(/[,/]/)[0].trim() })),
    ]);
    const mistakes = new Set();
    let sel = null, left = picks.length;
    const t0 = Date.now();
    const best = getState().best.match;
    f.body.innerHTML = `
      <div class="row between mb"><span class="muted small">같은 뜻끼리 두 개를 눌러 짝지으세요</span>
      <span class="chip accent" id="mt">0.0초</span></div>
      <div class="match-grid"></div>
      ${best ? `<p class="muted small center mt">최고 기록 ${best.toFixed(1)}초</p>` : ''}`;
    const grid = f.body.querySelector('.match-grid');
    clearInterval(timer);
    timer = setInterval(() => {
      const t = f.body.querySelector('#mt');
      if (!t) return clearInterval(timer);
      t.textContent = ((Date.now() - t0) / 1000).toFixed(1) + '초';
    }, 100);
    tiles.forEach(t => {
      const b = el(`<button class="tile" type="button">${esc(t.text)}</button>`);
      b.onclick = () => {
        if (b.classList.contains('done')) return;
        if (!sel) { sel = { t, b }; b.classList.add('sel'); if (t.side === 'en') speak(t.text); return; }
        if (sel.b === b) { b.classList.remove('sel'); sel = null; return; }
        if (sel.t.id === t.id && sel.t.side !== t.side) {
          sel.b.classList.add('done'); b.classList.add('done');
          const ok = !mistakes.has(t.id);
          review(t.id, ok ? true : 'hard');
          f.mark(ok);
          sel = null;
          if (--left === 0) finish();
        } else {
          mistakes.add(sel.t.id); mistakes.add(t.id);
          [sel.b, b].forEach(x => { x.classList.add('shake'); setTimeout(() => x.classList.remove('shake', 'sel'), 350); });
          f.st.streak = 0;
          sel = null;
        }
      };
      grid.append(b);
    });
    const finish = () => {
      clearInterval(timer);
      const sec = (Date.now() - t0) / 1000;
      const isBest = picks.length >= 6 && setBest('match', sec, true);
      f.body.innerHTML = `
        <div class="card center">
          <div style="font-size:2.5rem">${isBest ? '🏆' : '⚡'}</div>
          <h2>${sec.toFixed(1)}초${isBest ? ' · 신기록!' : ''}</h2>
          <p class="muted">실수 ${mistakes.size / 2 | 0}번</p>
          <button class="btn primary block mt">한 판 더</button>
        </div>`;
      f.body.querySelector('button').onclick = round;
    };
  };
  round();
  return () => clearInterval(timer);
}

/* ---------------- 빈칸 러시 ---------------- */
function cloze(root, ctx) {
  const f = frame(root, 'cloze', ctx.exit);
  let last = null;
  const next = () => {
    const e = weightedPick(ctx.pool, last?.id); last = e;
    const x = exOf(e);
    const ans = bracketText(x.en);
    const opts = shuffle([ans, ...otherBrackets(ctx.pool, x.en, 3)]);
    f.body.innerHTML = '';
    const card = el(`
      <div>
        <div class="card q-card">
          <div class="q-sentence">${blankOut(x.en)}</div>
          <p class="muted mt">${esc(x.ko)}</p>
        </div>
        <div class="choices"></div>
        <div class="after"></div>
      </div>`);
    const box = card.querySelector('.choices');
    opts.forEach(o => {
      const b = el(`<button class="choice" type="button">${esc(o)}</button>`);
      b.onclick = () => {
        if (box.dataset.done) return;
        box.dataset.done = 1;
        const ok = o === ans;
        b.classList.add(ok ? 'correct' : 'wrong');
        if (!ok) [...box.children].find(c => c.textContent === ans)?.classList.add('correct');
        review(e.id, ok); f.mark(ok);
        if (ok && f.st.streak > 0) setBest('cloze', f.st.streak);
        speak(stripBrackets(x.en));
        const after = card.querySelector('.after');
        after.append(el(`<div class="feedback ${ok ? 'good' : 'bad'}">
          <b>${esc(e.en)}</b> — ${esc(e.ko)}<br><span>${hl(x.en)}</span></div>`));
        const nb = el('<button class="btn primary block mt">다음 ▶</button>');
        nb.onclick = next;
        after.append(nb);
        if (ok) setTimeout(() => { if (nb.isConnected) next(); }, 1400);
      };
      box.append(b);
    });
    f.body.append(card);
  };
  next();
}

/* ---------------- 듣고 받아쓰기 ---------------- */
function dictation(root, ctx) {
  const f = frame(root, 'dictation', ctx.exit);
  let last = null;
  const next = () => {
    const e = weightedPick(ctx.pool, last?.id); last = e;
    const x = exOf(e);
    const plain = stripBrackets(x.en);
    f.body.innerHTML = '';
    const input = answerBox({ placeholder: '들리는 문장을 그대로 써 보세요', rows: 2 });
    const card = el(`
      <div>
        <div class="card q-card">
          <div class="row" style="justify-content:center;gap:12px">
            <button class="btn primary" data-play>🔊 듣기</button>
            <button class="btn" data-slow>🐢 천천히</button>
          </div>
          <p class="muted small mt">힌트: ${esc(x.ko)}</p>
        </div>
        <div class="in"></div>
        <button class="btn primary block mt" data-check>채점하기</button>
        <div class="after"></div>
      </div>`);
    card.querySelector('.in').append(input.node);
    input.node.querySelector('.mic').remove();
    card.querySelector('[data-play]').onclick = () => speak(plain);
    card.querySelector('[data-slow]').onclick = () => speak(plain, { rate: 0.7 });
    card.querySelector('[data-check]').onclick = ev => {
      ev.target.remove();
      const r = compare(plain, input.value);
      const ok = r.score >= 90 ? true : r.score >= 65 ? 'hard' : false;
      review(e.id, ok); f.mark(ok);
      const after = card.querySelector('.after');
      after.append(el(`<div class="feedback ${ok === true ? 'good' : ok ? 'info' : 'bad'}">
        <b>정확도 ${r.score}%</b><br>${diffHtml(r)}<p class="small mt" style="margin:0">${hl(x.en)}<br>${esc(x.ko)}</p></div>`));
      const nb = el('<button class="btn primary block mt">다음 ▶</button>');
      nb.onclick = next; after.append(nb);
    };
    f.body.append(card);
    setTimeout(() => speak(plain), 300);
  };
  next();
}

/* ---------------- 섀도잉 챌린지 ---------------- */
function shadow(root, ctx) {
  const f = frame(root, 'shadow', ctx.exit);
  let last = null;
  const next = () => {
    const e = weightedPick(ctx.pool, last?.id); last = e;
    const x = exOf(e);
    const plain = stripBrackets(x.en);
    f.body.innerHTML = '';
    const card = el(`
      <div>
        <div class="card q-card">
          <div class="q-sentence">${hl(x.en)}</div>
          <p class="muted mt">${esc(x.ko)}</p>
          <div class="row mt" style="justify-content:center;gap:10px">
            <button class="btn" data-play>🔊 듣기</button>
            <button class="btn" data-slow>🐢 천천히</button>
          </div>
        </div>
        ${canListen()
          ? `<button class="btn primary block" data-rec>🎤 따라 말하기</button><div class="interim center mt"></div>`
          : `<div class="feedback info">이 브라우저는 음성 인식을 지원하지 않아요. 소리 내 따라 말한 뒤 스스로 평가해 주세요.</div>`}
        <div class="after"></div>
      </div>`);
    card.querySelector('[data-play]').onclick = () => speak(plain);
    card.querySelector('[data-slow]').onclick = () => speak(plain, { rate: 0.7 });
    const after = card.querySelector('.after');
    const showRate = () => after.append(rateButtons(ok => { review(e.id, ok); f.mark(ok); next(); },
      ['잘 안 됐어요', '조금 막혔어요', '자연스러웠어요']));
    const rec = card.querySelector('[data-rec]');
    if (rec) {
      rec.onclick = async () => {
        if (rec.dataset.on) { stopListening(); return; }
        rec.dataset.on = 1; rec.textContent = '⏹ 그만 말하기'; rec.classList.add('bad');
        const interim = card.querySelector('.interim');
        let said = '';
        try { said = await listen({ onInterim: t => { interim.textContent = t; } }); }
        catch (err) { toast('음성 인식 오류: ' + err.message); }
        delete rec.dataset.on; rec.textContent = '🎤 다시 말하기'; rec.classList.remove('bad');
        interim.textContent = said ? `"${said}"` : '잘 안 들렸어요. 다시 해 볼까요?';
        if (!said) return;
        const r = compare(plain, said);
        const ok = r.score >= 85 ? true : r.score >= 60 ? 'hard' : false;
        after.innerHTML = '';
        after.append(el(`<div class="feedback ${ok === true ? 'good' : ok ? 'info' : 'bad'}">
          <b>${r.score >= 85 ? '👏 훌륭해요' : r.score >= 60 ? '👍 거의 다 왔어요' : '💪 한 번 더'} · ${r.score}%</b><br>${diffHtml(r)}</div>`));
        if (ok === true) setBest('shadow', f.st.streak + 1);
        const row = el('<div class="grid2 mt"><button class="btn">다시 도전</button><button class="btn primary">다음 ▶</button></div>');
        row.children[0].onclick = () => { after.innerHTML = ''; rec.click(); };
        row.children[1].onclick = () => { review(e.id, ok); f.mark(ok); next(); };
        after.append(row);
      };
    } else showRate();
    f.body.append(card);
    setTimeout(() => speak(plain), 300);
  };
  next();
}

/* ---------------- 한→영 순간 말하기 ---------------- */
function speakMode(root, ctx) {
  const f = frame(root, 'speak', ctx.exit);
  let last = null;
  const next = () => {
    const e = weightedPick(ctx.pool, last?.id); last = e;
    const x = exOf(e);
    const plain = stripBrackets(x.en);
    f.body.innerHTML = '';
    const input = answerBox({ placeholder: '🎤를 누르고 영어로 말해 보세요 (써도 돼요)', rows: 2 });
    const card = el(`
      <div>
        <div class="card q-card">
          <div class="q-ko">${esc(x.ko)}</div>
          <div class="mt"><button class="chip-toggle" data-hint>💡 힌트 보기</button></div>
        </div>
        <div class="in"></div>
        <button class="btn primary block mt" data-check>정답 확인</button>
        <div class="after"></div>
      </div>`);
    card.querySelector('.in').append(input.node);
    card.querySelector('[data-hint]').onclick = ev => { ev.target.outerHTML = `<span class="chip accent">${esc(e.en)} · ${esc(e.ko)}</span>`; };
    card.querySelector('[data-check]').onclick = ev => {
      ev.target.remove();
      const said = input.value.trim();
      const used = usesExpr(said, e);
      const r = compare(plain, said);
      const after = card.querySelector('.after');
      after.append(el(`<div class="feedback ${used ? 'good' : said ? 'bad' : 'info'}">
        ${said ? (used ? `✅ <b>${esc(e.en)}</b> 잘 썼어요!` : `❗ <b>${esc(e.en)}</b> 표현이 안 보여요`) : '정답을 소리 내 따라 말해 보세요'}
        ${said ? `<span class="muted small"> · 모범 답안과 ${r.score}% 일치</span>` : ''}
        <div class="ex" style="margin-top:8px">${sayBtn(plain)}<div><div class="ex-en">${hl(x.en)}</div>
        <div class="ex-ko small">다른 표현으로 말했어도 뜻이 통하면 OK!</div></div></div></div>`));
      bindSay(after);
      speak(plain);
      after.append(rateButtons(ok => { review(e.id, ok); f.mark(ok); next(); },
        ['못 떠올렸어요', '힌트 보고 했어요', '바로 말했어요']));
    };
    f.body.append(card);
  };
  next();
}

/* ---------------- 상황 롤플레이 ---------------- */
function roleplay(root, ctx) {
  const f = frame(root, 'roleplay', ctx.exit);
  const list = roleplaysOf(ctx.weeks);
  if (!list.length) { f.body.innerHTML = '<div class="empty">선택한 회차에 롤플레이가 없어요.</div>'; return; }
  let order = shuffle(list), i = 0;
  const next = () => {
    if (i >= order.length) { order = shuffle(list); i = 0; }
    const r = order[i++];
    const targets = r.use.map(getExpr).filter(Boolean);
    f.body.innerHTML = '';
    const input = answerBox({ placeholder: '배운 표현을 넣어서 대답해 보세요', rows: 3 });
    const card = el(`
      <div>
        <div class="card">
          <span class="chip">${r.week}회차 상황</span>
          <p class="mt">${esc(r.situation)}</p>
          <div class="ex">${sayBtn(r.line)}<div><div class="ex-en"><b>🧑 "${esc(r.line)}"</b></div></div></div>
          <p class="small muted" style="margin:8px 0 4px">이 표현들을 써 보세요</p>
          <div class="checklist">${targets.map(t => `<span class="chip" data-id="${t.id}">${esc(t.en)}</span>`).join('')}</div>
        </div>
        <div class="in"></div>
        <button class="btn primary block mt" data-check>대답 확인</button>
        <div class="after"></div>
      </div>`);
    card.querySelector('.in').append(input.node);
    const chips = card.querySelectorAll('.checklist .chip');
    input.textarea.addEventListener('input', () => {
      chips.forEach(c => c.className = 'chip ' + (usesExpr(input.value, getExpr(c.dataset.id)) ? 'good' : ''));
    });
    bindSay(card);
    card.querySelector('[data-check]').onclick = ev => {
      ev.target.remove();
      const usedIds = targets.filter(t => usesExpr(input.value, t)).map(t => t.id);
      const after = card.querySelector('.after');
      after.append(el(`<div class="feedback ${usedIds.length === targets.length ? 'good' : 'info'}">
        <b>표현 ${usedIds.length}/${targets.length}개 사용</b>
        <div class="ex" style="margin-top:8px">${sayBtn(r.sample)}<div><div class="small muted">모범 답안</div><div class="ex-en">${esc(r.sample)}</div></div></div></div>`));
      bindSay(after);
      const row = el('<div class="grid2 mt"><button class="btn">다시 말해 보기</button><button class="btn primary">다음 상황 ▶</button></div>');
      row.children[0].onclick = () => { input.value = ''; input.textarea.dispatchEvent(new Event('input')); input.focus(); };
      row.children[1].onclick = () => {
        targets.forEach(t => review(t.id, usedIds.includes(t.id) ? true : 'hard'));
        f.mark(usedIds.length === targets.length);
        next();
      };
      after.append(row);
    };
    f.body.append(card);
    setTimeout(() => speak(r.line), 300);
  };
  next();
}

/* ---------------- 표현 보스전 ---------------- */
function boss(root, ctx) {
  const f = frame(root, 'boss', ctx.exit);
  let lives = 3, score = 0, timer, last = null;
  const LIMIT = 15;
  const types = ['meaning', 'reverse', 'cloze', 'type'];
  const ask = () => {
    clearInterval(timer);
    if (!f.body.isConnected) return;
    if (lives <= 0) return over();
    const e = weightedPick(ctx.pool, last?.id); last = e;
    const x = exOf(e);
    const type = ctx.pool.length < 4 ? 'type' : pick(types);
    let prompt, opts, ans;
    if (type === 'meaning') {
      prompt = `<div class="small muted">이 표현의 뜻은?</div><div class="q-big">${esc(e.en)}</div>`;
      ans = e.ko; opts = shuffle([ans, ...sample(ctx.pool.filter(o => o.id !== e.id), 3).map(o => o.ko)]);
    } else if (type === 'reverse') {
      prompt = `<div class="small muted">이 뜻을 가진 표현은?</div><div class="q-ko">${esc(e.ko)}</div>`;
      ans = e.en; opts = shuffle([ans, ...sample(ctx.pool.filter(o => o.id !== e.id), 3).map(o => o.en)]);
    } else if (type === 'cloze') {
      prompt = `<div class="q-sentence">${blankOut(x.en)}</div><p class="muted small mt">${esc(x.ko)}</p>`;
      ans = bracketText(x.en); opts = shuffle([ans, ...otherBrackets(ctx.pool, x.en, 3)]);
    } else {
      prompt = `<div class="small muted">빈칸에 들어갈 표현을 직접 쓰세요</div><div class="q-sentence">${blankOut(x.en)}</div><p class="muted small mt">${esc(x.ko)}</p>`;
      ans = bracketText(x.en);
    }
    f.body.innerHTML = '';
    const card = el(`
      <div>
        <div class="row between mb"><span class="lives">${'❤️'.repeat(lives)}${'🤍'.repeat(3 - lives)}</span><b>점수 ${score}</b></div>
        <div class="timer-bar"><i style="width:100%"></i></div>
        <div class="card q-card">${prompt}</div>
        <div class="choices"></div>
        <div class="after"></div>
      </div>`);
    const box = card.querySelector('.choices');
    let answered = false;
    const resolve = (ok, given) => {
      if (answered) return; answered = true;
      clearInterval(timer);
      review(e.id, ok); f.mark(ok);
      if (ok) score += 10 + Math.max(0, Math.round(left)); else lives--;
      [...box.querySelectorAll('.choice')].forEach(c => {
        if (c.textContent === ans) c.classList.add('correct');
        else if (c.textContent === given) c.classList.add('wrong');
      });
      card.querySelector('.after').append(el(`<div class="feedback ${ok ? 'good' : 'bad'}">
        ${ok ? '⚔️ 명중!' : given === null ? '⏰ 시간 초과!' : '💥 아쉬워요!'} <b>${esc(e.en)}</b> — ${esc(e.ko)}<br>${hl(x.en)}</div>`));
      setTimeout(ask, ok ? 1100 : 2200);
    };
    if (opts) {
      opts.forEach(o => {
        const b = el(`<button class="choice" type="button">${esc(o)}</button>`);
        b.onclick = () => resolve(o === ans, o);
        box.append(b);
      });
    } else {
      const inp = el('<div><input type="text" placeholder="표현 입력 후 Enter" autocapitalize="off" autocomplete="off" spellcheck="false"><button class="btn primary block mt">확인</button></div>');
      const go = () => resolve(looseEqual(inp.querySelector('input').value, ans), inp.querySelector('input').value);
      inp.querySelector('button').onclick = go;
      inp.querySelector('input').onkeydown = ev => { if (ev.key === 'Enter') go(); };
      box.append(inp);
      setTimeout(() => inp.querySelector('input').focus(), 50);
    }
    f.body.append(card);
    let left = LIMIT;
    const bar = card.querySelector('.timer-bar i');
    timer = setInterval(() => {
      if (!card.isConnected) return clearInterval(timer);
      left -= 0.25;
      bar.style.width = Math.max(0, left / LIMIT * 100) + '%';
      if (left <= 0) resolve(false, null);
    }, 250);
  };
  const over = () => {
    const isBest = setBest('boss', score);
    f.body.innerHTML = `
      <div class="card center">
        <div style="font-size:2.8rem">${isBest ? '🏆' : '👾'}</div>
        <h2>게임 오버 · ${score}점${isBest ? ' · 신기록!' : ''}</h2>
        <p class="muted">${f.st.count}문제 중 ${f.st.correct}개 정답 · 최고 연속 ${f.st.best}</p>
        <p class="muted small">최고 점수 ${getState().best.boss || score}점</p>
        <button class="btn primary block mt">다시 도전</button>
      </div>`;
    f.body.querySelector('button').onclick = () => boss(root, ctx);
  };
  ask();
  return () => clearInterval(timer);
}

/* ---------------- 영상 섀도잉 ---------------- */
function scene(root, ctx) {
  const f = frame(root, 'scene', ctx.exit);
  const pool = ctx.pool.filter(e => getScene(e.id));
  if (!pool.length) { f.body.innerHTML = '<div class="empty">선택한 범위에 영상 장면이 없어요.</div>'; return; }
  f.body.innerHTML = `
    <div class="video-wrap"><div class="video-box"></div></div>
    <div class="video-error hide feedback info"></div>
    <div class="scene-area"></div>`;
  const area = f.body.querySelector('.scene-area');
  const errBox = f.body.querySelector('.video-error');
  let rate = 1, hideText = false, last = null, sc = null;
  const hideErr = () => errBox.classList.add('hide');
  const player = createPlayer(f.body.querySelector('.video-box'), null, {
    onPlaying: hideErr,
    onError: (code, vid) => {
      if (!sc || vid !== sc.videoId) return; // 지금 장면과 상관없는 영상의 오류는 무시
      errBox.classList.remove('hide');
      errBox.innerHTML = (isEmbedBlocked(code)
        ? '이 영상은 사이트 안에서 재생이 막혀 있어요. '
        : '영상을 불러오지 못했어요. ▶ 듣기를 다시 눌러 보거나 ')
        + `<a href="${ytLink(sc.videoId, sc.start)}" target="_blank" rel="noopener">유튜브에서 이 장면 열기 ↗</a>`;
    },
  });
  const next = () => {
    const e = weightedPick(pool, last?.id); last = e;
    sc = getScene(e.id);
    const plain = stripBrackets(sc.text);
    hideErr();
    player.showScene(sc.videoId, sc.start, sc.end, rate);
    area.innerHTML = '';
    const card = el(`
      <div>
        <div class="card">
          <div class="row between"><span class="chip accent">${e.week}회차 · ${esc(e.en)}</span>
            <button class="chip-toggle ${hideText ? 'on' : ''}" data-hide>${hideText ? '자막 보이기' : '자막 가리기'}</button></div>
          <p class="q-sentence mt ${hideText ? 'masked' : ''}" style="margin-bottom:4px">${hl(sc.text)}</p>
          <p class="small muted" style="margin:0">${esc(e.ko)}</p>
        </div>
        <div class="grid3">
          <button class="btn" data-play>▶ 듣기</button>
          <button class="btn ${rate < 1 ? 'warn' : ''}" data-slow>🐢 ${rate < 1 ? '0.75배' : '1배'}</button>
          <button class="btn" data-ctx>⏪ 앞부터</button>
        </div>
        ${canListen()
          ? `<button class="btn primary block mt" data-rec>🎤 따라 말하기</button><div class="interim center mt"></div>`
          : `<p class="small muted mt">이 브라우저는 음성 인식이 안 돼요. 소리 내 따라 말한 뒤 스스로 평가해 주세요.</p>`}
        <div class="after"></div>
      </div>`);
    const play = () => player.playSegment(sc.start, sc.end, rate);
    card.querySelector('[data-play]').onclick = play;
    card.querySelector('[data-slow]').onclick = ev => {
      rate = rate < 1 ? 1 : 0.75;
      ev.target.textContent = '🐢 ' + (rate < 1 ? '0.75배' : '1배');
      ev.target.classList.toggle('warn', rate < 1);
      play();
    };
    card.querySelector('[data-ctx]').onclick = () => player.playSegment(Math.max(0, sc.start - 6), sc.end, rate);
    card.querySelector('[data-hide]').onclick = ev => {
      hideText = !hideText;
      card.querySelector('.q-sentence').classList.toggle('masked', hideText);
      ev.target.classList.toggle('on', hideText);
      ev.target.textContent = hideText ? '자막 보이기' : '자막 가리기';
    };
    const after = card.querySelector('.after');
    const rec = card.querySelector('[data-rec]');
    if (!rec) {
      after.append(rateButtons(ok => { review(e.id, ok); f.mark(ok); next(); }, ['잘 안 됐어요', '조금 막혔어요', '자연스러웠어요']));
    } else {
      rec.onclick = async () => {
        if (rec.dataset.on) { stopListening(); return; }
        player.pause();
        rec.dataset.on = 1; rec.textContent = '⏹ 그만 말하기'; rec.classList.add('bad');
        const interim = card.querySelector('.interim');
        let said = '';
        try { said = await listen({ onInterim: t => { interim.textContent = t; } }); }
        catch (err) { toast('음성 인식 오류: ' + err.message); }
        delete rec.dataset.on; rec.textContent = '🎤 다시 말하기'; rec.classList.remove('bad');
        interim.textContent = said ? `"${said}"` : '잘 안 들렸어요. 다시 해 볼까요?';
        if (!said) return;
        const r = compare(plain, said);
        const usedIt = usesExpr(said, e);
        const ok = r.score >= 80 ? true : r.score >= 55 ? 'hard' : false;
        after.innerHTML = '';
        after.append(el(`<div class="feedback ${ok === true ? 'good' : ok ? 'info' : 'bad'}">
          <b>${r.score >= 80 ? '👏 훌륭해요' : r.score >= 55 ? '👍 거의 다 왔어요' : '💪 한 번 더'} · ${r.score}%</b>
          ${usedIt ? ' · ✅ 표현 OK' : ''}<br>${diffHtml(r)}</div>`));
        const row = el('<div class="grid2 mt"><button class="btn">다시 도전</button><button class="btn primary">다음 장면 ▶</button></div>');
        row.children[0].onclick = () => { after.innerHTML = ''; play(); };
        row.children[1].onclick = () => { review(e.id, ok); f.mark(ok); next(); };
        after.append(row);
      };
    }
    area.append(card);
  };
  next();
  return () => player.destroy();
}

const RUNNERS = { scene, flash, match, cloze, dictation, shadow, speak: speakMode, roleplay, boss };

export function runMode(mode, root, ctx) {
  stopListening();
  if (window.speechSynthesis) speechSynthesis.cancel();
  if (!ctx.pool.length) {
    root.innerHTML = '<div class="empty">연습할 표현이 없어요. 범위를 다시 골라 주세요.<br><a class="btn mt" href="#/practice">돌아가기</a></div>';
    return () => {};
  }
  return RUNNERS[mode](root, ctx) || (() => {});
}

export function runReview(root, ctx, queue) {
  return flash(root, ctx, { queue }) || (() => {});
}

// 오늘 복습할 카드: 복습 시기가 된 것 + 아직 안 본 새 표현 몇 개
export function buildReviewQueue(pool, newPerDay = 10) {
  const due = pool.filter(e => isDue(e.id));
  const fresh = pool.filter(e => !item(e.id)?.seen).slice(0, newPerDay);
  return shuffle([...due, ...fresh]);
}
