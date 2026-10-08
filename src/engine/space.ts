import type { CompleteRequest } from '../ai/provider.ts';
import { ALL_ROLES, ROLE_LABEL, roleTitle } from '../core/roles.ts';
import { eulreul, iga } from '../core/voice.ts';
import type { Office, Role } from '../core/types.ts';
import { DomainError, type Repo, newId, now } from '../store/repo.ts';

/**
 * 도메인 맞춤 공간(결정 67·68) — 매니저(AI)가 회사에 맞는 공간 설계도를 쓰고, 대표는 빈 부지에 짓는다.
 * 사무실 레벨(결정 66의 단계)은 전략 시뮬레이션의 '성'이다: 레벨이 지을 수 있는 방 수를 정한다.
 * 짓는 비용은 직무별 실적 자원이다 — 실제로 끝낸 일에서만 생기고, 지을 때 쓴다. AI 사용량은 따로 보여 준다.
 */
export type ResKey = 'insight' | 'draft' | 'design' | 'trust' | 'promo' | 'polish' | 'scene' | 'keyword';
/** icon은 아이콘 이름(키)만 — 화면이 web/js/icons.js로 그린다(brand.md §3-3, 이모지 쓰지 않음) */
export const RES: Record<ResKey, { label: string; icon: string; role: Role }> = {
  insight: { label: '인사이트', icon: 'bulb', role: 'researcher' },
  draft: { label: '원고', icon: 'pencil', role: 'writer' },
  design: { label: '디자인', icon: 'palette', role: 'designer' },
  trust: { label: '신뢰', icon: 'shield', role: 'manager' },
  promo: { label: '홍보', icon: 'megaphone', role: 'marketer' },
  polish: { label: '교정', icon: 'nib', role: 'editor' },
  scene: { label: '영상', icon: 'film', role: 'producer' },
  keyword: { label: '키워드', icon: 'hash', role: 'seo' },
};
const ROLE_RES = Object.fromEntries(Object.entries(RES).map(([k, r]) => [r.role, k])) as Record<Role, ResKey>;
const ROLES: readonly Role[] = ALL_ROLES;
const zero = (): Record<ResKey, number> => Object.fromEntries(Object.keys(RES).map((k) => [k, 0])) as Record<ResKey, number>;
const FACILITIES = ['board', 'decisions', 'power', 'knowledge', 'milestones'];
/** 사무실 레벨(단계)별 지을 수 있는 방 수 — 임시값 */
export const ROOM_CAP = [3, 4, 5, 6, 8];
export const DECOR = ['plant', 'lamp', 'armchair', 'bookshelf', 'coffee_bar'];
const DECOR_LABEL: Record<string, string> = { plant: '화분', lamp: '스탠드 조명', armchair: '안락의자', bookshelf: '책장', coffee_bar: '커피 바' };
const DECOR_PER_ROOM = 2;

type Cost = Partial<Record<ResKey, number>>;
interface Station { role: Role | null; station: string; count: number; label: string; extras?: string[] }
interface Room { id: string; name: string; stations: Station[]; facilities: string[]; props?: unknown[]; walls?: string; size?: string; color?: string | null; added?: boolean }
export interface SpaceSpec { title: string; domain?: string; rooms: Room[]; facilities?: Record<string, unknown>; recipes?: Record<string, unknown>; style?: Record<string, unknown> }
export interface Built { rooms: string[]; stations: Record<string, number>; decor: Record<string, string[]> }
export interface Placement { x: number; z: number; rot: number }

const get = <T>(repo: Repo, key: string): T | null => repo.getSetting<T>(key);

