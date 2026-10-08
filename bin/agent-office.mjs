#!/usr/bin/env node
// agent-office 명령 — 켜기 · 데모 · 점검 · 백업 · 업데이트 (결정 77, Hermes Agent의 `hermes` 명령을 본뜸)
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const NODE_FLAGS = ['--env-file-if-exists=.env.local', '--disable-warning=ExperimentalWarning'];

const HELP = `Agent Office ${PKG.version} — 내 컴퓨터에서 돌아가는 AI 직원 사무실

사용법: agent-office <명령> [옵션]

  start        사무실 켜기 (기본: http://127.0.0.1:4317)
  demo         데모 사무실 켜기 (가짜 AI · 데이터는 data-demo/)
  doctor       실행 환경 점검 (Node · 의존성 · 데이터 폴더 · 포트 · Claude Code)
  backup       사무실 데이터 백업 (실행 중에도 안전하게 한 파일로)
  update       최신 코드로 업데이트 (git pull + npm install)
  version      버전 보기

옵션:
  --port <n>   포트 (start · demo · doctor)
  --host <h>   접속을 받을 주소 (기본 127.0.0.1 — 이 컴퓨터에서만)
  --data <dir> 데이터 폴더 (기본: ${path.join(ROOT, 'data')})
  --out <file> 백업 파일 경로 (backup)

설정 파일: ${path.join(ROOT, '.env.local')} (예시: .env.example)`;

function parse(argv) {
  const [cmd = 'help', ...rest] = argv;
  const opt = {};
  for (let i = 0; i < rest.length; i++) {
    const m = /^--(port|host|data|out)(?:=(.*))?$/.exec(rest[i]);
    if (!m) fail(`알 수 없는 옵션: ${rest[i]}`);
    opt[m[1]] = m[2] ?? rest[++i];
    if (opt[m[1]] == null) fail(`--${m[1]} 값이 필요해요`);
  }
  return { cmd, opt };
}

function fail(msg) {
  console.error(`agent-office: ${msg}\n'agent-office help'로 사용법을 볼 수 있어요.`);
  process.exit(1);
}

/** 옵션 → 서버 환경 변수. 데이터 폴더는 어디서 실행하든 같은 곳을 쓰도록 절대 경로로 */
function envFor(opt, base = {}) {
  const env = { ...process.env, ...base };
  if (opt.port) env.PORT = opt.port;
  if (opt.host) env.HOST = opt.host;
  env.DATA_DIR = path.resolve(opt.data ?? env.DATA_DIR ?? path.join(ROOT, base.DATA_DIR ?? 'data'));
  return env;
}

function run(env) {
  const child = spawn(process.execPath, [...NODE_FLAGS, 'src/main.ts'], { cwd: ROOT, env, stdio: 'inherit' });
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
  child.on('exit', (code, sig) => process.exit(sig ? 0 : code ?? 0));
}

const portFree = (port, host) => new Promise((resolve) => {
  const s = net.createServer().once('error', () => resolve(false)).once('listening', () => s.close(() => resolve(true)));
  s.listen(port, host);
});

