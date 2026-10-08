// 내 할 일(P2 결정 3) — 결정 73 '대표가 할 일 vs AI 팀이 할 일'의 대표 몫.
// 대표가 확정한 실행 계획의 ownerTasks와 체크리스트의 [대표] 항목이 할 일이 된다. 체크는 대표가, 다음 주간 회고가 진행을 읽는다.
import { stepOfKind } from '../blocks/catalog.ts';
import type { Artifact, ChecklistItem, Todo } from '../core/types.ts';
import { DomainError, type Repo, newId, now } from '../store/repo.ts';

interface Row { id: string; text: string; due: string | null; source: string; artifact_id: string; item_id: string; status: string; done_at: string | null; created_at: string; artifact_title: string | null }
const SELECT = 'SELECT t.*, a.title AS artifact_title FROM owner_todos t LEFT JOIN artifacts a ON a.id = t.artifact_id';
const toTodo = (r: Row): Todo => ({
  id: r.id, text: r.text, due: r.due, source: r.source as Todo['source'], artifactId: r.artifact_id, artifactTitle: r.artifact_title ?? '',
  status: r.status as Todo['status'], doneAt: r.done_at, createdAt: r.created_at,
});

/**
 * 확정한 결과물에서 할 일을 만든다. 같은 결과물(itemId)의 새 버전을 확정하면 이전 할 일은 바꾸지 않고 새것만 더한다 — 같은 글은 건너뛴다.
 * 결정 처리 트랜잭션 안에서 부른다.
 */
export function createTodosFrom(repo: Repo, artifact: Artifact): Todo[] {
  const def = stepOfKind(artifact.kind);
  if (!def) return [];
  const wanted: Array<{ text: string; due: string | null; source: Todo['source'] }> = [];
  if (def.step.plan) for (const text of (artifact.meta.ownerTasks as string[] | undefined) ?? []) wanted.push({ text, due: null, source: 'plan' });
  if (def.step.shape === 'checklist') {
    for (const x of (artifact.meta.items as ChecklistItem[] | undefined) ?? []) if (x.owner === 'ceo') wanted.push({ text: x.text, due: x.due ?? null, source: 'checklist' });
  }
  const have = new Set(repo.many<{ text: string }>('SELECT text FROM owner_todos WHERE item_id = ?', artifact.itemId).map((r) => r.text.trim()));
  const made: string[] = [];
  for (const w of wanted) {
    const text = w.text.trim();
    if (!text || have.has(text)) continue;
    have.add(text);
    const id = newId('td');
    repo.exec('INSERT INTO owner_todos (id, text, due, source, artifact_id, item_id, status, done_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', id, text, w.due, w.source, artifact.id, artifact.itemId, 'open', null, now());
    made.push(id);
  }
  if (made.length) repo.emit('todo_changed', `내 할 일 ${made.length}개 — “${artifact.title}”에서`, { subjectId: artifact.id, data: { artifactId: artifact.id, added: made.length } });
  return made.map((id) => getTodo(repo, id)!);
}

export function getTodo(repo: Repo, id: string): Todo | null {
  const r = repo.one<Row>(`${SELECT} WHERE t.id = ?`, id);
  return r ? toTodo(r) : null;
}

/** 열린 할 일 전부(오래된 것부터) + 끝낸 것 최근 30개 */
export function listTodos(repo: Repo): { open: Todo[]; done: Todo[] } {
  return {
    open: repo.many<Row>(`${SELECT} WHERE t.status = 'open' ORDER BY t.created_at, t.rowid`).map(toTodo),
    done: repo.many<Row>(`${SELECT} WHERE t.status = 'done' ORDER BY t.done_at DESC LIMIT 30`).map(toTodo),
  };
}

export function openTodoCount(repo: Repo): number {
  return repo.one<{ n: number }>("SELECT COUNT(*) AS n FROM owner_todos WHERE status = 'open'")?.n ?? 0;
}

/** 대표가 체크 · 체크 해제 */
export function setTodoDone(repo: Repo, id: string, done: boolean): Todo {
  const t = getTodo(repo, id);
  if (!t) throw new DomainError(404, '할 일을 찾을 수 없어요');
  if ((t.status === 'done') === done) return t;
  repo.tx(() => {
    repo.exec('UPDATE owner_todos SET status = ?, done_at = ? WHERE id = ?', done ? 'done' : 'open', done ? now() : null, id);
    repo.emit('todo_changed', done ? `내 할 일 끝: ${t.text}` : `내 할 일 다시 열기: ${t.text}`, { subjectId: id, data: { status: done ? 'done' : 'open' } });
  });
  return getTodo(repo, id)!;
}

/** 주간 회고 · 다음 달 계획이 읽는 진행 — 남은 것 전부와 지난 회고 뒤(없으면 최근 7일)에 끝낸 것 */
export function todoProgress(repo: Repo, since?: string | null): { done: string[]; open: Array<{ text: string; due: string | null }> } {
  const from = since ?? new Date(Date.now() - 7 * 86_400_000).toISOString();
  return {
    done: repo.many<{ text: string }>("SELECT text FROM owner_todos WHERE status = 'done' AND done_at > ? ORDER BY done_at", from).map((r) => r.text),
    open: repo.many<{ text: string; due: string | null }>("SELECT text, due FROM owner_todos WHERE status = 'open' ORDER BY created_at, rowid"),
  };
}