/** 실적 자원 — 번 것은 기록에서 계산하고(저장하지 않음), 쓴 것은 짓기 기록에서 더한다. 공사 중인 방의 비용은 따로 잡아 둔다 */
export function resources(repo: Repo): { earned: Record<ResKey, number>; spent: Record<ResKey, number>; reserved: Record<ResKey, number>; balance: Record<ResKey, number>; formula: string } {
  const earned = zero();
  for (const r of repo.many<{ role: Role; n: number }>("SELECT e.role AS role, COUNT(*) AS n FROM tasks t JOIN employees e ON e.id = t.assignee_id WHERE t.status = 'done' GROUP BY e.role")) {
    const k = ROLE_RES[r.role]; if (k) earned[k] += r.n * 10;
  }
  earned.trust += 3 * (repo.one<{ n: number }>("SELECT COUNT(*) AS n FROM decisions WHERE status = 'approved'")?.n ?? 0);
  const spent = zero();
  for (const b of repo.many<{ cost: string }>('SELECT cost FROM builds')) for (const [k, v] of Object.entries(JSON.parse(b.cost) as Cost)) spent[k as ResKey] += v ?? 0;
  const reserved = zero();
  for (const w of works(repo)) if (w.status === 'designing') for (const [k, v] of Object.entries(w.cost)) reserved[k as ResKey] += v ?? 0;
  const balance = Object.fromEntries((Object.keys(earned) as ResKey[]).map((k) => [k, earned[k] - spent[k] - reserved[k]])) as Record<ResKey, number>;
  return { earned, spent, reserved, balance, formula: '직원이 끝낸 업무 1건 = 그 직무 자원 10 · 승인한 결정 1건 = 신뢰 3. 짓기에 쓴 만큼 줄어요.' };
}

// ── 새 방 요청 — 설계도에 없는 방을 매니저(AI)가 새로 설계한다. 설계하는 동안이 곧 공사 기간이다 ──
/** 새 방 비용(임시값) — 미리 설계된 방(신뢰 40 + 직무 자원 30)과 비슷하게, 설계까지 매니저가 맡는다 */
export const NEW_ROOM_COST: Cost = { trust: 60 };
const NEW_ROOM_AI = '설계 1회(구독 사용량 조금 — 보통 업무 하나보다 적어요)';
interface WorkRow { id: string; need: string; requestId: string; cost: Cost; startedAt: string; roomId?: string; doneAt?: string }
export interface Work extends WorkRow { status: 'designing' | 'done' | 'failed'; error: string | null }

/** 공사 기록 — 상태는 AI 요청에서 읽는다(서버가 다시 켜져 요청이 실패로 닫혀도 비용이 묶이지 않는다) */
export function works(repo: Repo): Work[] {
  return (get<WorkRow[]>(repo, 'space.works') ?? []).map((w) => {
    if (w.roomId) return { ...w, status: 'done' as const, error: null };
    const r = repo.one<{ status: string; error: string | null }>('SELECT status, error FROM ai_requests WHERE id = ?', w.requestId);
    return { ...w, status: r?.status === 'running' ? 'designing' as const : 'failed' as const, error: r?.status === 'running' ? null : (r?.error ?? '설계 결과를 받지 못했어요') };
  });
}

/** 처음 공간 — 기능 자리가 있는 방과 지금 직원이 있는 방은 지어진 채로 시작한다. 자리는 직무마다 한 개씩(직원이 더 있으면 그만큼) */
export function initialBuilt(repo: Repo, spec: SpaceSpec): Built {
  const hired = new Map<Role, number>();
  for (const e of repo.listEmployees()) hired.set(e.role, (hired.get(e.role) ?? 0) + 1);
  const rooms = spec.rooms.filter((r) => r.facilities.some((f) => FACILITIES.includes(f)) || r.stations.some((z) => z.role && hired.has(z.role))).map((r) => r.id);
  if (!rooms.length && spec.rooms[0]) rooms.push(spec.rooms[0].id);
  const stations: Record<string, number> = {};
  const left = new Map(hired);
  for (const r of spec.rooms) {
    if (!rooms.includes(r.id)) continue;
    r.stations.forEach((z, i) => {
      const want = z.role ? Math.max(1, left.get(z.role) ?? 0) : 1;
      const n = Math.min(z.count, want);
      stations[`${r.id}:${i}`] = n;
      if (z.role) left.set(z.role, Math.max(0, (left.get(z.role) ?? 0) - n));
    });
  }
  return { rooms, stations, decor: {} };
}

