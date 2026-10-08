import { ASK_LIMIT } from '../ai/tasks.ts';
import type { Task, TaskAsk } from '../core/types.ts';
import { clip, iga } from '../core/voice.ts';
import type { Repo } from '../store/repo.ts';

// 되묻기(결정 80) — 받은 직원이 자료가 이상하거나 모자라면 짐작하지 않고 묻는다.
// ① 넘겨준 직원에게: 짧은 '답하기' 업무가 생기고, 답이 오면 이어서 ② 대표에게: 결정함에 질문 카드, 대표 답이 오면 이어서.
// 업무 하나에 넘겨준 직원에게는 ASK_LIMIT번까지, 넘으면 대표에게 한 번. 그 뒤로는 묻지 않고 지금 자료로 끝낸다.

interface AskEntry { to: 'sender' | 'owner'; question: string; toEmployeeId?: string; answer?: string }

/** 이번 되묻기를 받을지 · 누구에게 갈지. null이면 묻지 않고 응답 그대로 끝낸다(상한을 넘음) */
export function routeAsk(task: Task, wanted: 'sender' | 'owner', senderId: string | null): 'sender' | 'owner' | null {
  const count = (task.meta.ask as TaskAsk | undefined)?.count ?? 0;
  if (count > ASK_LIMIT) return null;
  if (count === ASK_LIMIT) return 'owner';
  return wanted === 'sender' && senderId && senderId !== task.assigneeId ? 'sender' : 'owner';
}

/** 묻는다 — 업무는 '되묻는 중', 넘겨준 직원에게 답하기 업무 또는 대표에게 질문 카드. 만든 결정 id를 돌려준다 */
export function openAsk(repo: Repo, task: Task, to: 'sender' | 'owner', question: string, sender: { employeeId: string; artifactId: string } | null): string | null {
  return repo.tx(() => {
    const count = ((task.meta.ask as TaskAsk | undefined)?.count ?? 0) + 1;
    const asker = repo.getEmployee(task.assigneeId)?.name ?? '직원';
    const toEmployeeId = to === 'sender' && sender ? sender.employeeId : undefined;
    const target = toEmployeeId ? repo.getEmployee(toEmployeeId)?.name ?? '동료' : '대표';
    const ask: TaskAsk = { to, question, ...(toEmployeeId ? { toEmployeeId } : {}), askedAt: new Date().toISOString(), count };
    const history = [...((task.meta.askHistory as AskEntry[] | undefined) ?? []), { to, question, ...(toEmployeeId ? { toEmployeeId } : {}) }];
    repo.updateTaskMeta(task.id, { ask, askHistory: history });
    repo.setTaskStatus(task.id, 'asked', { reason: `${target}에게 물어보는 중 — ${clip(question, 60)}` });
    let decisionId: string | null = null;
    if (toEmployeeId && sender) {
      repo.createTask({
        cycleId: task.cycleId, step: `${task.step}-ask${count}`, kind: 'answer', title: `${asker}의 질문에 답하기`, assigneeId: toEmployeeId,
        dependsOn: [], itemId: `${task.itemId}:ask${count}`, meta: { answerFor: task.id, question, askerName: asker, inputs: [sender.artifactId] },
      });
      repo.message(task.assigneeId, toEmployeeId, question, { cycleId: task.cycleId, taskId: task.id, ask: true });
    } else {
      decisionId = repo.openDecision({
        kind: 'owner_question', cycleId: task.cycleId, itemId: `ask:${task.id}:${count}`, title: `${iga(asker)} 여쭤봐요 — ${clip(question, 50)}`,
        payload: { taskId: task.id, question, from: task.assigneeId, count },
      }).id;
    }
    repo.emit('task_asked', `${iga(asker)} ${target}에게 물었어요: ${clip(question, 80)}`, {
      actorId: task.assigneeId, subjectId: task.id, data: { taskId: task.id, from: task.assigneeId, to: toEmployeeId ?? 'owner', question, cycleId: task.cycleId },
    });
    return decisionId;
  });
}

/** 답이 왔다 — 답을 남기고 업무를 다시 대기로. by: 답한 직원 id 또는 'owner' */
export function answerAsk(repo: Repo, taskId: string, answer: string, by: string): void {
  repo.tx(() => {
    const t = repo.getTask(taskId);
    if (!t || t.status !== 'asked') return;
    const ask = t.meta.ask as TaskAsk | undefined;
    const history = [...((t.meta.askHistory as AskEntry[] | undefined) ?? [])];
    const last = history.at(-1);
    if (last && last.answer === undefined) history[history.length - 1] = { ...last, answer };
    repo.updateTaskMeta(t.id, { ...(ask ? { ask: { ...ask, answer, answeredAt: new Date().toISOString() } } : {}), askHistory: history });
    const who = by === 'owner' ? '대표' : repo.getEmployee(by)?.name ?? '동료';
    repo.setTaskStatus(t.id, 'waiting', { reason: `${iga(who)} 답했어요 — 이어서 해요` });
    if (by !== 'owner') repo.message(by, t.assigneeId, answer, { cycleId: t.cycleId, taskId: t.id, answer: true });
    repo.emit('task_answered', `${iga(who)} 답했어요: ${clip(answer, 80)}`, { actorId: by === 'owner' ? null : by, subjectId: t.id, data: { taskId: t.id, by, answer, cycleId: t.cycleId } });
  });
}
