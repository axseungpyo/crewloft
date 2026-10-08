import { ALL_ROLES, DEFAULT_LOOK, DEFAULT_STYLE, ROLE_LABEL, firstRank } from '../core/roles.ts';
import type { Employee, EmployeeProfile, EmployeeStyle, Look, Role } from '../core/types.ts';
import { eunneun, say } from '../core/voice.ts';
import { DomainError, type Repo } from '../store/repo.ts';

export const ROADMAP: readonly Role[] = ALL_ROLES;

/** 후보 원형 — 같은 AI이고 차이는 '일하는 방식 설정'이다(결정 56). 이름·외형·성향은 고용 전에 바꿀 수 있다. */
export interface Archetype {
  id: string;
  role: Role;
  name: string;
  tags: string[];
  pitch: string;
  look: Look;
  traits: EmployeeStyle['traits'];
}

export const ARCHETYPES: readonly Archetype[] = [
  { id: 'careful', role: 'manager', name: '미나', tags: ['신중', '데이터'], pitch: '숫자로 확인하면서 가요.', look: { hair: 'long', hairColor: '#3A2A22', skin: '#F2D3B8', outfit: '#476A58', acc: 'none' }, traits: { bold: 30, speed: 35, data: 80, propose: 55 } },
  { id: 'growth', role: 'manager', name: '도윤', tags: ['과감', '실험'], pitch: '빨리 실험하고, 남는 걸 키워요.', look: { hair: 'short', hairColor: '#1E1E1E', skin: '#E5BE9C', outfit: '#3E6A8A', acc: 'glasses' }, traits: { bold: 80, speed: 75, data: 45, propose: 80 } },
  { id: 'story', role: 'manager', name: '서아', tags: ['브랜드', '스토리'], pitch: '브랜드 목소리부터 세워요.', look: { hair: 'pony', hairColor: '#6B4A2F', skin: '#F2D3B8', outfit: '#7A5A78', acc: 'earring' }, traits: { bold: 50, speed: 45, data: 35, propose: 35 } },
  { id: 'careful', role: 'researcher', name: '준', tags: ['꼼꼼', '근거'], pitch: '출처 없는 이야기는 안 해요.', look: { hair: 'short', hairColor: '#1E1E1E', skin: '#F2D3B8', outfit: '#3E6A8A', acc: 'glasses' }, traits: { bold: 30, speed: 30, data: 85, propose: 50 } },
  { id: 'fast', role: 'researcher', name: '서연', tags: ['빠름', '요약'], pitch: '핵심만 세 줄로.', look: { hair: 'bun', hairColor: '#2B1D17', skin: '#E5BE9C', outfit: '#A8772A', acc: 'none' }, traits: { bold: 60, speed: 85, data: 50, propose: 70 } },
  { id: 'warm', role: 'writer', name: '하나', tags: ['따뜻', '공감'], pitch: '읽는 사람 입장에서 써요.', look: { hair: 'bun', hairColor: '#3A2A22', skin: '#F2D3B8', outfit: '#E9DCC6', acc: 'none' }, traits: { bold: 45, speed: 45, data: 40, propose: 60 } },
  { id: 'sharp', role: 'writer', name: '태오', tags: ['간결', '명확'], pitch: '한 문장에 하나만 말해요.', look: { hair: 'curly', hairColor: '#2B1D17', skin: '#C9946B', outfit: '#476A58', acc: 'none' }, traits: { bold: 55, speed: 70, data: 60, propose: 70 } },
  { id: 'calm', role: 'designer', name: '레오', tags: ['차분', '정돈'], pitch: '여백이 메시지를 살려요.', look: { hair: 'short', hairColor: '#2B1D17', skin: '#E5BE9C', outfit: '#C9785B', acc: 'phones' }, traits: { bold: 40, speed: 50, data: 45, propose: 55 } },
  { id: 'bold', role: 'designer', name: '유나', tags: ['과감', '컬러'], pitch: '한눈에 멈추게 만들어요.', look: { hair: 'bob', hairColor: '#6B4A2F', skin: '#F2D3B8', outfit: '#C9785B', acc: 'earring' }, traits: { bold: 80, speed: 65, data: 35, propose: 75 } },
  // 추가 직무(결정 71)
  { id: 'reach', role: 'marketer', name: '지아', tags: ['타이밍', '확산'], pitch: '올리는 시간이 반이에요.', look: { hair: 'pony', hairColor: '#2B1D17', skin: '#F2D3B8', outfit: '#B04A7A', acc: 'earring' }, traits: { bold: 70, speed: 75, data: 55, propose: 80 } },
  { id: 'community', role: 'marketer', name: '민호', tags: ['대화', '관계'], pitch: '댓글 하나가 다음 글을 만들어요.', look: { hair: 'short', hairColor: '#1E1E1E', skin: '#E5BE9C', outfit: '#B04A7A', acc: 'none' }, traits: { bold: 45, speed: 50, data: 40, propose: 65 } },
  { id: 'strict', role: 'editor', name: '은재', tags: ['정확', '교정'], pitch: '틀린 글자 하나 안 넘겨요.', look: { hair: 'bob', hairColor: '#1E1E1E', skin: '#F2D3B8', outfit: '#3E6B55', acc: 'glasses' }, traits: { bold: 25, speed: 35, data: 80, propose: 40 } },
  { id: 'flow', role: 'editor', name: '다인', tags: ['흐름', '리듬'], pitch: '읽히는 문장으로 다듬어요.', look: { hair: 'long', hairColor: '#6B4A2F', skin: '#E5BE9C', outfit: '#3E6B55', acc: 'none' }, traits: { bold: 45, speed: 50, data: 45, propose: 55 } },
  { id: 'hook', role: 'producer', name: '시우', tags: ['훅', '속도'], pitch: '첫 3초에 잡아요.', look: { hair: 'curly', hairColor: '#2B1D17', skin: '#C9946B', outfit: '#C0472F', acc: 'phones' }, traits: { bold: 80, speed: 80, data: 35, propose: 75 } },
  { id: 'story', role: 'producer', name: '라온', tags: ['이야기', '구성'], pitch: '짧아도 이야기가 있어야 해요.', look: { hair: 'bun', hairColor: '#3A2A22', skin: '#F2D3B8', outfit: '#C0472F', acc: 'none' }, traits: { bold: 50, speed: 45, data: 40, propose: 60 } },
  { id: 'data', role: 'seo', name: '도하', tags: ['키워드', '근거'], pitch: '사람들이 검색하는 말로 써요.', look: { hair: 'short', hairColor: '#2B1D17', skin: '#F2D3B8', outfit: '#2F6FA8', acc: 'glasses' }, traits: { bold: 35, speed: 50, data: 85, propose: 55 } },
  { id: 'intent', role: 'seo', name: '윤서', tags: ['의도', '구조'], pitch: '찾는 사람이 원하는 답부터.', look: { hair: 'long', hairColor: '#1E1E1E', skin: '#E5BE9C', outfit: '#2F6FA8', acc: 'none' }, traits: { bold: 50, speed: 55, data: 60, propose: 65 } },
];

