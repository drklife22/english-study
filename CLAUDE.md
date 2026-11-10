# Speak Up 스터디 — 작업 안내

정적 사이트(빌드 없음, 바닐라 ES 모듈)이고 GitHub Pages로 `main` 브랜치 루트에서 배포된다.

## 매주 새 회차 추가 ("이번 주 거 추가해 줘")
1. 비공개 저장소 `drklife22/english-study-pdfs`에서 새 PDF를 찾는다 (`pdftotext -layout`).
   PDF의 "표현 배우기 / 영어표현 정리" 부분에서 표현 목록을 뽑는다.
2. `content/weekNN.txt`를 `content/README.md` 형식으로 작성한다.
   - 예문·설명·롤플레이·모범 문단은 **새로 쓴다**. PDF의 대본·예문을 복사하지 않는다 (이 저장소는 공개).
   - 스터디 담당자 이름 등 개인 정보는 넣지 않는다.
   - 표현마다 예문 3개, 회차마다 `@role` 4개, `@para` 2개.
3. `python3 tools/build_data.py` 실행 → 오류 없을 때까지 수정.
4. 표현 체크가 예문과 맞는지 확인: 각 예문(대괄호 제거)이 `js/match.js`의 `usesExpr`로 잡혀야 한다.
5. 커밋 후 `main`에 푸시.

## 구조
- `content/*.txt` 원본 → `tools/build_data.py` → `data/index.json`, `data/weekNN.json`
- `js/main.js` 라우터·화면, `js/games.js` 연습 모드, `js/store.js` 기록·간격 반복,
  `js/sync.js` Firebase 동기화(`firebase-config.js`가 비어 있으면 꺼짐), `js/match.js` 표현 사용 체크·채점,
  `js/speech.js` 브라우저 TTS/STT
