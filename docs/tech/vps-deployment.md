# Agent Office — 본인 VPS 구축 설계 (R0)

작성일: 2026-10-02
상태: **설계만. 구축하지 않았다**(결정 60). 아래 설정은 초안이며 실행·검증 전이다.
근거: [deployment.md](../product/specs/deployment.md) · [publishing.md](../product/specs/publishing.md) · [구조](architecture.md)

## 1. 목표와 전제
- 내 컴퓨터를 꺼도 주간 회차가 돌고, 예약 게시(Threads·LinkedIn은 API 예약이 없음)를 Agent Office가 실행한다.
- 사용자 1명·사무실 1개. 서버 1대로 충분하다.
- 앱 연결(Notion·Google·LinkedIn·Threads)의 OAuth 콜백을 받으려면 **공개 HTTPS 주소**가 필요하다.
- **AI 경로가 VPS 가동의 선행 조건이다.**

| AI 연결 | VPS에서 | 이유 |
| --- | --- | --- |
| Claude 구독(Claude Code CLI) | **보류** | 화면 없는 상시 운영은 회색지대. Anthropic 회신 전에는 켜지 않는다(결정 34·61) |
| Codex 구독 | M0-A 결과에 따름 | 디바이스 코드 로그인·무인 실행을 스파이크로 확인 |
| API 키(종량제) | 가능 | 정책상 제한 없음. 비용 상한 필요 |

## 2. 구성
```
인터넷 ──443──> Caddy (자동 HTTPS)
                 ├─ /oauth/callback/*, /healthz ──────────> 공개
                 └─ 그 외 ── 소유자 인증 ──> agent-office (127.0.0.1:4317)
agent-office — systemd 서비스, 전용 사용자 agentoffice
  ├─ 한 프로세스: API + 업무 실행기 + 예약 실행기
  ├─ /var/lib/agent-office/office.db (SQLite, WAL)
  └─ AI CLI 로그인 상태: 전용 사용자 홈(~agentoffice)
백업 — systemd 타이머: 매일 SQLite 스냅샷, 14일 보관 (+ 선택: 외부 저장소)
```

### 왜 이렇게 — 선택과 대안
| 항목 | 기본안 | 대안 | 판단 |
| --- | --- | --- | --- |
| 실행 방식 | systemd + Node 직접 | Docker Compose | R0는 1인·1프로세스이고 AI CLI 로그인이 사용자 홈에 남는다. 움직이는 부분이 적은 쪽을 고른다. Docker는 R1(오픈소스 배포)에서 만든다 |
| HTTPS·프록시 | Caddy(인증서 자동) | Nginx + certbot | 설정이 짧고 갱신이 자동이다 |
| 소유자 접근 | Caddy 기본 인증(강한 비밀번호) | Tailscale 전용 접근 | 앱에 로그인 기능이 생기기 전 임시 방어. 모바일 결정함은 HTTPS로 바로 열려야 해서 기본 인증을 기본안으로 둔다. 앱 로그인은 M5에서 |
| 데이터 | SQLite 파일 하나 | Postgres | 1인·저부하. 백업은 파일 스냅샷 |

## 3. 서버
- 2 vCPU · 2–4 GB RAM · 40 GB SSD, Ubuntu 24.04 LTS, 서울 리전.
- Node 24 LTS 이상(내장 SQLite와 TypeScript 바로 실행을 쓴다).
- 시간대 `Asia/Seoul`(주간 예약이 서버 시간대를 따른다).

## 4. 보안
- SSH 키 로그인만, 비밀번호 로그인과 root 로그인 끄기. 방화벽: 22·80·443만 연다.
- 보안 업데이트 자동 적용(unattended-upgrades).
- 앱은 `127.0.0.1`에만 바인딩한다. 외부 접근은 Caddy를 통해서만 한다.
- 비밀값은 `/etc/agent-office/env`(권한 600, 소유자 agentoffice). git에 넣지 않는다.
- 앱 OAuth 토큰(M2부터)은 DB에 암호화해 저장하고, 키는 환경 파일에만 둔다(`AO_SECRET_KEY`).
- `NODE_ENV=production`이면 초기화 API(`/api/dev/reset`)가 막힌다.
- `ALLOWED_HOSTS`에 도메인을 넣는다(앱의 Host·Origin 검사).

