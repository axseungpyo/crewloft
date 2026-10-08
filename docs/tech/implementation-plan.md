# Agent Office — 기술 구현 계획 (사업 맞춤 셋팅 · R0 기능 완성)

작성일: 2026-10-04 · 상태: **P1 구현됨**(a421d3f, 결정 78), **P2 엔진(기술 T1–T7) 구현됨**(tech-dev 브랜치, 2026-10-05 — 아래 '진행 상태'). P2부터는 [P2 나눠 맡기기 계획](../product/plans/p2-blocks-plan.md)을 따른다. 나머지(P3 · P4)는 제안.
기준: [백엔드 기술 설계 검토](backend-design.md)(AI 직원 실행 · 프롬프트 · 컨텍스트 · 로그인 · DB) · [PRD](../product/PRD.md) · [결정 73 · 사업 맞춤 셋팅](../product/specs/business-setup.md) · 제품 검토 10-04 · [MVP 구조](architecture.md)
근거는 2026-10-04 `office-3d` 브랜치의 코드다(경로는 저장소 기준, `파일:줄`).

## 0. 한눈에
1. **실행기는 이미 일반적이다.** 업무 실행기(`src/engine/runner.ts`)는 업무 종류를 모르고 '의존 → 인계 수락 → 실행 → 결과물 저장'만 한다. 콘텐츠 가정은 **회차를 만드는 곳 · 업무 종류 · 브리프 · 결정 종류 · 성장 계산 · 화면 상수**에 몰려 있다. 갈아엎지 않고 이 여섯 곳을 블록 기준으로 바꾸면 결정 73이 된다.
2. **새 개체는 셋:** 업무 블록 카탈로그(코드) · 사업 설계도(표, 버전) · 이번 달 계획(첫 결과물 '사업 진단 + 이번 달 실행 계획'을 대표가 확인한 것).
3. **새 결정 '결과물 확인'이 필요하다.** 지금 수정 요청(이번만 / 앞으로도) · 배운 것 경로는 게시 확인에만 있다. 문서 · 표 · 체크리스트도 같은 경로로 고치게 한다.
4. **성장 계산이 게시에 묶여 있다.** 채택률 · 승급 · 사무실 레벨 업 · 마일스톤이 `publish_confirm`과 실제 게시를 센다. 게시가 없는 사업은 승급 · 레벨 업이 영영 안 된다 — 블록 엔진과 함께 일반화한다.
5. **실제 AI 검증 도구를 P1과 같이 만든다.** 제품 검토의 위험 1(핵심 루프가 실제 AI로 한 번도 돌지 않음)은 블록 수가 늘수록 커진다. 응답 기록 · 재생 · 평가 실행을 먼저 깐다.

| 단계 | 내용 | 크기 | 끝나면 |
| --- | --- | --- | --- |
| P0 정리 | 진행 중인 3D 작업 정리, 스키마 이전 전 자동 백업, AI 응답 기록 | 작음 | 실제 AI를 켜면 응답이 남는다 |
| P1 온보딩 · 첫 결과물 | 사업 인터뷰 → 사업 설계도 → 매니저 단독 첫 회차 → 결과물 확인 | 큼 | 빈 상태에서 첫 확인까지 |
| P2 업무 블록 엔진 | 카탈로그 · 회차 조립 · 문서함 · 콘텐츠 운영을 블록으로 · 성장 계산 일반화 | 큼 | 이번 달 계획대로 주간 회차가 돈다 |
| P3 직무 · 채용 · 공간 | 직무 정의 한 곳으로, 분석가, 설계도 기반 채용 · 공간 설계 | 중간 | 설계도가 팀 · 공간까지 정한다 |
| P4 기준 · 검증 | R0 완료 기준 개정, 실제 AI 평가(사용자), 화면 자동 점검, 3D 저사양 모드 | 중간 | R0 '기능 완성' 판정 |

### 진행 상태 (2026-10-05)
- **P1 구현됨 — a421d3f**(조정자 Business planning 터미널). 아래 §1–§2는 P1 전 코드 기준의 검토다.
- 계획과 다른 점(결정 78):
  1. 사업 인터뷰는 **뼈대 고정 + 매니저(AI)는 선택지 · 덧붙일 질문만** — §9-3 제안 채택.
  2. **P1에 최소 업무 블록 엔진을 함께 넣었다** — 카탈로그 11개(`src/blocks/catalog.ts`) · 확정한 실행 계획 기반 회차 조립 · 결과물 확인(`artifact_confirm`) · 이전 회차 입력(`task.meta.inputs`). 계획대로면 킥오프 뒤 회차가 콘텐츠 운영으로 돌아가 결정 73과 어긋나서다.
  3. 채용 순서는 **고른 블록이 필요로 하는 직무만** 남긴다.