export function spaceState(repo: Repo) {
  const spec = get<SpaceSpec>(repo, 'space.spec');
  const built = get<Built>(repo, 'space.built');
  const office = repo.getOffice();
  const stage = office?.stage ?? 0;
  return {
    spec, built, placements: get<Record<string, Placement>>(repo, 'space.placements') ?? {},
    rev: get<number>(repo, 'space.rev') ?? 0, stage, roomCap: ROOM_CAP[stage] ?? ROOM_CAP.at(-1)!,
    resources: resources(repo), res: RES, plots: spec && built ? plots(repo, spec, built, stage) : [],
    works: works(repo).slice(-5),
  };
}

export interface Plot { id: string; kind: 'room' | 'station' | 'decor' | 'new'; roomId: string; group?: number; title: string; cost: Cost; options?: Array<{ key: string; label: string }>; reqs: Array<{ label: string; met: boolean }>; ready: boolean; affordable: boolean; ai: string }

function plots(repo: Repo, spec: SpaceSpec, built: Built, stage: number): Plot[] {
  const bal = resources(repo).balance;
  const hired = new Set(repo.listEmployees().map((e) => e.role));
  const cap = ROOM_CAP[stage] ?? ROOM_CAP.at(-1)!;
  const out: Plot[] = [];
  const designing = works(repo).filter((w) => w.status === 'designing').length;
  const used = built.rooms.length + designing; // 공사 중인 방도 한 칸을 쓴다
  const afford = (c: Cost) => Object.entries(c).every(([k, v]) => bal[k as ResKey] >= (v ?? 0));
  const add = (p: Omit<Plot, 'ready' | 'affordable'>) => { const affordable = afford(p.cost); out.push({ ...p, affordable, ready: p.reqs.every((r) => r.met) && affordable }); };
  for (const r of spec.rooms) {
    if (!built.rooms.includes(r.id)) {
      const roles = [...new Set(r.stations.map((z) => z.role).filter((x): x is Role => !!x))];
      const main = roles[0] ? ROLE_RES[roles[0]] : 'draft';
      const lvNeed = ROOM_CAP.findIndex((c) => c > used);
      const reqs = [{ label: lvNeed < 0 ? '방을 더 지을 수 없어요' : `사무실 레벨 ${lvNeed} 이상 (지금 ${stage})`, met: used < cap }];
      for (const role of roles) reqs.push({ label: `${ROLE_LABEL[role]} 채용`, met: hired.has(role) });
      add({ id: `room:${r.id}`, kind: 'room', roomId: r.id, title: `${r.name} 짓기`, cost: { trust: 40, [main]: 30 }, reqs, ai: '없음 — 이미 설계된 방이에요' });
      continue;
    }
    r.stations.forEach((z, i) => {
      const n = built.stations[`${r.id}:${i}`] ?? 0;
      if (n >= z.count) return;
      const k = z.role ? ROLE_RES[z.role] : 'trust';
      add({ id: `station:${r.id}:${i}`, kind: 'station', roomId: r.id, group: i, title: `${z.label || r.name} 자리 추가`, cost: z.role ? { [k]: 20, trust: 10 } : { trust: 20 }, reqs: [{ label: `${r.name} 있음`, met: true }], ai: '없음' });
    });
    if ((built.decor[r.id] ?? []).length < DECOR_PER_ROOM) {
      add({ id: `decor:${r.id}`, kind: 'decor', roomId: r.id, title: `${r.name} 꾸미기`, cost: { design: 10 }, options: DECOR.map((k) => ({ key: k, label: DECOR_LABEL[k]! })), reqs: [{ label: `${r.name} 있음`, met: true }], ai: '없음' });
    }
  }
  // 새 방 요청 부지 — 건물 옆 빈 땅. 공사 중이면 그 자리에 가림막이 선다
  if (!designing) {
    const lvNeed = ROOM_CAP.findIndex((c) => c > used);
    add({
      id: 'new:room', kind: 'new', roomId: '', title: '새 방 요청', cost: NEW_ROOM_COST, ai: NEW_ROOM_AI,
      reqs: [
        { label: lvNeed < 0 ? '방을 더 지을 수 없어요' : `사무실 레벨 ${lvNeed} 이상 (지금 ${stage})`, met: used < cap },
        { label: '매니저 채용', met: hired.has('manager') },
      ],
    });
  }
  return out;
}

