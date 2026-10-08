# Agent Office — 게시 연동과 구독 이용 조건 (R0 기준)

작성일: 2026-10-01
상태: 대상 플랫폼(Threads, LinkedIn, Ghost, WordPress)은 사용자 확정(결정 28–30). 아래 API 조건은 2026-10-01 공식 문서 조사 결과이며, 구현 방식은 기술 계획에서 확정한다. "미확인"은 공식 문서로 확인하지 못한 항목이다.

## 1. 플랫폼별 조건 요약
| 대상 | R0 가능 | 인증 | 예약 게시 | 이미지 | 토큰/재인증 | 주의 |
| --- | --- | --- | --- | --- | --- | --- |
| Threads | 가능 | OAuth 인가코드 (`threads_basic`, `threads_content_publish`) | API 예약 없음 → 자체 스케줄러 | **공개 URL 필수**(JPEG/PNG ≤8MB) | 장기 토큰 60일, 만료 전 갱신 가능 → 주기 갱신 작업 | 본인을 Threads Tester로 등록하면 앱 심사 불필요. 24h당 게시 250건 |
| LinkedIn (개인 프로필) | 가능 | 3-legged OAuth, HTTPS 콜백 사전 등록 | 예약 불가(생성 즉시 게시) → 자체 스케줄러 | 업로드 API로 직접 업로드 | 60일, 프로그래매틱 갱신은 파트너 전용 → **60일마다 사용자 재인가** | Share on LinkedIn 셀프서브, 심사 불필요. 회원당 하루 150요청 |
| LinkedIn (회사 페이지) | 사실상 불가 | — | — | — | — | 법인 대상 심사(Community Management API). R0 범위 밖 |
| Ghost | 가능 | Admin API Key로 JWT 서명(요청마다 생성) | 네이티브 지원(`status: scheduled`) | multipart 직접 업로드 | OAuth 없음 — 로컬/VPS 동일 | Ghost(Pro)는 Publisher 이상 플랜 필요, 셀프호스트는 제한 없음 |
| WordPress (셀프호스트) | 가능 | Application Password (HTTPS 필수) | `status: future` 가능하나 WP-Cron은 방문 시에만 실행 | `/wp/v2/media` 업로드 | 비밀번호 폐기 전까지 유효 | 정시 게시는 자체 스케줄러에서 게시 시각에 `publish` 호출 권장 |
| WordPress.com | 조건부 | OAuth2 | 미확인 | 미확인 | 서버측 토큰 만료 미확인 | 플랜별 API 제한 미확인 |

출처: developers.facebook.com/docs/threads (posts, get-started, long-lived-tokens), learn.microsoft.com/linkedin (share-on-linkedin, posts-api, authorization-code-flow, programmatic-refresh-tokens, images-api), docs.ghost.org/admin-api, ghost.org/pricing, developer.wordpress.org/rest-api, developer.wordpress.org/plugins/cron, developer.wordpress.com/docs/oauth2.

## 2. 제품 설계에 주는 영향 — 제안
- **예약은 Agent Office가 소유한다.** Threads·LinkedIn은 API 예약이 없고 WordPress 예약은 신뢰성이 낮다. 승인된 게시물은 Agent Office 스케줄러가 게시 시각에 실행한다. 따라서 예약 게시는 상시 실행 환경(VPS)이 필요하며, 로컬 실행 중 기기가 꺼져 있으면 게시가 밀린다는 사실을 표시한다. Ghost는 네이티브 예약을 쓸 수 있으나 일관성을 위해 방식을 기술 계획에서 정한다.
- **이미지 공개 호스팅이 필요하다.** Threads는 공개 URL의 이미지만 받는다. VPS 또는 오브젝트 스토리지에 승인된 이미지를 게시 직전에만 공개하는 방식을 검토한다. 승인 전 이미지를 공개 위치에 올리지 않는다.
- **재연결 UX가 운영의 일부다.** LinkedIn은 60일마다 사용자가 다시 인가해야 한다. 만료 7일 전 Slack/결정함 알림, 만료 시 해당 게시 업무만 "재연결 필요"로 대기시키는 흐름이 필요하다. Threads는 자동 갱신 작업을 두되 실패 시 같은 흐름을 쓴다.
- **게시 기록과 중복 방지.** 각 게시는 플랫폼, 계정, 승인 버전, 예약 시각, 실행 결과, 게시 URL을 기록한다. 결과가 불명확하면 재게시하지 않고 플랫폼에서 확인하거나 사용자 확인을 받는다(기존 원칙).
- **설정 → 연결된 앱**에 게시 플랫폼 4종을 추가한다. 연결 상태 외에 "토큰 만료일"과 "예약 실행 가능 여부(상시 실행 환경 필요)"를 표시한다.