- 계획과 같은 점: 스키마 v7 = `blueprints` · `cycles.blocks`. P0 항목 중 '스키마 이전 전 자동 백업'도 됐다.
- **P2 엔진 구현됨(Technology development, `tech-dev` 브랜치 — [p2-blocks-plan](../product/plans/p2-blocks-plan.md) §3 T1–T7):** 결과물 모양(`meta.shape · table · items`) · 문서함 API · 내려받기 · 내 할 일(v8 `owner_todos`) · `flowBlocks` · `/api/meta` · 성장 일반화. 계약 §2의 이름 · 모양 그대로. P2 화면(D1–D6)은 Office design이 같은 계약으로.
- P2에서 §5 계획과 다르게 한 것: `TaskKind`를 `string`으로 바꾸지 않았다(`${블록}.${단계}` 템플릿 문자열로 충분), `WEEKLY_STEPS`는 `content_ops` 블록이 펼치는 그대로, `composeCycle`은 P1의 `startCycle` · `planCycle`을 그대로 쓴다, 경고 코드 · 점진적 공개(`unlocks`)는 하지 않았다(P3 이후 후보).

## 1. 지금 시스템 검토
### 1.1 구성과 상태
| 항목 | 상태 |
| --- | --- |
| 규모 | 서버 TS 약 7,000줄 · 화면 JS 약 6,100줄 + CSS 600줄 · 테스트 730줄 |
| 실행 | Node 24(타입 제거로 TS 바로 실행) · 내장 SQLite(WAL) · Preact + htm(import map) · three 0.180 — 빌드 없음 |
| 프로세스 | 하나: HTTP · SSE + 업무 실행기(0.5초) + 저장 · 게시 실행기(1초) + 예약 실행기(1초) |
| API · 저장 | API 79개(경로 × 메서드) · 스키마 v5 · 표 24개 |
| 검사 | `npm test` 23개 통과 · `npm run typecheck` 통과(2026-10-04) |
| 브랜치 | `office-3d`가 `master`보다 18커밋 앞, 원격 없음. 커밋 안 된 3D 작업(시간대별 하늘 `web/js/office3d/sky.js` · 간판이 카메라를 봄) 있음 |
| Claude CLI | 설치본 2.1.288에서 쓰는 플래그(`--json-schema` `--tools` `--safe-mode` `--permission-prompts` `--strict-mcp-config` `--no-session-persistence` `--max-budget-usd`)가 모두 있음을 확인. 실제 호출은 0회 |

### 1.2 그대로 쓰는 설계
- **변경 + 활동 이벤트를 한 트랜잭션으로**(`repo.tx` · `emit`) — 화면 · 모션 · 복귀 요약의 유일한 근거.
- **업무 상태 전이표**(`src/core/task-state.ts`) — 허용 안 된 전이는 저장소가 거부.
- **업무 실행기**(`runner.ts:124–300`) — 의존 · 인계 · 한도 대기 · 재시도 · 사람 우선(`AIGate`). 업무 종류와 무관하다.
- **결과물 버전**(`itemId` + `version`)과 **결정 = 버전 스냅샷**(내용이 바뀌면 `stale`).
- **외부 행동 중복 방지 키** · 결과 불명확 → `확인 필요` · 연습 게시 기본.
- **AI 요청 한 모양**(`complete` + JSON Schema) · 가짜 AI가 같은 형식 · 응답이 형식에 안 맞으면 지어내지 않고 실패.

### 1.3 결정 73을 막는 콘텐츠 가정
| # | 위치 | 지금 | 바꿀 방향 |
| --- | --- | --- | --- |
| 1 | `src/core/roles.ts:60` `WEEKLY_STEPS`, `src/engine/cycle.ts:49` | 회차 = 콘텐츠 11단계 고정 | 이번 달 계획의 블록으로 회차를 조립(§2.3) |
| 2 | `src/core/types.ts:92` `TaskKind`, `src/ai/tasks.ts:38–110` | 업무 종류 11개 유니온, 지시문 · 형식 · 도구가 한 파일 | 블록 정의로 옮기고 종류는 카탈로그에서 찾음(§2.1) |
| 3 | `types.ts:34` `Brief`, `src/ai/prompts.ts:49`, `tasks.ts:118` | 대상 독자 · 채널 · 분량이 모든 직원 프롬프트에, 모든 업무에 `채널:` 줄 | 프롬프트엔 설계도 요약, 채널 · 분량은 콘텐츠 운영 블록 설정으로 |
| 4 | `src/engine/onboarding.ts:11–20 · 133`, `src/ai/hire-prompts.ts:67` | 기획 회의 = 독자 · 채널 · 분량, 채용 로드맵은 리서처 · 작가 · 디자이너만 | 사업 인터뷰 · 사업 설계도(§2.6) |
| 5 | `src/engine/decisions.ts:26 · 58` | 수정 요청 · 배운 것 경로가 `publish_confirm`에만 | 결과물 확인 결정과 공용 수정 경로(§2.4) |
| 6 | `src/engine/growth.ts:51 · 77`, `src/engine/office-growth.ts:30 · 38 · 41`, 마일스톤 '첫 게시 · 누적 게시 30' | 채택률 · 승급 · 레벨 업 · 마일스톤이 게시 확인 · 실제 게시를 셈 | 확인 종류 일반화(§2.5) |
| 7 | `src/core/roles.ts:81` `FLOW_STAGES`, `src/server/views.ts:21` | 도크 · 회차 보드 = 조사 … 게시 7단계 | 이번 주 블록 띠(§2.8) |
| 8 | 화면: `web/js/screens/onboarding.js:132–195`, `content.js:6–8`, `calendar.js:4`, `decisions.js:12–15 · 66 · 75`, `office3d/build.js:31` | 회의 질문 · 브리프 카드 · 7단계 보드 · 플랫폼 레인 · 게시 미리보기가 화면에 박혀 있음 | 서버가 블록 · 업무 종류 · 결정 종류 정보를 내려줌(§2.8) |
| 9 | `src/ai/fake-data.ts` | 견본이 콘텐츠 업무 종류별 | 블록별 견본(블록 파일 안) |

