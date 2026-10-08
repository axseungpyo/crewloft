import { dmRequest } from '../ai/hire-prompts.ts';
import { personaPrompt } from '../ai/prompts.ts';
import type { App } from '../app.ts';
import { clip, iga } from '../core/voice.ts';
import { DomainError } from '../store/repo.ts';

/**
 * 직원에게 DM — 대표의 말은 바로 기록하고, 직원 답장은 AI가 그 직원 말투로 쓴다.
 * "앞으로도 지킬 규칙"을 고르면 확정 규칙(배운 것)으로 저장해 다음 업무부터 적용한다(결정 47·49).
 */
export function sendDm(app: App, employeeId: string, text: string, scope: 'always' | null): { dmId: string; requestId: string } {
  const { repo, learning } = app;
  const e = repo.getEmployee(employeeId);
  const office = repo.getOffice();
  const project = repo.getProject();
  if (!e || !office || !project) throw new DomainError(404, '직원을 찾을 수 없어요');
  const body = text.trim().slice(0, 1000);
  if (!body) throw new DomainError(400, '보낼 말을 적어 주세요');
  const history = learning.dms(e.id, 12).map((d) => ({ author: d.author, text: d.text }));
  const dm = repo.tx(() => {
    const d = learning.addDm(e.id, 'user', body);
    repo.emit('dm', `대표 → ${e.name}: ${clip(body, 60)}`, { subjectId: e.id, data: { employeeId: e.id, author: 'user' } });
    if (scope === 'always') {
      const fb = learning.addFeedback({ employeeId: e.id, kind: 'dm', text: body, scope: 'always' });
      const rule = learning.addRule({ employeeId: e.id, text: body, status: 'confirmed', source: { kind: 'dm', feedbackIds: [fb.id] } });
      repo.emit('rule_changed', `${iga(e.name)} 배웠어요: ${clip(body, 60)}`, { actorId: e.id, subjectId: rule.id, data: { status: 'confirmed' } });
    }
    return d;
  });
  const rules = learning.rules(e.id, ['confirmed']).map((r) => r.text);
  const knowledge = learning.knowledge(['active']).map((k) => ({ title: k.title, body: k.body }));
  const system = personaPrompt({ office, brief: project.brief, employee: e, teammates: repo.listEmployees(), rules, knowledge });
  const req = app.requests.start('dm:reply', { key: e.id }, () => dmRequest(system, history, body, e), (data) => {
    const reply = typeof data.reply === 'string' ? data.reply.trim() : '';
    if (!reply) return;
    learning.addDm(e.id, 'employee', reply);
    repo.message(e.id, null, reply, { dm: true });
  });
  return { dmId: dm.id, requestId: req.id };
}

export function employeeCard(app: App, id: string) {
  const { repo, learning } = app;
  const e = repo.getEmployee(id);
  if (!e) throw new DomainError(404, '직원을 찾을 수 없어요');
  const artifacts = repo.many<{ id: string; item_id: string; kind: string; version: number; title: string; body: string; created_at: string }>(
    'SELECT a.id, a.item_id, a.kind, a.version, a.title, a.body, a.created_at FROM artifacts a JOIN tasks t ON t.id = a.task_id WHERE t.assignee_id = ? ORDER BY a.created_at DESC LIMIT 12', id,
  ).map((a) => ({ id: a.id, itemId: a.item_id, kind: a.kind, version: a.version, title: a.title, body: a.body, createdAt: a.created_at }));
  return { employee: e, dms: learning.dms(id, 40), artifacts, rules: learning.rules(id) };
}
