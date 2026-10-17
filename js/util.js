/* 工具层：数学、随机、格式化。无依赖。 */
window.ZTS = window.ZTS || {};
(function () {
  const U = {};
  U.TAU = Math.PI * 2;

  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
  U.dist = (ax, ay, bx, by) => Math.sqrt(U.dist2(ax, ay, bx, by));
  U.angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
  U.approach = (cur, target, step) =>
    cur < target ? Math.min(cur + step, target) : Math.max(cur - step, target);
  U.shortestAngle = (a, b) => {
    let d = (b - a) % U.TAU;
    if (d > Math.PI) d -= U.TAU;
    if (d < -Math.PI) d += U.TAU;
    return d;
  };
  U.norm = (x, y) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };

  /* 可复现随机数（存档续玩的基础） */
  U.mulberry32 = function (seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  U.rand = (rng, a, b) => a + rng() * (b - a);
  U.randInt = (rng, a, b) => Math.floor(a + rng() * (b - a + 1));
  U.pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
  U.chance = (rng, p) => rng() < p;
  U.shuffle = (rng, arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  };
  U.weightedPick = (rng, entries) => {
    let total = 0;
    for (const e of entries) total += e.w;
    let r = rng() * total;
    for (const e of entries) { r -= e.w; if (r <= 0) return e; }
    return entries[entries.length - 1];
  };

  U.fmtTime = (sec) => {
    sec = Math.max(0, Math.floor(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  };
  U.fmtNum = (n) => (n || 0).toLocaleString("en-US");
  U.pct = (v) => Math.round(v * 100) + "%";

  /* 简易空间哈希（碰撞广相） */
  U.SpatialHash = class SpatialHash {
    constructor(cell) { this.cell = cell; this.map = new Map(); }
    clear() { this.map.clear(); }
    key(cx, cy) { return cx * 100003 + cy; }
    insert(x, y, item) {
      const cx = Math.floor(x / this.cell), cy = Math.floor(y / this.cell);
      const k = this.key(cx, cy);
      let bucket = this.map.get(k);
      if (!bucket) { bucket = []; this.map.set(k, bucket); }
      bucket.push(item);
    }
    query(x, y, r, out) {
      out.length = 0;
      const c = this.cell;
      const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
      const y0 = Math.floor((y - r) / c), y1 = Math.floor((y + r) / c);
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          const bucket = this.map.get(this.key(cx, cy));
          if (bucket) for (let i = 0; i < bucket.length; i++) out.push(bucket[i]);
        }
      }
      return out;
    }
  };

  window.ZTS.util = U;
})();