/** 짓기 — 조건과 자원을 확인하고, 자원을 쓰고, 지은 것을 기록한다 */
export function build(repo: Repo, plotId: string, option?: string): ReturnType<typeof spaceState> {
  const s = spaceState(repo);
  if (!s.spec || !s.built) throw new DomainError(400, '공간 설계도가 아직 없어요');
  const p = s.plots.find((x) => x.id === plotId);
  if (!p || p.kind === 'new') throw new DomainError(404, '지을 수 있는 자리가 아니에요');
  const unmet = p.reqs.find((r) => !r.met);
  if (unmet) throw new DomainError(409, `조건이 모자라요 — ${unmet.label}`);
  if (!p.affordable) throw new DomainError(409, '자원이 모자라요');
  if (p.kind === 'decor' && !DECOR.includes(option ?? '')) throw new DomainError(400, '꾸밀 물건을 골라 주세요');
  const built: Built = JSON.parse(JSON.stringify(s.built));
  const room = s.spec.rooms.find((r) => r.id === p.roomId)!;
  if (p.kind === 'room') {
    built.rooms.push(p.roomId);
    room.stations.forEach((_, i) => { built.stations[`${p.roomId}:${i}`] = 1; });
  } else if (p.kind === 'station') built.stations[`${p.roomId}:${p.group}`] = (built.stations[`${p.roomId}:${p.group}`] ?? 0) + 1;
  else (built.decor[p.roomId] ??= []).push(option!);
  repo.tx(() => {
    repo.exec('INSERT INTO builds (id, kind, target, cost, created_at) VALUES (?, ?, ?, ?, ?)', newId('bd'), p.kind, p.id + (option ? `:${option}` : ''), JSON.stringify(p.cost), now());
    repo.setSetting('space.built', built);
    repo.setSetting('space.rev', s.rev + 1);
    const what = p.kind === 'decor' ? `${room.name}에 ${DECOR_LABEL[option!]}` : p.kind === 'room' ? room.name : p.title.replace(' 자리 추가', ' 자리');
    repo.emit('space_built', `${eulreul(what)} 지었어요`, { data: { plot: p.id, kind: p.kind, roomId: p.roomId } });
  });
  return spaceState(repo);
}

/** 배치 모드 — 물건 위치 저장(드래그). 좌표 검사(겹침·방 밖)는 화면이 하고, 서버는 범위만 확인한다 */
export function place(repo: Repo, id: string, p: Placement | null): void {
  if (!/^[\w:-]{1,80}$/.test(id)) throw new DomainError(400, '물건 이름이 올바르지 않아요');
  const all = get<Record<string, Placement>>(repo, 'space.placements') ?? {};
  if (p === null) delete all[id];
  else {
    const ok = (v: unknown, lim: number) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= lim;
    if (!ok(p.x, 60) || !ok(p.z, 60) || !ok(p.rot, 7)) throw new DomainError(400, '위치가 올바르지 않아요');
    all[id] = { x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100, rot: Math.round(p.rot * 1000) / 1000 };
  }
  repo.setSetting('space.placements', all);
}

/** 설계도 저장 — 처음이면 지은 상태도 정한다 */
export function saveSpec(repo: Repo, spec: SpaceSpec): void {
  if (!Array.isArray(spec?.rooms) || !spec.rooms.length) throw new DomainError(400, '설계도에 방이 없어요');
  repo.tx(() => {
    repo.setSetting('space.spec', spec);
    if (!get<Built>(repo, 'space.built')) repo.setSetting('space.built', initialBuilt(repo, spec));
    repo.setSetting('space.rev', (get<number>(repo, 'space.rev') ?? 0) + 1);
    repo.emit('space_built', `매니저가 "${spec.title}" 공간을 설계했어요`, { data: { kind: 'design' } });
  });
}