async function doctor(opt) {
  const env = envFor(opt);
  let bad = 0;
  const line = (ok, label, note = '') => { if (ok === false) bad++; console.log(`${ok === true ? '✓' : ok === false ? '✗' : '·'} ${label}${note ? ` — ${note}` : ''}`); };
  const major = Number(process.versions.node.split('.')[0]);
  line(major >= 24, `Node ${process.versions.node}`, major >= 24 ? '' : 'Node 24 이상이 필요해요 (https://nodejs.org)');
  let sqlite = true;
  try { await import('node:sqlite'); } catch { sqlite = false; }
  line(sqlite, 'node:sqlite', sqlite ? '' : '이 Node에는 SQLite가 없어요 — Node 24 이상으로 바꿔 주세요');
  const missing = Object.keys(PKG.dependencies).filter((d) => !fs.existsSync(path.join(ROOT, 'node_modules', d, 'package.json')));
  line(missing.length === 0, '화면 라이브러리', missing.length ? `없음: ${missing.join(', ')} — '${ROOT}'에서 npm install` : '');
  try {
    fs.mkdirSync(env.DATA_DIR, { recursive: true });
    fs.accessSync(env.DATA_DIR, fs.constants.W_OK);
    const db = path.join(env.DATA_DIR, 'office.db');
    const kb = ['', '-wal'].reduce((n, x) => n + (fs.existsSync(db + x) ? fs.statSync(db + x).size : 0), 0) / 1024;
    line(true, `데이터 폴더 ${env.DATA_DIR}`, fs.existsSync(db) ? `사무실 있음 (${kb.toFixed(0)}KB)` : '아직 비어 있어요 — 처음 켜면 만들어져요');
  } catch (e) {
    line(false, `데이터 폴더 ${env.DATA_DIR}`, `쓸 수 없어요 (${e.code ?? e.message})`);
  }
  const port = Number(env.PORT ?? 4317), host = env.HOST ?? '127.0.0.1';
  const free = await portFree(port, host);
  line(free ? true : null, `포트 ${host}:${port}`, free ? '비어 있어요' : '사용 중 — 사무실이 이미 켜져 있거나 다른 프로그램이 쓰고 있어요');
  if (host !== '127.0.0.1' && host !== 'localhost') line(null, '외부 접속을 받는 주소', '다른 기기에서 열 수 있어요 — 화면 › 설정에서 소유자 비밀번호를 꼭 정해 주세요');
  const bin = env.CLAUDE_BIN ?? 'claude';
  try {
    const v = execFileSync(bin, ['--version'], { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    line(true, `Claude Code ${v}`, '로그인은 터미널에서 `claude`를 한 번 실행해 직접 해요 (이 명령은 로그인 정보를 보지 않아요)');
  } catch {
    line(null, 'Claude Code', '없어요 — 가짜 AI로는 그대로 쓸 수 있어요. 내 Claude 구독으로 쓰려면 https://claude.com/claude-code');
  }
  line(fs.existsSync(path.join(ROOT, '.env.local')) ? true : null, '설정 파일 .env.local', fs.existsSync(path.join(ROOT, '.env.local')) ? '' : '없어요 — 기본값으로 동작해요(필요하면 .env.example을 복사)');
  console.log(bad ? `\n고칠 것이 ${bad}개 있어요.` : '\n준비됐어요 — agent-office start');
  process.exit(bad ? 1 : 0);
}

async function backup(opt) {
  const env = envFor(opt);
  const src = path.join(env.DATA_DIR, 'office.db');
  if (!fs.existsSync(src)) fail(`사무실 데이터가 없어요: ${src}`);
  const d = new Date(), two = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`;
  const out = path.resolve(opt.out ?? path.join(env.DATA_DIR, 'backups', `office-${stamp}.db`));
  if (fs.existsSync(out)) fail(`이미 있는 파일이에요: ${out}`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(src, { readOnly: true });
  try { db.prepare('VACUUM INTO ?').run(out); } finally { db.close(); }
  console.log(`백업했어요: ${out} (${(fs.statSync(out).size / 1024).toFixed(0)}KB)`);
  console.log(`되돌리려면 사무실을 끈 뒤 이 파일을 ${src} 자리에 복사하세요.\n앱 연결(슬랙 등)까지 되살리려면 같은 폴더의 secret.key도 함께 보관하세요 — 백업 파일에는 들어가지 않아요.`);
}

function update() {
  if (!fs.existsSync(path.join(ROOT, '.git'))) fail('git으로 받은 설치가 아니라 업데이트할 수 없어요 — 설치 스크립트를 다시 실행해 주세요');
  const sh = (cmd, args) => execFileSync(cmd, args, { cwd: ROOT, stdio: 'inherit' });
  try {
    sh('git', ['pull', '--ff-only']);
    sh('npm', ['install', '--omit=dev', '--no-audit', '--no-fund']);
  } catch {
    fail('업데이트하지 못했어요 — 위 메시지를 확인해 주세요(직접 고친 파일이 있으면 git pull이 멈춰요)');
  }
  console.log('업데이트했어요. 켜져 있던 사무실은 다시 켜 주세요(데이터는 처음 켤 때 자동으로 옮겨져요).');
}

const { cmd, opt } = parse(process.argv.slice(2));
switch (cmd) {
  case 'start': run(envFor(opt)); break;
  case 'demo': run(envFor(opt, { DATA_DIR: 'data-demo', AI_PROVIDER: 'fake', FAKE_SPEED_MS: '1500', HANDOFF_ACCEPT_MS: '2500' })); break;
  case 'doctor': await doctor(opt); break;
  case 'backup': await backup(opt); break;
  case 'update': update(); break;
  case 'version': case '--version': case '-v': console.log(PKG.version); break;
  case 'help': case '--help': case '-h': console.log(HELP); break;
  default: fail(`알 수 없는 명령: ${cmd}`);
}