### 1.4 검토 중 찾은 문제
| 문제 | 근거 | 처리 |
| --- | --- | --- |
| **회차 보드 · 장부에 결정 71의 업무가 안 보임** — SEO 키워드 · 교정 · 숏폼 대본 · 배포 계획 | 화면이 서버 `FLOW_STAGES`를 복사해 쓰는데(`content.js:6–8`) 새 종류를 안 넣음 | 버그. P2에서 서버가 내려주는 값으로 바꾸면 없어짐(그 전에 급하면 한 줄 수정) |
| 같은 표가 여러 파일에 복사됨 — 플랫폼 이름 4곳, 상태 이름 2곳, 직급 이름 3곳 | `decisions.js:12` · `settings.js:11` · `calendar.js:4` · `onboarding.js:170` 등 | `/api/meta`(§2.8) |
| 결정함이 서버 경고 **문장**을 찾아 버튼 문구를 정함('드라이런' · '썸네일' · '연결') | `decisions.js:15 · 85–86` | 경고를 코드 + 문장으로(`{ code, text }`) |
| SSE 이벤트 하나마다 열린 화면의 모든 API를 다시 읽음 | `web/js/lib.js:41–47 · 113` | 이벤트 종류 → 다시 읽을 API 표(P2 이후, 실사용에서 느려지면) |
| 3D가 저사양에서 무거움 — 계속 그림(30fps, 20초 입력 없으면 12fps), 4096² 부드러운 그림자 매 장면, GTAO(16+16 샘플), 4× MSAA, 거의 모든 물건이 개별 메시 | `web/js/office3d/stage.js:14–27 · 96–110`, `office3d/office.js:32–42`, `props.js:14–18` | P4 화질 단계(§4) |
| 사무실 화면을 쓰는 동안 버리는 3D 물체를 해제하지 않음, 화면에 올 때마다 장면 전체를 새로 지음 | `office3d/office.js:73–80 · 225 · 262–276`, `build.js:100–103` | P4 |
| WebGL은 `WebGL2RenderingContext`가 있는지만 봄, 문맥 잃음(`webglcontextlost`) 처리 없음 | `screens/office.js:327`, `office-mini.js:14` | P4 — 잃으면 2D로 |
| 화면 자동 테스트 없음 | `tests/`는 서버 · 순수 모듈만 | P4 |
| 상태가 `settings` 키-값 JSON에 흩어짐(`space.spec` 3KB · `space.built` · `space.works` · `hiring.roadmap` · `onboarding.*`) | `src/engine/space.ts` · `onboarding.ts` | 설계도는 표로(버전 · 확인 기록이 필요). 공간은 그대로 둠 |
| 스키마 이전 전에 백업이 없음 | `src/store/db.ts:312` `migrate` | P0 — 적용 전 `office.db.v{N}.bak` 복사 |
| 진행 중인 3D 작업: 해가 4°까지 내려가도 그림자 범위가 고정이라 잘릴 수 있고, 밤에도 4096² 그림자를 그림. `.playwright-mcp/`가 `.gitignore`에 없음 | `sky.js`, `office3d/office.js:32` | P0 — 마무리 · 커밋할 때 |

## 2. 목표 구조
```
사업 소개 → 매니저 면접(지금 그대로) → 사업 인터뷰 ─AI→ 사업 설계도 v1 ─대표 확인→ 설계도(확정)
                                                                         │
첫 회차: 킥오프 블록(매니저) → '사업 진단 + 이번 달 실행 계획' ─결과물 확인─→ 이번 달 계획(주차별 블록)
                                                                         │
매주: 회차 조립기 = 계획의 이번 주 블록 × 채용된 직무 → 업무 DAG → 업무 실행기(그대로)
      → 결과물(문서 · 표 · 체크리스트 · 초안 · 게시물) → 확인이 필요한 것만 결정함 → 문서함
```

### 2.1 업무 블록 카탈로그 — 코드로 둔다
블록마다 지시문 · 응답 형식 · 견본 · 테스트가 한 묶음이어야 품질을 관리할 수 있다(business-setup §2 "엔진에 추가하는 건 개발 몫"). 그래서 DB가 아니라 `src/blocks/`에 블록당 파일 하나로 두고, 설계도는 블록 id만 가리킨다.

