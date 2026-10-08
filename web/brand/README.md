# Crewloft 로고 — L1-b 기운 다락

정한 날: 2026-10-08 · 근거: `docs/product/specs/crewloft-brand.md` §6(결정 82) · 시안 `docs/product/mockups/crewloft-logo-2026-10-08/`
**아직 화면에 넣지 않았다.** 앱 왼쪽 막대 · 첫 화면 · README의 이름 표기와 로고 교체는 도메인 · 상표를 확보한 뒤 이름 바꾸기와 함께 한다.

한쪽으로만 기운 지붕 밑 다락 한 칸, 창 하나에만 불이 켜져 있다 — '대표 자리에 불이 켜져 있다'. 색은 브랜드 B: 검정 · 흰색에 **창 하나만 인주색**.

## 파일
| 파일 | 크기 · 바탕 | 쓰는 곳 |
| --- | --- | --- |
| `crewloft-logo.svg` | 가로형(상징 + `crewloft`), 밝은 바탕용 | 첫 화면 머리 · README(밝게) · 문서 |
| `crewloft-logo-dark.svg` | 가로형, 어두운 바탕용 | README(어둡게) · 어두운 화면 |
| `crewloft-mark.svg` · `crewloft-mark-dark.svg` | 상징만(32칸), 밝은 · 어두운 바탕용 | 좁은 자리 · 공유 그림 |
| `crewloft-icon.svg` · `icon-512.png` | 앱 아이콘 — 검정 둥근 네모 + 흰 상징 + 인주색 창 | 앱 설치 아이콘 · 저장소 대표 그림 |
| `crewloft-icon-square.svg` · `apple-touch-icon.png`(180) | 꽉 찬 검정 네모(애플 기기가 스스로 둥글림) | 휴대폰 홈 화면 |
| `favicon.svg` · `favicon-32.png` · `favicon-16.png` | 앱 아이콘과 같고 상징만 조금 크게(78%) | 브라우저 탭 |
| `og-1200x630.png` | 1200 × 630, 한 줄 소개 「혼자 시작해도, 팀과 함께.」 + 설명 줄 | 공유 미리보기(`og:image`) |

## 쓰는 법
- 글자 `crewloft`는 **윤곽선(path)** 이라 글꼴 없이 어디서나 같게 보인다. Pretendard ExtraBold(800), 자간 −0.045em으로 그렸다(Pretendard는 SIL OFL — `THIRD_PARTY_NOTICES.md`).
- 둘레 여백은 상징 높이의 절반 이상. 가장 작게는 상징만 16px, 가로형은 높이 20px.
- 색을 바꾸지 않는다. 인주색(밝게 #D23F26 · 어둡게 #FF5A3C)은 창에만. 지붕 · 글자는 검정 #14171C 또는 흰색 #F1F3F6.
- 기울이거나 늘이거나, 그림자 · 테두리를 더하지 않는다.

## 넣을 때 (이름 바꾸기와 함께 — 지금은 하지 않음)
```html
<link rel="icon" href="/brand/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/brand/favicon-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="/brand/apple-touch-icon.png">
<meta property="og:image" content="/brand/og-1200x630.png">
```
README 머리(깃허브 화면 밝기에 따라 바뀜):
```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="web/brand/crewloft-logo-dark.svg">
  <img src="web/brand/crewloft-logo.svg" alt="Crewloft" height="48">
</picture>
```

## 보조안 — L1-c 지붕과 창(`alt/l1-c/`)
사용자 요청으로 함께 저장해 둔 **보조안**이다. **앱 · 첫 화면 · README에는 쓰지 않는다** — 대표 로고는 위의 L1-b.
기운 지붕 한 획 아래 인주색 창 하나. 가장 덜어낸 모양이라 가볍지만, 설명 없이는 다락으로 덜 읽힌다(시안 `docs/product/mockups/crewloft-logo-2026-10-08/`).

| 파일 | 크기 · 바탕 |
| --- | --- |
| `crewloft-l1c-logo.svg` · `crewloft-l1c-logo-dark.svg` | 가로형(상징 + `crewloft` 글자 윤곽선 — L1-b와 같은 글자), 밝은 · 어두운 바탕용 |
| `crewloft-l1c-mark.svg` · `crewloft-l1c-mark-dark.svg` | 상징만(32칸), 밝은 · 어두운 바탕용 |
| `crewloft-l1c-icon.svg` · `icon-512.png` | 앱 아이콘 — 검정 둥근 네모 + 흰 지붕 획 + 인주색 창 |

색 · 여백 규칙은 L1-b와 같다. 창 바닥을 글자 바닥선에 맞췄다.
