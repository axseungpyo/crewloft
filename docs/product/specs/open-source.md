# 오픈소스 공개 — R1 먼저 (결정 77)

2026-10-04 사용자: "일단 github에 오픈소스 방식으로 구현하는건 어때? 웹앱은 hermes agent를 모티브로 하는거야."
사용자 선택: **비공개 저장소에 먼저 올리고, 정리한 뒤 공개** · 라이선스 **AGPL-3.0**.
관련: [PRD](../PRD.md) §4(출시 단계 — R1 오픈소스) · [publishing](publishing.md) §3(AI 구독 조건) · [entry-pages](entry-pages.md)(결정 74) · [architecture](../../tech/architecture.md).

## 1. 왜 오픈소스 먼저인가
- **Claude 구독 문제가 풀린다.** 각자 자기 컴퓨터 · 자기 서버에서 돌리고, 공식 Claude Code에 자기 구독으로 직접 로그인한다. 개인 사용이라 허용된다. 우리가 AI 비용을 대신 내거나 중계하지 않는다(publishing §3, 경로 A의 가장 가벼운 형태).
- **지금 구조와 맞다.** Node 프로세스 하나 + SQLite 파일 하나, 기본은 127.0.0.1에서만, 가짜 AI로도 돈다.
- **Hermes Agent가 길을 보여 줬다.** MIT 라이선스이고, 한 줄 설치 · `hermes` 명령 · 내 컴퓨터에서만 열리는 대시보드(127.0.0.1:9119) · AI 회사 무관 · 메신저 게이트웨이 · 스킬 허브를 갖췄다.
- **초기 사용자.** AI 파워유저 · 개발자가 먼저 온다. 피드백과 기여(업무 블록 등)를 받는다.

## 2. Hermes Agent에서 가져올 것

| Hermes | Agent Office | 상태 |
| --- | --- | --- |
| `curl … install.sh \| bash` 한 줄 설치 | `scripts/install.sh` → `~/.agent-office` + `~/.local/bin/agent-office` | 됨 |
| `hermes` 명령(대화 · 설정 · 모델 · 업데이트) | `agent-office start · demo · doctor · backup · update · version` | 됨 |
| `hermes dashboard` — 내 컴퓨터에서만 열리는 웹 화면, 외부로 열면 인증 | 3D 사무실이 곧 대시보드. 외부 접속은 출입 비밀번호 또는 `AUTH_MODE=accounts` | 됨 |
| AI 회사 무관(Nous Portal · OpenRouter · Anthropic · OpenAI · 직접 연결) | 지금: Claude Code(내 구독) · 가짜 AI. 다음: API 키(결정 76) · OpenRouter · 로컬 모델 | 다음 |
| 메신저 게이트웨이(텔레그램 · 디스코드 · 슬랙 · 왓츠앱 · 이메일) | 결정 요청을 휴대폰 메신저로 받고 바로 승인. 지금은 슬랙 알림만 | 다음 |
| 스킬(배운 절차) + 스킬 허브(agentskills.io) | 업무 블록(결정 73)을 공개 형식으로 — 커뮤니티가 블록을 기여 | 다음 |
| 기억 · 세션 검색 | 배운 것 · 회사 지식(있음) · 결과물 검색 | 일부 |
| 예약 실행(cron) | 주간 회차 예약(있음) → 일반 예약 | 일부 |
| 설치 관리(Python · Node 등 자동 설치) · Windows PowerShell 설치 | Node 24 확인만. Windows · Docker 이미지 · 데스크톱 앱은 후속 | 다음 |

차별점: Hermes는 터미널 중심의 에이전트 한 명, Agent Office는 **눈으로 보는 팀과 사무실**, 대상은 창업을 막 시작하는 사람이다.

## 3. 지금 한 것 (2026-10-04)
- 라이선스 `LICENSE`(AGPL-3.0 원문), `package.json`의 `license: AGPL-3.0-or-later`, 외부 구성 요소 목록 `THIRD_PARTY_NOTICES.md`(Preact MIT · htm Apache-2.0 · three.js MIT · 글꼴 OFL — 모두 AGPL과 함께 쓸 수 있음).
- 안내: `README.md`(영어) · `README.ko.md`(한국어) · `CONTRIBUTING.md` · `SECURITY.md`(비공개 취약점 신고) · 이슈 · PR 양식.
- 자동 확인: `.github/workflows/ci.yml` — Node 24 · 26에서 타입 검사 · 테스트 · 화면 스크립트 문법 · CLI 점검. 외부 호출 없음.
- 명령 · 설치: `bin/agent-office.mjs`, `scripts/install.sh`(설치 폴더 · 저장소 · 브랜치를 환경 변수로 바꿀 수 있음).
- 앱 안 소스 링크(AGPL 13조 — 네트워크로 쓰는 사람에게 소스를 제공): 설정 › 데이터 '오픈소스' 카드, 공개 화면 바닥글.
- 홈 문구: 요금 '준비 중' → **무료 · 오픈소스**(AI는 내 Claude 구독).
- 비공개 저장소: `github.com/axseungpyo/agent-office`(임시 이름).

