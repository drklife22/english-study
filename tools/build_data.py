#!/usr/bin/env python3
"""content/weekNN.txt 파일들을 읽어 data/weekNN.json 과 data/index.json 을 만든다.

사용법:  python3 tools/build_data.py

원본 형식 (content/README.md 참고)
----------------------------------
week: 1
date: 2026-09-04
title: 제니 영어 인터뷰
subtitle: BLACKPINK JENNIE
video: https://...

## blow up | 대박 나다 | 뉘앙스 설명(선택)
match: blow up; blew up        (선택: 문단 체크용 표현 형태, ; 로 구분)
- His video [blew up] overnight. = 그의 영상이 하룻밤 사이에 떴어.

@role 상황 설명 | 상대방 대사 | 사용할 표현(;구분) | 모범 답안
@para 주제 | 사용할 표현(;구분) | 모범 문단
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "content"
OUT = ROOT / "data"


def slug(s: str) -> str:
    s = s.lower().replace("’", "'")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "x"


def parse(path: Path):
    meta, exprs, roles, paras = {}, [], [], []
    errors = []
    cur = None
    for ln, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("//"):
            continue
        where = f"{path.name}:{ln}"
        if line.startswith("## "):
            parts = [p.strip() for p in line[3:].split("|")]
            if len(parts) < 2:
                errors.append(f"{where} 표현 줄에는 '표현 | 뜻' 이 필요합니다")
                continue
            cur = {
                "en": parts[0],
                "ko": parts[1],
                "note": parts[2] if len(parts) > 2 else "",
                "match": [],
                "examples": [],
            }
            exprs.append(cur)
        elif line.startswith("match:"):
            if cur is None:
                errors.append(f"{where} match 앞에 표현이 없습니다")
                continue
            cur["match"] = [m.strip() for m in line[6:].split(";") if m.strip()]
        elif line.startswith("- "):
            if cur is None:
                errors.append(f"{where} 예문 앞에 표현이 없습니다")
                continue
            if " = " not in line:
                errors.append(f"{where} 예문은 '영어 = 한국어' 형식이어야 합니다")
                continue
            en, ko = line[2:].split(" = ", 1)
            en, ko = en.strip(), ko.strip()
            if not re.search(r"\[[^\]]+\]", en):
                errors.append(f"{where} 예문에 [표현] 대괄호 표시가 없습니다")
            cur["examples"].append({"en": en, "ko": ko})
        elif line.startswith("@role "):
            parts = [p.strip() for p in line[6:].split("|")]
            if len(parts) != 4:
                errors.append(f"{where} @role 은 4칸(상황|대사|표현|답안)이어야 합니다")
                continue
            roles.append({"situation": parts[0], "line": parts[1],
                          "use": [u.strip() for u in parts[2].split(";")],
                          "sample": parts[3]})
        elif line.startswith("@para "):
            parts = [p.strip() for p in line[6:].split("|")]
            if len(parts) != 3:
                errors.append(f"{where} @para 는 3칸(주제|표현|문단)이어야 합니다")
                continue
            paras.append({"topic": parts[0],
                          "use": [u.strip() for u in parts[1].split(";")],
                          "text": parts[2]})
        elif re.match(r"^[a-z]+:", line) and cur is None:
            k, v = line.split(":", 1)
            meta[k.strip()] = v.strip()
        else:
            errors.append(f"{where} 알 수 없는 줄: {line[:40]}")

    week = int(meta.get("week", 0))
    by_en = {}
    seen = set()
    for e in exprs:
        base = slug(e["en"])
        sid = f"w{week:02d}-{base}"
        n = 2
        while sid in seen:
            sid = f"w{week:02d}-{base}-{n}"
            n += 1
        seen.add(sid)
        e["id"] = sid
        e["week"] = week
        by_en[e["en"].lower()] = sid
        if len(e["examples"]) < 2:
            errors.append(f"{path.name} '{e['en']}' 예문이 2개 미만입니다")

    def resolve(names, where):
        ids = []
        for n in names:
            sid = by_en.get(n.lower())
            if not sid:
                errors.append(f"{path.name} {where}: 표현 '{n}' 을 찾을 수 없습니다")
            else:
                ids.append(sid)
        return ids

    for r in roles:
        r["use"] = resolve(r["use"], "@role")
    for p in paras:
        p["use"] = resolve(p["use"], "@para")

    data = {
        "week": week,
        "date": meta.get("date", ""),
        "title": meta.get("title", ""),
        "subtitle": meta.get("subtitle", ""),
        "video": meta.get("video", ""),
        "expressions": exprs,
        "roleplays": roles,
        "paragraphs": paras,
    }
    return data, errors


def main():
    OUT.mkdir(exist_ok=True)
    index, all_errors = [], []
    for path in sorted(SRC.glob("week*.txt")):
        data, errors = parse(path)
        all_errors += errors
        name = f"week{data['week']:02d}.json"
        (OUT / name).write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
        index.append({"week": data["week"], "date": data["date"], "title": data["title"],
                      "subtitle": data["subtitle"], "file": name,
                      "count": len(data["expressions"])})
        print(f"{path.name}: 표현 {len(data['expressions'])}개, 롤플레이 {len(data['roleplays'])}개, "
              f"문단 {len(data['paragraphs'])}개")
    index.sort(key=lambda w: w["week"])
    (OUT / "index.json").write_text(json.dumps({"weeks": index}, ensure_ascii=False, indent=1),
                                    encoding="utf-8")
    if all_errors:
        print("\n오류:")
        for e in all_errors:
            print("  " + e)
        sys.exit(1)
    print(f"\n완료: {len(index)}개 회차")


if __name__ == "__main__":
    main()