export function archetypesFor(role: Role): Archetype[] {
  return ARCHETYPES.filter((a) => a.role === role);
}

export interface HireInput {
  role: Role;
  name: string;
  style?: unknown;
  look?: unknown;
  profile?: EmployeeProfile;
}

const clamp = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : fallback);
const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T => (options.includes(v as T) ? (v as T) : fallback);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

export function normalizeStyle(raw: unknown, base: EmployeeStyle = DEFAULT_STYLE): EmployeeStyle {
  const s = obj(raw);
  const tone = obj(s.tone);
  const traits = obj(s.traits);
  const report = obj(s.report);
  return {
    tone: { form: oneOf(tone.form, ['haeyo', 'hamnida', 'banmal'] as const, base.tone.form), emoji: typeof tone.emoji === 'boolean' ? tone.emoji : base.tone.emoji },
    traits: {
      bold: clamp(traits.bold, base.traits.bold),
      speed: clamp(traits.speed, base.traits.speed),
      data: clamp(traits.data, base.traits.data),
      propose: clamp(traits.propose, base.traits.propose),
    },
    report: {
      detail: oneOf(report.detail, ['summary', 'detail'] as const, base.report.detail),
      freq: oneOf(report.freq, ['decide', 'daily', 'cycle'] as const, base.report.freq),
      ask: oneOf(report.ask, ['low', 'mid', 'high'] as const, base.report.ask),
    },
  };
}

