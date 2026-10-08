// 설계도 견본 — 회사 설명 "1인 창업자들이 쓰는 생산성 도구를 리뷰하는 브랜드(블로그·뉴스레터·SNS)"를 받은 매니저(AI)가 쓸 출력의 예시.
// (스파이크: 가짜 AI로 확인 — 형식·조립 확인용 견본)
export default {
  version: 1,
  title: '툴로그 콘텐츠 랩',
  domain: '콘텐츠 미디어',
  style: { floor: 'wood', floorColor: '#C9A77E', wall: '#ECE7DF', accent: '#2E8A63', light: 'warm', windows: true },
  rooms: [
    {
      id: 'editorial', name: '에디토리얼룸', walls: 'open', size: 'l', color: '#2E8A63',
      stations: [
        { role: 'writer', station: 'desk', count: 2, label: '콘텐츠 작성', extras: [] },
        { role: 'researcher', station: 'desk', count: 1, label: '트렌드 리서치', extras: [] },
      ],
      props: ['plant'], facilities: ['board'],
    },
    {
      id: 'studio', name: '촬영 스튜디오', walls: 'glass', size: 'm', color: '#8A5BB8',
      stations: [{ role: 'designer', station: 'drafting', count: 1, label: '썸네일·이미지', extras: [] }],
      props: ['backdrop_stand', 'camera_tripod', 'ring_light'], facilities: [],
    },
    {
      id: 'chief', name: '편집장실', walls: 'glass', size: 's', color: '#1F3B5B',
      stations: [{ role: 'manager', station: 'desk', count: 1, label: '편집장', extras: [] }],
      props: [], facilities: ['decisions'],
    },
    {
      id: 'lounge', name: '라이브러리 라운지', walls: 'open', size: 'm', color: '#C98A2E',
      stations: [], props: ['sofa', 'coffee_bar'], facilities: ['knowledge', 'milestones', 'power'],
    },
    {
      id: 'podcast', name: '팟캐스트 부스', walls: 'solid', size: 's', color: '#B4664C',
      stations: [], props: ['podcast_desk', 'plant'], facilities: [],
    },
  ],
  facilities: {
    board: { form: 'whiteboard', label: '콘텐츠 캘린더' },
    decisions: { form: 'desk', label: '편집장 확인' },
    power: { form: 'router', label: 'AI 연결' },
    knowledge: { form: 'bookshelf', label: '브랜드 자료실' },
    milestones: { form: 'trophy', label: '마일스톤' },
  },
  recipes: {
    podcast_desk: { parts: [
      { s: 'cyl', d: [0.55, 0.04], p: [0, 0.74, 0], m: 'wood', c: '#8A6A4A' },
      { s: 'cyl', d: [0.05, 0.72], p: [0, 0.36, 0], m: 'black' },
      { s: 'cyl', d: [0.012, 0.3], p: [-0.25, 0.9, 0.15], r: [0, 0, 20], m: 'black' },
      { s: 'cyl', d: [0.04, 0.13], p: [-0.3, 1.06, 0.15], m: 'metal' },
      { s: 'cyl', d: [0.012, 0.3], p: [0.25, 0.9, -0.15], r: [0, 0, -20], m: 'black' },
      { s: 'cyl', d: [0.04, 0.13], p: [0.3, 1.06, -0.15], m: 'metal' },
      { s: 'box', d: [0.3, 0.05, 0.18], p: [0, 0.79, 0], m: 'black' },
      { s: 'box', d: [0.06, 0.02, 0.06], p: [0.08, 0.82, 0.03], m: 'glow', c: '#E8892B' },
    ] },
    camera_tripod: { parts: [
      { s: 'cyl', d: [0.012, 1.25], p: [0, 0.75, 0], m: 'black' },
      { s: 'cyl', d: [0.01, 0.8], p: [0.18, 0.34, 0], r: [0, 0, 25], m: 'black' },
      { s: 'cyl', d: [0.01, 0.8], p: [-0.09, 0.34, -0.156], r: [0, 120, 25], m: 'black' },
      { s: 'cyl', d: [0.01, 0.8], p: [-0.09, 0.34, 0.156], r: [0, 240, 25], m: 'black' },
      { s: 'box', d: [0.16, 0.11, 0.1], p: [0, 1.42, 0], m: 'black', c: '#1E1E22' },
      { s: 'cyl', d: [0.04, 0.1], p: [0, 1.42, 0.09], r: [90, 0, 0], m: 'black' },
      { s: 'cyl', d: [0.034, 0.012], p: [0, 1.42, 0.145], r: [90, 0, 0], m: 'glass' },
    ] },
    ring_light: { parts: [
      { s: 'cyl', d: [0.012, 1.5], p: [0, 0.75, 0], m: 'metal' },
      { s: 'cyl', d: [0.18, 0.03], p: [0, 0.015, 0], m: 'black' },
      { s: 'torus', d: [0.24, 0.025], p: [0, 1.62, 0], m: 'glow', c: '#FFF4DE' },
      { s: 'box', d: [0.08, 0.14, 0.01], p: [0, 1.62, 0.01], m: 'black' },
    ] },
    backdrop_stand: { parts: [
      { s: 'cyl', d: [0.015, 2.3], p: [-1.0, 1.15, 0], m: 'metal' },
      { s: 'cyl', d: [0.015, 2.3], p: [1.0, 1.15, 0], m: 'metal' },
      { s: 'cyl', d: [0.04, 2.1], p: [0, 2.25, 0], r: [0, 0, 90], c: '#E8D9BF' },
      { s: 'box', d: [2.0, 2.2, 0.01], p: [0, 1.15, 0.03], c: '#F1E7D3' },
      { s: 'box', d: [2.0, 0.01, 0.9], p: [0, 0.01, 0.48], c: '#F1E7D3' },
      { s: 'box', d: [0.5, 0.5, 0.5], p: [0.3, 0.25, 0.55], c: '#E4C9A0' },
    ] },
  },
};
