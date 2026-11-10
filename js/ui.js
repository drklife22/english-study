// 공통 UI 도우미
import { speak, listen, canListen, stopListening } from './speech.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// "[표현]" 을 형광펜으로
export const hl = s => esc(s).replace(/\[([^\]]+)\]/g, '<mark>$1</mark>');
// "[표현]" 을 빈칸으로
export const blankOut = s => esc(s).replace(/\[([^\]]+)\]/g, '<span class="blank">&nbsp;?&nbsp;</span>');

let toastTimer;
export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// 🔊 버튼: data-say="문장" 속성을 가진 버튼을 눌러 읽어 준다
export function bindSay(root) {
  root.querySelectorAll('[data-say]').forEach(b => {
    b.addEventListener('click', ev => {
      ev.stopPropagation();
      speak(b.dataset.say, { rate: b.dataset.rate ? Number(b.dataset.rate) : undefined });
    });
  });
}
export const sayBtn = (text, label = '🔊', rate) =>
  `<button class="icon-btn" type="button" data-say="${esc(text)}" ${rate ? `data-rate="${rate}"` : ''} aria-label="듣기">${label}</button>`;

// 말하기/쓰기 입력창: 마이크로 말하면 글자로 들어간다
export function answerBox({ placeholder = '영어로 말하거나 써 보세요', rows = 3, continuous = false } = {}) {
  const box = el(`
    <div>
      <div class="answer-box">
        <textarea rows="${rows}" placeholder="${esc(placeholder)}" autocapitalize="off" spellcheck="false"></textarea>
        <button class="icon-btn mic" type="button" aria-label="말하기" title="${canListen() ? '눌러서 말하기' : '이 브라우저는 음성 인식을 지원하지 않아요 (크롬 권장)'}">🎤</button>
      </div>
      <div class="interim"></div>
    </div>`);
  const ta = box.querySelector('textarea');
  const mic = box.querySelector('.mic');
  const interim = box.querySelector('.interim');
  let recording = false;
  if (!canListen()) mic.style.opacity = .45;
  mic.addEventListener('click', async () => {
    if (!canListen()) { toast('음성 인식은 크롬(안드로이드·PC)이나 사파리에서 돼요. 글로 써도 괜찮아요!'); return; }
    if (recording) { stopListening(); return; }
    recording = true;
    mic.classList.add('rec');
    const before = ta.value.trim();
    try {
      const text = await listen({ continuous, onInterim: t => { interim.textContent = t; } });
      if (text) ta.value = (before ? before + ' ' : '') + text;
      ta.dispatchEvent(new Event('input'));
    } catch (e) {
      toast(e.message === 'not-allowed' ? '마이크 권한을 허용해 주세요' : '음성 인식 오류: ' + e.message);
    }
    interim.textContent = '';
    recording = false;
    mic.classList.remove('rec');
  });
  return { node: box, textarea: ta, get value() { return ta.value; }, set value(v) { ta.value = v; }, focus: () => ta.focus() };
}

export function weekLabel(w) {
  const d = w.date ? w.date.slice(5).replace('-', '/') : '';
  return `${w.week}회차${d ? ' · ' + d : ''}`;
}