```ts
// src/blocks/types.ts (제안)
export type Shape = 'doc' | 'table' | 'checklist' | 'post';
export type BizStage = 'idea' | 'prep' | 'launch' | 'operate';
export interface BlockStep {
  step: string;                       // 업무 종류 = `${blockId}.${step}` (콘텐츠 운영만 옛 이름 그대로)
  role: Role; title: string;
  deps: string[];                     // 블록 안 단계
  shape: Shape;
  guide: string;                      // 지시문
  extra?: Record<string, unknown>;    // 형식에 더할 필드(JSON Schema)
  tools?: string[];                   // 조사 계열만 WebSearch · WebFetch
  confirm?: 'owner' | 'publish';      // 끝나면 결과물 확인 / 검수 뒤 게시 확인
}
export interface BlockDef {
  id: string; name: string; purpose: string;
  stages: BizStage[] | 'any';
  cadence: 'once' | 'weekly' | 'monthly';
  steps: BlockStep[];
  needs?: string[];                   // 앞 블록 — 이번 회차에 없으면 문서함의 최신 확인본을 받는다
  sensitive?: boolean;                // 법 · 세무 · 인허가: '확인 필요(전문가)' 필수, 화면 배지
  aiRequests: number;                 // 설계도 화면의 예상 AI 요청 수
  version: number;                    // 지시문 버전 → 결과물 meta.prompt = `${id}@${version}`
  sample(ctx: SampleCtx): Record<string, unknown>; // 가짜 AI 견본
}
```
- **결과물 모양은 넷뿐**: `doc`(마크다운) · `table`(`columns` · `rows`) · `checklist`(`items: { text, owner: 'ceo' | 'team', due? }`) · `post`(콘텐츠 운영의 지금 형식). 공통 필드는 `title · body · note · sources · assumptions[] · expertCheck[]`. 화면 그리는 틀이 넷이라 블록을 더해도 화면 코드는 늘지 않는다.
- **업무 종류**: `TaskKind` 유니온을 `string`으로 바꾸고 `stepOf(kind)`로 카탈로그에서 찾는다. 모르는 종류는 형식 오류로 실패. 기존 11종은 `content_ops` 블록의 단계 이름으로 그대로 남아 옛 데이터가 읽힌다.
- **지금 `tasks.ts`의 일**(`buildTaskRequest` · `parseTaskOutput`)은 모양별 공용 함수가 되고, 종류별 분기(블로그 excerpt · SNS posts · 이미지 prompts …)는 `content_ops` 블록 파일로 옮긴다.
- **첫 카탈로그**(P2, business-setup §2에서 고름): `kickoff`(사업 진단 + 이번 달 실행 계획) · `monthly_plan` · `weekly_retro` · `market_research` · `customer_interview` · `problem_canvas` · `pricing`(sensitive 아님, 가정 표시) · `prep_checklist`(sensitive) · `landing_copy` · `first_customers` · `content_ops`. 나머지(브랜드 기초 · 도구 비교 · 출시 공지 · 문의 답변 틀 · 숏폼 대본)는 P2 뒤에 같은 방식으로.

### 2.2 사업 설계도
- **표 `blueprints`**(스키마 v7 — v6은 계정, 결정 74): `id · version(고유) · status(draft | confirmed | superseded) · data(JSON) · source(ai | owner | legacy) · request_id · created_at · confirmed_at`. 대표가 고치면 새 버전, 확정은 한 번에 하나.
- **모양**(AI 응답 형식 = 저장 모양):
```ts
interface Blueprint {
  summary: string; stage: BizStage; stageWhy: string;
  customer: string;                                    // 모르면 '(가정)'
  goals: Array<{ text: string; check: string }>;      // 이번 달 1–3개, 확인 방법
  blocks: Array<{ id: string; why: string; config?: Record<string, unknown> }>; // 콘텐츠 운영의 채널 · 분량은 config
  hiring: Array<{ role: Role; why: string; when: string }>;
  split: { owner: string[]; team: string[] };         // 대표가 할 일 vs AI 팀이 할 일
  destinations: string[];                              // 기본 문서함, Notion · Docs는 선택
  assumptions: string[];
  ideas: string[];                                     // 카탈로그에 없는 블록 제안(개발 몫)
}
```
- **보정**: 공간 설계도처럼 서버가 고쳐서 받는다 — 카탈로그에 없는 블록은 `ideas`로, 단계에 안 맞는 블록은 표시, 목표는 3개까지, 없는 직무는 뺀다. 형식 자체가 틀리면 지어내지 않고 실패.
- **쓰이는 곳**: 직원 프롬프트의 '프로젝트' 줄(`prompts.ts:49`)은 설계도 요약 · 단계 · 이번 달 목표 · 가정으로. 채용 순서(`settings.hiring.roadmap` 대체). 공간 설계 입력(P3). `projects.brief`는 남기되 콘텐츠 운영 블록 설정으로만 읽는다.

### 2.3 이번 달 계획과 회차 조립
- **이번 달 계획 = 대표가 확인한 킥오프(또는 `monthly_plan`) 결과물.** 따로 표를 만들지 않는다. 결과물 `meta.weeks: [{ week, goal, blocks: [blockId] }]` · `meta.ownerTasks`. 결과물은 이미 버전이 있고 결정이 버전을 확인하므로 그대로 쓴다.
- **주차 계산은 달력이 아니라 회차 순서**: 계획을 확인한 뒤 시작한 회차 수 + 1 = 이번 주. 달 중간에 시작해도 어긋나지 않는다. 계획의 주를 다 쓰면 다음 회차는 `monthly_plan`(매니저)부터.
- **`composeCycle`**(`cycle.ts`의 `WEEKLY_STEPS` 반복을 대체):
  1. 확정된 설계도가 없으면 거절("설계도를 먼저 확인해 주세요").
  2. 확인된 이번 달 계획이 없으면 `kickoff` 블록만 — 매니저 혼자 할 수 있어 첫 결과물이 바로 나온다.
  3. 있으면 이번 주 블록 + `weekly` 주기 블록 + `weekly_retro`(마지막, 모든 업무에 의존).
  4. 블록 단계를 업무로 펼친다: `step = ${blockId}.${step}`, `itemId = ${cycleId}:${blockId}.${step}`. 블록 사이 `needs`는 이번 회차에 그 블록이 있으면 의존으로, 없으면 문서함의 최신 확인본 id를 `task.meta.inputs`에 넣는다.
  5. 없는 직무 → 지금처럼 `task_skipped` "○○ 채용 후 가능". 콘텐츠 운영 블록 안 규칙(채널 · 빠진 의존)은 지금 코드를 그대로 옮긴다.
