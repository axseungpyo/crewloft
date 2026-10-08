# Contributing · 기여 안내

Thanks for your interest! The project is in **early alpha** and the product docs are in Korean, so please open an issue before a large change. Issues and pull requests in English or Korean are both welcome.

관심 가져 주셔서 고마워요. 아직 초기 알파라 큰 변경은 먼저 이슈로 이야기해 주세요. 이슈 · PR은 한국어 · 영어 모두 괜찮아요.

## Setup · 준비

```bash
npm install
npm run demo        # fake AI, demo data → http://127.0.0.1:4317
npm test            # must pass
npm run typecheck   # must pass
```

- Node 24+. There is no build step: the server runs TypeScript through Node's type stripping, and the browser loads Preact + htm + three.js as plain ES modules.
- Syntax-check browser files you touch: `node --check web/js/path/to/file.js`.

## Rules · 원칙

1. **Tests make no external calls.** Use the fake AI (`AI_PROVIDER=fake`) and dry-run publishing. Never require a real Claude login, API key or platform account in tests or CI.
2. **Nothing goes out without the owner.** Any feature that posts, sends, pays or deletes outside the office must go through a decision the owner approves.
3. **Never read or store AI credentials.** Claude Code handles its own sign-in. Platform tokens are encrypted at rest (`src/store/connections.ts`).
4. **Keep it local-first.** It must keep working on one machine with one SQLite file and no cloud services.
5. **Record product decisions.** If a change alters behaviour, add or update a row in [docs/product/decisions.md](docs/product/decisions.md) and the relevant spec.
6. **Match the surrounding code:** naming, comment density, and the Korean UI copy style (short, polite 해요체, no jargon).

## Pull requests

- Keep each PR focused on one topic. Explain what changed and how you checked it (test, screenshot or GIF for UI).
- CI runs the typecheck, the tests and a syntax check on every PR.
- By contributing, you agree that your contribution is licensed under [AGPL-3.0-or-later](LICENSE).

## Security

Please don't open public issues for vulnerabilities — see [SECURITY.md](SECURITY.md).
