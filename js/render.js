/* 渲染层：16-bit 像素渲染（地形预渲染 + 像素精灵 + 光影 + 氛围）。 */
window.ZTS = window.ZTS || {};
(function () {
  const U = window.ZTS.util, A = window.ZTS.art;
  const APX = A.unit; /* 1 个美术像素 = 2 世界单位 */
  let ZOOM = 1.6;     /* 镜头拉近：地块与像素角色更"星露谷"；小屏自动降档 */

  const R = {
    canvas: null, ctx: null, mini: null, miniCtx: null,
    view: { w: 0, h: 0, dpr: 1 },
    camera: { x: 0, y: 0 },
    shakeMag: 0, shakeX: 0, shakeY: 0,
    showDmg: true, quality: "high",
    floor: null, decals: null, decalCount: 0, miniStatic: null,
    light: null, lightCtx: null, world: null,
    trail: [],
  };

  /* ---------- 工具 ---------- */
  const snap = (v) => Math.round(v / APX) * APX;
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (k >= 0) { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
    else { r *= (1 + k); g *= (1 + k); b *= (1 + k); }
    return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
  }
  function rect(g, x, y, w, h, color) {
    g.fillStyle = color;
    g.fillRect(snap(x), snap(y), Math.max(APX, snap(w)), Math.max(APX, snap(h)));
  }
  function outline(g, x, y, w, h, color) {
    const c = color || "#08090c";
    rect(g, x - APX, y - APX, w + APX * 2, APX, c);
    rect(g, x - APX, y + h, w + APX * 2, APX, c);
    rect(g, x - APX, y - APX, APX, h + APX * 2, c);
    rect(g, x + w, y - APX, APX, h + APX * 2, c);
  }
  function pixelRing(ctx, x, y, r, color, alpha, dash) {
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    const stepA = dash ? 0.42 : 0.2;
    for (let a = 0; a < U.TAU; a += stepA) {
      A.dot(ctx, x + Math.cos(a) * r, y + Math.sin(a) * r, APX, color, 1);
    }
    ctx.globalAlpha = 1;
  }
  function hash2(x, y) {
    const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return n - Math.floor(n);
  }

  /* ---------- 初始化 ---------- */
  R.init = function (canvas, minimap) {
    R.canvas = canvas;
    R.ctx = canvas.getContext("2d");
    R.mini = minimap;
    R.miniCtx = minimap.getContext("2d");
    R.light = document.createElement("canvas");
    R.lightCtx = R.light.getContext("2d");
    R.resize();
    window.addEventListener("resize", R.resize);
  };

  R.resize = function () {
    if (!R.canvas) return;
    const dpr = Math.min(R.quality === "low" ? 1.3 : 2, window.devicePixelRatio || 1);
    const w = R.canvas.clientWidth || window.innerWidth;
    const h = R.canvas.clientHeight || window.innerHeight;
    R.view.w = w; R.view.h = h; R.view.dpr = dpr;
    ZOOM = w < 760 ? 1.3 : 1.6;
    R.canvas.width = Math.round(w * dpr);
    R.canvas.height = Math.round(h * dpr);
    R.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    R.ctx.imageSmoothingEnabled = false;
    R.light.width = Math.round(w * dpr);
    R.light.height = Math.round(h * dpr);
    R.lightCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  R.setQuality = function (mode) {
    R.quality = mode === "low" ? "low" : "high";
    if (R.canvas) R.resize();
  };

  R.shake = function (mag) {
    R.shakeMag = Math.min(22, R.shakeMag + mag);
  };

  /* ---------- 静态层 ---------- */
  R.setWorld = function (world) {
    R.world = world;
    R.decalCount = 0;
    R.trail = [];
    R.lamps = makeLamps(world);
    buildFloor(world);
    buildDecalLayer(world);
    buildMiniStatic(world);
    const p = world.player;
    R.camera.x = p.x - R.view.w / ZOOM / 2;
    R.camera.y = p.y - R.view.h / ZOOM / 2;
  };

  /* 顶灯：给黑暗地图提供暖色光池 */
  function makeLamps(world) {
    const rng = U.mulberry32((world.seed ^ 0x7a5c1103) >>> 0);
    const lamps = [];
    const n = 7;
    for (let i = 0; i < n; i++) {
      lamps.push({
        x: U.rand(rng, 220, world.w - 220),
        y: U.rand(rng, 220, world.h - 220),
        r: U.rand(rng, 150, 230),
        ok: rng() < 0.72,
      });
    }
    return lamps;
  }

  function buildFloor(world) {
    const cv = document.createElement("canvas");
    cv.width = world.w; cv.height = world.h;
    const g = cv.getContext("2d");
    const th = world.map.theme;
    const rng = U.mulberry32((world.seed ^ 0x51ed270b) >>> 0);
    const T = 12 * APX;
    const base = th.floor, alt = th.floor2;
    const seam = shade(base, -0.2);
    /* 底色 */
    rect(g, 0, 0, world.w, world.h, base);
    /* 地块 */
    for (let y = 0; y < world.h; y += T) {
      for (let x = 0; x < world.w; x += T) {
        const r = rng();
        const col = r < 0.2 ? alt : (r < 0.32 ? shade(base, 0.06) : shade(base, 0.02));
        rect(g, x, y, T, T, col);
        rect(g, x, y, T, APX, seam);
        rect(g, x, y, APX, T, seam);
        const d = rng();
        if (d < 0.09) {
          const cx = x + snap(U.rand(rng, 4, T - 8)), cy = y + snap(U.rand(rng, 4, T - 8));
          rect(g, cx, cy, APX, APX * 3, shade(base, -0.3));
          rect(g, cx + APX, cy + APX * 2, APX * 2, APX, shade(base, -0.3));
        } else if (d < 0.15) {
          rect(g, x + snap(U.rand(rng, 6, T - 8)), y + snap(U.rand(rng, 6, T - 8)), APX * 2, APX * 2,
            rng() < 0.45 ? th.blood : shade(base, -0.16));
        } else if (d < 0.21) {
          rect(g, x + snap(U.rand(rng, 2, T - 4)), y + snap(U.rand(rng, 2, T - 4)), APX, APX, shade(base, 0.12));
        }
      }
    }
    drawFloorMotifs(g, world, rng);
    /* 大块污渍（打破瓷砖网格感） */
    for (let i = 0; i < 14; i++) {
      const x = U.rand(rng, 120, world.w - 120), y = U.rand(rng, 120, world.h - 120);
      const rr = U.rand(rng, 40, 110);
      g.globalAlpha = 0.10 + rng() * 0.10;
      A.disc(g, x, y, rr, rng() < 0.4 ? th.blood : shade(th.floor, -0.35));
      g.globalAlpha = 1;
    }
    /* 顶灯灯罩 + 地面暖光 */
    for (const lamp of R.lamps) {
      g.globalAlpha = lamp.ok ? 0.06 : 0.02;
      A.disc(g, lamp.x, lamp.y, lamp.r * 0.38, lamp.ok ? "#ffd9a0" : "#5a5f66");
      g.globalAlpha = 1;
      rect(g, lamp.x - APX * 4, lamp.y - APX * 2, APX * 8, APX * 4, "#08090c");
      rect(g, lamp.x - APX * 3, lamp.y - APX, APX * 6, APX * 2, lamp.ok ? "#ffe6a8" : "#39414d");
    }
    for (const wl of world.walls) drawWall(g, world, wl, rng);
    for (const pr of world.props) drawProp(g, world, pr, rng);
    R.floor = cv;
  }

  function drawFloorMotifs(g, world, rng) {
    const th = world.map.theme;
    const gen = world.map.gen;
    if (gen === "tunnel") {
      for (const lane of world.trainLanes) {
        rect(g, 0, lane - 20, world.w, APX, "#4b515a");
        rect(g, 0, lane + 20, world.w, APX, "#4b515a");
        for (let x = 0; x < world.w; x += 40) {
          rect(g, x, lane - 28, APX * 6, APX * 16, "#23262c");
          rect(g, x, lane - 26, APX * 6, APX, "#3a3f47");
        }
        for (let x = 0; x < world.w; x += 56) {
          rect(g, x, lane - 52, 24, APX, "rgba(201,180,60,0.5)");
          rect(g, x, lane + 52, 24, APX, "rgba(201,180,60,0.5)");
        }
      }
      for (let i = 0; i < 260; i++) {
        rect(g, U.rand(rng, 0, world.w), U.rand(rng, 0, world.h), APX, APX, shade(th.floor, 0.1));
      }
      /* 水洼与站台垃圾 */
      for (let i = 0; i < 14; i++) {
        const x = U.rand(rng, 80, world.w - 80), y = U.rand(rng, 80, world.h - 80);
        const rx = U.rand(rng, 26, 70);
        g.globalAlpha = 0.55;
        A.disc(g, x, y, rx, "#0f161d");
        g.globalAlpha = 0.22;
        A.disc(g, x - rx * 0.2, y - rx * 0.2, rx * 0.6, "#33424f");
        g.globalAlpha = 1;
      }
      for (let i = 0; i < 44; i++) {
        rect(g, U.rand(rng, 0, world.w), U.rand(rng, 0, world.h), APX * 2, APX, rng() < 0.5 ? "#8a8f6a" : "#c2cad2");
      }
    } else if (gen === "base") {
      for (let i = 0; i < 12; i++) {
        const x = U.rand(rng, 100, world.w - 100), y = U.rand(rng, 100, world.h - 100);
        for (let k = 0; k < 5; k++) rect(g, x + k * 26, y + Math.sin(k * 0.9) * 10, APX * 5, APX * 2, shade(th.floor, -0.18));
      }
      for (let i = 0; i < 8; i++) {
        const x = U.rand(rng, 200, world.w - 200), y = U.rand(rng, 200, world.h - 200);
        for (let k = 0; k < 6; k++) rect(g, x + k * 14, y + k * 6, APX * 3, APX * 2, "rgba(183,166,120,0.18)");
      }
    } else if (gen === "prison") {
      for (let i = 0; i < 26; i++) {
        const x = snap(U.rand(rng, 60, world.w - 60)), y = snap(U.rand(rng, 60, world.h - 60));
        rect(g, x, y, APX * 8, APX * 8, shade(th.floor, -0.3));
        for (let k = 0; k < 4; k++) {
          rect(g, x + k * APX * 2, y, APX, APX * 8, shade(th.floor, -0.5));
          rect(g, x, y + k * APX * 2, APX * 8, APX, shade(th.floor, -0.5));
        }
      }
      for (let i = 0; i < 34; i++) {
        rect(g, U.rand(rng, 0, world.w), U.rand(rng, 0, world.h), APX * 2, APX, "#8b97a3");
      }
    } else if (gen === "lab") {
      for (let i = 0; i < 30; i++) {
        const x = snap(U.rand(rng, 60, world.w - 60)), y = snap(U.rand(rng, 60, world.h - 60));
        const s = APX * Math.floor(U.rand(rng, 2, 7));
        rect(g, x, y, s, APX, "rgba(95,212,184,0.10)");
        rect(g, x + APX, y + APX, s - APX * 2, APX, "rgba(95,212,184,0.08)");
      }
      /* 地面线缆 */
      for (let i = 0; i < 5; i++) {
        let x = U.rand(rng, 120, world.w - 120), y = U.rand(rng, 120, world.h - 120);
        for (let k = 0; k < 12; k++) {
          rect(g, x, y, APX * 3, APX, "rgba(95,212,184,0.35)");
          x += APX * 3 * (rng() < 0.5 ? 1 : 0.4);
          y += (rng() < 0.5 ? 1 : -1) * APX * 3;
        }
      }
    } else {
      for (let i = 0; i < 18; i++) {
        rect(g, U.rand(rng, 60, world.w - 60), U.rand(rng, 60, world.h - 60), APX * 2, APX, "#e8dcc4");
      }
      /* 病床之间的血拖痕 */
      for (let i = 0; i < 10; i++) {
        const x = U.rand(rng, 100, world.w - 100), y = U.rand(rng, 100, world.h - 100);
        const a = U.rand(rng, 0, U.TAU), len = U.rand(rng, 60, 180);
        g.globalAlpha = 0.12;
        for (let k = 0; k < len; k += 8) {
          A.disc(g, x + Math.cos(a) * k, y + Math.sin(a) * k, Math.max(3, 8 - k / 30), "#5c1414");
        }
        g.globalAlpha = 1;
      }
    }
  }

  function drawWall(g, world, wl, rng) {
    const th = world.map.theme;
    const wall = th.wall, top = th.wallTop;
    /* 落影 */
    rect(g, wl.x + APX * 2, wl.y + APX * 2, wl.w, wl.h, "rgba(0,0,0,0.35)");
    if (wl.train) {
      rect(g, wl.x, wl.y, wl.w, wl.h, "#3c444e");
      rect(g, wl.x, wl.y, wl.w, APX * 3, "#525c68");
      for (let x = wl.x + 24; x < wl.x + wl.w - 24; x += 78) {
        rect(g, x, wl.y + APX * 4, 54, APX * 5, "#222a33");
        rect(g, x + APX * 2, wl.y + APX * 5, 50, APX * 3, "rgba(180,210,235,0.45)");
      }
      for (let x = wl.x + 30; x < wl.x + wl.w - 40; x += 92) {
        rect(g, x, wl.y + wl.h - APX * 8, 40, APX * 6, "#2a323b");
      }
      rect(g, wl.x + APX * 6, wl.y + APX * 7, wl.w - APX * 12, APX * 2, "#8a2f22");
      for (let x = wl.x + 70; x < wl.x + wl.w - 80; x += 170) {
        rect(g, x, wl.y + APX * 4, APX * 2, wl.h - APX * 8, "#1a222b");
        rect(g, x + APX * 2, wl.y + APX * 10, APX * 2, wl.h - APX * 20, "#1a222b");
      }
      outline(g, wl.x, wl.y, wl.w, wl.h);
      return;
    }
    if (wl.container) {
      rect(g, wl.x, wl.y, wl.w, wl.h, wall);
      rect(g, wl.x, wl.y, wl.w, APX * 3, shade(wall, 0.16));
      const horiz = wl.w > wl.h;
      if (horiz) {
        for (let x = wl.x + 16; x < wl.x + wl.w - 8; x += 22) rect(g, x, wl.y + APX * 4, APX * 2, wl.h - APX * 8, shade(wall, -0.22));
      } else {
        for (let y = wl.y + 16; y < wl.y + wl.h - 8; y += 22) rect(g, wl.x + APX * 4, y, wl.w - APX * 8, APX * 2, shade(wall, -0.22));
      }
      rect(g, wl.x + APX * 2, wl.y + wl.h - APX * 3, wl.w - APX * 4, APX, shade(wall, -0.3));
      outline(g, wl.x, wl.y, wl.w, wl.h);
      return;
    }
    if (wl.sandbag) {
      rect(g, wl.x, wl.y, wl.w, wl.h, "#5c5a42");
      for (let x = wl.x; x < wl.x + wl.w; x += 26) {
        rect(g, x, wl.y, 22, APX * 4, "#6b6a4c");
        rect(g, x + APX, wl.y + APX, 18, APX * 2, "#7d7b58");
        rect(g, x, wl.y + APX * 5, 22, APX * 4, "#5f5d45");
      }
      outline(g, wl.x, wl.y, wl.w, wl.h);
      return;
    }
    if (wl.crate) {
      rect(g, wl.x, wl.y, wl.w, wl.h, "#6b4a30");
      rect(g, wl.x + APX, wl.y + APX, wl.w - APX * 2, wl.h - APX * 2, "#7d5a3a");
      rect(g, wl.x + APX, wl.y + wl.h / 2 - APX, wl.w - APX * 2, APX, "#5a3d28");
      for (let x = wl.x + APX * 2; x < wl.x + wl.w - APX; x += APX * 6) {
        rect(g, x, wl.y + APX * 2, APX, wl.h - APX * 4, "#5a3d28");
      }
      outline(g, wl.x, wl.y, wl.w, wl.h);
      return;
    }
    if (wl.cell) {
      rect(g, wl.x, wl.y, wl.w, wl.h, wall);
      rect(g, wl.x, wl.y, wl.w, APX * 2, top);
      const horiz = wl.w > wl.h;
      if (horiz) {
        for (let x = wl.x + APX * 3; x < wl.x + wl.w - APX * 2; x += APX * 6) rect(g, x, wl.y + APX * 2, APX, wl.h - APX * 4, "#9aa8b6");
      } else {
        for (let y = wl.y + APX * 3; y < wl.y + wl.h - APX * 2; y += APX * 6) rect(g, wl.x + APX * 2, y, wl.w - APX * 4, APX, "#9aa8b6");
      }
      outline(g, wl.x, wl.y, wl.w, wl.h);
      return;
    }
    /* 通用墙：底 + 顶部亮面 + 砖缝 + 描边 */
    rect(g, wl.x, wl.y, wl.w, wl.h, wall);
    rect(g, wl.x, wl.y, wl.w, APX * 2, top);
    const frontH = Math.min(wl.h * 0.35, APX * 9);
    rect(g, wl.x, wl.y + wl.h - frontH, wl.w, frontH, shade(wall, -0.26));
    rect(g, wl.x, wl.y + wl.h - frontH, wl.w, APX, shade(wall, 0.12));
    for (let x = wl.x + 18; x < wl.x + wl.w - 4; x += 18) {
      rect(g, x, wl.y + APX * 2, APX, Math.max(APX, wl.h - APX * 2), shade(wall, -0.18));
    }
    if (wl.h > 40) {
      rect(g, wl.x, wl.y + wl.h - APX * 2, wl.w, APX, shade(wall, -0.32));
    }
    if (world.map.gen === "lab") {
      rect(g, wl.x + APX * 2, wl.y + wl.h / 2, APX, APX, "#5fd4b8");
      for (let k = 0; k < Math.floor(wl.h / APX); k += 2) {
        rect(g, wl.x - APX * 2, wl.y + k * APX, APX * 2, APX, (k / 2) % 2 === 0 ? "#c9b03c" : "#232933");
      }
    }
    outline(g, wl.x, wl.y, wl.w, wl.h);
  }

  function drawProp(g, world, pr, rng) {
    const th = world.map.theme;
    if (pr.kind === "bed") {
      const rot = Math.round((pr.rot || 0) / (Math.PI / 2)) % 4;
      g.save();
      g.translate(snap(pr.x), snap(pr.y));
      g.rotate(rot * Math.PI / 2);
      const hv = hash2(pr.x, pr.y);
      rect(g, -34, -20, 68, 40, "#08090c");
      rect(g, -32, -18, 64, 36, "#3a2a22");
      rect(g, -28, -14, 56, 28, "#8b97a3");
      rect(g, -28, -14, 56, APX * 2, "#a7b3bf");
      rect(g, -26, -12, 14, 24, "#c7d1dc");
      rect(g, -26, -12, 14, APX * 2, "#e8dcc4");
      rect(g, 6, -12, 24, 24, "#6f7c8d");
      rect(g, 6, -12, 24, APX * 2, "#7f8c9c");
      if (hv < 0.5) {
        rect(g, -2, 2, 12, 8, "rgba(122,43,43,0.6)");
        rect(g, 2, 8, 6, 4, "rgba(122,43,43,0.45)");
      }
      rect(g, -30, 14, APX * 2, APX * 2, "#232933");
      rect(g, 24, 14, APX * 2, APX * 2, "#232933");
      g.restore();
      return;
    }
    if (pr.kind === "pillar") {
      A.disc(g, pr.x, pr.y + APX, pr.r, "rgba(0,0,0,0.35)");
      A.disc(g, pr.x, pr.y, pr.r, th.wallTop || "#4c525c");
      A.disc(g, pr.x - APX * 2, pr.y - APX * 2, pr.r * 0.6, shade(th.wallTop || "#4c525c", 0.18));
      pixelRing(g, pr.x, pr.y, pr.r, "#08090c", 0.9, false);
      return;
    }
    if (pr.kind === "barrel") {
      A.disc(g, pr.x, pr.y + APX, pr.r, "rgba(0,0,0,0.35)");
      A.disc(g, pr.x, pr.y, pr.r, "#8a3a2a");
      A.disc(g, pr.x, pr.y, pr.r * 0.72, "#a8503a");
      pixelRing(g, pr.x, pr.y, pr.r * 0.8, "#3a1a16", 0.8, true);
      return;
    }
    if (pr.kind === "bench") {
      rect(g, pr.x - 34, pr.y - 12, 68, 24, "#08090c");
      rect(g, pr.x - 32, pr.y - 10, 64, 20, "#6b4a30");
      rect(g, pr.x - 32, pr.y - 10, 64, APX * 2, "#8a6240");
      rect(g, pr.x - 12, pr.y + 4, APX * 2, APX * 4, "#3a2a22");
      rect(g, pr.x + 10, pr.y + 4, APX * 2, APX * 4, "#3a2a22");
      return;
    }
    if (pr.kind === "tank") {
      A.disc(g, pr.x, pr.y + APX * 2, pr.r, "rgba(0,0,0,0.35)");
      A.disc(g, pr.x, pr.y, pr.r, "#2f4a4a");
      A.disc(g, pr.x, pr.y, pr.r * 0.84, "#3c6660");
      const t = world.t * 0.8 + pr.x * 0.01;
      for (let i = 0; i < 4; i++) {
        const a = t + i * 1.7;
        A.dot(g, pr.x + Math.cos(a) * pr.r * 0.45, pr.y + Math.sin(a) * pr.r * 0.45, APX, "#8fe8d0", 1);
      }
      A.disc(g, pr.x - pr.r * 0.25, pr.y - pr.r * 0.3, pr.r * 0.3, "rgba(143,232,208,0.5)");
      pixelRing(g, pr.x, pr.y, pr.r, "#8fe8d0", 0.5, false);
      return;
    }
  }

  function buildDecalLayer(world) {
    const cv = document.createElement("canvas");
    cv.width = world.w; cv.height = world.h;
    R.decals = cv;
    R.decalCount = 0;
  }

  function buildMiniStatic(world) {
    const cv = document.createElement("canvas");
    cv.width = R.mini.width; cv.height = R.mini.height;
    const g = cv.getContext("2d");
    const sx = cv.width / world.w, sy = cv.height / world.h;
    g.fillStyle = "rgba(8,10,14,0.92)";
    g.fillRect(0, 0, cv.width, cv.height);
    g.fillStyle = "rgba(120,140,160,0.35)";
    for (const wl of world.walls) {
      g.fillRect(Math.round(wl.x * sx), Math.round(wl.y * sy), Math.max(1, Math.round(wl.w * sx)), Math.max(1, Math.round(wl.h * sy)));
    }
    R.miniStatic = cv;
  }

  /* ---------- 主绘制 ---------- */
  R.draw = function (world, dt) {
    const ctx = R.ctx, view = R.view, p = world.player, th = world.map.theme;
    R.shakeMag *= Math.pow(0.001, dt);
    if (R.shakeMag < 0.15) R.shakeMag = 0;
    R.shakeX = (Math.random() * 2 - 1) * R.shakeMag;
    R.shakeY = (Math.random() * 2 - 1) * R.shakeMag;
    const tx = p.x - view.w / 2 + Math.cos(p.facing) * 26;
    const ty = p.y - view.h / 2 + Math.sin(p.facing) * 26;
    const vw = view.w / ZOOM, vh = view.h / ZOOM;
    R.camera.x = U.lerp(R.camera.x, p.x - vw / 2 + Math.cos(p.facing) * 26, Math.min(1, dt * 7));
    R.camera.y = U.lerp(R.camera.y, p.y - vh / 2 + Math.sin(p.facing) * 26, Math.min(1, dt * 7));
    let camX = R.camera.x, camY = R.camera.y;
    if (world.w > vw) camX = U.clamp(camX, 0, world.w - vw); else camX = (world.w - vw) / 2;
    if (world.h > vh) camY = U.clamp(camY, 0, world.h - vh); else camY = (world.h - vh) / 2;
    camX = Math.round(camX + R.shakeX);
    camY = Math.round(camY + R.shakeY);
    R._camX = camX; R._camY = camY;

    ctx.fillStyle = "#05060a";
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.save();
    ctx.scale(ZOOM, ZOOM);
    ctx.translate(-camX, -camY);
    const vx0 = camX - 80, vy0 = camY - 80, vx1 = camX + vw + 80, vy1 = camY + vh + 80;
    const vis = (x, y, r) => x + r > vx0 && x - r < vx1 && y + r > vy0 && y - r < vy1;

    if (R.floor) ctx.drawImage(R.floor, camX, camY, vw, vh, camX, camY, vw, vh);
    syncDecals(world);
    if (R.decals && R.decals.width) ctx.drawImage(R.decals, camX, camY, vw, vh, camX, camY, vw, vh);

    /* 毒池 */
    for (const pool of world.pools) {
      if (!vis(pool.x, pool.y, pool.r)) continue;
      const k = Math.min(1, (pool.life - pool.t) / 2);
      ctx.globalAlpha = 0.5 * k + 0.15;
      A.disc(ctx, pool.x, pool.y, pool.r, "#31451a");
      ctx.globalAlpha = 0.32 * k;
      A.disc(ctx, pool.x - pool.r * 0.15, pool.y - pool.r * 0.1, pool.r * 0.62, "#8fae3f");
      for (let i = 0; i < 5; i++) {
        const a = world.t * 0.8 + i * 1.3;
        A.dot(ctx, pool.x + Math.cos(a) * pool.r * 0.5, pool.y + Math.sin(a) * pool.r * 0.4, APX, "#c9ff4a", 1);
      }
      ctx.globalAlpha = 1;
    }

    /* 毒雾（研究所） */
    for (const tz of world.toxics) {
      if (!vis(tz.x, tz.y, tz.r)) continue;
      ctx.globalAlpha = 0.16;
      A.disc(ctx, tz.x, tz.y, tz.r, "#5aa06a");
      ctx.globalAlpha = 0.1;
      A.disc(ctx, tz.x - tz.r * 0.2, tz.y - tz.r * 0.15, tz.r * 0.7, "#7ac98a");
      ctx.globalAlpha = 1;
    }

    /* 可破坏物 */
    for (const d of world.destructibles) {
      if (!d.alive || !vis(d.x, d.y, d.r + 16)) continue;
      A.draw(ctx, d.type === "barrel" ? "barrel" : "crate", d.x, d.y, {
        unit: APX, frame: 0, tint: d.hitT > 0 ? "#ffffff" : null, tintAlpha: 0.7,
      });
      if (d.type === "barrel" && d.hitT > 0) pixelRing(ctx, d.x, d.y, d.r + 6, "#ffb347", 0.5, true);
    }

    /* 危险区 / 光束 / 列车 */
    for (const hz of world.hazards) {
      const k = U.clamp(hz.t / hz.maxT, 0, 1);
      if (hz.kind === "beamTele" || hz.kind === "beam") {
        const active = hz.kind === "beam";
        const half = Math.tan(hz.half) * hz.range;
        ctx.save();
        ctx.translate(hz.x, hz.y);
        ctx.rotate(hz.angle);
        ctx.globalAlpha = active ? 0.55 : 0.18 + 0.12 * Math.sin(hz.t * 24);
        ctx.fillStyle = "#ff5a2a";
        ctx.fillRect(0, -9, hz.range, 18);
        if (active) {
          ctx.globalAlpha = 0.85;
          ctx.fillStyle = "#ffe6a8";
          ctx.fillRect(0, -3, hz.range, 6);
        }
        ctx.globalAlpha = 0.2;
        ctx.beginPath();
        ctx.moveTo(0, -9); ctx.lineTo(hz.range, -half); ctx.lineTo(hz.range, half); ctx.lineTo(0, 9);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.globalAlpha = 1;
        continue;
      }
      if (hz.kind === "tele-line") {
        ctx.save();
        ctx.translate(hz.x, hz.y);
        ctx.rotate(hz.angle);
        ctx.globalAlpha = 0.18 + 0.14 * Math.abs(Math.sin(hz.t * 18));
        ctx.fillStyle = "#ff3a22";
        ctx.fillRect(0, -hz.w / 2, hz.len, hz.w);
        ctx.globalAlpha = 0.75;
        for (let d = 0; d < hz.len; d += 24) rect(ctx, d, -hz.w / 2, 10, APX, "#ff6a4a");
        ctx.restore();
        ctx.globalAlpha = 1;
      } else if (hz.kind === "tele-circle") {
        ctx.globalAlpha = 0.14;
        A.disc(ctx, hz.x, hz.y, hz.r, "#ff3a22");
        ctx.globalAlpha = 1;
        pixelRing(ctx, hz.x, hz.y, hz.r * k, "#ff6a4a", 0.9, true);
      } else if (hz.kind === "tendril") {
        const rr = hz.r * (0.45 + 0.55 * k);
        ctx.globalAlpha = 0.18 + 0.2 * k;
        A.disc(ctx, hz.x, hz.y, rr, "#5a2a6a");
        ctx.globalAlpha = 1;
        pixelRing(ctx, hz.x, hz.y, hz.r, "#b46ad9", 0.8 + 0.2 * Math.sin(hz.t * 20), true);
      } else if (hz.kind === "boom") {
        pixelRing(ctx, hz.x, hz.y, hz.r * (0.5 + k * 0.7), "#ffb347", 1 - k, false);
      }
    }
    if (world.trainLanes.length) {
      if (world.trainWarn > 0) {
        const k = 1 - world.trainWarn / 3.2;
        ctx.globalAlpha = 0.1 + 0.12 * Math.abs(Math.sin(k * 18));
        ctx.fillStyle = "#e6b428";
        ctx.fillRect(0, world.trainLane - 74, world.w, 148);
        ctx.globalAlpha = 0.8;
        for (let x = 0; x < world.w; x += 48) {
          rect(ctx, x, world.trainLane - 74, 22, APX, "#ffd84a");
          rect(ctx, x, world.trainLane + 70, 22, APX, "#ffd84a");
        }
        ctx.globalAlpha = 1;
      }
      if (world.trainActive) {
        const x = world.trainX;
        rect(ctx, x - 60, world.trainLane - 70, 540, 140, "#11151a");
        rect(ctx, x - 60, world.trainLane - 70, 540, 24, "#2f3944");
        for (let i = 0; i < 6; i++) {
          rect(ctx, x - 30 + i * 88, world.trainLane - 52, 62, 30, "#1a222b");
          rect(ctx, x - 28 + i * 88, world.trainLane - 50, 58, 26, "rgba(210,235,250,0.5)");
          rect(ctx, x - 44 + i * 88, world.trainLane + 8, 48, 52, "#161c23");
        }
        const hl = ctx.createRadialGradient(x + 470, world.trainLane, 10, x + 470, world.trainLane, 260);
        hl.addColorStop(0, "rgba(255,240,200,0.55)");
        hl.addColorStop(1, "rgba(255,240,200,0)");
        ctx.fillStyle = hl;
        ctx.beginPath(); ctx.arc(x + 470, world.trainLane, 260, 0, U.TAU); ctx.fill();
      }
    }

    /* 拾取物 */
    for (const it of world.pickups) {
      if (!vis(it.x, it.y, 28)) continue;
      drawPickup(ctx, it, world);
    }

    /* 炮台 */
    for (const t of world.turrets) {
      if (!vis(t.x, t.y, 30)) continue;
      rect(ctx, t.x - 12, t.y - 12, 24, 24, "#08090c");
      rect(ctx, t.x - 10, t.y - 10, 20, 20, "#3a4149");
      A.line(ctx, t.x, t.y, t.x + Math.cos(t.angle) * 20, t.y + Math.sin(t.angle) * 20, APX, "#8fd4ff", 1);
      A.dot(ctx, t.x, t.y, APX, "#8fd4ff", 1);
    }

    /* 敌人 */
    for (const e of world.enemies) {
      if (!e.alive || !vis(e.x, e.y, e.r + 40)) continue;
      drawZombie(ctx, world, e);
    }
    /* 玩家 */
    drawPlayer(ctx, world, dt);
    /* 子弹 */
    for (const b of world.bullets) {
      if (!vis(b.x, b.y, 30)) continue;
      if (b.kind === "grenade") {
        A.dot(ctx, b.x, b.y, APX, "#2f4a2a", 2);
        A.dot(ctx, b.x, b.y - APX * 2, APX, world.t % 0.4 < 0.2 ? "#ff6a3a" : "#c9d94f", 1);
        continue;
      }
      if (b.kind === "flame") {
        A.dot(ctx, b.x, b.y, APX, "#ffe6a8", 1);
        A.dot(ctx, b.x + U.rand(world.rng, -4, 4), b.y + U.rand(world.rng, -4, 4), APX, "#ff7a3c", 1);
        continue;
      }
      A.dot(ctx, b.x, b.y, APX, "#ffffff", 1);
      A.dot(ctx, b.x - b.vx * 0.006, b.y - b.vy * 0.006, APX, b.color, 1);
      A.dot(ctx, b.x - b.vx * 0.012, b.y - b.vy * 0.012, APX, b.color, 1);
    }
    for (const b of world.eBullets) {
      if (!vis(b.x, b.y, 20)) continue;
      A.dot(ctx, b.x, b.y, APX, "#9fce3f", 2);
      A.dot(ctx, b.x, b.y, APX, "#d9ff8a", 1);
    }
    /* 粒子 */
    for (const pt of world.particles) {
      if (!vis(pt.x, pt.y, 12)) continue;
      const k = Math.max(0, pt.life / (pt.maxLife || 0.3));
      ctx.globalAlpha = Math.min(1, k * 1.6);
      A.dot(ctx, pt.x, pt.y, APX, pt.color, pt.r > 3 ? 2 : 1);
    }
    ctx.globalAlpha = 1;
    /* 伤害数字 */
    if (R.showDmg) {
      ctx.textAlign = "center";
      for (const f of world.floaters) {
        const k = f.t / f.life;
        ctx.globalAlpha = 1 - k;
        ctx.font = (f.heal ? "bold 13px " : f.crit ? "bold 16px " : "bold 12px ") + "Consolas, monospace";
        ctx.fillStyle = f.heal ? "#8fe0a0" : f.crit ? "#ffd469" : "#ffffff";
        ctx.strokeStyle = "rgba(0,0,0,0.85)";
        ctx.lineWidth = 3;
        const yy = f.y - k * 26;
        ctx.strokeText(f.v, f.x, yy);
        ctx.fillText(f.v, f.x, yy);
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    /* 环境浮尘（屏幕空间） */
    drawMotes(ctx, camX, camY, world.t);

    /* 黑夜遮罩 */
    const dark = (th.dark || 0) + (world.mods.darkAdd || 0);
    if (dark > 0.28) drawLighting(world, camX, camY, Math.min(0.93, dark));
    /* 暖色氛围（极轻） */
    ctx.fillStyle = "rgba(120, 60, 30, 0.05)";
    ctx.fillRect(0, 0, view.w, view.h);
    /* 暗角 + 扫描线 */
    const vg = ctx.createRadialGradient(view.w / 2, view.h / 2, Math.min(view.w, view.h) * 0.38, view.w / 2, view.h / 2, Math.max(view.w, view.h) * 0.72);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.5)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.fillStyle = "rgba(0,0,0,0.10)";
    for (let y = 0; y < view.h; y += 3) ctx.fillRect(0, y, view.w, 1);

    drawMinimap(world);
  };

  function drawMotes(ctx, camX, camY, t) {
    const w = R.view.w, h = R.view.h;
    ctx.fillStyle = "rgba(220,210,190,0.10)";
    for (let i = 0; i < 46; i++) {
      const px = ((i * 173 + Math.sin(t * 0.4 + i) * 40 - camX * 0.35) % (w + 80) + w + 80) % (w + 80) - 40;
      const py = ((i * 97 - camY * 0.35 + t * (6 + (i % 3) * 4)) % (h + 80) + h + 80) % (h + 80) - 40;
      ctx.fillRect(Math.round(px / 2) * 2, Math.round(py / 2) * 2, 2, 2);
    }
  }

  function drawZombie(ctx, world, e) {
    const p = world.player;
    const def = e.def;
    const id = e.boss ? def.id : e.kind;
    const flip = p.x < e.x;
    const rate = 2.2 + Math.min(2.4, (e.speed || 0) / 60);
    const frame = Math.floor(world.t * rate + (e.wob || 0) * 2) % 2;
    const unit = e.boss ? APX * 2 : APX;
    const bob = e.boss ? 0 : Math.round(Math.sin(world.t * 7 + (e.wob || 0)) * (APX * 0.5));
    /* 影子 */
    ctx.globalAlpha = 0.35;
    A.disc(ctx, e.x, e.y + e.r * 0.7, e.r * 0.9, "#05070a");
    ctx.globalAlpha = 1;
    /* 精英光环 */
    if (e.elite) {
      pixelRing(ctx, e.x, e.y, e.r + 8, "#b46ad9", 0.75 + 0.2 * Math.sin(world.t * 4), true);
      if (e.affixes) {
        const cols = { berserk: "#ff6b4a", shielded: "#6bb4ff", regen: "#6bff9a", toxic: "#c9ff4a" };
        for (let i = 0; i < e.affixes.length; i++) {
          pixelRing(ctx, e.x, e.y, e.r + 12 + i * 4, cols[e.affixes[i]] || "#ffffff", 0.55, true);
        }
      }
    }
    if (e.shielded) pixelRing(ctx, e.x, e.y, e.r + 4, "#6bb4ff", 0.5, true);
    /* 本体 */
    let tint = null, tintAlpha = 0;
    if (e.hitT > 0) { tint = "#ffffff"; tintAlpha = 0.8; }
    else if (e.slowT > 0) { tint = "#8fd4ff"; tintAlpha = 0.22; }
    A.draw(ctx, id, e.x, e.y + bob, { unit, frame, flip, tint, tintAlpha });
    /* 血条 */
    if (!e.boss && (e.elite || e.hp < e.maxHp)) {
      const bw = Math.max(16, e.r * 1.8), bh = APX * 2;
      const bx = e.x - bw / 2, by = e.y - e.r - 12;
      rect(ctx, bx - APX, by - APX, bw + APX * 2, bh + APX * 2, "#08090c");
      rect(ctx, bx, by, bw * U.clamp(e.hp / e.maxHp, 0, 1), bh, e.elite ? "#b46ad9" : "#c0392b");
    }
  }

  function drawPlayer(ctx, world, dt) {
    const p = world.player;
    if (!p.alive) return;
    const moving = Math.hypot(p.vx || 0, p.vy || 0) > 4 || p.dashT > 0;
    const frame = moving ? Math.floor(world.t * 8) % 2 : 0;
    const flip = Math.cos(p.facing) < 0;
    const blink = p.iframeT > 0 && Math.floor(p.iframeT * 18) % 2 === 0;
    /* 冲刺拖影 */
    if (p.dashT > 0) {
      R.trail.push({ x: p.x, y: p.y, t: 0.25, facing: p.facing });
      if (R.trail.length > 8) R.trail.shift();
    }
    for (let i = R.trail.length - 1; i >= 0; i--) {
      const tr = R.trail[i];
      tr.t -= dt;
      if (tr.t <= 0) { R.trail.splice(i, 1); continue; }
      A.draw(ctx, "player", tr.x, tr.y, { frame: 0, flip: Math.cos(tr.facing) < 0, alpha: tr.t * 1.6, tint: "#8fd4ff", tintAlpha: 0.4 });
    }
    ctx.globalAlpha = 0.35;
    A.disc(ctx, p.x, p.y + 14, 13, "#05070a");
    ctx.globalAlpha = 1;
    A.draw(ctx, "player", p.x, p.y, { frame, flip, alpha: blink ? 0.55 : 1, tint: p.hurtT > 0 ? "#ff8a72" : null, tintAlpha: 0.5 });
    /* 枪与枪口火光 */
    const gx = p.x + Math.cos(p.facing) * 12, gy = p.y + Math.sin(p.facing) * 12;
    const tx = p.x + Math.cos(p.facing) * 30, ty = p.y + Math.sin(p.facing) * 30;
    A.line(ctx, gx, gy, tx, ty, APX, "#14171d", 1);
    A.dot(ctx, tx, ty, APX, "#9aa8b6", 1);
    if (world.muzzleT > 0) {
      A.dot(ctx, tx + Math.cos(p.facing) * 6, ty + Math.sin(p.facing) * 6, APX, "#ffe6a8", 2);
      A.dot(ctx, tx + Math.cos(p.facing) * 12, ty + Math.sin(p.facing) * 12, APX, "#ff7a3c", 1);
    }
    /* 换弹进度 */
    const wp = p.weapons[p.weaponIdx];
    if (wp && wp.reloadT > 0) {
      const st = window.ZTS.Sim.weaponStats(p, wp);
      const k = 1 - wp.reloadT / st.reload;
      const bw = 34;
      rect(ctx, p.x - bw / 2, p.y - 30, bw, APX * 2, "#08090c");
      rect(ctx, p.x - bw / 2, p.y - 30, bw * U.clamp(k, 0, 1), APX * 2, "#ffcf6e");
    }
  }

  function drawPickup(ctx, it, world) {
    const t = world.t + it.x * 0.01;
    const bob = Math.round(Math.sin(t * 4) * APX);
    if (it.type === "xp") {
      ctx.globalAlpha = 0.28;
      A.disc(ctx, it.x, it.y + bob, 10, "#d9a441");
      ctx.globalAlpha = 1;
      A.dot(ctx, it.x, it.y + bob, APX, "#ffd469", 1);
      A.dot(ctx, it.x - APX, it.y + bob - APX, APX, "#ffe6a8", 1);
      A.dot(ctx, it.x + APX, it.y + bob + APX, APX, "#c9a23c", 1);
      return;
    }
    if (it.type === "health") {
      rect(ctx, it.x - 8, it.y - 8 + bob, 16, 16, "#08090c");
      rect(ctx, it.x - 6, it.y - 6 + bob, 12, 12, "#e8dcc4");
      rect(ctx, it.x - 2, it.y - 5 + bob, 4, 10, "#c0392b");
      rect(ctx, it.x - 5, it.y - 2 + bob, 10, 4, "#c0392b");
      return;
    }
    if (it.type === "ammo") {
      rect(ctx, it.x - 9, it.y - 7 + bob, 18, 14, "#08090c");
      rect(ctx, it.x - 7, it.y - 5 + bob, 14, 10, "#6d7a4a");
      rect(ctx, it.x - 4, it.y - 3 + bob, 3, 6, "#d9c47a");
      rect(ctx, it.x + 1, it.y - 3 + bob, 3, 6, "#d9c47a");
      return;
    }
    if (it.type === "grenade") {
      A.disc(ctx, it.x, it.y + bob, 7, "#2f4a2a");
      A.dot(ctx, it.x - 2, it.y - 2 + bob, APX, "#8aa85f", 1);
      rect(ctx, it.x - APX, it.y - 10 + bob, APX * 2, APX * 2, "#9aa8b6");
      return;
    }
    if (it.type === "serum") {
      rect(ctx, it.x - 3, it.y - 9 + bob, 6, 18, "#08090c");
      rect(ctx, it.x - 2, it.y - 7 + bob, 4, 14, "#5fd48a");
      rect(ctx, it.x - 2, it.y - 7 + bob, 4, 4, "#d9ffe9");
      A.dot(ctx, it.x, it.y + 4 + bob, APX, "#8fe8c0", 1);
      return;
    }
    if (it.type === "supply" || it.type === "intel") {
      const glow = 0.3 + 0.2 * Math.sin(world.t * 4);
      ctx.globalAlpha = glow;
      A.disc(ctx, it.x, it.y, it.r + 10, it.type === "supply" ? "#d9a441" : "#8fd4ff");
      ctx.globalAlpha = 1;
      A.draw(ctx, it.type === "supply" ? "supply" : "intel", it.x, it.y, { unit: APX, frame: 0 });
    }
  }

  /* ---------- 血迹（像素贴花） ---------- */
  function syncDecals(world) {
    if (!R.decals || R.decalCount >= world.decals.length) return;
    const g = R.decals.getContext("2d");
    for (let i = R.decalCount; i < world.decals.length; i++) {
      const d = world.decals[i];
      const rng = U.mulberry32((Math.floor(d.x * 73856093) ^ Math.floor(d.y * 19349663)) >>> 0);
      g.globalAlpha = d.a;
      g.fillStyle = d.color;
      const n = 12 + Math.floor(d.r / 2);
      for (let k = 0; k < n; k++) {
        const a = rng() * U.TAU, rr = rng() * d.r;
        const px = snap(d.x + Math.cos(a) * rr), py = snap(d.y + Math.sin(a) * rr * 0.8);
        g.fillRect(px, py, APX * (rng() < 0.35 ? 2 : 1), APX * (rng() < 0.25 ? 2 : 1));
      }
      g.globalAlpha = 1;
    }
    R.decalCount = world.decals.length;
  }

  /* ---------- 光照 ---------- */
  function drawLighting(world, camX, camY, dark) {
    const lc = R.lightCtx, view = R.view, p = world.player;
    lc.setTransform(R.view.dpr, 0, 0, R.view.dpr, 0, 0);
    lc.globalCompositeOperation = "source-over";
    lc.clearRect(0, 0, view.w, view.h);
    lc.fillStyle = "rgba(4,5,8," + dark + ")";
    lc.fillRect(0, 0, view.w, view.h);
    lc.globalCompositeOperation = "destination-out";
    const lm = world.mods.lightMul || 1;
    if (R.lamps) {
      for (const lamp of R.lamps) {
        if (!lamp.ok) continue;
        punch(lc, (lamp.x - camX) * ZOOM, (lamp.y - camY) * ZOOM, lamp.r * ZOOM * 0.42, 0.22);
      }
    }
    punch(lc, (p.x - camX) * ZOOM, (p.y - camY) * ZOOM, 240 * lm * ZOOM, 1);
    if (world.muzzleT > 0) {
      punch(lc, (p.x - camX + Math.cos(p.facing) * 40) * ZOOM, (p.y - camY + Math.sin(p.facing) * 40) * ZOOM, 240 * ZOOM, 1);
    }
    for (const hz of world.hazards) {
      if (hz.kind === "boom") punch(lc, (hz.x - camX) * ZOOM, (hz.y - camY) * ZOOM, hz.r * 2.4 * ZOOM, 1);
    }
    if (world.trainActive) punch(lc, (world.trainX + 470 - camX) * ZOOM, (world.trainLane - camY) * ZOOM, 300 * ZOOM, 1);
    for (const it of world.pickups) {
      if (it.type === "serum" || it.type === "health" || it.type === "supply" || it.type === "intel") {
        punch(lc, (it.x - camX) * ZOOM, (it.y - camY) * ZOOM, 80 * ZOOM, 0.65);
      }
    }
    lc.globalCompositeOperation = "source-over";
    R.ctx.drawImage(R.light, 0, 0, R.light.width, R.light.height, 0, 0, view.w, view.h);
  }
  function punch(ctx, x, y, r, a) {
    const grd = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
    grd.addColorStop(0, "rgba(0,0,0," + a + ")");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(x, y, r, 0, U.TAU); ctx.fill();
  }

  /* ---------- 小地图 ---------- */
  function drawMinimap(world) {
    const mc = R.miniCtx;
    if (!mc || !R.miniStatic) return;
    mc.clearRect(0, 0, R.mini.width, R.mini.height);
    mc.drawImage(R.miniStatic, 0, 0);
    const sx = R.mini.width / world.w, sy = R.mini.height / world.h;
    for (const it of world.pickups) {
      if (it.type === "supply") {
        mc.fillStyle = "#ffd469";
        mc.fillRect(it.x * sx - 2, it.y * sy - 2, 4, 4);
        continue;
      }
      if (it.type !== "serum") continue;
      mc.fillStyle = "#5fd48a";
      mc.fillRect(it.x * sx - 1, it.y * sy - 1, 2, 2);
    }
    for (const e of world.enemies) {
      if (!e.alive) continue;
      mc.fillStyle = e.boss ? "#ff5a3c" : e.elite ? "#c678f0" : "#d06a54";
      const s = e.boss ? 5 : e.elite ? 3 : 2;
      mc.fillRect(e.x * sx - s / 2, e.y * sy - s / 2, s, s);
    }
    const p = world.player;
    mc.fillStyle = "#ffffff";
    mc.fillRect(p.x * sx - 2, p.y * sy - 2, 4, 4);
    if (!world.trainActive && world.trainLanes.length && world.trainWarn > 0) {
      mc.fillStyle = "rgba(255,210,80,0.85)";
      mc.fillRect(0, world.trainLane * sy - 2, R.mini.width, 4);
    }
  }

  /* ---------- 屏幕坐标 → 世界坐标 ---------- */
  R.screenToWorld = function (sx, sy) {
    let camX = R._camX === undefined ? R.camera.x : R._camX;
    let camY = R._camY === undefined ? R.camera.y : R._camY;
    const view = R.view, world = R.world;
    if (world) {
      const vw = view.w / ZOOM, vh = view.h / ZOOM;
      if (R._camX === undefined) {
        if (world.w > vw) camX = U.clamp(camX, 0, world.w - vw); else camX = (world.w - vw) / 2;
        if (world.h > vh) camY = U.clamp(camY, 0, world.h - vh); else camY = (world.h - vh) / 2;
      }
    }
    return { x: sx / ZOOM + camX, y: sy / ZOOM + camY };
  };

  window.ZTS.Render = R;
})();