/** 새 방 요청 확인 — 조건 · 자원이 되면 공사 기록을 만든다. AI 요청은 화면 쪽(routes)이 시작하고 requestId 를 넘긴다 */
export function checkRoomRequest(repo: Repo, need: string): Plot {
  const text = need.trim();
  if (text.length < 2 || text.length > 80) throw new DomainError(400, '어떤 방이 필요한지 2–80자로 적어 주세요');
  const s = spaceState(repo);
  if (!s.spec || !s.built) throw new DomainError(400, '공간 설계도가 아직 없어요');
  if (s.works.some((w) => w.status === 'designing')) throw new DomainError(409, '지금 짓고 있는 방이 있어요 — 끝나면 요청해 주세요');
  const p = s.plots.find((x) => x.id === 'new:room')!;
  const unmet = p.reqs.find((r) => !r.met);
  if (unmet) throw new DomainError(409, `조건이 모자라요 — ${unmet.label}`);
  if (!p.affordable) throw new DomainError(409, '자원이 모자라요');
  return p;
}

export function startWork(repo: Repo, w: { id: string; need: string; requestId: string }): void {
  const all = get<WorkRow[]>(repo, 'space.works') ?? [];
  all.push({ ...w, need: w.need.trim(), cost: NEW_ROOM_COST, startedAt: now() });
  repo.tx(() => {
    repo.setSetting('space.works', all.slice(-20));
    const mgr = repo.listEmployees().find((e) => e.role === 'manager');
    repo.emit('space_built', `${mgr ? `${iga(mgr.name)} ` : ''}새 방 공사를 시작했어요 — ${w.need.trim()}`, { data: { kind: 'work', workId: w.id } });
  });
}

const RES_ROLES = ROLES as readonly string[];
/** 새 방 설계 결과 다듬기 — 방 하나 · 작업 자리 한 줄(최대 3자리) · 기능 자리 없음 · id 겹치지 않게 */
export function tidyRoom(spec: SpaceSpec, raw: Record<string, unknown>): { room: Room; recipes: Record<string, unknown> } {
  const r = (raw.room ?? {}) as Record<string, unknown>;
  const str = (v: unknown, f: string, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : f);
  let id = str(r.id, 'room', 20).replace(/[^\w-]/g, '') || 'room';
  const ids = new Set(spec.rooms.map((x) => x.id));
  if (ids.has(id)) { let i = 2; while (ids.has(`${id}${i}`)) i++; id = `${id}${i}`; }
  let left = 3;
  const stations: Station[] = (Array.isArray(r.stations) ? r.stations : []).slice(0, 2).flatMap((z: Record<string, unknown>) => {
    const count = Math.max(0, Math.min(left, Math.round(Number(z.count) || 1))); left -= count;
    if (!count) return [];
    return [{ role: RES_ROLES.includes(String(z.role)) ? (z.role as Role) : null, station: str(z.station, 'desk', 20), count, label: str(z.label, '', 16), extras: (Array.isArray(z.extras) ? z.extras : []).slice(0, 2).map(String) }];
  });
  const props = (Array.isArray(r.props) ? r.props : []).slice(0, 6).map((p) => (typeof p === 'string' ? p : String((p as { name?: unknown }).name ?? ''))).filter(Boolean);
  const room: Room = {
    id, name: str(r.name, '새 방', 16), walls: ['open', 'glass', 'solid'].includes(String(r.walls)) ? String(r.walls) : 'glass',
    size: ['s', 'm', 'l'].includes(String(r.size)) ? String(r.size) : 'm', color: /^#[0-9a-f]{6}$/i.test(String(r.color ?? '')) ? String(r.color) : null,
    stations, props, facilities: [], added: true,
  };
  // 레시피 — 이미 있는 이름은 있던 것을 다시 쓴다(한 번 쓴 레시피는 저장해 둔다)
  const recipes: Record<string, unknown> = {};
  for (const [k, v] of Object.entries((raw.recipes ?? {}) as Record<string, { parts?: unknown[] }>).slice(0, 6)) {
    if (spec.recipes?.[k] || !Array.isArray(v?.parts) || !/^[\w-]{1,40}$/.test(k)) continue;
    recipes[k] = { parts: v.parts.slice(0, 60) };
  }
  return { room, recipes };
}