## 4. 공개 전 체크리스트

| 항목 | 상태 · 제안 |
| --- | --- |
| 서비스 이름 · 저장소 이름 | **Crewloft(결정 82)** — 상표 확인 · 도메인 · 깃허브 이름 `crewloft` 확보 뒤 바꾼다. 바꾸면 `SOURCE_URL`(web/js/lib.js) · install.sh · README · package.json을 함께 바꾼다(GitHub는 옛 주소를 새 주소로 넘겨 준다) |
| 기본 브랜치 | `master`가 `office-3d`보다 뒤처져 있다 — 공개 전에 합친다. 설치 스크립트는 기본 브랜치를 받는다 |
| 지난 이력 | 지난 커밋에 `.playwright-mcp` 스크린샷, 문서에 로컬 경로 · 작성자 이메일이 남아 있다. 비밀값(API 키 · 토큰 · 비밀번호)은 이력 전체 검사에서 나오지 않았다. **공개는 새 이력(한 커밋으로 시작)을 제안** — 개발 이력은 비공개 저장소에 남긴다 |
| `prototype/character3d/ref.png` | 사용자가 보내 준 참고 그림 — 출처를 모르면 공개본에서 뺀다 |
| 문서 속 개인 정보 | 사용자 회사 이름 · 대화 원문(결정 로그 · 작업 기록)이 있다 — 공개해도 되는지 사용자 확인 |
| 커밋 작성자 이메일 | 공개 저장소에서는 커밋마다 보인다 — GitHub noreply 주소로 바꿀지 결정 |
| 기여 조건(CLA) | 외부 기여를 받기 전에 정한다. 나중에 AGPL이 아닌 닫힌 상용판을 낼 가능성이 있으면 CLA가 필요하고, 아니면 지금처럼 'AGPL로 기여'(CONTRIBUTING) |
| 공개 홈 · 약관 | 셀프호스트에서는 운영자가 약관 주체 — 공개 화면 약관 문구를 '운영자' 기준으로. 프로젝트 소개 사이트(GitHub Pages)로 홈을 따로 둘지 |
| CI 첫 실행 | 저장소에 올린 뒤 확인 |
| Windows 설치 | PowerShell 설치 스크립트 — 후속 |

## 5. 결정 74(공개 서비스 기준)와의 관계
- 출시 순서는 **R1 오픈소스 먼저**, 관리형 서비스(R2)는 나중에 다시 판단한다(PRD §4 그대로).
- 홈 · 회원가입 · 로그인 화면과 계정 모드(`AUTH_MODE=accounts`)는 **서버에 올려 쓰는 사람의 선택 기능**으로 남긴다. 기본은 지금처럼 로컬 모드(로그인 없이 바로 사무실).
- 계정별 사무실 분리(H2) · 실제 구글 · 메일은 R2를 다시 판단할 때까지 미룬다.

## 6. 공개본 내보내기 (결정 83, 첫 공개 2026-10-08)
- 공개 저장소: `github.com/axseungpyo/crewloft`(main). 개발은 비공개 `agent-office`에서 하고, 정리본을 커밋 하나씩 내보낸다. 작성자는 GitHub noreply 주소(`98517097+axseungpyo@users.noreply.github.com`).
- **빼는 것:** `prototype/` · `docs/mockups/` · `docs/superpowers/` · `docs/product/{history,research,outreach,qa,reviews}/` · 모든 `CLAUDE.md` · `README.ko.md`(공개 README에 합침).
- **내보낼 때 바꾸는 것:** 빠진 문서로 가는 링크는 글자만 남김 · `README.md` = 소개 저장소 README + 설치 · 사용 안내(영어판은 `README.en.md`) · `images/`(소개 스크린샷) · 저장소 주소 `agent-office` → `crewloft`(`web/js/lib.js` SOURCE_URL · `scripts/install.sh` · `package.json` · `.github/ISSUE_TEMPLATE/config.yml`).
- **확인:** 개인 흔적 검사(실명 · 이메일 · 내 컴퓨터 경로 · 작업 공간 경로) · 공개본에서 `npm ci` → 테스트 · 타입 검사 · 로그인 없이 README · 설치 스크립트 열림 · 한 줄 설치 → `agent-office doctor`.
- 후속: 위 과정을 스크립트(`scripts/export-public.sh`)로 — 기술 쪽에 맡김 예정.