- **실행기 변경은 한 곳**: `#inputsFor`(`runner.ts:177`)가 `task.meta.inputs`의 이전 회차 결과물도 받는다.
- **`cycles.blocks`**(v7 열): 이 회차를 만든 블록 목록 — 도크 · 회차 보드 · 복귀 요약이 읽는다. 회차 이름('10월 1주차') · 주간 예약은 그대로.
- **실행 시간 감**: Claude CLI 동시 실행 1(`CLAUDE_CONCURRENCY`), 업무 하나 1–5분(조사는 웹 검색으로 더 길 수 있음) → 블록 3–4개 회차는 10–30분(추정 — §3의 기록으로 실측값으로 바꾼다).

### 2.4 결과물 확인 — 새 결정 종류
- `artifact_confirm`(결정 종류만 더함, 표 변경 없음). 블록 단계가 `confirm: 'owner'`면 **그 업무가 끝나는 즉시** 연다 — 검수를 기다리지 않아 첫 확인이 빨라진다(제품 검토 위험 3). 콘텐츠 운영은 지금처럼 검수 뒤 게시 확인.
- 처리는 게시 확인과 같다: **승인 / 수정 요청**(문단 코멘트 + 이번만 · 앞으로도 → 같은 `itemId`의 수정 업무, 배운 것) **/ 보류**. `decisions.ts`의 수정 요청 부분(`:72–120`)을 `requestRevision(d)`로 떼어 두 결정이 같이 쓴다. 교정본 → 원래 작가 규칙도 그 안에 남긴다.
- 결재함 일괄 승인(시설 Lv2) · Slack 알림 · 복귀 요약 '결정해 주실 것'에 같이 들어간다.
- 확인된 결과물은 문서함에서 '확정'으로 보이고, 다음 블록이 입력으로 우선 받는다.
- **대표 할 일**(제안, §9-1): 확인된 체크리스트의 `owner: 'ceo'` 항목을 표 `owner_todos`로 옮겨 결정함 옆 '내 할 일'에 둔다. 체크는 대표가, 다음 `weekly_retro`가 진행을 읽는다.

### 2.5 성장 계산 일반화
| 계산 | 지금 | 바꾼 뒤(제안 — §9-2) |
| --- | --- | --- |
| 채택률(직원 숙련 · 승급) | 수정 없이 승인된 게시 확인 ÷ 처리된 게시 확인(`growth.ts:51`) | 확인 종류 = 게시 확인 + 결과물 확인 |
| 레벨 업 조건 '승인한 결과물' | 게시 확인 승인 수(`office-growth.ts:38`) | 두 확인 종류의 승인 수 |
| 레벨 4 조건 '실제 게시 30' | 실제 게시 성공(`:30 · 41`) | '확정한 결과물 30'. 게시는 콘텐츠 운영 블록을 쓸 때만 대체 조건 |
| 마일스톤 '첫 게시 · 누적 게시 30' | 실제 게시 | '첫 실행 계획 확정' · '확정한 결과물 30', 게시 마일스톤은 콘텐츠 블록이 있을 때만 보임 |
| 실적 자원 | 직무별 끝낸 업무 × 10 + 승인 × 3 | 그대로(블록이 바뀌어도 '끝낸 업무'). 새 직무는 자원 키 하나 추가 |

수치는 모두 임시값이고(결정 68–70), 실제 회차 속도를 보고 조정한다.

### 2.6 온보딩
| 지금 단계(`onboarding.ts:9`) | 바뀐 뒤 |
| --- | --- |
| describe → power → interview → meeting → roadmap → ready → done | **intro → describe → power → interview → setup → blueprint → first → done** |

- `intro`: 서비스 소개 · 예시 결과물 2–3개. 화면만(AI 없음).
- `interview`: 매니저 면접 그대로(`hire:interview`).
- `setup`(사업 인터뷰): **질문 뼈대는 고정**(단계 · 고객 · 가장 큰 막힘 · 이번 달 목표 · 가진 것 · 직접 하고 싶은 일), 매니저(AI)는 사업에 맞는 **선택지 칩과 덧붙일 질문 0–2개**만 만든다 — `setup:questions` 1회(제안, §9-3). '잘 모르겠어요'는 가정으로.
- `blueprint`: `setup:blueprint` 1회 → 설계도 화면(블록 켜고 끄기 · 순서 · 목표 고치기). 글로 고쳐 달라면 `setup:revise`. 확인하면 설계도 확정 + 채용 순서 + 공간 설계(P3).
- `first`: 첫 회차를 바로 연다(킥오프 블록, 매니저 단독). 두 번째 채용은 설계도 순서대로 이후에.
- **기존 사무실**(`onboarding.briefDone = true`): 시작할 때 설계도 v1을 합성한다 — `source: 'legacy'`, 블록은 `content_ops` 하나, 지금 브리프를 그 설정으로. 단계는 `done` 유지. `data-demo`도 그대로 돈다.
- **가짜 AI 견본 3종**: 카페 · 앱 서비스 · 온라인 판매(회사 설명 낱말로 고름 — 공간 견본과 같은 방식).
- 화면의 '/7' 퀘스트 수 · 컴포넌트 사이 전역 이벤트(`onboarding.js:16 · 25 · 94`) · 렌더 중 AI 요청(`:162 · 208`)은 이번에 같이 정리한다(중복 요청 위험).