## 5. 설정 초안
### `/etc/systemd/system/agent-office.service`
```ini
[Unit]
Description=Agent Office
After=network-online.target
Wants=network-online.target

[Service]
User=agentoffice
Group=agentoffice
WorkingDirectory=/opt/agent-office
EnvironmentFile=/etc/agent-office/env
ExecStart=/usr/bin/node --disable-warning=ExperimentalWarning src/main.ts
Restart=always
RestartSec=5
# 종료 신호를 받으면 실행 중 업무를 '대기'로 되돌리고 끝난다
KillSignal=SIGTERM
TimeoutStopSec=20
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/lib/agent-office /home/agentoffice
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

### `/etc/agent-office/env`
```bash
NODE_ENV=production
HOST=127.0.0.1
PORT=4317
DATA_DIR=/var/lib/agent-office
ALLOWED_HOSTS=office.example.com
TZ=Asia/Seoul
AI_PROVIDER=fake          # AI 경로 확정 전까지 가짜 AI
WEEKLY_BUDGET_USD=        # 주간 사용 상한(API 환산 추정)
```

### `/etc/caddy/Caddyfile`
```caddy
office.example.com {
  encode gzip
  @public path /oauth/callback/* /healthz
  handle @public {
    reverse_proxy 127.0.0.1:4317
  }
  handle {
    basic_auth {
      owner <bcrypt 해시 — caddy hash-password로 만든다>
    }
    # 활동 기록 실시간(SSE)을 버퍼 없이 바로 전달
    reverse_proxy 127.0.0.1:4317 {
      flush_interval -1
    }
  }
}
```
`/oauth/callback/*`는 앱 연결(M2)에서 만든다. 지금은 없는 경로다.

### 백업 — 매일 03:30
```bash
# /usr/local/bin/agent-office-backup
set -euo pipefail
dest=/var/backups/agent-office
mkdir -p "$dest"
sqlite3 /var/lib/agent-office/office.db ".backup '$dest/office-$(date +%F).db'"
find "$dest" -name 'office-*.db' -mtime +14 -delete
```
systemd 타이머(`OnCalendar=*-*-* 03:30`)로 실행한다. 외부 보관(restic + 오브젝트 스토리지)은 선택이다.

## 6. 운영
| 상황 | 처리 |
| --- | --- |
| 업데이트 | `git pull` → `npm ci --omit=dev` → `systemctl restart agent-office`. 실행 중 업무는 대기로 돌아갔다가 다시 시작한다 |
| 서버 재부팅·장애 | systemd가 다시 켠다. 놓친 예약은 켜질 때 한 번만 실행한다 |
| 상태 감시 | 외부 헬스체크(예: 5분마다 `/healthz`). 응답이 없으면 알림(Slack 연동은 M2) |
| 연결 끊김 표시 | 화면은 "연결 끊김 — 마지막 확인 hh:mm:ss"를 보여주고 움직임을 멈춘다(가짜 실시간 금지) |
| 로그 | journald(`journalctl -u agent-office`). 로그에 비밀값을 남기지 않는다 |
| AI 한도·로그인 만료 | 해당 업무만 `한도 대기`·`재연결 필요`. 로그인은 서버에서 전용 사용자로 다시 한다 |

## 7. 로컬 ↔ VPS 이전
R0는 실행 장소 전환을 포함한다(PRD §11). 한 사무실을 두 곳에서 동시에 실행하면 업무·게시가 중복되므로 **책임 실행 장소는 하나**다.
1. 로컬 서버를 멈춘다(실행 중 업무는 대기로 돌아간다).
2. `sqlite3 data/office.db ".backup office-move.db"`로 스냅샷을 만들어 VPS의 `/var/lib/agent-office/office.db`로 옮긴다.
3. VPS 서비스를 켠다. 앱 연결(OAuth 토큰)은 자동으로 복사하지 않고 VPS에서 다시 연결한다(deployment.md 원칙).
4. 구현 필요(VPS 구축 시): DB에 실행 장소 잠금(`executor` 설정 + 주기적 신호)을 두고, 잠금을 가진 곳만 업무·예약을 실행한다. 다른 곳에서 켜면 "다른 장소에서 실행 중"을 보여주고 실행하지 않는다.

## 8. 구축 순서(실행 전 체크리스트)
1. [ ] AI 경로 확정(M0-A 결과, Anthropic 회신)
2. [ ] VPS 생성, 도메인 A 레코드 연결
3. [ ] 기본 보안: 사용자·SSH 키·방화벽·자동 업데이트
4. [ ] Node 24 LTS, sqlite3, Caddy 설치
5. [ ] 전용 사용자 `agentoffice`, `/opt/agent-office`(코드), `/var/lib/agent-office`(데이터)
6. [ ] 코드 배치 → `npm ci --omit=dev`
7. [ ] `/etc/agent-office/env` 작성(권한 600)
8. [ ] systemd 서비스 등록·시작, `curl 127.0.0.1:4317/healthz`
9. [ ] Caddy 설정(기본 인증 해시), HTTPS 접속 확인
10. [ ] AI 로그인(정책이 허용하는 경로만, 전용 사용자로)
11. [ ] 백업 타이머, 외부 헬스체크
12. [ ] (선택) 로컬 데이터 이전

## 9. 구축 전에 앱에 더할 것
- 소유자 로그인(세션) — 기본 인증을 대신한다.
- 실행 장소 잠금(§7).
- 앱 OAuth 콜백 경로와 토큰 암호화 저장.
- 구조화 로그(비밀값 마스킹)와 `/healthz`에 실행기·예약기 마지막 동작 시각.