## 3. AI 구독 이용 조건 재확인 — 2026-10-01
### Claude
- Agent SDK 문서: "Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK."
- Legal and compliance: 제3자 개발자가 자기 앱에 Claude.ai 로그인을 제공하거나 사용자를 대신해 Free/Pro/Max 자격으로 요청을 중계하는 것, Claude.ai 자격증명·세션 토큰을 수집·저장·중계하는 것을 허용하지 않는다. 예외로 최종 사용자가 **수정하지 않은 Claude Code 바이너리**에 자신의 구독으로 로그인하는 것은 막지 않는다고 명시한다. Pro/Max 한도는 "ordinary, individual usage"를 전제로 한다.
- Consumer Terms: API 키 또는 명시적 허용이 없는 자동화·비인간적 접근을 제한한다.
- 해석(법률 판단 아님): 본인 기기에서 순정 Claude Code를 본인 구독으로 쓰는 것은 문서와 상충하지 않는다. 그러나 **무인 24시간 VPS 자동 운영을 개인 구독으로 하는 것을 명시적으로 허용하는 문장은 찾지 못했다(회색지대).** R2 SaaS에서 사용자 Claude 구독을 중계하는 것은 명시적으로 금지된다 → R2는 API 키 또는 Anthropic 사전 승인 필요.
- 출처: https://code.claude.com/docs/en/agent-sdk/overview , https://code.claude.com/docs/en/legal-and-compliance , https://www.anthropic.com/legal/consumer-terms

### ChatGPT / Codex
- app-server 인증은 상용·호스팅 서비스에 허용된 적이 없다고 명시. 로컬/오픈소스 앱은 사용 가능하나 Sign in with ChatGPT(파트너 신청) 이전을 권장.
- 인증 문서는 CI/CD 같은 프로그래매틱 워크플로에 API 키 인증을 권장한다.
- 이미지 생성: Codex 내장 이미지 생성(`gpt-image-2`)은 일반 Codex 사용 한도에서 차감되며 3–5배 빠르게 소진. Plus 이상. 공식 문서에 명시된 경로는 앱/대화형 CLI/IDE이며 **app-server·SDK·비대화형 실행에서의 지원은 미확인.**
- 출처: https://learn.chatgpt.com/docs/app-server.md , https://learn.chatgpt.com/docs/auth , https://learn.chatgpt.com/docs/image-generation.md , https://developers.openai.com/siwc

### 결론 — R0/R1/R2별
| 단계 | Codex 구독 | Claude 구독 | 이미지 생성 |
| --- | --- | --- | --- |
| R0 개인 | 로컬/개인 사용 가능 | 대화형·순정 CLI는 무난, 무인 자동 운영은 회색지대 | Codex 비대화형 지원 미확인 → 기술 스파이크로 검증, 안 되면 이미지 API 키 |
| R1 오픈소스 | 로컬/오픈소스 앱 허용, SIWC 이전 권장 | 순정 Claude Code에 사용자가 직접 로그인하는 구조 — 각자 자기 컴퓨터 · 서버에서 실행하므로 개인 사용(결정 77로 R1 먼저). 앱이 로그인 창을 띄우거나 구독을 중계하는 것은 승인 필요 | 동일 |
| R2 SaaS | app-server 인증 불가 → SIWC 파트너 또는 API 키 | 우리 앱이 구독을 중계 · 로그인 제공은 불가. **사용자별 실행 공간의 순정 Claude Code에 사용자가 직접 로그인**은 상용 약관 조건으로 가능(2026-10-04 재조사), 또는 API 키(사용자 · 우리) | API 키 |