### 2.7 직무
- 직무 하나를 더하면 지금 7–8곳을 고친다: `types.ts` `Role` · `roles.ts` `ROLE_LABEL` · `ROLE_KIN` · `space.ts` `RES` · `hiring.ts` `ARCHETYPES` · `hire-prompts.ts` 샘플 문구 · `fake-data.ts` · 화면 `species.js` · `space/generate.js:11`. → 서버는 `src/core/role-defs.ts` 한 곳, 화면은 `/api/meta`로 받는다(3D 외형 표 `species.js`만 화면에 남음).
- 새 직무는 **분석가**(가격 · 원가 · 손익 표) 하나. 나머지 블록은 기존 8직무로 덮인다.
- 채용 추천 = 설계도 `hiring` 순서. 매니저 한 명 · 다른 직무 여러 명 · 이름 중복 막기는 그대로.

### 2.8 화면
| 화면 | 바뀌는 것 |
| --- | --- |
| 공통 | `GET /api/meta` — 직무 · 업무 종류 이름 · 블록 요약 · 결정 종류 · 플랫폼 · 상태 이름 · 경고 코드. 복사된 표를 지운다 |
| S3 온보딩 | §2.6 단계, 설계도 화면(블록 카드 · 목표 · 대표 vs 팀 · 가정) |
| S1 사무실 도크 · 3D 회차 보드 | 7단계 → **이번 주 블록 띠**(블록마다 담당 · 상태 · 막힘). 콘텐츠 운영 블록만 있으면 지금 7단계 그대로. 3D 보드는 칸 수가 바뀌어도 되게(`build.js:31`의 고정 간격) |
| S5 콘텐츠 → **일** | 탭: 회차 보드(블록 띠) · **문서함**(블록별 최신본 · 확정 표시 · 버전 · 내려받기) · 캘린더(콘텐츠 운영 블록이 있을 때만). 지표 카드 이름 일반화 |
| S2 결정함 | 결과물 확인 작업대 — 모양 네 개 미리보기(doc · table · checklist · post), 문단 코멘트는 doc · checklist만 |
| 회사 · 복귀 요약 | 지표 · 마일스톤 이름(§2.5) |

- 메뉴 이름 '콘텐츠' → '일'은 제품 결정(§9-4).
- 문서 한 개 내려받기는 핵심 기능이라 잠그지 않는다. 회차 결과물 한 번에 내려받기는 지금처럼 시설 Lv2 편의 기능.

## 3. 실제 AI 검증 도구 (R0 게이트 위험 1)
지금 Claude CLI 연결은 구현됐지만 실제 호출은 0회다. 블록이 늘면 지시문 · 형식도 늘어나므로, 실제 응답을 남기고 다시 쓰는 길을 먼저 만든다. 실행은 사용자가 한다(외부 호출).

| 도구 | 하는 일 | 위치(제안) |
| --- | --- | --- |
| 응답 기록 | `AI_RECORD=1`이면 모든 `complete` 호출의 목적 · 프롬프트 · 형식 해시 · 응답 · 사용량 · 걸린 시간 · 오류 종류 · CLI 버전을 `data/ai-log/날짜/`에 남김. 이 컴퓨터에만 | `src/ai/recorder.ts`(공급자 감싸기) |
| 재생 | 기록을 테스트에서 재생 — 실제 응답 모양으로 파서 · 흐름 회귀 테스트(외부 호출 없음) | `src/ai/replay.ts` + `tests/fixtures/ai/`(검토한 견본 사업 기록만) |
| 평가 실행 | `npm run eval -- --biz cafe,app,shop --blocks kickoff,market_research` — 견본 사업 3종 × 블록을 실제 AI로 돌리고 시간 · 비용(API 환산) · 형식 실패 · '(가정)' 수 · 출처 수 · 전문가 확인 표시를 표로. 품질 판단은 사람 | `scripts/eval.ts` → `data-eval/report-날짜.md` |

- 순서: P1 끝에 설계도 · 킥오프만 → P2 끝에 카탈로그 전체 → P4에서 R0 판정.
- CLI 업데이트로 출력 모양이 바뀔 수 있다 — 기록에 CLI 버전을 남기고, 형식 실패가 늘면 버전부터 본다.
- 한도 메시지 모양(`classifyError` · `parseReset`, `src/ai/claude-cli.ts:75–103`)은 실제 한도에 닿았을 때의 기록으로 확인한다(완료 기준 6).

