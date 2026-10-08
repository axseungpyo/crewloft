# P2 업무 블록 — 기술 · 디자인 나눠 맡기기 (결정 73 · 78 · 79)

작성: 2026-10-05 Business planning(조정자). 사용자: "기술: 업무 블록 엔진 P2, 디자인: P2 화면"을 바로 넘김.
기준: [business-setup](../specs/business-setup.md) §2–§5 · 구현 현황, [기술 구현 계획](../../tech/implementation-plan.md) §2 · §5 P2, [ui-ux](../specs/ui-ux.md).
역할(결정 79): **Technology development** = 서버 · 엔진 · 테스트, **Office design** = 화면 · 3D · 문구, **Business planning** = 이 계획과 받아들이기(합치기 포함). 각자 자기 git 워크트리(브랜치)에서 일하고 조정자가 `office-3d`에 합친다.

## 0. P1에서 이미 된 것(다시 하지 않음)
업무 블록 카탈로그 11개(`src/blocks/catalog.ts`), 설계도 · 실행 계획 · 회차 조립(`planCycle`), 결과물 확인(`artifact_confirm`), 이전 회차 입력, 마크다운 표 · 체크리스트 표시, 회차 보드의 블록 칸(담당 직무로 7칸에), 채용 탭의 설계도 순서, 채택률 · 레벨 조건의 '승인한 결과물'.

## 1. 결정(이 계획에서 정함)
| # | 결정 | 이유 |
| --- | --- | --- |
| 1 | 결과물 모양은 **넷**: `doc`(마크다운) · `table` · `checklist` · `post`(콘텐츠 운영 그대로). 본문 마크다운은 늘 함께 저장(내려받기 · 옛 화면 · 검색용) | 화면 틀이 넷이면 블록을 더해도 화면 코드는 늘지 않는다 |
| 2 | 블록 단계별 모양: 문제 · 가설 한 장 = table, 가격 · 원가 = table, 준비 체크리스트 = checklist, 나머지 = doc(본문 안 표는 그대로) | 대표가 바로 고치고 체크할 것만 구조화 |
| 3 | **내 할 일**: 대표가 확인(확정)한 실행 계획의 `ownerTasks`와 체크리스트의 `[대표]` 항목이 '내 할 일'이 된다. 체크는 대표가, 다음 주간 회고가 진행을 읽는다 | 결정 73 '대표가 할 일 vs AI 팀이 할 일'이 화면에 남아야 한다(기술 계획 §9-1) |
| 4 | 게시 없는 사업의 성장: 레벨 4 조건 '실제 게시 30' → **'확정한 결과물 30'**, 마일스톤 '첫 게시 · 누적 게시 30' → **'첫 실행 계획 확정' · '확정한 결과물 30'**. 게시 마일스톤 · 조건은 설계도에 콘텐츠 운영이 있을 때만 | 기술 계획 §9-2 |
| 5 | 메뉴 '콘텐츠' → **'일'**. 탭: 이번 주(블록 띠 · 회차 보드) · 문서함 · 캘린더(콘텐츠 운영이 있을 때만) | 콘텐츠는 블록 하나일 뿐(결정 73), 기술 계획 §9-4 |
| 6 | 도크 · 3D 회차 보드: 블록 회차는 **이번 주 블록 띠**(블록마다 담당 · 상태 · 확인 대기), 콘텐츠 운영만 있는 회차는 지금 7단계 그대로 | 블록 회차에 '이미지 · 게시' 칸은 의미가 없다 |
| 7 | 문서 한 개 내려받기(.md)는 잠그지 않는다. 회차 결과물 한 번에 내려받기는 지금처럼 시설 Lv2 | 핵심 기능(기술 계획 §2.8) |

## 2. API 계약 — 기술이 만들고 디자인이 이 모양으로 화면을 짠다
모든 응답은 지금처럼 JSON. 필드를 더하는 건 괜찮고 빼거나 이름을 바꾸면 안 된다.

```ts
// (1) 결과물 모양 — artifact.meta에 더한다(P1 필드 assumptions · expertCheck · weeks · ownerTasks는 그대로)
meta.shape: 'doc' | 'table' | 'checklist' | 'post'
meta.table?: { columns: string[]; rows: string[][] }                          // shape = table
meta.items?: Array<{ text: string; owner: 'ceo' | 'team'; due?: string; expert?: boolean }>  // shape = checklist

// (2) 문서함
GET /api/documents → { groups: Array<{ block: string; blockName: string; items: DocItem[] }> }
DocItem = { itemId: string; artifactId: string; title: string; version: number; shape: string;
            status: 'confirmed' | 'waiting' | 'revising' | 'draft'; // 확정 · 확인 대기 · 고치는 중 · 확인 없는 블록
            author: string | null; cycleLabel: string | null; updatedAt: string; confirmedAt: string | null }
GET /api/documents/:itemId → { item: DocItem; artifact: Artifact; versions: Array<{ id; version; createdAt }>; decisions: Array<{ id; status; comment; scope }> }
GET /api/artifacts/:id/download → text/markdown 첨부(파일 이름 = 제목 · v버전.md)

// (3) 내 할 일 — 표 owner_todos(스키마 v8)
GET /api/todos → { open: Todo[]; done: Todo[] }   // done은 최근 30개
Todo = { id: string; text: string; due: string | null; source: 'plan' | 'checklist'; artifactId: string; artifactTitle: string; status: 'open' | 'done'; doneAt: string | null; createdAt: string }
POST /api/todos/:id { done: boolean } → Todo
/api/state.counts.todos: number   // 열린 할 일 수

// (4) 이번 주 블록 띠 — /api/state.flow 와 /api/cycles/:id 의 flow 옆에
flowBlocks: null | Array<{ id: string; name: string; state: 'waiting' | 'active' | 'issue' | 'quota' | 'done' | 'skipped' | 'me';
                           who: string[]; tasks: number; done: number; confirm: number; detail: string }>
// 콘텐츠 운영만 있는 회차(옛 사무실 포함)는 null → 화면은 지금 7단계 flow를 쓴다

// (5) 화면이 복사해 쓰던 표를 한 곳에서
GET /api/meta → { roles: Record<Role, { label: string; kin: Role | null }>; kinds: Record<string, { label: string; block: string | null }>;
                  blocks: BlockSummary[]; decisionKinds: Record<string, string>; platforms: Record<string, string>;
                  statuses: Record<string, string>; stages: Record<BizStage, string> }
```

