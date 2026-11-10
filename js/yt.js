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

// 퍼가기(사이트 안 재생)가 막힌 영상의 오류 코드
export const isEmbedBlocked = code => code === 101 || code === 150;

// mount 안에 플레이어를 만든다.
// onError(code, videoId): 재생 오류 / onPlaying(videoId): 정상 재생이 시작됐을 때
export function createPlayer(mount, videoId, { onError, onPlaying } = {}) {
  const holder = document.createElement('div');
  mount.innerHTML = '';
  mount.append(holder);
  let player = null, ready, segTimer = null, loop = null, segEnd = null, currentId = videoId;
  let preview = null; // 소리 없이 잠깐 재생해서 장면 화면에 멈춰 두는 중이면 { start }
  let sceneToken = 0;
  const readyP = new Promise(r => { ready = r; });

  loadApi().then(YT => {
    player = new YT.Player(holder, {
      videoId,
      width: '100%',
      height: '100%',
      playerVars: { playsinline: 1, rel: 0, modestbranding: 1, cc_load_policy: 0 },
      events: {
        onReady: () => ready(),
        onError: e => onError && onError(e.data, currentId),
        onStateChange: e => {
          if (e.data !== 1) return;
          if (preview) {
            const st = preview.start;
            preview = null;
            player.pauseVideo();
            player.seekTo(st, true);
            player.unMute();
          }
          if (onPlaying) onPlaying(currentId);
        },
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
    // 장면을 띄운다. 먼저 소리 켜고 그 장면 재생을 시도하고,
    // 브라우저가 막으면 소리 없이 잠깐 재생해 장면 화면에서 멈춰 둔다.
    async showScene(id, start, end, rate = 1) {
      await readyP;
      const token = ++sceneToken;
      loop = null; preview = null;
      currentId = id;
      player.unMute();
      player.loadVideoById({ videoId: id, startSeconds: start });
      player.setPlaybackRate(rate);
      segEnd = end;
      watch();
      setTimeout(() => {
        if (token !== sceneToken || !mount.isConnected) return;
        if (player.getPlayerState() === 1) return; // 잘 재생 중
        segEnd = null;
        preview = { start };
        player.mute();
        player.seekTo(start, true);
        player.playVideo();
      }, 1500);
    },
    get videoId() { return currentId; },
    async playSegment(start, end, rate) {
      await readyP;
      sceneToken++; preview = null;
      loop = null;
      player.unMute();
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