## 4. 3D 저사양 모드 (P4)
| 항목 | 지금 | 제안 |
| --- | --- | --- |
| 화질 단계 | 하나(높음) | 높음 / 보통 / 낮음. 첫 2초 프레임 시간으로 자동 선택, 설정에서 바꿈 |
| 그림자 | 4096² PCF 부드러운 그림자, 매 장면 다시 그림 | 보통 2048² · 낮음 끔. 움직임이 있을 때만 다시 그림(`shadowMap.autoUpdate = false`) |
| 주변광 가림(GTAO) · MSAA | 16+16 샘플 · 4× | 보통 8 샘플 · 2× / 낮음 끔 |
| 픽셀 비율 | 기기 값(최대 2) | 낮음 1 |
| 물건 | 거의 개별 메시(책만 인스턴싱) | 낮음에서 이미 있는 저폴리 경로(`props.js:14` `kit.flat`)를 켬, 같은 물건은 인스턴싱 |
| 해제 · 재구성 | 버리는 물체 해제 안 함, 화면 올 때마다 전체 재구성 | 해제 정리, 설계도 판(`space.rev`)이 같으면 장면 재사용 |
| 문맥 잃음 | 처리 없음 | `webglcontextlost` → 2D 사무실로 |

- 먼저 잰다: `?debug3d`에 그리기 호출 수(`renderer.info.render.calls`) · 프레임 시간 표시. 기준 기기를 정한 뒤 목표치를 정한다(예: 보통 화질 30fps).

## 5. 단계별 작업
### P0 정리 (작음)
- 진행 중인 3D 작업 마무리 · 커밋(그림자 범위, 밤 그림자 끄기), `.playwright-mcp/`를 `.gitignore`에.
- `migrate`가 적용 전에 `office.db.v{N}.bak`을 만든다.
- 응답 기록(`recorder.ts`) — 지금 흐름 그대로 실제 AI를 켜 볼 수 있게.
- (급하면) 회차 보드 · 장부의 결정 71 업무 누락 한 줄 수정.

### P1 온보딩 · 첫 결과물 (큼) — 구현됨(a421d3f · 결정 78)
- 서버: 스키마 v7(`blueprints` · `cycles.blocks`) + 기존 사무실 설계도 합성 · 온보딩 단계(§2.6) · AI 요청 `setup:questions` · `setup:blueprint` · `setup:revise`(형식 · 보정 · 가짜 견본 3종) · 최소 카탈로그(`kickoff` + `content_ops` 껍데기) · `composeCycle`(계획 없으면 킥오프만, 있으면 아직은 콘텐츠 운영) · `artifact_confirm` + `requestRevision` 분리.
- 화면: S3 새 단계 · 설계도 화면 · 결정함 doc 미리보기 · 첫 회차 시작.
- 테스트: 온보딩(빈 상태 → 설계도 확정 → 킥오프 → 결과물 확인 → 수정 요청 앞으로도 → 배운 것), 기존 사무실 합성, 엉성한 설계도 보정.
- 완료: 빈 상태에서 매니저 한 명으로 '사업 진단 + 이번 달 실행 계획'이 결정함에 오고, 승인 · 수정 요청이 된다. 기존 데모 사무실이 그대로 돈다.

### P2 업무 블록 엔진 (큼) — 엔진 구현됨(tech-dev, 2026-10-05), 화면은 Office design 진행 중
- 서버: `src/blocks/` 카탈로그(§2.1 첫 카탈로그) · `TaskKind` → `string` · `WEEKLY_STEPS`를 `content_ops`로 · 계획 기반 `composeCycle` · 이전 회차 입력 · 문서함 API · 성장 계산 일반화(§2.5) · `/api/meta` · 경고 코드 · `flowView`를 블록 띠로 · (선택) 대표 할 일.
- 화면: 도크 · 3D 보드 블록 띠 · 문서함 · 결정함 table · checklist 미리보기 · 복사된 표 제거.
- 테스트: 블록마다 견본 → 형식 → 저장, 조립기(설계도 × 채용 직무 × 주차 → 업무 DAG · 빠진 직무 · 이전 회차 입력), 성장 일반화, v5 데이터 → 콘텐츠 운영 블록으로 읽힘.
- 완료: 설계도의 블록으로 한 달 계획이 주차별로 돌고 결과물이 문서함에 쌓인다. 콘텐츠 운영 블록을 고르면 지금 흐름 그대로 게시 확인까지.

### P3 직무 · 채용 · 공간 (중간)
- `role-defs.ts` · 분석가(원형 2 · 샘플 · 자원 · 3D 자리표시) · 설계도 기반 채용 추천 · 공간 설계 요청(`space:design`)에 설계도 요약 · 직무 · 블록을 넣음.
- 완료: 설계도가 채용 순서와 공간을 정한다.

### P4 기준 · 검증 (중간)
- PRD §12 R0 완료 기준 개정(3번 문장은 PRD에 예고된 대로), 평가 실행(사용자), 화면 자동 점검(핵심 흐름 3개 × 화면 폭 3개, Playwright — 개발 의존성 추가), 3D 저사양 모드(§4), 디자인 QA.
- 완료: R0 '기능 완성' 판정 → 3주 실운영 시작.

