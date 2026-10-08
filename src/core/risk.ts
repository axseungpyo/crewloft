import type { DecisionKind, DecisionRisk } from './types.ts';

/**
 * 결정 등급(결정 80) — 대표는 위험한 것만 하나씩 결재한다.
 * - 밖으로(external): 게시 · 발송 · 외부 저장 — 실제 나갈 원문을 연 뒤에만 승인, 알림은 하나씩
 * - 방향(direction): 실행 계획 · 설계도 · 예산 계속 · 채용 · 대표에게 묻는 질문 — 하나씩 보되 미리보기 단계는 없음
 * - 사무실 안(internal): 결과물 확인 등 — 회차별로 묶어 한 번에 확정할 수 있다
 */
export function riskOf(kind: DecisionKind, payload: Record<string, unknown> = {}): DecisionRisk {
  switch (kind) {
    case 'publish_confirm':
      return 'external';
    case 'artifact_confirm':
      return payload.plan === true ? 'direction' : 'internal';
    case 'rule_confirm':
    case 'knowledge_promote':
      return 'internal';
    default:
      // 재연결(이미 승인한 게시를 다시 보냄) · 채용 · 승급 · 사무실 이전 · 질문 · 예산 계속
      return 'direction';
  }
}

export const RISK_LABEL: Record<DecisionRisk, string> = { internal: '사무실 안', direction: '방향', external: '밖으로' };
