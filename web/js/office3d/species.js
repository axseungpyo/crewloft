// 직무 → 3D 전령(임시 — 캐릭터는 재기획 예정, 결정 64). 사무실 · 초상이 같이 쓴다
import { owl, fox, octopusWriter, chameleon } from './cast.js';
import { meta } from '../lib.js';

/** 추가 직무(결정 71)는 같은 종의 색만 바꾼 자리표시 */
export const SPECIES = {
  manager: owl, researcher: fox, writer: octopusWriter, designer: chameleon,
  marketer: (o) => fox({ ...o, colors: { body: '#C2457A', cream: '#F8E3EC', dark: '#4A1F33' } }),
  editor: (o) => owl({ ...o, colors: { body: '#3E6B55', wing: '#2F5444', belly: '#86A898' } }),
  producer: (o) => octopusWriter({ ...o, colors: { body: '#C0472F', spot: '#E8836B', ink: '#4A1A12' } }),
  seo: (o) => fox({ ...o, colors: { body: '#2F7FB8', cream: '#E3F0F8', dark: '#173A54' } }),
};
/** 직급 → 장식 금속(청동 · 은 · 금 · 금+보석) */
export const RANK = { '매니저(팀장)': 'lead', 실장: 'head', 본부장: 'head', 사원: 'new', 주임: 'mid', 선임: 'lead' };
/** 추가 직무가 단계 공간에서 앉을 가까운 팀 — /api/meta의 roles[].kin(3D는 앱이 표를 읽은 뒤에 불러온다) */
export const KIN = Object.fromEntries(Object.entries(meta.roles).filter(([, r]) => r.kin).map(([k, r]) => [k, r.kin]));
