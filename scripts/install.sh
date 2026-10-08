#!/usr/bin/env bash
# Agent Office 설치 — 코드를 받고 의존성을 깔고 `agent-office` 명령을 만든다 (결정 77)
#   curl -fsSL <저장소>/raw/<브랜치>/scripts/install.sh | bash
# 바꿀 수 있는 값: AGENT_OFFICE_REPO(저장소) · AGENT_OFFICE_REF(브랜치) · AGENT_OFFICE_HOME(설치 폴더) · AGENT_OFFICE_BIN(명령 폴더)
set -euo pipefail

REPO="${AGENT_OFFICE_REPO:-https://github.com/axseungpyo/crewloft.git}"
REF="${AGENT_OFFICE_REF:-}"
HOME_DIR="${AGENT_OFFICE_HOME:-$HOME/.agent-office}"
BIN_DIR="${AGENT_OFFICE_BIN:-$HOME/.local/bin}"

say() { printf '\033[1m%s\033[0m\n' "$*"; }
die() { printf '설치를 멈췄어요: %s\n' "$*" >&2; exit 1; }

command -v git >/dev/null || die "git이 필요해요"
command -v node >/dev/null || die "Node 24 이상이 필요해요 — https://nodejs.org"
command -v npm >/dev/null || die "npm이 필요해요(Node와 함께 설치돼요)"
major="$(node -p 'process.versions.node.split(".")[0]')"
[ "$major" -ge 24 ] || die "Node $major 버전이에요 — 24 이상이 필요해요"

if [ -d "$HOME_DIR/.git" ]; then
  say "이미 설치돼 있어요 — 업데이트할게요: $HOME_DIR"
  git -C "$HOME_DIR" pull --ff-only
else
  [ -e "$HOME_DIR" ] && die "$HOME_DIR 가 이미 있어요(git 설치가 아님) — 옮기거나 AGENT_OFFICE_HOME으로 다른 곳을 정해 주세요"
  say "코드 받는 중: $REPO"
  git clone --depth 1 ${REF:+--branch "$REF"} "$REPO" "$HOME_DIR"
fi

say "의존성 설치 중"
(cd "$HOME_DIR" && npm ci --omit=dev --no-audit --no-fund)

mkdir -p "$BIN_DIR"
ln -sf "$HOME_DIR/bin/agent-office.mjs" "$BIN_DIR/agent-office"
chmod +x "$HOME_DIR/bin/agent-office.mjs"

say "설치했어요 🎉"
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) echo "  $BIN_DIR 가 PATH에 없어요. 셸 설정에 추가해 주세요: export PATH=\"$BIN_DIR:\$PATH\"" ;;
esac
cat <<EOF
  agent-office doctor   # 실행 환경 점검
  agent-office start    # 사무실 켜기 → http://127.0.0.1:4317
  agent-office demo     # 가짜 AI로 둘러보기
EOF
