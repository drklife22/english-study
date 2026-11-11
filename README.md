# Speak Up 스터디 💬

매주 영어 스터디에서 배운 표현을 **듣고 → 떠올리고 → 말하며** 복습하는 사이트입니다.
목표는 배운 표현을 실제 스피킹에서 자연스럽게 꺼내 쓰는 것이에요.

## 할 수 있는 것

| 메뉴 | 내용 |
|---|---|
| 📅 오늘의 복습 | 간격 반복으로 오늘 다시 볼 표현과 새 표현을 카드로 복습 |
| 📚 표현 | 회차별 표현, 뜻, 뉘앙스, 예문 듣기, 알아요/헷갈려요/몰라요 표시, 내 문장 만들기 |
| 🎬 영상 | 회차 화면에서 영상 재생, 3·5초 되감기, 속도 조절, A-B 구간 반복, 표현 옆 🎬로 그 장면 바로 재생 |
| 🎮 연습 (끝없이 출제) | 영상 섀도잉 · 플래시카드 · 스피드 매칭 · 빈칸 러시 · 듣고 받아쓰기 · 섀도잉 챌린지 · 한→영 순간 말하기 · 상황 롤플레이 · 표현 보스전 |
| ⌨️ 딕테이션 | 영상을 들으며 전체 대본 받아 적기, 단축키(재생·되감기·속도), 지금까지/전체 채점, 놓친 부분 표시, 결과 기록 |
| ✍️ 문단 | 랜덤 표현 3~5개로 문단 말하기/쓰기, 회차 미션(모범 문단 포함), 1분 말하기, 내 문단 모음 |
| 📈 내 기록 | 연속 학습일, 표현 상태, 최고 기록, 발음 억양(미국·영국·호주)·속도 설정, 백업 |

- 연습 범위는 회차별로 고를 수 있고, "약한 표현만"으로 모아 연습할 수도 있어요.
- 모르는 표현일수록 더 자주 나옵니다.
- 음성 인식(🎤)은 크롬(안드로이드·PC)과 사파리(아이폰)에서 동작해요. 안 되면 글로 써도 됩니다.

## 매주 업데이트 방법

1. 비공개 저장소 `english-study-pdfs`에 새 회차 PDF를 올립니다.
2. Claude에게 "이번 주 거 추가해 줘"라고 요청합니다.
3. Claude가 `content/weekNN.txt`를 만들고 `python3 tools/build_data.py`로 `data/`를 갱신해 커밋합니다.
   비공개 저장소에 `대본_N회차`(시간+자막)도 올려 두면 표현이 나오는 영상 장면을 자동으로 찾아 넣어요.
4. GitHub Pages가 자동으로 다시 배포합니다 (1~2분).

PDF 원문이나 대본 전체는 이 공개 저장소에 올리지 않습니다. 영상 장면은 표현이 들어간 한 문장과 시간만 저장해요. 예문과 설명은 새로 쓴 것입니다.
원본 형식은 [content/README.md](content/README.md)를 참고하세요.

## 딕테이션 대본 열쇠 (GitHub 토큰, 무료)

전체 딕테이션의 정답 대본은 비공개 저장소 `english-study-pdfs`의 `대본_N회차` 파일을 그때그때 읽어 옵니다.
그래서 기기마다 한 번, 읽기 전용 토큰을 사이트에 넣어야 해요 (사이트의 딕테이션 화면이나 내 기록에서 입력).

1. https://github.com/settings/personal-access-tokens/new
2. Repository access: **Only select repositories** → `english-study-pdfs`
3. Permissions → Repository permissions → **Contents: Read-only**
4. Generate token → `github_pat_…`를 사이트에 붙여 넣기

토큰은 그 브라우저에만 저장되고 동기화되지 않습니다. 만료되면 새로 만들어 넣으면 돼요.

## 동기화 설정 (Firebase, 무료)

설정하지 않으면 기록은 각 브라우저에만 저장됩니다. 휴대폰과 PC의 기록을 합치려면:

1. https://console.firebase.google.com 에서 **프로젝트 추가** (Google 애널리틱스는 꺼도 됨)
2. **빌드 → Authentication → 시작하기 → 로그인 방법 → Google** 사용 설정
3. **Authentication → 설정 → 승인된 도메인**에 `drklife22.github.io` 추가
4. **빌드 → Firestore Database → 데이터베이스 만들기** (위치: `asia-northeast3 (서울)`, 프로덕션 모드)
5. Firestore **규칙** 탭에 아래 내용을 붙여 넣고 **게시**

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{uid} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```

6. **프로젝트 설정(⚙️) → 내 앱 → 웹 앱 추가(</>)** 후 나오는 `firebaseConfig` 값 중
   `apiKey`, `authDomain`, `projectId`, `appId`를 [firebase-config.js](firebase-config.js)에 넣고 커밋

이 설정값은 공개되어도 괜찮은 식별자이고, 데이터는 5번 규칙 때문에 본인만 읽고 쓸 수 있어요.

## 로컬에서 실행

```bash
python3 -m http.server 8000
```

브라우저에서 http://localhost:8000 을 엽니다.