## 3. 기술 몫 — Technology development
| # | 일 | 받아들이는 기준 |
| --- | --- | --- |
| T1 | 결과물 모양(계약 1): 카탈로그 단계에 `shape`, 단계별 응답 형식 · 파싱 · 가짜 견본, 형식이 틀리면 지어내지 않고 실패. 본문 마크다운은 늘 채움 | 블록마다 견본 → 형식 → 저장 테스트(`tests/blocks.test.ts`) |
| T2 | 문서함 API · 내려받기(계약 2) | 확정 · 확인 대기 · 고치는 중 상태가 맞음, 콘텐츠 운영 결과물은 문서함에 넣지 않음(콘텐츠 화면에 있음) |
| T3 | 내 할 일(계약 3): 스키마 v8 `owner_todos`, 확정할 때 만들기(같은 결과물 새 버전을 확정하면 이전 할 일은 바꾸지 않고 새것만 더함 — 중복 글은 건너뜀), 주간 회고 입력에 할 일 진행을 넣음, `counts.todos` | 테스트: 계획 확정 → 할 일 생김 → 체크 → 회고 입력에 반영 |
| T4 | 이번 주 블록 띠(계약 4) | 블록 회차 · 콘텐츠 회차 · 옛 사무실 모두 테스트 |
| T5 | `/api/meta`(계약 5) | 화면 쪽 표와 같은 값 |
| T6 | 성장 일반화(결정 4): `office-growth.ts` 조건 · 마일스톤 | 게시 없는 사업도 레벨 업 조건을 채울 수 있음 — `tests/growth.test.ts` |
| T7 | 문서: architecture · business-setup '구현 현황' · implementation-plan P2 표시 | — |

지키기: 외부 호출 없는 테스트, 기존 테스트 모두 통과, 옛 사무실 · 데모(`data-demo`)가 그대로 돈다, 화면 파일(web/)은 고치지 않는다(계약만 맞춘다).

## 4. 디자인 몫 — Office design
| # | 일 | 받아들이는 기준 |
| --- | --- | --- |
| D1 | 결정함 '결과물 확인'의 모양별 미리보기: table(표 그대로, 칸 위에 코멘트), checklist([대표]/[팀] 칩 · 기한 · 전문가 확인 표시), doc(지금) | 세 모양 · 세 폭(390 · 768 · 1440) 스크린샷 |
| D2 | 메뉴 '일'(결정 5): 탭 이번 주 · 문서함 · 캘린더. 문서함 = 블록별 묶음, 확정 표시 · 버전 · 내려받기 · 열면 결정함으로 | 계약 2로 동작 |
| D3 | 내 할 일: 결정함 옆(또는 결정함 안 탭) '내 할 일' — 체크 · 출처(어느 계획 · 체크리스트) · 사이드바 배지 | 계약 3으로 동작 |
| D4 | 도크 · 3D 회차 보드의 이번 주 블록 띠(결정 6) | 계약 4로 동작, 콘텐츠 회차는 지금 모양 |
| D5 | 화면에 복사된 표(직무 이름 · 업무 종류 · 플랫폼 · 상태)를 `/api/meta`로 | 계약 5 |
| D6 | 온보딩 새 단계(서비스 소개 · 사업 인터뷰 · 사업 설계도 · 첫 주) 디자인 QA — 문구 · 간격 · 작은 화면 | 세 폭 스크린샷, 고친 것 목록 |

지키기: 서버 코드(src/)는 고치지 않는다(필요하면 조정자에게 요청), 3D 성능 기준(결정 75 확인값)을 넘지 않는다.

## 5. 순서
1. 기술 T1–T7과 디자인 D1 · D6(계약의 예시 데이터로 먼저)를 동시에 시작.
2. 기술이 끝나면 조정자가 `office-3d`에 합치고 디자인에 알린다 → 디자인이 `office-3d`를 받아 D2–D5를 실제 API에 붙인다.
3. 조정자가 화면으로 받아들이기(가짜 AI로 카페 사업 처음부터 2주차까지) → 결정 · 작업 기록 정리.
