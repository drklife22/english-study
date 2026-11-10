// 브라우저 내장 음성 기능: 듣기(TTS)와 말하기 인식(STT)
let settings = { accent: 'en-US', rate: 0.95 };
export function setSpeechSettings(s) { settings = { ...settings, ...s }; }

let voices = [];
function loadVoices() { voices = window.speechSynthesis ? speechSynthesis.getVoices() : []; }
if (window.speechSynthesis) {
  loadVoices();
  speechSynthesis.onvoiceschanged = loadVoices;
}

function pickVoice(lang) {
  const exact = voices.filter(v => v.lang.replace('_', '-') === lang);
  const pref = exact.find(v => /Google|Samantha|Karen|Daniel|Natural|Premium|Enhanced/i.test(v.name));
  return pref || exact[0] || voices.find(v => v.lang.startsWith('en'));
}

export const canSpeak = () => 'speechSynthesis' in window;

export function speak(text, opts = {}) {
  if (!canSpeak()) return Promise.resolve();
  speechSynthesis.cancel();
  return new Promise(resolve => {
    const u = new SpeechSynthesisUtterance(text.replace(/\[|\]/g, ''));
    u.lang = opts.lang || settings.accent;
    const v = pickVoice(u.lang);
    if (v) u.voice = v;
    u.rate = opts.rate || settings.rate;
    u.onend = u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}

const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
export const canListen = () => !!Rec;

let active = null;
export function stopListening() { if (active) { try { active.stop(); } catch (e) { /* noop */ } } }

// 한 번 말하기를 듣고 최종 문장을 돌려준다. onInterim으로 중간 결과를 받는다.
export function listen({ onInterim, continuous = false, lang = 'en-US' } = {}) {
  if (!Rec) return Promise.reject(new Error('unsupported'));
  stopListening();
  if (window.speechSynthesis) speechSynthesis.cancel();
  return new Promise((resolve, reject) => {
    const r = new Rec();
    active = r;
    r.lang = lang;
    r.interimResults = true;
    r.continuous = continuous;
    r.maxAlternatives = 1;
    let finalText = '';
    r.onresult = e => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t + ' ';
        else interim += t;
      }
      onInterim && onInterim((finalText + interim).trim());
    };
    r.onerror = e => {
      active = null;
      if (e.error === 'no-speech' || e.error === 'aborted') resolve(finalText.trim());
      else reject(new Error(e.error));
    };
    r.onend = () => { active = null; resolve(finalText.trim()); };
    try { r.start(); } catch (err) { reject(err); }
  });
}
