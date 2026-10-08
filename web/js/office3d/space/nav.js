// 길 찾기 — 바닥을 0.25m 칸으로 나누고 물건·벽이 있는 칸을 막은 뒤 A*로 걷는 길을 찾는다.
// 물건을 아무 데나 옮길 수 있어서(배치 모드) 정해진 통로 대신 쓴다.
const CELL = 0.25;

export class NavGrid {
  constructor(x0, z0, x1, z1) {
    this.x0 = x0; this.z0 = z0;
    this.nx = Math.ceil((x1 - x0) / CELL); this.nz = Math.ceil((z1 - z0) / CELL);
    this.block = new Uint8Array(this.nx * this.nz);
  }
  clear() { this.block.fill(0); }
  #ix(x) { return Math.floor((x - this.x0) / CELL); }
  #iz(z) { return Math.floor((z - this.z0) / CELL); }
  /** 사각형(축 정렬) 막기 */
  rect(ax, az, bx, bz) {
    const i0 = Math.max(0, this.#ix(Math.min(ax, bx))), i1 = Math.min(this.nx - 1, this.#ix(Math.max(ax, bx)));
    const k0 = Math.max(0, this.#iz(Math.min(az, bz))), k1 = Math.min(this.nz - 1, this.#iz(Math.max(az, bz)));
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) this.block[k * this.nx + i] = 1;
  }
  /** 선분(벽) 막기 */
  segment(ax, az, bx, bz, half = 0.08) {
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / (CELL / 2)));
    for (let t = 0; t <= n; t++) { const x = ax + ((bx - ax) * t) / n, z = az + ((bz - az) * t) / n; this.rect(x - half, z - half, x + half, z + half); }
  }
  free(i, k) { return i >= 0 && k >= 0 && i < this.nx && k < this.nz && !this.block[k * this.nx + i]; }
  #nearestFree(i, k) {
    if (this.free(i, k)) return [i, k];
    for (let r = 1; r < 12; r++) for (let dk = -r; dk <= r; dk++) for (let di = -r; di <= r; di++) if (Math.max(Math.abs(di), Math.abs(dk)) === r && this.free(i + di, k + dk)) return [i + di, k + dk];
    return null;
  }
  #center(i, k) { return [this.x0 + (i + 0.5) * CELL, this.z0 + (k + 0.5) * CELL]; }
  #los(a, b) { // 두 칸 사이가 다 비었는가(지름길)
    const [ai, ak] = a, [bi, bk] = b, n = Math.max(Math.abs(bi - ai), Math.abs(bk - ak)) * 2;
    for (let t = 0; t <= n; t++) { const i = Math.round(ai + ((bi - ai) * t) / n), k = Math.round(ak + ((bk - ak) * t) / n); if (!this.free(i, k)) return false; }
    return true;
  }
  /** A(x,z) → B(x,z) 길. 못 찾으면 곧은 선 */
  path(ax, az, bx, bz) {
    const s = this.#nearestFree(this.#ix(ax), this.#iz(az)), g = this.#nearestFree(this.#ix(bx), this.#iz(bz));
    if (!s || !g) return [[ax, az], [bx, bz]];
    const N = this.nx * this.nz, key = (i, k) => k * this.nx + i;
    const gs = new Float32Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const h = (i, k) => Math.hypot(i - g[0], k - g[1]);
    const open = [[h(...s), key(...s)]]; gs[key(...s)] = 0;
    const goal = key(...g);
    while (open.length) {
      let bi = 0; for (let q = 1; q < open.length; q++) if (open[q][0] < open[bi][0]) bi = q;
      const [, cur] = open.splice(bi, 1)[0];
      if (closed[cur]) continue; closed[cur] = 1;
      if (cur === goal) break;
      const ci = cur % this.nx, ck = (cur - ci) / this.nx;
      for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
        if (!di && !dk) continue;
        const ni = ci + di, nk = ck + dk;
        if (!this.free(ni, nk) || (di && dk && (!this.free(ci + di, ck) || !this.free(ci, ck + dk)))) continue;
        const nkey = key(ni, nk), cost = gs[cur] + (di && dk ? 1.414 : 1);
        if (cost < gs[nkey]) { gs[nkey] = cost; prev[nkey] = cur; open.push([cost + h(ni, nk), nkey]); }
      }
    }
    if (prev[goal] < 0 && goal !== key(...s)) return [[ax, az], [bx, bz]];
    const cells = []; for (let c = goal; c >= 0; c = prev[c]) { cells.unshift([c % this.nx, Math.floor(c / this.nx)]); if (c === key(...s)) break; }
    // 지름길로 줄이기
    const out = [cells[0]];
    let a = 0;
    while (a < cells.length - 1) { let b = cells.length - 1; while (b > a + 1 && !this.#los(cells[a], cells[b])) b--; out.push(cells[b]); a = b; }
    const pts = out.map(([i, k]) => this.#center(i, k));
    return [[ax, az], ...pts.slice(1, -1), [bx, bz]];
  }
}
