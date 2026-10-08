import type { App } from '../app.ts';
import type { Channel } from '../core/types.ts';
import { milestones } from '../engine/growth.ts';
import { employeeCard, sendDm } from '../engine/people.ts';
import { decide, decisionRisk } from '../engine/decisions.ts';
import { calendar } from './calendar.ts';
import { contentView } from './content.ts';
import { markSeen, returnSummary } from '../engine/summary.ts';
import { companyView, employeeSheet, knowledgeAction, promote, promoteRule, ruleAction } from '../engine/company.ts';
import { restyle } from '../engine/hiring.ts';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ApprovalPolicy, Timetable } from '../engine/publishing.ts';
import { DomainError, newId } from '../store/repo.ts';
import { build, checkRoomRequest, finishRoom, place, saveSpec, spaceDesignRequest, spaceRoomRequest, spaceState, startWork, type SpaceSpec } from '../engine/space.ts';
import type { Route } from './http.ts';
import { exportCycle, exportKnowledge, facilityLevels, facilityState, upgradeFacility, usageLog } from '../engine/facilities.ts';
import { recordTime, timeSummary } from '../engine/owner-time.ts';

/** 설정·연결·로그인 — 사람(S4)·회사(S8)·복귀 요약(S6)은 각 단계에서 추가한다 */
export function moreRoutes(app: App): Route[] {
  const { repo } = app;
  const CHANNELS: Channel[] = ['blog', 'threads', 'linkedin'];
  return [
    // ── 공간(결정 67·68) — 설계도·짓기·배치 ──
    { method: 'GET', path: '/api/space', handler: () => ({ ...spaceState(repo), design: app.requests.latest('space:design'), facilities: facilityState(repo) }) },
    // ── 기능 시설 업그레이드 — 레벨이 오르면 그 화면에 편의 기능이 열린다 ──
    { method: 'POST', path: '/api/space/facility', handler: ({ body }) => { upgradeFacility(repo, String(body.key ?? '')); return facilityState(repo); } },
    { method: 'GET', path: '/api/cycles/:id/export', handler: ({ params }) => exportCycle(repo, params.id ?? '') },
    { method: 'GET', path: '/api/usage/log', handler: () => usageLog(repo) },
    { method: 'GET', path: '/api/knowledge/export', handler: () => exportKnowledge(repo, app.learning.knowledge(['active'])) },
    {
      method: 'POST', path: '/api/space/design',
      handler: () => {
        const office = repo.getOffice();
        if (!office) throw new DomainError(400, '사무실을 먼저 열어 주세요');
        const running = app.requests.latest('space:design');
        if (running?.status === 'running') return running;
        const team = repo.listEmployees().map((e) => ({ role: e.role, name: e.name }));
        return app.requests.start('space:design', { key: 'space' }, () => spaceDesignRequest(office, team), (data) => saveSpec(repo, data as unknown as SpaceSpec));
      },
    },
    {
      // 새 방 요청 — 매니저(AI)가 설계하는 동안이 공사 기간. 끝나면 그 방이 지어진 채로 생긴다
      method: 'POST', path: '/api/space/rooms',
      handler: ({ body }) => {
        const office = repo.getOffice();
        if (!office) throw new DomainError(400, '사무실을 먼저 열어 주세요');
        const need = String(body.need ?? '').trim();
        checkRoomRequest(repo, need);
        const spec = repo.getSetting<SpaceSpec>('space.spec')!;
        const team = repo.listEmployees().map((e) => ({ role: e.role, name: e.name }));
        const workId = newId('wk');
        const req = app.requests.start('space:room', { key: workId, need }, () => spaceRoomRequest(office, spec, need, team), (data) => finishRoom(repo, workId, data));
        startWork(repo, { id: workId, need, requestId: req.id });
        return spaceState(repo);
      },
    },
    { method: 'POST', path: '/api/space/build', handler: ({ body }) => build(repo, String(body.plot ?? ''), body.option ? String(body.option) : undefined) },
    {
      method: 'POST', path: '/api/space/place',
      handler: ({ body }) => {
        const p = body.reset ? null : { x: Number(body.x), z: Number(body.z), rot: Number(body.rot ?? 0) };
        place(repo, String(body.id ?? ''), p);
        return { ok: true };
      },
    },
    // ── 대표가 들인 시간(결정 72) ──
    { method: 'POST', path: '/api/time', handler: ({ body }) => recordTime(repo, body.spans) },
    { method: 'GET', path: '/api/time/summary', handler: () => timeSummary(repo) },
    // ── 사람(S1 직원 카드·DM) ──
    { method: 'GET', path: '/api/employees/:id', handler: ({ params }) => employeeCard(app, params.id ?? '') },
    {
      method: 'POST', path: '/api/employees/:id/dm',
      handler: ({ params, body }) => sendDm(app, params.id ?? '', String(body.text ?? ''), body.scope === 'always' ? 'always' : null),
    },
    {
      method: 'GET', path: '/api/knowledge/summary',
      handler: () => ({ books: app.learning.knowledge(['active']).length, trophies: milestones(app).filter((m) => m.achieved).length }),
    },
    {
      method: 'POST', path: '/api/pause',
      handler: ({ body }) => {
        const paused = body.paused === true;
        repo.setSetting('runner.paused', paused);
        repo.emit('system', paused ? '대표님이 전체를 잠시 멈췄어요 — 하던 업무만 마무리해요' : '다시 시작했어요');
        return { paused };
      },
    },
    {
      method: 'POST', path: '/api/office/decor',
      handler: ({ body }) => {
        const wall = ['sage', 'cream', 'clay'].includes(String(body.wall)) ? String(body.wall) : 'sage';
        const decor = { wall, plants: body.plants !== false, rug: body.rug !== false };
        repo.setSetting('office.decor', decor);
        return decor;
      },
    },
    // ── 복귀 요약(S6) ──
    { method: 'GET', path: '/api/summary', handler: () => returnSummary(app) },
    { method: 'POST', path: '/api/summary/seen', handler: () => { markSeen(app); return { ok: true }; } },
    // ── 회사(S4·S8) ──
    { method: 'GET', path: '/api/employees/:id/sheet', handler: ({ params }) => employeeSheet(app, params.id ?? '') },
    { method: 'POST', path: '/api/employees/:id/style', handler: ({ params, body }) => restyle(repo, params.id ?? '', { name: body.name, style: body.style, look: body.look }) },
    {
      method: 'POST', path: '/api/employees/:id/ai',
      handler: ({ params, body }) => {
        const e = repo.getEmployee(params.id ?? '');
        if (!e) throw new DomainError(404, '직원을 찾을 수 없어요');
        const p = body.provider === null ? null : String(body.provider ?? '');
        if (p !== null && !(p in app.providers)) throw new DomainError(400, '알 수 없는 AI 연결이에요');
        repo.exec('UPDATE employees SET ai_provider = ? WHERE id = ?', p, e.id);
        repo.emit('employee_updated', `${e.name}의 AI 연결: ${p ? app.providers[p as keyof typeof app.providers].label : '사무실 기본'}`, { actorId: e.id, subjectId: e.id });
        return { ok: true };
      },
    },
    { method: 'POST', path: '/api/employees/:id/promote', handler: ({ params }) => { promote(app, params.id ?? ''); return { ok: true }; } },
    { method: 'POST', path: '/api/rules/:id', handler: ({ params, body }) => ruleAction(app, params.id ?? '', String(body.action ?? ''), typeof body.text === 'string' ? body.text : undefined) },
    {
      method: 'POST', path: '/api/rules/:id/promote',
      handler: ({ params, body }) => promoteRule(app, params.id ?? '', body.category === 'principle' || body.category === 'lesson' ? body.category : 'method'),
    },
    { method: 'GET', path: '/api/company', handler: () => companyView(app) },
    {
      method: 'POST', path: '/api/knowledge',
      handler: ({ body }) => {
        const title = String(body.title ?? '').trim().slice(0, 40);
        const text = String(body.body ?? '').trim().slice(0, 600);
        if (!title || !text) throw new DomainError(400, '제목과 내용을 적어 주세요');
        const category = body.category === 'principle' || body.category === 'lesson' ? body.category : 'method';
        const k = app.learning.addKnowledge({ category, title, body: text, scope: String(body.scope ?? '').slice(0, 80), status: 'active' });
        repo.emit('knowledge_changed', `회사 지식 추가: ${title}`, { subjectId: k.id, data: { status: 'active' } });
        return k;
      },
    },
    {
      method: 'POST', path: '/api/knowledge/:id',
      handler: ({ params, body }) => knowledgeAction(app, params.id ?? '', String(body.action ?? ''), { title: body.title as string | undefined, body: body.body as string | undefined, scope: body.scope as string | undefined }),
    },
    // ── 콘텐츠(S5) ──
    { method: 'GET', path: '/api/content', handler: ({ query }) => contentView(app, query.get('cycle')) },
    {
      method: 'POST', path: '/api/actions/:id/review-again',
      handler: ({ params }) => {
        const a = repo.getAction(params.id ?? '');
        if (!a || a.kind !== 'publish') throw new DomainError(404, '게시 기록을 찾을 수 없어요');
        app.executor.cancel(a.id);
        const old = a.decisionId ? repo.getDecision(a.decisionId) : null;
        if (!old) return { ok: true };
        return repo.openDecision({ kind: 'publish_confirm', cycleId: old.cycleId, itemId: old.itemId, artifactId: old.artifactId, reviewArtifactId: old.reviewArtifactId, title: `${old.title} (다시 검토)`, payload: { ...old.payload, changed: true } });
      },
    },
    // ── 캘린더·일괄 승인(S2·S5) ──
    { method: 'GET', path: '/api/calendar', handler: ({ query }) => calendar(app, Number(query.get('offset') ?? 0) || 0) },
    {
      // 회차 묶음 확정(결정 80) — 사무실 안 등급만 한 번에. 방향 · 밖으로가 섞이면 하나도 처리하지 않고 409. 시설 잠금 없음
      method: 'POST', path: '/api/decisions/batch',
      handler: ({ body }) => {
        if (body.action !== 'approve') throw new DomainError(400, '일괄 처리는 승인만 할 수 있어요');
        const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map(String))] : [];
        const mixed = ids.map((id) => repo.getDecision(id)).filter((d) => d && decisionRisk(d) !== 'internal');
        if (mixed.length) throw new DomainError(409, `사무실 안 확인만 한 번에 확정할 수 있어요 — 방향 · 밖으로 ${mixed.length}건은 하나씩 확인해 주세요`);
        const failed: string[] = [];
        for (const id of ids) {
          try { decide(repo, app.learning, id, { action: 'approve' }); } catch (err) { failed.push(`${id}: ${(err as Error).message}`); }
        }
        return { approved: ids.length - failed.length, failed };
      },
    },
    {
      method: 'GET', path: '/api/media/:id',
      handler: async ({ params, res }) => {
        const m = repo.one<{ file: string; mime: string }>('SELECT file, mime FROM media WHERE id = ?', params.id ?? '');
        if (!m) throw new DomainError(404, '파일이 없어요');
        res.writeHead(200, { 'content-type': m.mime, 'cache-control': 'private, max-age=3600' });
        res.end(await readFile(path.join(app.cfg.dataDir, 'media', path.basename(m.file))));
        return undefined;
      },
    },
    // ── 로그인 ──
    { method: 'GET', path: '/api/auth', handler: () => ({ enabled: app.auth.enabled() }) },
    {
      method: 'POST', path: '/api/login',
      handler: ({ body, req, res }) => {
        app.auth.login(String(body.password ?? ''), res, (req.headers['x-forwarded-proto'] ?? '') === 'https');
        return { ok: true };
      },
    },
    { method: 'POST', path: '/api/logout', handler: ({ req, res }) => { app.auth.logout(req, res); return { ok: true }; } },
    {
      method: 'POST', path: '/api/auth/password',
      handler: ({ body }) => {
        app.auth.setPassword(body.password === null ? null : String(body.password ?? ''));
        return { enabled: app.auth.enabled() };
      },
    },

    // ── 설정 전체(S7) ──
    {
      method: 'GET', path: '/api/settings',
      handler: () => ({
        dataDir: app.cfg.dataDir, host: app.cfg.host, port: app.cfg.port, authEnabled: app.auth.enabled(),
        appPublicBase: repo.getSetting<string>('app.publicBase'), mediaPublicBase: repo.getSetting<string>('media.publicBase'),
        notify: repo.getSetting('notify.policy') ?? { kinds: ['decision', 'reconnect', 'task', 'unknown', 'failed', 'cycle'], batchSeconds: 20 },
        blogTarget: repo.getSetting<string>('publish.blogTarget'), weeklyBudgetUsd: app.cfg.weeklyBudgetUsd,
        claude: { model: app.cfg.claude.model, maxBudgetPerRunUsd: app.cfg.claude.maxBudgetPerRunUsd, concurrency: app.cfg.claude.concurrency },
      }),
    },
    {
      method: 'POST', path: '/api/settings/public',
      handler: ({ body }) => {
        for (const [k, key] of [['appPublicBase', 'app.publicBase'], ['mediaPublicBase', 'media.publicBase']] as const) {
          if (body[k] === undefined) continue;
          const v = typeof body[k] === 'string' && /^https?:\/\/\S+$/.test(body[k] as string) ? (body[k] as string).replace(/\/$/, '') : null;
          if (v) repo.setSetting(key, v);
          else repo.deleteSetting(key);
        }
        return { ok: true };
      },
    },
    {
      method: 'GET', path: '/api/export',
      handler: ({ res }) => {
        const tables = ['offices', 'projects', 'employees', 'cycles', 'tasks', 'artifacts', 'handoffs', 'decisions', 'external_actions', 'rules', 'knowledge', 'feedback', 'dms', 'events', 'blueprints', 'owner_todos'];
        const dump: Record<string, unknown> = { exportedAt: new Date().toISOString(), note: '연결 비밀값(토큰·키)은 내보내지 않아요' };
        for (const t of tables) dump[t] = repo.many(`SELECT * FROM ${t}`);
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'content-disposition': 'attachment; filename="agent-office-export.json"' });
        res.end(JSON.stringify(dump, null, 2));
        return undefined;
      },
    },
    // ── 결재 규칙·시간표·게시 모드(S7) ──
    {
      method: 'POST', path: '/api/settings/publish',
      handler: ({ body }) => {
        if (body.live !== undefined) {
          repo.setSetting('publish.live', body.live === true);
          repo.emit('system', body.live === true ? '실제 게시를 켰어요 — 승인된 게시물이 예약 시각에 실제로 올라가요' : '실제 게시를 껐어요 — 연습 게시로 기록만 남겨요');
        }
        if (body.policy !== undefined) {
          const p = body.policy as Partial<ApprovalPolicy>;
          const policy: ApprovalPolicy = {
            mode: p.mode === 'weekly' ? 'weekly' : 'per_post',
            autoPlatforms: Array.isArray(p.autoPlatforms) ? p.autoPlatforms.filter((c): c is Channel => CHANNELS.includes(c as Channel)) : [],
          };
          repo.setSetting('approval.policy', policy);
          repo.emit('system', `결재 규칙: ${policy.mode === 'weekly' ? '주간 묶음 검토' : '게시물별 확인'}${policy.autoPlatforms.length ? ` · 사전 허용 ${policy.autoPlatforms.join(', ')}` : ''}`);
        }
        if (body.timetable !== undefined) repo.setSetting('publish.timetable', body.timetable as Partial<Timetable>);
        if (body.blogTarget !== undefined) {
          if (body.blogTarget !== 'ghost' && body.blogTarget !== 'wordpress' && body.blogTarget !== null) throw new DomainError(400, '블로그 대상은 ghost 또는 wordpress예요');
          if (body.blogTarget === null) repo.deleteSetting('publish.blogTarget');
          else repo.setSetting('publish.blogTarget', body.blogTarget);
        }
        if (body.publicBase !== undefined) {
          const v = typeof body.publicBase === 'string' && /^https?:\/\//.test(body.publicBase) ? body.publicBase.replace(/\/$/, '') : null;
          if (v) repo.setSetting('media.publicBase', v);
          else repo.deleteSetting('media.publicBase');
        }
        return { ok: true };
      },
    },
    {
      method: 'POST', path: '/api/settings/notify',
      handler: ({ body }) => {
        const kinds = Array.isArray(body.kinds) ? body.kinds.map(String).slice(0, 10) : undefined;
        const batchSeconds = typeof body.batchSeconds === 'number' ? Math.max(5, Math.min(3600, Math.round(body.batchSeconds))) : undefined;
        const cur = repo.getSetting<Record<string, unknown>>('notify.policy') ?? {};
        repo.setSetting('notify.policy', { ...cur, ...(kinds ? { kinds } : {}), ...(batchSeconds ? { batchSeconds } : {}) });
        return repo.getSetting('notify.policy');
      },
    },
  ];
}
