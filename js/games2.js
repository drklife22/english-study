// 게임 3종: 표현 소나기(떨어지는 표현 타자), 십자말풀이, 풍선 행맨
import { esc, hl, blankOut, el, toast, sayBtn, bindSay } from './ui.js';
import { stripBrackets, shuffle, pick } from './data.js';
import { review, weightedPick, setBest, getState } from './store.js';
import { speak } from './speech.js';

/* ---------------- 공통: 표현을 정답 형태로 ---------------- */
// "keep someone on one's toes" → "keep me on my toes", "here I am (still) ~ing" → "here I am"
export function answerForm(e) {
  let s = e.en.split('/')[0];
  if (/\s[AB](\s|$)/.test(s)) return null;           // incorporate A into B 같은 꼴은 제외
  s = s.replace(/\([^)]*\)/g, ' ').replace(/~-?\w*/g, ' ')
    .replace(/\bsomeone's\b/g, 'my').replace(/\bsomeone\b/g, 'me').replace(/\bone's\b/g, 'my')
    .replace(/\boneself\b/g, 'myself').replace(/\bsomething\b/g, 'it')
    .replace(/[’]/g, "'").replace(/\s+/g, ' ').trim();
  return s.replace(/[^A-Za-z]/g, '').length >= 3 ? s : null;
}
const normAns = s => s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const shortKo = e => e.ko.split(/[,/]/)[0].trim();

