import { interviewRequest, samplesRequest } from '../ai/hire-prompts.ts';
import { SETUP_DEFAULTS, SETUP_KEYS, STAGE_ANSWER, blueprintRequest, questionsRequest, reviseRequest } from '../ai/setup-prompts.ts';
import { WORK_BLOCKS, WORK_BLOCK_IDS, blockById, blockSummary } from '../blocks/catalog.ts';
import { STAFF_ROLES } from '../core/roles.ts';
import type { AIRequest, BlueprintData, Channel, Employee, Role } from '../core/types.ts';
import { say } from '../core/voice.ts';
import { DomainError, type Repo } from '../store/repo.ts';
import type { AIRequests } from './ai-requests.ts';
import { confirmDraft, confirmedBlueprint, draftBlueprint, normalizeBlueprint, saveDraft } from './blueprint.ts';
import { ARCHETYPES, archetypesFor, hire } from './hiring.ts';

/**
 * S3 온보딩 단계(결정 54–56 · 73): 서비스 소개 → 사업 소개 → 전력(AI) 연결 → 매니저 면접 →
 * 사업 인터뷰 → 사업 설계도 확인 → 첫 주 → 끝
 */
export type Stage = 'intro' | 'describe' | 'power' | 'interview' | 'setup' | 'blueprint' | 'first' | 'done';

/** '잘 모르겠어요' — 설계도에 가정으로 남는다 */
export const UNKNOWN = '__unknown__';

export const CHANNEL_OPTIONS: ReadonlyArray<{ key: string; label: string; channels: Channel[] }> = [
  { key: 'all', label: '블로그 + Threads + LinkedIn', channels: ['blog', 'threads', 'linkedin'] },
  { key: 'blog', label: '블로그만 먼저', channels: ['blog'] },
  { key: 'sns', label: 'SNS만 먼저 (Threads + LinkedIn)', channels: ['threads', 'linkedin'] },
];
export const CADENCE_OPTIONS: ReadonlyArray<{ key: string; label: string; sns: number }> = [
  { key: 'std', label: '블로그 1 + 뉴스레터 초안 1 + SNS 6 (추천)', sns: 3 },
  { key: 'light', label: '블로그 1 + 뉴스레터 초안 1 + SNS 4', sns: 2 },
  { key: 'min', label: '블로그 1 + 뉴스레터 초안 1 + SNS 2', sns: 1 },
];

export interface RoadmapItem { role: Role; why: string; when: string }
export interface SetupQuestion { key: string; text: string; options: string[] }

const setting = (repo: Repo, key: string): boolean => repo.getSetting<boolean>(key) === true;

export class Onboarding {
  #repo: Repo;
  #requests: AIRequests;

  constructor(repo: Repo, requests: AIRequests) {
    this.#repo = repo;
    this.#requests = requests;
  }

  stage(): Stage {
    const repo = this.#repo;
    if (!repo.getOffice()) return setting(repo, 'onboarding.intro') ? 'describe' : 'intro';
    if (!setting(repo, 'onboarding.power')) return 'power';
    if (!repo.listEmployees().some((e) => e.role === 'manager')) return 'interview';
    if (setting(repo, 'onboarding.done')) return 'done';
    if (confirmedBlueprint(repo)) return 'first';
    return draftBlueprint(repo) ? 'blueprint' : 'setup';
  }

