// 대본 파일(첫 줄 제목, 둘째 줄 "Time\tSubtitle", 이후 "1:05\t자막") 읽기
// 브라우저(딕테이션)와 tools/build_scenes.mjs 가 함께 쓴다.

export const toSec = t => {
  t = t.trim();
  if (/^\d+s$/.test(t)) return Number(t.slice(0, -1));
  const p = t.split(':').map(Number);
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
};

// [Interviewer], (Applause), >> 같은 표시와 줄 앞 대시 제거
export const cleanLine = s => s
  .replace(/\[[^\]]*\]/g, ' ').replace(/\([^)]*\)/g, ' ').replace(/>>/g, ' ')
  .replace(/(^|\s)-\s/g, ' ').replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();

export function parseTranscript(raw) {
  const lines = raw.replace(/\r/g, '').split('\n');
  const title = (lines[0] || '').trim();
  const rows = [];
  for (const line of lines.slice(1)) {
    const [t, ...rest] = line.split('\t');
    if (!t || !rest.length || !/\d/.test(t)) continue;
    const text = cleanLine(rest.join(' '));
    if (text) rows.push({ t: toSec(t), text });
  }
  return { title, rows };
}
