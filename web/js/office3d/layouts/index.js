// 성장 단계 → 사무실 레이아웃 (기획: docs/product/specs/growth-office.md)
export const STAGES = [
  { stage: 0, name: '공유 오피스 한 칸', file: 's0-shared.js' },
  { stage: 1, name: '작은 사무실', file: 's1-small.js' },
  { stage: 2, name: '한 층 사무실', file: 's2-floor.js' },
  { stage: 3, name: '빌딩 여러 층', file: 's3-tower.js' },
  { stage: 4, name: '사옥', file: 'hq.js' },
];

export async function loadLayout(stage) {
  const s = STAGES.find((x) => x.stage === stage) ?? STAGES.at(-1);
  try { return (await import(`./${s.file}`)).default; }
  catch (e) { console.warn(`${s.name} 레이아웃이 아직 없어요 — 사옥으로 보여요`, e?.message); return (await import('./hq.js')).default; }
}

/** 설계도 견본으로 짓기 — 도메인 맞춤 공간 스파이크(결정 67). ?space=music 처럼 미리본다 */
export async function loadSpace(name) {
  const [{ default: spec }, { layoutFromSpec }] = await Promise.all([import(`../space/samples/${name}.js`), import('../space/generate.js')]);
  const layout = layoutFromSpec(spec);
  if (layout.notes.length) console.info('설계도 메모', layout.notes);
  return layout;
}