## 6. 데이터 이전 (v7)
```sql
CREATE TABLE blueprints (id TEXT PRIMARY KEY, version INTEGER NOT NULL UNIQUE, status TEXT NOT NULL,
  data TEXT NOT NULL, source TEXT NOT NULL, request_id TEXT, created_at TEXT NOT NULL, confirmed_at TEXT);
ALTER TABLE cycles ADD COLUMN blocks TEXT NOT NULL DEFAULT '[]';
UPDATE cycles SET blocks = '["content_ops"]';           -- 지금까지의 회차는 모두 콘텐츠 운영
-- v8(P2, 구현됨): owner_todos(id, text, due, source 'plan'|'checklist', artifact_id, item_id, status, done_at, created_at)
--   같은 결과물(item_id)의 새 버전을 확정하면 같은 글은 건너뛰고 새것만 더한다
```
- 코드 이전(시작할 때 한 번): 사업이 있고 설계도가 없으면 v1 합성(§2.6). `DATA_TABLES`(`db.ts`)에 새 표 추가 — 내보내기 · 초기화에 들어가게.
- 결정 종류 `artifact_confirm` · 업무 종류 이름은 문자열이라 표 변경 없음.
- 되돌리기: 적용 전 백업 파일(P0)로.

## 7. 테스트 계획
| 테스트 | 내용 | 단계 |
| --- | --- | --- |
| `setup.test.ts` | 사업 인터뷰 → 설계도(보정) → 확정 → 첫 회차 = 킥오프만 | P1 |
| `confirm.test.ts` | 결과물 확인 승인 · 수정 요청(이번만 / 앞으로도) · 내용 바뀌면 다시 확인 · 일괄 승인 | P1 |
| `legacy.test.ts` | v6 데이터(콘텐츠 회차) → v7에서 설계도 합성 · 회차 · 결과물 · 게시가 그대로 읽힘 | P1 |
| `blocks.test.ts` | 카탈로그의 모든 블록: 견본 → 형식 검사 → 결과물 모양 | P2 — 됨 |
| `compose.test.ts` | 설계도 × 채용 직무 × 주차 → 업무 DAG, 빠진 직무, 이전 회차 입력, 계획 끝 → 월 계획 | P2 |
| `growth.test.ts` 고침 | 게시 없는 사업도 채택률 · 승급 · 레벨 업 | P2 — 됨(레벨 4 조건 · 마일스톤) |
| `work.test.ts` | 문서함 상태 · 내 할 일(확정 → 생김 → 체크 → 회고 입력) · 블록 띠(블록 · 콘텐츠 · 옛 사무실) · HTTP 계약 | P2 — 됨 |
| 재생 테스트 | 기록한 실제 응답으로 파서 · 흐름 | P2 이후 |
| 화면 점검 | 온보딩 · 결정함 · 사무실 × 390 · 768 · 1440px | P4 |

기존 23개는 계속 통과해야 한다(콘텐츠 운영 블록으로 같은 흐름).

## 8. 위험과 대응
| 위험 | 대응 |
| --- | --- |
| 설계도 품질이 곧 제품 품질인데 가짜 AI로만 확인 | §3 평가 실행을 P1 끝에 바로. 설계도 형식은 보정으로 받고, 대표가 고칠 수 있게 |
| 블록 지시문이 늘면 품질 관리가 어려움 | 블록 = 지시문 · 형식 · 견본 · 테스트 한 묶음, `meta.prompt` 버전으로 전후 비교 |
| 법 · 세무 · 인허가 내용을 지어냄 | `sensitive` 블록은 `expertCheck` 필수 · 화면 배지 · '전문가 확인 필요' 문구 |
| 기존 데이터 · 데모가 깨짐 | 설계도 합성 + `legacy.test.ts` + 이전 전 백업 |
| 회차가 실제 AI로 오래 걸림(동시 1) | 실측 후 블록 수 · 동시 실행 조정. 킥오프는 매니저 혼자라 첫 결과물은 빠름 |
| 무인 운영(VPS)이 Anthropic 회신 대기로 막힘 | 이번 범위 밖. 대안으로 API 키 연결(종량제)은 정책상 무인 실행이 가능하고 `AIProvider`에 그대로 붙는다(§9-5) |
| 화면 · 3D 회귀를 사람이 매번 확인 | P4 화면 자동 점검, 3D는 순수 모듈 테스트(지금 방식) 유지 |

## 9. 결정이 필요한 것
| # | 질문 | 제안 |
| --- | --- | --- |
| 1 | 대표 할 일(체크리스트의 대표 몫) 목록을 P2에 넣을까 | 넣는다 — '대표가 할 일 vs AI 팀이 할 일'(결정 73)이 화면에 남아야 함 |
| 2 | 게시가 없는 사업의 성장 조건 | 확정한 결과물 기준으로 일반화, 게시 조건 · 마일스톤은 콘텐츠 블록이 있을 때만 |
| 3 | 사업 인터뷰 질문 | 뼈대 고정 + AI는 선택지 · 덧붙일 질문만(예측 가능 · 테스트 가능) |
| 4 | 메뉴 '콘텐츠' → '일', 결정함에 '내 할 일' | 바꾼다 |
| 5 | 무인 운영 대안으로 API 키 연결을 먼저 만들까 | Anthropic 회신이 2주 넘게 없으면 만든다 |
| 6 | 점진적 공개(첫 회차 전엔 사무실 · 결정함만, 짓기 · 시설 · 배치는 레벨이 오르면) — 제품 검토 제안 | P2와 함께. 서버가 `unlocks`를 계산해 `/api/state`로 내려주면 화면은 숨기기만 |