  state(): Record<string, unknown> {
    const repo = this.#repo;
    const roles = STAFF_ROLES;
    // 그 직무를 마지막으로 채용한 뒤의 후보 샘플만 보여 준다 — 같은 직무를 또 뽑을 땐 새 후보를 받는다(결정 71)
    const hiredAt = new Map<string, string>();
    for (const e of repo.listEmployees()) if ((hiredAt.get(e.role) ?? '') < e.hiredAt) hiredAt.set(e.role, e.hiredAt);
    const fresh = (r: Role) => { const q = this.#requests.latest('hire:samples', r); return q && q.createdAt >= (hiredAt.get(r) ?? '') ? q : null; };
    return {
      stage: this.stage(),
      archetypes: ARCHETYPES,
      channelOptions: CHANNEL_OPTIONS,
      cadenceOptions: CADENCE_OPTIONS,
      interview: this.#requests.latest('hire:interview'),
      setup: this.#requests.latest('setup:questions'),
      questions: this.questions(),
      design: this.#requests.latest('setup:blueprint'),
      revise: this.#requests.latest('setup:revise'),
      draft: draftBlueprint(repo),
      blueprint: confirmedBlueprint(repo),
      catalog: WORK_BLOCKS.map(blockSummary),
      samples: Object.fromEntries(roles.map((r) => [r, fresh(r)])),
      roadmap: repo.getSetting<RoadmapItem[]>('hiring.roadmap') ?? [],
      answers: repo.getSetting<Record<string, string>>('onboarding.setupAnswers') ?? {},
    };
  }

  /** 사업 인터뷰 질문 — 뼈대는 고정, 매니저(AI)가 다듬은 말 · 선택지가 있으면 그것을 쓴다 */
  questions(): { greeting: string; list: SetupQuestion[] } {
    const out = this.#requests.latest('setup:questions');
    const data = (out?.status === 'done' ? out.output : null) as { greeting?: string; questions?: Array<Record<string, unknown>>; extra?: Array<Record<string, unknown>> } | null;
    const opts = (v: unknown, fallback: string[]): string[] => {
      const list = Array.isArray(v) ? v.map((x) => String(x).trim().slice(0, 30)).filter(Boolean).slice(0, 4) : [];
      return list.length ? list : fallback;
    };
    const list: SetupQuestion[] = SETUP_KEYS.map((key) => {
      const q = data?.questions?.find((x) => x.key === key);
      const d = SETUP_DEFAULTS[key];
      return { key, text: (typeof q?.text === 'string' && q.text.trim()) || d.text, options: key === 'stage' ? d.options : opts(q?.options, d.options) };
    });
    (data?.extra ?? []).slice(0, 2).forEach((x, i) => {
      if (typeof x.text === 'string' && x.text.trim()) list.push({ key: `x${i + 1}`, text: x.text.trim(), options: opts(x.options, []) });
    });
    return { greeting: data?.greeting ?? '', list };
  }

  seenIntro(): void {
    this.#repo.setSetting('onboarding.intro', true);
  }

  confirmPower(): void {
    this.#repo.setSetting('onboarding.power', true);
    this.#repo.emit('system', '사무실에 전력을 연결했어요(AI 연결 확인)');
  }

  startInterview(): AIRequest {
    const office = this.#repo.getOffice();
    if (!office) throw new DomainError(400, '먼저 사업을 소개해 주세요');
    return this.#requests.start('hire:interview', { key: 'manager' }, () => interviewRequest(office, archetypesFor('manager')));
  }

  /** 면접에서 고른 후보를 다듬어 고용 — 진단 내용은 프로필로 남는다 */
  hireFromCandidate(input: { role: Role; archetype: string; name: string; style?: unknown; look?: unknown }): Employee {
    const arch = ARCHETYPES.find((a) => a.role === input.role && a.id === input.archetype);
    if (!arch) throw new DomainError(400, '후보를 찾을 수 없어요');
    const profile: Employee['profile'] = { archetype: arch.id, pitch: arch.pitch };
    if (input.role === 'manager') {
      const out = this.#requests.latest('hire:interview')?.output as { candidates?: Array<Record<string, unknown>> } | null;
      const c = out?.candidates?.find((x) => x.archetype === arch.id);
      if (c) {
        profile.direction = String(c.direction ?? '');
        profile.plan = Array.isArray(c.plan) ? c.plan.map(String) : [];
      }
    } else {
      const out = this.#requests.latest('hire:samples', input.role)?.output as { candidates?: Array<Record<string, unknown>> } | null;
      const c = out?.candidates?.find((x) => x.archetype === arch.id);
      if (c) profile.bio = `면접 샘플: ${String(c.sample ?? '')}`;
    }
    return hire(this.#repo, { role: input.role, name: input.name || arch.name, style: input.style ?? { traits: arch.traits }, look: input.look ?? arch.look, profile });
  }

  #ctx(): { office: NonNullable<ReturnType<Repo['getOffice']>>; manager: Employee } {
    const office = this.#repo.getOffice();
    const manager = this.#repo.employeeByRole('manager');
    if (!office || !manager) throw new DomainError(400, '매니저를 먼저 채용해 주세요');
    return { office, manager };
  }

  /** 사업 인터뷰 준비 — 매니저가 이 사업에 맞는 말 · 선택지를 만든다(AI 1번) */
  startSetup(): AIRequest {
    const { office, manager } = this.#ctx();
    return this.#requests.start('setup:questions', { key: 'setup' }, () => questionsRequest(office, manager));
  }

  /** 인터뷰 답 → 사업 설계도 초안(AI 1번). '잘 모르겠어요'는 설계도에 가정으로 */
  submitSetup(raw: Record<string, unknown>): AIRequest {
    const repo = this.#repo;
    const { office, manager } = this.#ctx();
    const { list } = this.questions();
    const answers: Record<string, string> = {};
    for (const q of list) {
      const v = typeof raw[q.key] === 'string' ? (raw[q.key] as string).trim().slice(0, 300) : '';
      answers[q.key] = v || UNKNOWN;
    }
    if (answers.customer === UNKNOWN && answers.goal === UNKNOWN && answers.stage === UNKNOWN) throw new DomainError(400, '단계 · 고객 · 이번 달 목표 중 하나는 알려 주세요');
    repo.setSetting('onboarding.setupAnswers', answers);
    const qa = list.map((q) => ({ q: q.text, a: answers[q.key] === UNKNOWN ? '잘 모르겠어요 — 가정으로 두고 조사 · 제안받기' : answers[q.key]! }));
    const stage = STAGE_ANSWER[answers.stage ?? ''];
    if (stage) qa.push({ q: '(단계 해석)', a: stage });
    let id = '';
    const req = this.#requests.start('setup:blueprint', { key: 'blueprint' }, () => blueprintRequest(office, manager, qa), (data) => {
      const bp = normalizeBlueprint(data);
      if (stage && !data.stage) bp.stage = stage;
      saveDraft(repo, bp, 'ai', id);
    });
    id = req.id;
    return req;
  }

  /** 설계도를 글로 고쳐 달라기(AI 1번) */
  reviseBlueprint(text: string): AIRequest {
    const repo = this.#repo;
    const { office, manager } = this.#ctx();
    const draft = draftBlueprint(repo);
    if (!draft) throw new DomainError(409, '고칠 설계도 초안이 없어요');
    let id = '';
    const req = this.#requests.start('setup:revise', { key: 'blueprint' }, () => reviseRequest(office, manager, draft.data, text), (data) => saveDraft(repo, normalizeBlueprint(data), 'ai', id));
    id = req.id;
    return req;
  }

  /**
   * 설계도 확정 — 화면에서 바꾼 블록 · 목표가 있으면 대표가 고친 새 버전으로 남기고 확정한다.
   * 확정하면 채용 순서 · 직원 프롬프트(브리프)가 설계도를 따른다. 콘텐츠 운영을 고르면 채널 · 분량도 정한다.
   */
  confirmBlueprint(edits: { blocks?: unknown; goals?: unknown; channels?: unknown; cadence?: unknown }): BlueprintData {
    const repo = this.#repo;
    const { manager } = this.#ctx();
    const draft = draftBlueprint(repo);
    if (!draft) throw new DomainError(409, '확정할 설계도 초안이 없어요');
    let data: BlueprintData = draft.data;
    let changed = false;
    if (Array.isArray(edits.blocks)) {
      const ids = [...new Set(edits.blocks.map(String).filter((b) => WORK_BLOCK_IDS.includes(b)))];
      if (!ids.length) throw new DomainError(400, '업무 블록을 하나 이상 골라 주세요');
      if (ids.join() !== data.blocks.map((b) => b.id).join()) {
        changed = true;
        data = { ...data, blocks: ids.map((bid) => data.blocks.find((b) => b.id === bid) ?? { id: bid, why: `대표가 더함 — ${blockById(bid)!.purpose}` }) };
      }
    }
    if (Array.isArray(edits.goals)) {
      const goals = edits.goals.map((g) => (g && typeof g === 'object' ? (g as Record<string, unknown>) : {})).map((g) => ({ text: String(g.text ?? '').trim().slice(0, 160), check: String(g.check ?? '').trim().slice(0, 160) })).filter((g) => g.text).slice(0, 3);
      if (!goals.length) throw new DomainError(400, '이번 달 목표를 하나 이상 남겨 주세요');
      if (JSON.stringify(goals) !== JSON.stringify(data.goals)) { changed = true; data = { ...data, goals }; }
    }
    const content = data.blocks.find((b) => b.id === 'content_ops');
    const ch = CHANNEL_OPTIONS.find((o) => o.key === edits.channels) ?? CHANNEL_OPTIONS[0]!;
    const cad = CADENCE_OPTIONS.find((o) => o.key === edits.cadence) ?? CADENCE_OPTIONS[0]!;
    if (content) {
      const config = { channels: ch.channels, cadence: cad.label.replace(' (추천)', ''), snsPerPlatform: cad.sns };
      if (JSON.stringify(config) !== JSON.stringify(content.config ?? {})) { changed = true; data = { ...data, blocks: data.blocks.map((b) => (b.id === 'content_ops' ? { ...b, config } : b)) }; }
    }
    return repo.tx(() => {
      // 화면에서 고친 블록이 새 직무를 필요로 하면 채용 순서도 다시 맞춘다
      const final = changed ? saveDraft(repo, normalizeBlueprint(data as unknown as Record<string, unknown>), 'owner') : draft;
      const bp = confirmDraft(repo, final.id).data;
      repo.updateBrief({
        goal: bp.goals[0]!.text, direction: bp.summary.slice(0, 300), audience: bp.customer,
        principles: ['밖으로 나가는 일은 대표 확인 뒤에', '확인 안 된 내용은 (가정) 표시'], assumptions: bp.assumptions,
        ...(content ? { channels: ch.channels, cadence: cad.label.replace(' (추천)', ''), snsPerPlatform: cad.sns } : { cadence: '주간 업무 블록' }),
      }, manager.id);
      repo.message(manager.id, null, say(manager, {
        haeyo: `설계도 확정! 첫 주에는 제가 사업 진단과 이번 달 실행 계획을 써서 확인받을게요.`,
        hamnida: `설계도가 확정됐습니다. 첫 주에는 사업 진단과 이번 달 실행 계획을 작성해 확인받겠습니다.`,
        banmal: `설계도 확정! 첫 주엔 내가 사업 진단이랑 이번 달 실행 계획 써서 확인받을게.`,
      }));
      return bp;
    });
  }

  startSamples(role: Role): AIRequest {
    if (role === 'manager') throw new DomainError(400, '매니저는 면접으로 채용해요');
    const office = this.#repo.getOffice();
    const project = this.#repo.getProject();
    if (!office || !project) throw new DomainError(400, '먼저 사업을 소개해 주세요');
    return this.#requests.start('hire:samples', { key: role }, () => samplesRequest(office, project.brief, role, archetypesFor(role)));
  }

  finish(): void {
    this.#repo.setSetting('onboarding.done', true);
    this.#repo.emit('system', '채용 시작 퀘스트를 마쳤어요');
  }
}