/* ================= 1. 표현 소나기 ================= */
export function rain(root, ctx, { frame }) {
  const f = frame(root, 'rain', ctx.exit);
  let mode = getState().settings.rainMode || 'ko';
  let raf = 0, running = false;

  // 정답으로 인정할 형태들: 머리말 변형 + 예문 속 형태(blew up 등)
  const accepts = e => {
    const set = new Set();
    for (const part of e.en.split('/')) {
      set.add(normAns(part.replace(/[()]/g, '')));
      set.add(normAns(part.replace(/\([^)]*\)/g, ' ').replace(/~-?\w*/g, ' ')));
    }
    const af = answerForm(e); if (af) set.add(normAns(af));
    e.examples.forEach(x => { const b = (x.en.match(/\[([^\]]+)\]/) || [])[1]; if (b) set.add(normAns(b)); });
    set.delete('');
    return set;
  };

  const intro = () => {
    cancelAnimationFrame(raf); running = false;
    const best = getState().best;
    f.body.innerHTML = `
      <div class="card center">
        <div style="font-size:2.6rem">☔</div>
        <h2>표현 소나기</h2>
        <p class="muted">위에서 떨어지는 말이 바닥 물에 닿기 전에 영어 표현을 입력하세요.<br>놓칠 때마다 물이 차오르고, 5번 놓치면 끝!</p>
        <div class="row mt" style="justify-content:center">
          <button class="chip-toggle ${mode === 'ko' ? 'on' : ''}" data-m="ko">뜻 보고 영어 쓰기</button>
          <button class="chip-toggle ${mode === 'en' ? 'on' : ''}" data-m="en">영어 따라 쓰기 (쉬움)</button>
        </div>
        <p class="small muted mt">최고 점수 · 뜻 보고 ${best['rain-ko'] ?? '-'} · 따라 쓰기 ${best['rain-en'] ?? '-'}</p>
        <p class="small muted">예문 속 형태(blew up, took off …)로 써도 정답이에요.</p>
        <button class="btn primary block mt" data-start>시작하기</button>
      </div>`;
    f.body.querySelectorAll('[data-m]').forEach(b => b.onclick = () => {
      mode = b.dataset.m; getState().settings.rainMode = mode; intro();
    });
    f.body.querySelector('[data-start]').onclick = start;
  };

  const start = () => {
    f.body.innerHTML = `
      <div class="rain-hud row between"><span class="chip accent" data-lv>1단계</span><b data-score>0점</b><span class="small muted" data-miss></span></div>
      <div class="rain-stage">
        <div class="rain-water"></div>
        <div class="rain-missed"></div>
      </div>
      <div class="row mt" style="flex-wrap:nowrap">
        <input type="text" class="rain-input" placeholder="${mode === 'ko' ? '영어 표현 입력 후 Enter' : '보이는 표현 그대로 입력'}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">
        <button class="btn sm" data-pause>⏸</button>
      </div>`;
    const stage = f.body.querySelector('.rain-stage');
    const water = f.body.querySelector('.rain-water');
    const missedBox = f.body.querySelector('.rain-missed');
    const input = f.body.querySelector('.rain-input');
    const MAX_MISS = 5;
    let drops = [], score = 0, hits = 0, misses = 0, level = 1, last = performance.now(), spawnAt = 0, paused = false, lastE = null;
    const hud = () => {
      f.body.querySelector('[data-lv]').textContent = `${level}단계`;
      f.body.querySelector('[data-score]').textContent = `${score}점`;
      f.body.querySelector('[data-miss]').textContent = '💧'.repeat(misses) + '○'.repeat(MAX_MISS - misses);
      water.style.height = `${8 + misses / MAX_MISS * 42}%`;
    };
    const spawn = () => {
      const e = weightedPick(ctx.pool, lastE?.id); lastE = e;
      const node = el(`<div class="drop">${esc(mode === 'ko' ? shortKo(e) : e.en)}</div>`);
      stage.append(node);
      const maxX = Math.max(0, stage.clientWidth - node.offsetWidth - 8);
      const d = { e, node, x: 4 + Math.random() * maxX, y: -node.offsetHeight, ok: accepts(e) };
      node.style.left = d.x + 'px';
      drops.push(d);
    };
    const speed = () => (mode === 'ko' ? 16 : 26) + level * (mode === 'ko' ? 4 : 6);
    const interval = () => Math.max(mode === 'ko' ? 1.6 : 0.9, (mode === 'ko' ? 4.2 : 2.6) - level * 0.25);
    const floorY = () => stage.clientHeight * (1 - (8 + misses / MAX_MISS * 42) / 100);

    const tick = now => {
      if (!stage.isConnected) return;
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (!paused) {
        spawnAt -= dt;
        if (spawnAt <= 0) { spawn(); spawnAt = interval(); }
        const v = speed();
        for (const d of drops.slice()) {
          d.y += v * dt;
          d.node.style.transform = `translateY(${d.y}px)`;
          if (d.y + d.node.offsetHeight >= floorY()) {
            drops.splice(drops.indexOf(d), 1);
            d.node.classList.add('splash');
            setTimeout(() => d.node.remove(), 400);
            misses++;
            review(d.e.id, false); f.mark(false);
            missedBox.innerHTML = `<span class="chip bad">놓침: ${esc(shortKo(d.e))} → ${esc(d.e.en)}</span>`;
            hud();
            if (misses >= MAX_MISS) return over();
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };

    input.addEventListener('keydown', ev => {
      if (ev.key === 'Escape') { togglePause(); return; }
      if (ev.key !== 'Enter') return;
      const v = normAns(input.value);
      if (!v) return;
      // 가장 아래에 있는 일치 항목부터
      const hit = drops.filter(d => d.ok.has(v)).sort((a, b) => b.y - a.y)[0];
      if (hit) {
        drops.splice(drops.indexOf(hit), 1);
        hit.node.classList.add('pop');
        setTimeout(() => hit.node.remove(), 300);
        const heightBonus = Math.round((1 - hit.y / stage.clientHeight) * 10);
        score += 10 + level * 2 + Math.max(0, heightBonus);
        hits++;
        if (hits % 8 === 0) { level++; toast(`⬆️ ${level}단계! 더 빨라져요`); }
        review(hit.e.id, true); f.mark(true);
        if (mode === 'ko') speak(hit.e.en);
        input.value = '';
        hud();
      } else {
        input.classList.add('shake'); setTimeout(() => input.classList.remove('shake'), 300);
        input.select();
      }
    });
    const togglePause = () => {
      paused = !paused;
      f.body.querySelector('[data-pause]').textContent = paused ? '▶' : '⏸';
      stage.classList.toggle('paused', paused);
      if (!paused) input.focus();
    };
    f.body.querySelector('[data-pause]').onclick = togglePause;
    const onVis = () => { if (document.hidden && !paused) togglePause(); };
    document.addEventListener('visibilitychange', onVis);

    const over = () => {
      cancelAnimationFrame(raf); running = false;
      document.removeEventListener('visibilitychange', onVis);
      const key = 'rain-' + mode;
      const isBest = setBest(key, score);
      f.body.innerHTML = `
        <div class="card center">
          <div style="font-size:2.6rem">${isBest ? '🏆' : '🌊'}</div>
          <h2>${score}점${isBest ? ' · 신기록!' : ''}</h2>
          <p class="muted">${level}단계까지 · ${hits}개 맞힘</p>
          <p class="small muted">최고 점수 ${getState().best[key]}점</p>
          <div class="grid2 mt"><button class="btn" data-menu>모드 바꾸기</button><button class="btn primary" data-again>다시 하기</button></div>
        </div>`;
      f.body.querySelector('[data-again]').onclick = start;
      f.body.querySelector('[data-menu]').onclick = intro;
    };

    hud();
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(tick);
    setTimeout(() => input.focus(), 50);
  };

  intro();
  return () => { cancelAnimationFrame(raf); };
}

/* ================= 2. 십자말풀이 ================= */
function layoutCrossword(words) {
  // words: [{ ans: 'BLOWUP', ... }]  → 배치 결과 { cells: Map, placed: [{...w, r, c, dir}] }
  const key = (r, c) => r + ',' + c;
  let best = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    const order = attempt === 0 ? words.slice().sort((a, b) => b.ans.length - a.ans.length) : shuffle(words);
    const grid = new Map();
    const placed = [];
    const canPlace = (w, r, c, dir) => {
      const dr = dir === 'down' ? 1 : 0, dc = dir === 'across' ? 1 : 0;
      // 앞뒤 칸은 비어 있어야
      if (grid.has(key(r - dr, c - dc)) || grid.has(key(r + dr * w.length, c + dc * w.length))) return -1;
      let cross = 0;
      for (let i = 0; i < w.length; i++) {
        const rr = r + dr * i, cc = c + dc * i;
        const g = grid.get(key(rr, cc));
        if (g) {
          if (g.ch !== w[i] || g[dir]) return -1;
          cross++;
        } else {
          // 옆 칸과 붙으면 안 됨
          if (grid.has(key(rr + dc, cc + dr)) || grid.has(key(rr - dc, cc - dr))) return -1;
        }
      }
      return cross;
    };
    const put = (w, r, c, dir) => {
      const dr = dir === 'down' ? 1 : 0, dc = dir === 'across' ? 1 : 0;
      for (let i = 0; i < w.ans.length; i++) {
        const k = key(r + dr * i, c + dc * i);
        const g = grid.get(k) || { ch: w.ans[i] };
        g[dir] = true;
        grid.set(k, g);
      }
      placed.push({ ...w, r, c, dir });
    };
    put(order[0], 0, 0, 'across');
    for (const w of order.slice(1)) {
      const opts = [];
      for (const [k, g] of grid) {
        const [gr, gc] = k.split(',').map(Number);
        for (let i = 0; i < w.ans.length; i++) {
          if (w.ans[i] !== g.ch) continue;
          for (const dir of ['across', 'down']) {
            if (g[dir]) continue;
            const r = dir === 'down' ? gr - i : gr, c = dir === 'across' ? gc - i : gc;
            const cr = canPlace(w.ans, r, c, dir);
            if (cr > 0) opts.push({ r, c, dir, cr });
          }
        }
      }
      if (!opts.length) continue;
      const top = Math.max(...opts.map(o => o.cr));
      const o = pick(opts.filter(x => x.cr === top));
      put(w, o.r, o.c, o.dir);
    }
    // 가로·세로 비율도 고려해서 고르기
    const rs = [...grid.keys()].map(k => +k.split(',')[0]), cs = [...grid.keys()].map(k => +k.split(',')[1]);
    const h = Math.max(...rs) - Math.min(...rs) + 1, wdt = Math.max(...cs) - Math.min(...cs) + 1;
    const scoreL = placed.length * 100 - Math.max(h, wdt) * 2 - Math.abs(h - wdt);
    if (!best || scoreL > best.score) best = { score: scoreL, placed, minR: Math.min(...rs), minC: Math.min(...cs), h, w: wdt };
    if (placed.length === words.length && attempt > 10) break;
  }
  best.placed.forEach(p => { p.r -= best.minR; p.c -= best.minC; });
  return best;
}

export function crossword(root, ctx, { frame }) {
  const f = frame(root, 'cross', ctx.exit);
  const build = () => {
    // 후보: 글자 3~13자, 정답이 겹치지 않게
    const seen = new Set();
    const cands = [];
    for (const e of shuffle(ctx.pool)) {
      const af = answerForm(e);
      if (!af) continue;
      const ans = af.toUpperCase().replace(/[^A-Z]/g, '');
      if (ans.length < 3 || ans.length > 13 || seen.has(ans)) continue;
      seen.add(ans);
      cands.push({ e, ans, shape: af.split(' ').map(x => x.replace(/[^A-Za-z]/g, '').length).filter(Boolean).join(',') });
      if (cands.length >= 14) break;
    }
    if (cands.length < 3) { f.body.innerHTML = '<div class="empty">십자말풀이를 만들 표현이 부족해요. 범위를 넓혀 주세요.</div>'; return; }
    const L = layoutCrossword(cands);
    // 번호 매기기
    const starts = new Map();
    L.placed.forEach(p => { const k = p.r + ',' + p.c; if (!starts.has(k)) starts.set(k, []); starts.get(k).push(p); });
    const order = [...starts.keys()].sort((a, b) => { const [ar, ac] = a.split(',').map(Number), [br, bc] = b.split(',').map(Number); return ar - br || ac - bc; });
    order.forEach((k, i) => starts.get(k).forEach(p => { p.num = i + 1; }));
    const cellOf = new Map(); // "r,c" -> { ch, words: [] }
    L.placed.forEach(p => {
      for (let i = 0; i < p.ans.length; i++) {
        const r = p.r + (p.dir === 'down' ? i : 0), c = p.c + (p.dir === 'across' ? i : 0);
        const k = r + ',' + c;
        const cell = cellOf.get(k) || { ch: p.ans[i], words: [], r, c };
        cell.words.push(p);
        cellOf.set(k, cell);
      }
    });
    let showEx = false;
    const across = L.placed.filter(p => p.dir === 'across').sort((a, b) => a.num - b.num);
    const down = L.placed.filter(p => p.dir === 'down').sort((a, b) => a.num - b.num);
    const clue = p => {
      const x = p.e.examples[0];
      return showEx ? blankOut(x.en) : esc(p.e.ko);
    };
    f.body.innerHTML = `
      <div class="cw-wrap">
        <div class="cw-board"><div class="cw-grid" style="grid-template-columns:repeat(${L.w}, var(--cw))"></div></div>
        <div class="cw-side">
          <div class="cw-current card flat small"></div>
          <div class="row mb">
            <button class="chip-toggle" data-ex>💡 예문 힌트로 보기</button>
          </div>
          <div class="grid2 mb">
            <button class="btn sm" data-check-word>단어 확인</button>
            <button class="btn sm" data-reveal-letter>글자 하나 공개</button>
            <button class="btn sm" data-check-all>전체 확인</button>
            <button class="btn sm ghost" data-reveal-all>정답 보기</button>
          </div>
          <div class="cw-clues"></div>
          <button class="btn primary block mt" data-new>🔄 새 퍼즐</button>
        </div>
      </div>`;
    const gridEl = f.body.querySelector('.cw-grid');
    const size = Math.max(22, Math.min(38, Math.floor((Math.min(f.body.clientWidth, 560) - 8) / L.w)));
    gridEl.style.setProperty('--cw', size + 'px');
    for (let r = 0; r < L.h; r++) for (let c = 0; c < L.w; c++) {
      const cell = cellOf.get(r + ',' + c);
      if (!cell) { gridEl.append(el('<div class="cw-cell block"></div>')); continue; }
      const num = cell.words.find(p => p.r === r && p.c === c)?.num;
      const node = el(`<div class="cw-cell">${num ? `<span class="cw-num">${num}</span>` : ''}<input maxlength="1" autocomplete="off" autocapitalize="characters" spellcheck="false"></div>`);
      cell.node = node; cell.input = node.querySelector('input');
      gridEl.append(node);
    }
    let curWord = L.placed[0], curDir = curWord.dir;
    const cellsOf = p => [...Array(p.ans.length)].map((_, i) => cellOf.get(`${p.r + (p.dir === 'down' ? i : 0)},${p.c + (p.dir === 'across' ? i : 0)}`));
    const revealed = new Set();
    const renderClues = () => {
      const li = p => `<li data-n="${p.num}" data-d="${p.dir}" class="${p === curWord ? 'on' : ''} ${p.solved ? 'solved' : ''}"><b>${p.num}</b> ${clue(p)} <span class="muted small">(${p.shape})</span></li>`;
      f.body.querySelector('.cw-clues').innerHTML = `
        ${across.length ? `<b class="small">➡️ 가로</b><ul class="cw-list">${across.map(li).join('')}</ul>` : ''}
        ${down.length ? `<b class="small">⬇️ 세로</b><ul class="cw-list">${down.map(li).join('')}</ul>` : ''}`;
      f.body.querySelectorAll('.cw-list li').forEach(n => n.onclick = () => {
        const p = L.placed.find(x => x.num === Number(n.dataset.n) && x.dir === n.dataset.d);
        select(p); const first = cellsOf(p).find(c => !c.input.value) || cellsOf(p)[0]; first.input.focus();
      });
      f.body.querySelector('.cw-current').innerHTML = `<b>${curWord.num} ${curWord.dir === 'across' ? '가로' : '세로'}</b> · ${clue(curWord)} <span class="muted">(${curWord.shape})</span>`;
    };
    const select = p => {
      curWord = p; curDir = p.dir;
      cellOf.forEach(c => c.node.classList.remove('hl'));
      cellsOf(p).forEach(c => c.node.classList.add('hl'));
      renderClues();
    };
    const wordDone = p => cellsOf(p).every(c => c.input.value.toUpperCase() === c.ch);
    const markSolved = () => {
      let newly = false;
      L.placed.forEach(p => {
        if (!p.solved && wordDone(p)) {
          p.solved = true; newly = true;
          cellsOf(p).forEach(c => c.node.classList.add('ok'));
          review(p.e.id, revealed.has(p) ? 'hard' : true); f.mark(revealed.has(p) ? null : true);
          speak(p.e.en);
        }
      });
      if (newly) renderClues();
      if (L.placed.every(p => p.solved)) {
        setTimeout(() => {
          const card = el(`<div class="feedback good center mt">🎉 퍼즐 완성! ${L.placed.length}개 표현을 모두 맞혔어요.</div>`);
          f.body.querySelector('.cw-side').prepend(card);
        }, 200);
      }
    };
    cellOf.forEach(cell => {
      const inp = cell.input;
      inp.addEventListener('focus', () => {
        const p = cell.words.find(w => w.dir === curDir) || cell.words[0];
        if (p !== curWord) select(p);
        inp.select();
      });
      inp.addEventListener('click', () => {
        if (cell.words.length > 1 && document.activeElement === inp && inp.dataset.focused) {
          const other = cell.words.find(w => w !== curWord);
          if (other) select(other);
        }
        inp.dataset.focused = 1;
      });
      inp.addEventListener('blur', () => { delete inp.dataset.focused; });
      inp.addEventListener('input', () => {
        inp.value = inp.value.replace(/[^a-z]/gi, '').slice(-1).toUpperCase();
        cell.node.classList.remove('bad');
        if (inp.value) {
          const list = cellsOf(curWord);
          const i = list.indexOf(cell);
          const nxt = list.slice(i + 1).find(c => !c.input.value) || list[i + 1];
          if (nxt) nxt.input.focus();
        }
        markSolved();
      });
      inp.addEventListener('keydown', ev => {
        const list = cellsOf(curWord), i = list.indexOf(cell);
        if (ev.key === 'Backspace' && !inp.value && i > 0) { ev.preventDefault(); list[i - 1].input.value = ''; list[i - 1].input.focus(); }
        const move = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] }[ev.key];
        if (move) {
          ev.preventDefault();
          const n = cellOf.get(`${cell.r + move[0]},${cell.c + move[1]}`);
          curDir = move[0] ? 'down' : 'across';
          if (n) n.input.focus();
        }
      });
    });
    f.body.querySelector('[data-ex]').onclick = ev => { showEx = !showEx; ev.target.classList.toggle('on', showEx); renderClues(); };
    f.body.querySelector('[data-check-word]').onclick = () => {
      cellsOf(curWord).forEach(c => { if (c.input.value && c.input.value.toUpperCase() !== c.ch) c.node.classList.add('bad'); });
    };
    f.body.querySelector('[data-check-all]').onclick = () => {
      let wrong = 0;
      cellOf.forEach(c => { if (c.input.value && c.input.value.toUpperCase() !== c.ch) { c.node.classList.add('bad'); wrong++; } });
      toast(wrong ? `틀린 칸 ${wrong}개를 빨간색으로 표시했어요` : '지금까지 채운 칸은 모두 맞아요 👍');
    };
    f.body.querySelector('[data-reveal-letter]').onclick = () => {
      const c = cellsOf(curWord).find(x => x.input.value.toUpperCase() !== x.ch);
      if (!c) return;
      revealed.add(curWord);
      c.input.value = c.ch; c.node.classList.add('given');
      markSolved();
    };
    f.body.querySelector('[data-reveal-all]').onclick = () => {
      if (!confirm('정답을 모두 공개할까요?')) return;
      L.placed.forEach(p => { if (!p.solved) { revealed.add(p); review(p.e.id, false); f.mark(false); p.solved = true; } });
      cellOf.forEach(c => { if (c.input.value.toUpperCase() !== c.ch) { c.input.value = c.ch; c.node.classList.add('given'); } });
      renderClues();
    };
    f.body.querySelector('[data-new]').onclick = build;
    select(curWord);
  };
  build();
}