/** 설계가 끝나면 — 설계도에 방을 더하고 바로 지은 상태로 둔다. 비용은 이때 짓기 기록으로 쓴다 */
export function finishRoom(repo: Repo, workId: string, data: Record<string, unknown>): void {
  const all = get<WorkRow[]>(repo, 'space.works') ?? [];
  const w = all.find((x) => x.id === workId);
  const spec = get<SpaceSpec>(repo, 'space.spec'), built = get<Built>(repo, 'space.built');
  if (!w || w.roomId || !spec || !built) return;
  const { room, recipes } = tidyRoom(spec, data);
  spec.rooms.push(room);
  spec.recipes = { ...(spec.recipes ?? {}), ...recipes };
  built.rooms.push(room.id);
  room.stations.forEach((_, i) => { built.stations[`${room.id}:${i}`] = 1; });
  w.roomId = room.id; w.doneAt = now();
  repo.tx(() => {
    repo.exec('INSERT INTO builds (id, kind, target, cost, created_at) VALUES (?, ?, ?, ?, ?)', newId('bd'), 'room_new', `room:${room.id}`, JSON.stringify(w.cost), now());
    repo.setSetting('space.spec', spec);
    repo.setSetting('space.built', built);
    repo.setSetting('space.works', all);
    repo.setSetting('space.rev', (get<number>(repo, 'space.rev') ?? 0) + 1);
    repo.emit('space_built', `${room.name} 완공 — 요청: ${w.need}`, { data: { kind: 'room_new', roomId: room.id, workId } });
  });
}

// ── 설계 요청(매니저 AI) ───────────────────────────────
const STR = { type: 'string' } as const;
const NUM = { type: 'number' } as const;
const arr = (items: unknown) => ({ type: 'array', items });
const obj = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const PART = obj({ s: { type: 'string', enum: ['box', 'cyl', 'sph', 'cone', 'torus'] }, d: arr(NUM), p: arr(NUM), r: arr(NUM), m: STR, c: STR, led: { type: 'boolean' } }, ['s', 'd', 'p']);

export function spaceDesignRequest(office: Office, team: Array<{ role: Role; name: string }>): CompleteRequest {
  return {
    purpose: 'space:design',
    system: [
      `당신은 "${office.name}"의 매니저입니다. 회사에 맞는 작업 공간(사무실이 아니어도 됨 — 스튜디오, 연구소, 공방 등)을 설계도(JSON)로 씁니다.`,
      '규칙: 방 3–6개. 기능 자리 5종(board 진행 보드, decisions 대표 결재 자리, power AI 연결 장비, knowledge 지식 보관, milestones 마일스톤 진열)은 각각 정확히 한 방에 둡니다.',
      `지금 팀의 직무 자리는 꼭 두고, 앞으로 채용할 수 있는 직무(${ROLES.join(', ')}) 자리도 어울리면 둡니다. station: desk | console | lab_bench | workbench | drafting.`,
      '도메인 고유 소품은 recipes에 기본 도형 조합으로 만듭니다(바닥 y=0, 미터 단위, 소품 하나 60조각 이하, 1.5m 안쪽).',
      '사실과 다른 내용을 지어내지 말고, 이름은 한국어로 씁니다.',
    ].join('\n'),
    prompt: [`## 회사: ${office.name}`, office.description, '', '## 지금 팀', ...team.map((e) => `- ${e.name}(${roleTitle(e.role)})`)].join('\n'),
    schema: obj({
      title: STR, domain: STR,
      style: obj({ floor: { type: 'string', enum: ['carpet', 'wood', 'concrete', 'tile', 'epoxy'] }, floorColor: STR, wall: STR, accent: STR, light: { type: 'string', enum: ['warm', 'cool', 'neutral'] }, windows: { type: 'boolean' } }),
      rooms: arr(obj({
        id: STR, name: STR, walls: { type: 'string', enum: ['open', 'glass', 'solid'] }, size: { type: 'string', enum: ['s', 'm', 'l'] }, color: STR,
        stations: arr(obj({ role: { type: ['string', 'null'] }, station: STR, count: NUM, label: STR, extras: arr(STR) })),
        props: arr(STR), facilities: arr(STR),
      })),
      facilities: { type: 'object', additionalProperties: obj({ form: STR, label: STR }) },
      recipes: { type: 'object', additionalProperties: obj({ parts: arr(PART) }) },
    }, ['title', 'domain', 'style', 'rooms', 'facilities', 'recipes']),
    context: { description: office.description, name: office.name },
  };
}