export function normalizeLook(raw: unknown, base: Look = DEFAULT_LOOK): Look {
  const l = obj(raw);
  const str = (v: unknown, f: string): string => (typeof v === 'string' && v.length <= 32 ? v : f);
  return { hair: str(l.hair, base.hair), hairColor: str(l.hairColor, base.hairColor), skin: str(l.skin, base.skin), outfit: str(l.outfit, base.outfit), acc: str(l.acc, base.acc) };
}

/** 이름 + 이에요/예요 */
function named(name: string): { haeyo: string; banmal: string } {
  const code = name.charCodeAt(name.length - 1);
  const batchim = code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 > 0;
  return { haeyo: batchim ? `${name}이에요` : `${name}예요`, banmal: batchim ? `${name}이야` : `${name}야` };
}

/**
 * 채용 — 사용자의 명시적 행동(계약)으로만 일어난다.
 * 첫 직원은 매니저이고(결정 54), 매니저는 한 명이다. 다른 직무는 여러 명 둘 수 있고(결정 71) 이름은 겹치지 않게 한다.
 */
export function hire(repo: Repo, input: HireInput): Employee {
  if (!ROADMAP.includes(input.role)) throw new DomainError(400, '알 수 없는 역할이에요');
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (name.length < 1 || name.length > 12) throw new DomainError(400, '이름은 1–12자로 정해 주세요');
  if (!repo.getOffice()) throw new DomainError(400, '먼저 사업을 소개해 주세요');
  const team = repo.listEmployees();
  if (team.length === 0 && input.role !== 'manager') throw new DomainError(400, '첫 직원은 사업을 함께 설계할 매니저예요');
  if (input.role === 'manager' && team.some((e) => e.role === 'manager')) throw new DomainError(409, `${eunneun(ROLE_LABEL.manager)} 이미 근무 중이에요(매니저는 한 명)`);
  if (team.some((e) => e.name === name)) throw new DomainError(409, `같은 이름(${name})의 직원이 있어요 — 다른 이름으로 정해 주세요`);

  return repo.tx(() => {
    const e = repo.insertEmployee({ name, role: input.role, rank: firstRank(input.role), style: normalizeStyle(input.style), look: normalizeLook(input.look), profile: input.profile ?? {} });
    const n = named(e.name);
    const role = ROLE_LABEL[e.role];
    const lines = e.role === 'manager'
      ? { haeyo: `안녕하세요, 매니저 ${n.haeyo}. 사업 계획을 함께 세워요.`, hamnida: `안녕하십니까, 매니저 ${e.name}입니다. 사업 계획을 함께 세우겠습니다.`, banmal: `안녕, 매니저 ${n.banmal}. 사업 계획 같이 세우자.` }
      : { haeyo: `안녕하세요, ${role} ${n.haeyo}. 잘 부탁드려요.`, hamnida: `안녕하십니까, ${role} ${e.name}입니다. 잘 부탁드립니다.`, banmal: `안녕, ${role} ${n.banmal}. 잘 부탁해.` };
    repo.message(e.id, null, say(e, lines));
    return e;
  });
}

/** 고용 뒤 외형·말투·성향을 다시 다듬는다(능력 수치가 아니라 일하는 방식 설정) */
export function restyle(repo: Repo, id: string, raw: { style?: unknown; look?: unknown; name?: unknown }): Employee {
  const e = repo.getEmployee(id);
  if (!e) throw new DomainError(404, '직원을 찾을 수 없어요');
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 12) : e.name;
  const style = raw.style ? normalizeStyle(raw.style, e.style) : e.style;
  const look = raw.look ? normalizeLook(raw.look, e.look) : e.look;
  repo.exec('UPDATE employees SET name = ?, style = ?, look = ? WHERE id = ?', name, JSON.stringify(style), JSON.stringify(look), id);
  repo.emit('employee_updated', `${name}의 일하는 방식을 바꿨어요`, { actorId: id, subjectId: id, data: { restyle: true } });
  return repo.getEmployee(id)!;
}
