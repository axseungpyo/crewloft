# Security · 보안

## Reporting a vulnerability · 취약점 알리기

Please report vulnerabilities **privately** through GitHub: **Security → Report a vulnerability** on this repository. Do not open a public issue. We aim to reply within 7 days.

취약점은 공개 이슈 말고 저장소의 **Security → Report a vulnerability**로 비공개로 알려 주세요. 7일 안에 답하려고 해요.

## Supported versions

Only the latest commit on the default branch is supported during the alpha.

## Security model · 보안 모델

- **Local by default.** The server listens on `127.0.0.1` and rejects unknown `Host` headers. Change `HOST` only if you understand the risk.
- **Exposing it on a network** (for example on a VPS) requires authentication. Either set an owner password (설정 › 출입 비밀번호) or run with `AUTH_MODE=accounts`. Always put it behind HTTPS.
- **AI credentials are never handled by this app.** Claude Code signs in through its own flow, and the app only runs the official, unmodified CLI.
- **Platform tokens** (Slack and publishing platforms) are encrypted at rest with a key in `DATA_DIR/secret.key` or `AO_SECRET_KEY`.
- **Outbound actions** (posting, sending) wait for the owner's approval, and publishing is a dry run until it is turned on.
- **Passwords** are hashed with scrypt. Sessions are HttpOnly, SameSite=Lax cookies. Sign-in attempts are rate-limited.

Known gaps in the alpha: there is no per-account data isolation yet (one account per server in `AUTH_MODE=accounts`), and Google sign-in is a local mock screen. It is disabled when `NODE_ENV=production`.