/** 새 방 하나 설계 — 지금 공간의 스타일 · 방 · 레시피를 보고, 대표가 적은 필요에 맞춘다 */
export function spaceRoomRequest(office: Office, spec: SpaceSpec, need: string, team: Array<{ role: Role; name: string }>): CompleteRequest {
  const known = Object.keys(spec.recipes ?? {});
  return {
    purpose: 'space:room',
    system: [
      `당신은 "${office.name}"의 매니저입니다. 대표가 새 방을 요청했습니다. 지금 공간("${spec.title}")에 붙일 방 하나를 설계도(JSON)로 씁니다.`,
      '규칙: 방 하나. 기능 자리(facilities)는 넣지 않습니다(이미 공간에 있음). 작업 자리는 0–3자리(한 줄), station: desk | console | lab_bench | workbench | drafting.',
      `직무는 ${ROLES.join(', ')} 또는 null(누구나 쓰는 자리). 소품은 6개 이하 — 기본 소품(${['sofa', 'plant', 'meeting_table', 'long_table', 'coffee_bar', 'lamp', 'lockers', 'printer', 'bookshelf', 'armchair'].join(', ')})이나 레시피 이름.`,
      `이미 있는 레시피(그대로 다시 쓸 수 있음): ${known.join(', ') || '없음'}. 새 소품은 recipes에 기본 도형 조합으로 만듭니다(바닥 y=0, 미터 단위, 소품 하나 60조각 이하, 1.5m 안쪽).`,
      '지금 공간의 분위기와 어울리게 하고, 이름은 한국어로 씁니다. note에는 왜 이렇게 설계했는지 한두 문장으로 씁니다.',
    ].join('\n'),
    prompt: [
      `## 회사: ${office.name}`, office.description, '',
      `## 지금 공간: ${spec.title}${spec.domain ? ` (${spec.domain})` : ''}`, ...spec.rooms.map((r) => `- ${r.name}: ${r.stations.map((z) => z.label).filter(Boolean).join(', ') || '작업 자리 없음'}`), '',
      '## 지금 팀', ...team.map((e) => `- ${e.name}(${roleTitle(e.role)})`), '',
      `## 대표의 요청\n${need}`,
    ].join('\n'),
    schema: obj({
      room: obj({
        id: STR, name: STR, walls: { type: 'string', enum: ['open', 'glass', 'solid'] }, size: { type: 'string', enum: ['s', 'm', 'l'] }, color: STR,
        stations: arr(obj({ role: { type: ['string', 'null'] }, station: STR, count: NUM, label: STR, extras: arr(STR) })),
        props: arr(STR),
      }),
      recipes: { type: 'object', additionalProperties: obj({ parts: arr(PART) }) },
      note: STR,
    }),
    context: { description: office.description, name: office.name, need, known },
  };
}
