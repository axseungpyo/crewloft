# Agent Office <sub>(working title)</sub>

**An AI startup team in a 3D office you can watch — self-hosted and open source.**

한국어 · [License: AGPL-3.0](LICENSE) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

> **Early alpha.** The UI is Korean-only for now. The product is now called **Crewloft**; the code and CLI still use the working title `agent-office` until the rename.

You describe the business you want to start. A manager AI drafts a plan, then you hire AI employees one at a time — researcher, writer, designer, marketer, editor, video producer, SEO. They hand work to each other inside a live 3D office that is generated for your kind of business and grows with real output. You only review and decide. Nothing leaves the office without your approval.

## Why it's different

- **Runs on your computer.** One Node process and one SQLite file. Listens on `127.0.0.1` only, unless you change it.
- **Bring your own AI.** Use your own Claude subscription through the official [Claude Code](https://claude.com/claude-code) CLI — you sign in to Claude Code yourself, and this app never sees your credentials. A built-in fake AI lets you try everything with no AI account at all.
- **You stay in charge.** Posting, sending and paying wait for your decision. Publishing is a dry run until you turn it on.
- **A team you can see.** A 3D office where people walk work over to each other, rooms are built from real results, and a replay shows what happened while you were away.
- **Your data is yours.** Export everything to JSON at any time; back up with one command.

## Quick start

Requirements: **Node 24+**, git, npm. Optional: Claude Code (to use your Claude subscription).

```bash
curl -fsSL https://raw.githubusercontent.com/axseungpyo/crewloft/main/scripts/install.sh | bash
agent-office doctor   # checks Node, dependencies, data folder, port, Claude Code
agent-office demo     # demo office with the fake AI → http://127.0.0.1:4317
agent-office start    # your own office
```

From source:

```bash
git clone https://github.com/axseungpyo/crewloft.git && cd crewloft
npm install
npm run demo          # demo office, fake AI
npm run dev           # your office (data/), reloads on server changes
npm test              # flows, integration contracts, publishing — no external calls
```

### Commands

| Command | What it does |
| --- | --- |
| `agent-office start` | Start your office (`--port`, `--host`, `--data`) |
| `agent-office demo` | Start a demo office with the fake AI (`data-demo/`) |
| `agent-office doctor` | Check the environment |
| `agent-office backup` | Write a consistent copy of the office database, even while running |
| `agent-office update` | `git pull` + `npm install` |

Settings live in `.env.local` (see [`.env.example`](.env.example)). To use your Claude subscription, run `claude` once in a terminal to sign in, then pick Claude Code during onboarding or under **설정 › AI 연결**.

### Exposing it on a server

The default is localhost only. If you run it on a VPS, set an owner password in **설정 › 출입 비밀번호**, or start with `AUTH_MODE=accounts` for email sign-up and sign-in. Put it behind HTTPS. See [docs/tech/vps-deployment.md](docs/tech/vps-deployment.md).

## How it works

```
browser (Preact + htm + three.js, no build step)
   │  REST + server-sent events
Node 24 server (TypeScript via type stripping)
   ├─ engine — onboarding, hiring, weekly cycles, decisions, space and growth
   ├─ runner — queues AI tasks, retries, quota and budget waits
   ├─ AI provider — Claude Code CLI │ fake AI
   ├─ publishing — dry run by default, platform adapters
   └─ SQLite (node:sqlite) — one file per office
```

Architecture: [docs/tech/architecture.md](docs/tech/architecture.md). Product docs and the decision log are in Korean: [PRD](docs/product/PRD.md) · [decisions](docs/product/decisions.md).

## Inspiration

The way this project is packaged — a one-line installer, a CLI, a local web dashboard, any model provider — is modelled on [Hermes Agent](https://github.com/NousResearch/hermes-agent) by Nous Research. Agent Office takes a different angle: a visible team and office for people starting a business, rather than a single terminal agent.

## Roadmap

- Business-specific onboarding: an interview, a business blueprint and work blocks
- More AI providers: Anthropic API key, OpenRouter and local models
- Decisions from your phone through Telegram, Slack and Discord
- A shared, community-built library of work blocks
- One office per account for self-hosted servers

## License

[AGPL-3.0-or-later](LICENSE). You may use, change and share it. If you run a modified version as a network service, you must offer its source code to that service's users. Third-party components are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Claude and Claude Code are products of Anthropic. This project is not affiliated with or endorsed by Anthropic.
