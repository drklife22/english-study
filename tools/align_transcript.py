#!/usr/bin/env python3
"""문장부호 없는 자동 자막(시간 있음)에 정식 대본(문장부호 있음, 시간 없음)을 맞춰
시간이 붙은 깔끔한 대본을 만든다.

사용법:
  python3 tools/align_transcript.py <자동자막 대본_N회차> <정식 대본 텍스트> <출력 파일>

출력은 대본_N회차와 같은 형식(첫 줄 제목, 둘째 줄 "Time\tSubtitle", 이후 "M:SS\t문장")이다.
결과는 비공개 저장소(english-study-pdfs)에만 둔다. 공개 저장소에 대본 전체를 넣지 않는다.
"""
import difflib
import re
import sys


def to_sec(t):
    t = t.strip()
    if re.fullmatch(r"\d+s", t):
        return int(t[:-1])
    p = [int(x) for x in t.split(":")]
    return p[0] * 3600 + p[1] * 60 + p[2] if len(p) == 3 else p[0] * 60 + p[1]


def fmt(sec):
    sec = int(round(sec))
    return f"{sec // 60}:{sec % 60:02d}"


def norm(w):
    w = w.lower().replace("’", "'")
    w = re.sub(r"[^a-z0-9']", "", w).replace("'", "")
    return w


def main(auto_path, script_path, out_path):
    lines = open(auto_path, encoding="utf-8").read().splitlines()
    title = lines[0].strip()
    rows = []
    for line in lines[2:]:
        if "\t" not in line:
            continue
        t, text = line.split("\t", 1)
        try:
            rows.append((to_sec(t), re.sub(r"\[[^\]]*\]|\([^)]*\)|>>", " ", text)))
        except ValueError:
            continue
    auto = []  # (정규화 단어, 시간) — 한 줄 안에서는 단어 위치에 따라 시간을 나눠 준다
    for k, (sec, text) in enumerate(rows):
        nxt = rows[k + 1][0] if k + 1 < len(rows) else sec + 4
        ws = []
        for w in text.split():
            # chit-chatted → chit chatted 처럼 하이픈은 나눠서 비교
            ws += [n for n in (norm(p) for p in w.split("-")) if n]
        for j, n in enumerate(ws):
            auto.append((n, sec + (nxt - sec) * j / max(1, len(ws))))

    script = " ".join(open(script_path, encoding="utf-8").read().split())
    raw = script.split(" ")
    # 정식 대본 단어마다, 비교용 조각들(하이픈 분리)을 만든다
    pieces, owner = [], []
    for i, w in enumerate(raw):
        for part in re.split(r"-", w):
            n = norm(part)
            if n:
                pieces.append(n)
                owner.append(i)

    sm = difflib.SequenceMatcher(None, [a for a, _ in auto], pieces, autojunk=False)
    times = [None] * len(raw)
    matched = 0
    for a, b, size in sm.get_matching_blocks():
        for k in range(size):
            i = owner[b + k]
            if times[i] is None:
                times[i] = auto[a + k][1]
            matched += 1
    # 못 맞춘 단어는 앞뒤 시간으로 채우기
    last = 0
    for i in range(len(times)):
        if times[i] is None:
            times[i] = last
        last = times[i]
    for i in range(1, len(times)):
        times[i] = max(times[i], times[i - 1])

    # 문장 단위로 끊되, 너무 길면 쉼표나 18단어 근처에서 끊기
    out_rows, cur = [], []
    for i, w in enumerate(raw):
        cur.append(i)
        end_sentence = re.search(r"[.?!][\"')]*$", w)
        soft = len(cur) >= 12 and w.endswith(",")
        hard = len(cur) >= 22
        if end_sentence or soft or hard:
            out_rows.append(cur)
            cur = []
    if cur:
        out_rows.append(cur)

    with open(out_path, "w", encoding="utf-8") as f:
        f.write(title + "\n" + "Time\tSubtitle\n")
        for r in out_rows:
            f.write(f"{fmt(times[r[0]])}\t{' '.join(raw[i] for i in r)}\n")
    print(f"단어 {len(pieces)}개 중 {matched}개를 자동 자막 시간에 맞춤 ({matched * 100 // max(1, len(pieces))}%), {len(out_rows)}줄 생성")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print(__doc__)
        sys.exit(1)
    main(*sys.argv[1:])