### 2026-10-04 재조사 — "Aside는 Claude 구독으로 모델을 쓴다"(사용자 질문)
- **Aside:** 설정 › Models › Providers에서 Claude Pro/Max(및 ChatGPT 등) 구독을 OAuth 팝업으로 연결해 쓴다고 공식 도움말에 적혀 있다. 요금 · 약관 관계는 문서에 없다. Anthropic과 따로 합의가 있는지는 확인할 수 없다.
- **Anthropic 현재 문서(Legal and compliance):** 제3자 개발자가 자기 앱에 Claude.ai 로그인을 제공하거나 Free/Pro/Max 자격으로 사용자 요청을 중계하는 것, Claude.ai 자격증명 · 세션 토큰을 수집 · 저장 · 중계하는 것은 허용하지 않는다("sign-in to a Claude account must complete through Anthropic's own flow"). 2026-02-19 문서 갱신 뒤 강제 조치 보도가 있었다.
- **실제 운영(보고):** 2026-04부터 제3자 앱의 구독 OAuth 사용은 플랜 한도가 아니라 **추가 사용량(extra usage, 토큰당 과금)**에서 차감된다는 보고가 있다(JetBrains thinkrail #437). Agent SDK 사용분을 별도 월 크레딧으로 주는 안은 2026-06-15 보류됐다.
- **새로 확인한 허용 경로 — "Can customers offer Claude Code in their products?":** 상용 약관(Commercial Terms)에 동의하면 **수정하지 않은 Claude Code를 제품 · 서비스 안(호스팅 샌드박스 등)에 설치해 실행**할 수 있다. 조건: ① 바이너리를 고치지 않고 인증 방법(Claude 계정 로그인 · 사용자 API 키)을 막지 않는다 ② 사용자의 Claude 사용을 대신 결제 · 재판매 · 중계하지 않는다 — **각 사용자가 자기 API 키 · 자기 Claude 구독 · 자기 클라우드 자격으로 직접 인증하고, 사용량은 사용자에게 직접 청구**된다 ③ 이름 · 로고는 "Claude Code로 돌아가요" 수준만.
- **해석(법률 판단 아님):** 우리 앱이 Claude 로그인 창을 직접 띄우는 방식(Aside식 OAuth)은 합의 없이는 허용되지 않는다. 대신 **사용자별 실행 공간에서 순정 Claude Code를 돌리고, 사용자가 Claude Code 자체 로그인으로 자기 구독을 연결**하는 구조는 상용 약관 조건 안에서 가능하다. 지금 R0의 로컬 방식(사용자 PC의 순정 CLI)과 같은 구조를 서버로 옮긴 것이다. 플랜 한도는 'ordinary, individual usage' 전제라 자동 회차가 많으면 한도에 빨리 닿을 수 있다.
- 출처: https://docs.aside.com/help/ai , https://code.claude.com/docs/en/legal-and-compliance , https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan , https://github.com/JetBrains/thinkrail/issues/437 , https://gigazine.net/gsc_news/en/20260220-anthropic-third-party-block/

| R2에서 Claude를 쓰는 길 | 비용은 누가 | 판단 |
| --- | --- | --- |
| A. 사용자별 실행 공간에서 **순정 Claude Code** + 사용자가 **Claude Code 자체 로그인으로 자기 구독** 연결 | 사용자(자기 플랜) | **허용(상용 약관 조건)** — 사용자별 격리 실행 환경이 필요해 인프라가 무겁다 |
| B. 사용자가 **자기 API 키** 입력(BYOK) | 사용자(토큰당) | 허용 — 가장 단순, 비기술 사용자에겐 진입 장벽 |
| C. 우리 API 키로 제공 + 요금제 | 우리(요금에 포함) | 허용 — 요금이 AI 원가를 감당해야 한다 |
| D. 우리 앱에서 Claude 로그인 창(OAuth)을 직접 연결 | 사용자(추가 사용량으로 청구된다는 보고) | **합의 없이는 불가** — Anthropic 영업 문의(contact sales) |

## 4. 미확인 항목
- Threads 리다이렉트 HTTPS 강제/localhost 허용, 비즈니스 인증 요건.
- LinkedIn Share on LinkedIn 사용 시 Page 연결 필수 여부. API 버전 202510은 2026-10-15 종료 — 구현 시 최신 버전 확인.
- Ghost 레이트리밋. WordPress 미디어 업로드 바디 상세, WordPress.com 토큰 만료·플랜 제한.
- Codex 비대화형/app-server에서 이미지 생성 동작 여부, SIWC 사용량 범위.
- Anthropic: 개인이 본인 구독으로 무인 VPS 자동 운영을 하는 것의 명시적 허용 여부.