/* ================= 3. 풍선 행맨 ================= */
export function hangman(root, ctx, { frame }) {
  const f = frame(root, 'hangman', ctx.exit);
  const LIVES = 7;
  let last = null;
  const onKey = ev => {
    if (!f.body.isConnected) return document.removeEventListener('keydown', onKey);
    if (ev.ctrlKey || ev.metaKey || ev.altKey || /input|textarea/i.test(ev.target.tagName)) return;
    const k = ev.key.toLowerCase();
    if (/^[a-z]$/.test(k)) f.body.querySelector(`[data-key="${k}"]`)?.click();
    if (ev.key === 'Enter') f.body.querySelector('[data-next]')?.click();
  };
  document.addEventListener('keydown', onKey);

  const round = () => {
    const pool = ctx.pool.filter(answerForm);
    if (!pool.length) { f.body.innerHTML = '<div class="empty">행맨으로 낼 표현이 없어요.</div>'; return; }
    const e = weightedPick(pool, last?.id); last = e;
    const answer = answerForm(e);
    const letters = new Set(answer.toLowerCase().replace(/[^a-z]/g, ''));
    const guessed = new Set();
    let wrong = 0, hint = false, done = false;
    const x = e.examples[0];
    f.body.innerHTML = `
      <div class="card center">
        <div class="balloons" aria-label="남은 기회">${[...Array(LIVES)].map((_, i) => `<span class="balloon b${i % 5}">🎈</span>`).join('')}</div>
        <p class="muted small" style="margin:6px 0 2px">뜻</p>
        <div class="q-ko">${esc(e.ko)}</div>
        <div class="hm-word mt"></div>
        <div class="hm-hint small muted mt"><button class="chip-toggle" data-hint>💡 예문 힌트</button></div>
      </div>
      <div class="hm-keys"></div>
      <div class="after"></div>`;
    const wordEl = f.body.querySelector('.hm-word');
    const draw = (reveal = false) => {
      wordEl.innerHTML = answer.split(' ').map(word => `<span class="hm-w">${[...word].map(ch => {
        const isL = /[a-z]/i.test(ch);
        const show = !isL || guessed.has(ch.toLowerCase()) || reveal;
        const missed = reveal && isL && !guessed.has(ch.toLowerCase());
        return `<span class="hm-ch ${isL ? '' : 'punct'} ${missed ? 'missed' : ''}">${show ? esc(ch) : ''}</span>`;
      }).join('')}</span>`).join('');
    };
    draw();
    f.body.querySelector('[data-hint]').onclick = ev => {
      hint = true;
      ev.target.outerHTML = `<span>${blankOut(x.en)}</span><br><span>${esc(x.ko)}</span>`;
    };
    const keys = f.body.querySelector('.hm-keys');
    'qwertyuiopasdfghjklzxcvbnm'.split('').forEach(k => {
      const b = el(`<button class="hm-key" type="button" data-key="${k}">${k.toUpperCase()}</button>`);
      b.onclick = () => {
        if (done || guessed.has(k)) return;
        guessed.add(k);
        b.disabled = true;
        if (letters.has(k)) b.classList.add('hit');
        else {
          b.classList.add('miss');
          wrong++;
          const balloons = f.body.querySelectorAll('.balloon:not(.popped)');
          balloons[balloons.length - 1]?.classList.add('popped');
        }
        draw();
        const won = [...letters].every(l => guessed.has(l));
        if (won || wrong >= LIVES) finish(won);
      };
      keys.append(b);
    });
    const finish = won => {
      done = true;
      draw(!won);
      const ok = won ? (hint || wrong >= 4 ? 'hard' : true) : false;
      review(e.id, ok); f.mark(won ? (ok === true ? true : null) : false);
      if (won) setBest('hangman', f.st.streak);
      speak(e.en);
      const after = f.body.querySelector('.after');
      after.innerHTML = `
        <div class="feedback ${won ? 'good' : 'bad'}">
          ${won ? `🎉 정답! 남은 풍선 ${LIVES - wrong}개` : '💥 풍선이 다 터졌어요'} — <b>${esc(e.en)}</b>
          <div class="ex" style="margin-top:8px">${sayBtn(stripBrackets(x.en))}<div><div class="ex-en">${hl(x.en)}</div><div class="ex-ko">${esc(x.ko)}</div></div></div>
        </div>
        <button class="btn primary block mt" data-next>다음 표현 ▶ <span class="small">(Enter)</span></button>`;
      bindSay(after);
      after.querySelector('[data-next]').onclick = round;
    };
  };
  round();
  return () => document.removeEventListener('keydown', onKey);
}
