import type { App } from '../app.ts';
import { listTodos, setTodoDone } from '../engine/todos.ts';
import { DomainError } from '../store/repo.ts';
import type { Route } from './http.ts';
import { documentDetail, documentsView, metaView, sendArtifactDownload } from './work.ts';

/** P2 업무 블록 — 문서함 · 내려받기 · 내 할 일 · 화면 표(계약: docs/product/plans/p2-blocks-plan.md §2) */
export function workRoutes(app: App): Route[] {
  const { repo } = app;
  return [
    { method: 'GET', path: '/api/meta', handler: () => metaView() },
    { method: 'GET', path: '/api/documents', handler: () => documentsView(repo) },
    { method: 'GET', path: '/api/documents/:itemId', handler: ({ params }) => documentDetail(repo, params.itemId ?? '') },
    { method: 'GET', path: '/api/artifacts/:id/download', handler: ({ params, res }) => sendArtifactDownload(repo, params.id ?? '', res) },
    { method: 'GET', path: '/api/todos', handler: () => listTodos(repo) },
    {
      method: 'POST', path: '/api/todos/:id',
      handler: ({ params, body }) => {
        if (typeof body.done !== 'boolean') throw new DomainError(400, 'done(true · false)으로 보내 주세요');
        return setTodoDone(repo, params.id ?? '', body.done);
      },
    },
  ];
}
