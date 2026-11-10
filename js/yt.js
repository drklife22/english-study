// 유튜브 플레이어 (IFrame API). 구간 재생, 되감기, 속도, A-B 반복
let apiPromise = null;
function loadApi() {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise(resolve => {
    if (window.YT && window.YT.Player) return resolve(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev && prev(); resolve(window.YT); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.append(s);
  });
  return apiPromise;
}

export const ytLink = (id, t = 0) => `https://youtu.be/${id}${t ? `?t=${Math.floor(t)}` : ''}`;

// mount 안에 플레이어를 만든다. onError(code)는 퍼가기 금지 등 재생 불가일 때
export function createPlayer(mount, videoId, { onError } = {}) {
  const holder = document.createElement('div');
  mount.innerHTML = '';
  mount.append(holder);
  let player = null, ready, segTimer = null, loop = null, segEnd = null, currentId = videoId;
  const readyP = new Promise(r => { ready = r; });

  loadApi().then(YT => {
    player = new YT.Player(holder, {
      videoId,
      width: '100%',
      height: '100%',
      playerVars: { playsinline: 1, rel: 0, modestbranding: 1, cc_load_policy: 0 },
      events: {
        onReady: () => ready(),
        onError: e => onError && onError(e.data),
      },
    });
  });

  const watch = () => {
    clearInterval(segTimer);
    segTimer = setInterval(() => {
      if (!player || !mount.isConnected) return clearInterval(segTimer);
      const t = player.getCurrentTime();
      if (loop && t >= loop.b) player.seekTo(loop.a, true);
      else if (segEnd != null && t >= segEnd) { player.pauseVideo(); segEnd = null; }
    }, 150);
  };

  return {
    ready: readyP,
    async load(id) {
      await readyP;
      if (id !== currentId) { currentId = id; player.cueVideoById(id); }
    },
    async playSegment(start, end, rate) {
      await readyP;
      loop = null;
      if (rate) player.setPlaybackRate(rate);
      player.seekTo(start, true);
      player.playVideo();
      segEnd = end;
      watch();
    },
    async seekBy(sec) {
      await readyP;
      player.seekTo(Math.max(0, player.getCurrentTime() + sec), true);
      player.playVideo();
    },
    async toggle() {
      await readyP;
      if (player.getPlayerState() === 1) player.pauseVideo(); else { segEnd = null; player.playVideo(); watch(); }
    },
    async setRate(r) { await readyP; player.setPlaybackRate(r); },
    time: () => (player && player.getCurrentTime ? player.getCurrentTime() : 0),
    setLoop(a, b) { loop = a != null && b != null && b > a ? { a, b } : null; segEnd = null; if (loop) watch(); },
    pause() { if (player && player.pauseVideo) player.pauseVideo(); },
    destroy() { clearInterval(segTimer); try { player && player.destroy(); } catch (e) { /* noop */ } },
  };
}
