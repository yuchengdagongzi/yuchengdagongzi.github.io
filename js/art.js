/* 美术层：16-bit 像素精灵与绘制助手（零外部素材，代码即素材）。
   约定：1 个"美术像素" = 2 个世界单位；每个精灵带 1px 深色描边；侧视精灵按朝向水平翻转。 */
window.ZTS = window.ZTS || {};
(function () {
  const A = {};
  A.unit = 2;

  /* ---- 统一调色板 ---- */
  const PAL = {
    ".": null,
    "0": "#08090c", "1": "#14171d", "2": "#232933", "3": "#39414d", "4": "#525d6b",
    "5": "#72808f", "6": "#9aa8b6", "7": "#dfe6ea",
    "8": "#3a1a16", "9": "#6e241b", a: "#a83524", b: "#d9533b",
    c: "#7a5a3a", d: "#a8895e",
    e: "#3d4a2a", f: "#5e7a3c", g: "#8aa85f", h: "#c9d94f",
    i: "#2f4a6b", j: "#4a7fb5", k: "#8fd4ff",
    l: "#5a3a6a", m: "#9a6ad9",
    n: "#d9a441", o: "#f2c96a", p: "#e8dcc4", q: "#c8a184",
    r: "#2d3f3a", s: "#5fd4b8", t: "#3a2a22", u: "#6b4a30",
    v: "#ff7a3c", w: "#ffe6a8",
  };
  A.PAL = PAL;

  function make(w, frames, opts) {
    const o = opts || {};
    const sp = { w, frames, pal: o.pal || PAL, h: frames[0].length };
    if (o.sway) sp.sway = o.sway;
    return sp;
  }

  /* ---- 玩家（侧视，2 帧步态） ---- */
  const playerA = [
    "....0000....",
    "...0jjjj0...",
    "...0qqqq0...",
    "...0q00q0...",
    "....0qq0....",
    "..0jjjjjj0..",
    "..0j3333j0..",
    "..0j3333j0.n",
    "..0j3333j0..",
    "..0jjjjjj0..",
    "...0uuuu0...",
    "...0u00u0...",
    "...0u00u0...",
    "...00..00...",
    "............",
  ];
  const playerB = [
    "....0000....",
    "...0jjjj0...",
    "...0qqqq0...",
    "...0q00q0...",
    "....0qq0....",
    "..0jjjjjj0..",
    "..0j3333j0..",
    "..0j3333j0.n",
    "..0j3333j0..",
    "..0jjjjjj0..",
    "...0uuuu0...",
    "..0u0..0u0..",
    "..0u0..0u0..",
    "..00....00..",
    "............",
  ];

  /* ---- 丧尸：步行尸（侧视，2 帧） ---- */
  const walkerA = [
    "....000....",
    "...0ggg0...",
    "...0g0g0...",
    "...0ggg0...",
    "....0f0....",
    "..0fffff0..",
    ".0ff22ff0..",
    ".0ff22ff0..",
    ".0fffff0...",
    "..0ff0f0...",
    "..0f0.0f0..",
    "..00...00..",
    "...........",
  ];
  const walkerB = [
    "....000....",
    "...0ggg0...",
    "...0g0g0...",
    "...0ggg0...",
    "....0f0....",
    "..0fffff0..",
    ".0ff22ff0..",
    ".0ff22ff0..",
    ".0fffff0...",
    "..0ff0f0...",
    ".0f0...0f0.",
    ".00.....00.",
    "...........",
  ];

  /* ---- 疾行尸：更瘦、前倾 ---- */
  const runnerA = [
    ".....000...",
    "....0ddd0..",
    "....0d0d0..",
    "....0ddd0..",
    ".....0c0...",
    "...0cccc0..",
    "..0ccc22c0.",
    "..0ccc22c0.",
    "...0cccc0..",
    "...0cc0c0..",
    "..0c0..0c0.",
    "..00....00.",
    "...........",
  ];
  const runnerB = [
    ".....000...",
    "....0ddd0..",
    "....0d0d0..",
    "....0ddd0..",
    ".....0c0...",
    "...0cccc0..",
    "..0ccc22c0.",
    "..0ccc22c0.",
    "...0cccc0..",
    "...0cc0c0..",
    ".0c0.....0c",
    ".00......00",
    "...........",
  ];

  /* ---- 尸犬（横向 4 足） ---- */
  const dogA = [
    "..............00..",
    "...0000......0u0..",
    "..0uuuu0....0uu0..",
    ".0u0uuuu0000uu0...",
    ".0uuttttttuuu0....",
    "..0ttttttttt0.....",
    "..0t0t0t0t0t0.....",
    "..00.00.00.00.....",
    "..................",
  ];
  const dogB = [
    "..............00..",
    "...0000......0u0..",
    "..0uuuu0....0uu0..",
    ".0u0uuuu0000uu0...",
    ".0uuttttttuuu0....",
    "..0ttttttttt0.....",
    "..0tt0tt0tt0......",
    "..00..00..00......",
    "..................",
  ];

  /* ---- 呕吐者：鼓胀腹部 ---- */
  const spitterA = [
    "....0000....",
    "...0gggg0...",
    "...0g00g0...",
    "...0gggg0...",
    "....0hh0....",
    "..0fffff0...",
    ".0ffhhhhf0..",
    ".0ffhhhhf0..",
    ".0fffhhff0..",
    "..0fffff0...",
    "..0f0.0f0...",
    "..00...00...",
    "............",
  ];
  const spitterB = [
    "....0000....",
    "...0gggg0...",
    "...0g00g0...",
    "...0gggg0...",
    "....0hh0....",
    "..0fffff0...",
    ".0ffhhhhf0..",
    ".0ffhhhhf0..",
    ".0fffhhff0..",
    "..0fffff0...",
    ".0f0...0f0..",
    ".00.....00..",
    "............",
  ];

  /* ---- 自爆尸：菌囊高光 ---- */
  const boomerA = [
    "....0000....",
    "...0gggg0...",
    "...0g00g0...",
    "...0gggg0...",
    "....0ff0....",
    "..0ffhhff0..",
    ".0fhhhhhhf0.",
    ".0fhhwwhhf0.",
    ".0fhhhhhhf0.",
    "..0fhhhhf0..",
    "..0ff00ff0..",
    "..0f0..0f0..",
    "..00....00..",
  ];
  const boomerB = [
    "....0000....",
    "...0gggg0...",
    "...0g00g0...",
    "...0gggg0...",
    "....0ff0....",
    "..0ffhhff0..",
    ".0fhhhhhhf0.",
    ".0fhhwwhhf0.",
    ".0fhhhhhhf0.",
    "..0fhhhhf0..",
    "..0ff00ff0..",
    ".0f0....0f0.",
    ".00......00.",
  ];

  /* ---- 装甲尸：板甲 ---- */
  const bruteA = [
    "......000000.....",
    ".....0gggggg0....",
    ".....0g0000g0....",
    ".....0gggggg0....",
    "......0ffff0.....",
    "...00ffffffff00..",
    "..0f66666666f0...",
    "..0f64444466f0...",
    "..0f64444466f0...",
    "..0f66666666f0...",
    "...0ffffffff0....",
    "...0ff0..0ff0....",
    "...0f0....0f0....",
    "...00......00....",
    ".................",
  ];
  const bruteB = [
    "......000000.....",
    ".....0gggggg0....",
    ".....0g0000g0....",
    ".....0gggggg0....",
    "......0ffff0.....",
    "...00ffffffff00..",
    "..0f66666666f0...",
    "..0f64444466f0...",
    "..0f64444466f0...",
    "..0f66666666f0...",
    "...0ffffffff0....",
    "..0ff0....0ff0...",
    "..0f0......0f0...",
    "..00........00...",
    ".................",
  ];

  /* ---- 尖啸者：张口 ---- */
  const screamerA = [
    ".....0000...",
    "....0mmmm0..",
    "....0mmmm0..",
    "....0m00m0..",
    ".....0mm0...",
    "....0l00l0..",
    "...0llllll0.",
    "..0llllllll0",
    "..0ll0000ll0",
    "...0llllll0.",
    "...0l0..0l0.",
    "...00....00.",
    "............",
  ];
  const screamerB = [
    ".....0000...",
    "....0mmmm0..",
    "....0mmmm0..",
    "....0m00m0..",
    ".....0mm0...",
    "....0l00l0..",
    "...0llllll0.",
    "..0llllllll0",
    "..0ll0000ll0",
    "...0llllll0.",
    "..0l0....0l0",
    "..00......00",
    "............",
  ];

  /* ---- Boss：屠夫（骨锯 + 血围裙） ---- */
  const butcherA = [
    "..........0000..........",
    ".........0gggg0.........",
    ".........0g00g0.........",
    ".........0gggg0.........",
    "..........0ff0..........",
    "......000fffff000.......",
    ".....0ffaaaaaaff0.......",
    "..000ffffaaaaafff000....",
    "..0f666ffaaaaaff666f0...",
    "..0f644ffaaaaaff446f0...",
    "..0f644fffffffff446f0...",
    "..0f6666ffffff66666f0...",
    "...0fffffffffffffff0....",
    "...0ff0..0fff0..0ff0....",
    "...0f0....0f0....0f0....",
    "...00......0......00....",
    "........................",
  ];
  const butcherB = [
    "..........0000..........",
    ".........0gggg0.........",
    ".........0g00g0.........",
    ".........0gggg0.........",
    "..........0ff0..........",
    "......000fffff000.......",
    ".....0ffaaaaaaff0.......",
    "..000ffffaaaaafff000....",
    "..0f666ffaaaaaff666f0...",
    "..0f644ffaaaaaff446f0...",
    "..0f644fffffffff446f0...",
    "..0f6666ffffff66666f0...",
    "...0fffffffffffffff0....",
    "..0ff0..0fff0..0ff0.....",
    "..0f0....0f0....0f0.....",
    "..00......0......00.....",
    "........................",
  ];

  /* ---- Boss：母巢（肉团 + 触须 + 识别卡） ---- */
  const hiveA = [
    "........000000..........",
    "......00bbbbbbb00.......",
    "....00bbaaaaaabbb00.....",
    "...0bbaaaaaaaaaaabb0....",
    "..0bbaaabbbbbaaaabb0....",
    "..0baaaabbbbbaaaaab0....",
    "..0baaaaaaaaaaaaaab0....",
    ".0bbaaaaaaaaaaaaaabb0...",
    ".0bbbaaaaaaaaaaaabbb0...",
    "..0bbbbaaaaaaaabbbb0....",
    "..0s0b0bbb0b0bbbb0s0....",
    "...0.0..0.0.0..0.0......",
    "......0....0....0.......",
    "........................",
  ];
  const hiveB = [
    "........000000..........",
    "......00bbbbbbb00.......",
    "....00bbaaaaaabbb00.....",
    "...0bbaaaaaaaaaaabb0....",
    "..0bbaaabbbbbaaaabb0....",
    "..0baaaabbbbbaaaaab0....",
    "..0baaaaaaaaaaaaaab0....",
    ".0bbaaaaaaaaaaaaaabb0...",
    ".0bbbaaaaaaaaaaaabbb0...",
    "..0bbbbaaaaaaaabbbb0....",
    "..0s0b0bbb0b0bbbb0s0....",
    ".........0..0...........",
    ".......0....0....0......",
    "........................",
  ];

  /* ---- Boss：暴君（军官制服 + 肩刺） ---- */
  const tyrantA = [
    "......00....00..........",
    ".....0nn0..0nn0.........",
    "......04444440..........",
    "......04000040..........",
    "......04444440..........",
    ".......044440...........",
    "...000444444444000......",
    "..0n444444444444n0......",
    "..0nn4444444444nn0......",
    "..0n444444444444n0......",
    "..0nn4444444444nn0......",
    "..0n444444444444n0......",
    "...04444444444440.......",
    "...0440..04440..0440....",
    "...040....040....040....",
    "...00......0......00....",
    "........................",
  ];
  const tyrantB = [
    "......00....00..........",
    ".....0nn0..0nn0.........",
    "......04444440..........",
    "......04000040..........",
    "......04444440..........",
    ".......044440...........",
    "...000444444444000......",
    "..0n444444444444n0......",
    "..0n444444444444n0......",
    "..0nn4444444444nn0......",
    "..0n444444444444n0......",
    "..0n444444444444n0......",
    "...04444444444440.......",
    "..0440..04440..0440.....",
    "..040....040....040.....",
    "..00......0......00.....",
    "........................",
  ];

  /* ---- 道具与场景小件 ---- */
  const barrel = [
    "00000000",
    "09999990",
    "0abbbba0",
    "09999990",
    "0abbbba0",
    "09999990",
    "0abbbba0",
    "09999990",
    "00000000",
  ];
  const crate = [
    "00000000",
    "0dddddd0",
    "0d0dd0d0",
    "0dd00dd0",
    "0dd00dd0",
    "0d0dd0d0",
    "0dddddd0",
    "00000000",
  ];
  const supply = [
    "....000....",
    "...0non0...",
    "..0noooon0.",
    ".0nn0000nn0",
    ".0noooooon0",
    ".0nnoooonn0",
    ".0nn0000nn0",
    "..0noooon0.",
    "...00000...",
    "...........",
  ];
  const intel = [
    ".000000.",
    "0kkkkkk0",
    "0k0000k0",
    "0k0kk0k0",
    "0k0000k0",
    "0kkkkkk0",
    "0kkkkkk0",
    ".000000.",
  ];

  A.SPR = {
    player: make(12, [playerA, playerB]),
    walker: make(11, [walkerA, walkerB]),
    runner: make(11, [runnerA, runnerB]),
    dog: make(18, [dogA, dogB]),
    spitter: make(12, [spitterA, spitterB]),
    boomer: make(12, [boomerA, boomerB]),
    brute: make(17, [bruteA, bruteB]),
    screamer: make(12, [screamerA, screamerB]),
    butcher: make(24, [butcherA, butcherB]),
    hive: make(24, [hiveA, hiveB]),
    tyrant: make(24, [tyrantA, tyrantB]),
    barrel: make(8, [barrel]),
    crate: make(8, [crate]),
    supply: make(11, [supply]),
    intel: make(8, [intel]),
  };

  /* ---- 绘制：精灵像素化渲染 + 水平翻转 + 受击白闪 ---- */
  A.draw = function (ctx, id, cx, cy, opts) {
    const sp = A.SPR[id];
    if (!sp) return;
    const o = opts || {};
    const u = o.unit || A.unit;
    const frame = sp.frames[((o.frame || 0) % sp.frames.length + sp.frames.length) % sp.frames.length];
    const rows = frame.length, cols = sp.w;
    const ox = Math.round(cx / u) * u, oy = Math.round(cy / u) * u;
    const flip = !!o.flip;
    const alpha = o.alpha === undefined ? 1 : o.alpha;
    ctx.save();
    ctx.globalAlpha = alpha;
    for (let y = 0; y < rows; y++) {
      const row = frame[y];
      for (let x = 0; x < cols; x++) {
        const col = sp.pal[row[x]];
        if (!col) continue;
        const dx = flip ? (cols - 1 - x) : x;
        ctx.fillStyle = col;
        ctx.fillRect(ox + (dx - cols / 2) * u, oy + (y - rows / 2) * u, u, u);
      }
    }
    if (o.tint) {
      ctx.globalAlpha = alpha * (o.tintAlpha === undefined ? 0.65 : o.tintAlpha);
      ctx.fillStyle = o.tint;
      for (let y = 0; y < rows; y++) {
        const row = frame[y];
        for (let x = 0; x < cols; x++) {
          if (!sp.pal[row[x]]) continue;
          const dx = flip ? (cols - 1 - x) : x;
          ctx.fillRect(ox + (dx - cols / 2) * u, oy + (y - rows / 2) * u, u, u);
        }
      }
    }
    ctx.restore();
  };

  /* 像素线段（枪管/光束/瞄准线）：按美术像素步进 */
  A.line = function (ctx, x0, y0, x1, y1, u, color, thickness) {
    const dx = x1 - x0, dy = y1 - y0;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / u));
    ctx.fillStyle = color;
    const t = Math.max(1, thickness || 1);
    for (let i = 0; i <= steps; i++) {
      const px = Math.round((x0 + (dx * i) / steps) / u) * u;
      const py = Math.round((y0 + (dy * i) / steps) / u) * u;
      ctx.fillRect(px - (u * t) / 2, py - (u * t) / 2, u * t, u * t);
    }
  };

  /* 小像素块（粒子/血迹/光点） */
  A.dot = function (ctx, x, y, u, color, size) {
    const s = (size || 1) * u;
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x / u) * u - s / 2, Math.round(y / u) * u - s / 2, s, s);
  };

  /* 像素圆盘（用于月亮/柱子/木桶等） */
  A.disc = function (ctx, cx, cy, r, color) {
    const step = A.unit;
    ctx.fillStyle = color;
    for (let dy = -r; dy <= r; dy += step) {
      const half = Math.sqrt(Math.max(0, r * r - dy * dy));
      const x0 = Math.round((cx - half) / step) * step;
      const w0 = Math.max(step, Math.round((half * 2) / step) * step);
      ctx.fillRect(x0, Math.round((cy + dy) / step) * step, w0, step);
    }
  };

  /* 主菜单主视觉：血月 / 城市剪影 / 灯塔电台 / 铁丝网 / 主角剪影 / 飘灰 */
  A.menuBackdrop = function (ctx, w, h, t) {
    const step = A.unit * 2;
    const snap = (v) => Math.round(v / step) * step;
    const hash = (i) => {
      const s = Math.sin(i * 12.9898) * 43758.5453;
      return s - Math.floor(s);
    };
    /* 天空：分色带（像素风，不用渐变） */
    const bands = ["#080a0f", "#0b0e14", "#10131b", "#161821", "#1e1a20", "#2a1d1e", "#37211d", "#43261f"];
    const horizon = Math.round(h * 0.62);
    const bh = Math.ceil(horizon / bands.length);
    for (let i = 0; i < bands.length; i++) {
      ctx.fillStyle = bands[i];
      ctx.fillRect(0, i * bh, w, bh);
    }
    /* 星点 */
    for (let i = 0; i < 110; i++) {
      const x = snap(hash(i + 3) * w), y = snap(hash(i * 7 + 11) * horizon * 0.86);
      ctx.globalAlpha = 0.25 + 0.35 * Math.abs(Math.sin(t * 1.3 + i * 0.7));
      ctx.fillStyle = i % 9 === 0 ? "#ffd9a0" : "#cfe6ff";
      ctx.fillRect(x, y, step, step);
    }
    ctx.globalAlpha = 1;
    /* 血月 */
    const mx = Math.round(w * 0.73), my = Math.round(h * 0.24), mr = Math.round(h * 0.105);
    for (let i = 4; i >= 1; i--) {
      ctx.globalAlpha = 0.045 * i;
      A.disc(ctx, mx, my, mr + i * step * 3, "#c8452f");
    }
    ctx.globalAlpha = 1;
    A.disc(ctx, mx, my, mr, "#b8452f");
    A.disc(ctx, mx - mr * 0.12, my - mr * 0.1, mr * 0.9, "#cf6242");
    A.disc(ctx, mx - mr * 0.2, my - mr * 0.18, mr * 0.72, "#db7450");
    const craters = [[-0.3, -0.18, 0.2], [0.26, 0.28, 0.16], [0.06, -0.46, 0.12], [-0.5, 0.34, 0.1]];
    for (const c of craters) A.disc(ctx, mx + c[0] * mr, my + c[1] * mr, mr * c[2], "#a63f2c");
    /* 远景城市（偏冷） */
    for (let i = 0; i < 26; i++) {
      const bw = Math.round((28 + hash(i * 3) * 70) / step) * step;
      const bhg = Math.round((40 + hash(i * 5) * 150) / step) * step;
      const x = snap(hash(i * 11) * w);
      const y = horizon - bhg;
      ctx.fillStyle = "#14161d";
      ctx.fillRect(x, y, bw, bhg);
      ctx.fillStyle = "#1b1e27";
      ctx.fillRect(x, y, bw, step);
      for (let wy = y + step * 2; wy < horizon - step; wy += step * 3) {
        for (let wx = x + step; wx < x + bw - step; wx += step * 3) {
          if (hash(wx * 3 + wy * 7) > 0.72) {
            ctx.fillStyle = hash(wx + wy) > 0.5 ? "#c9a25a" : "#6a7a8a";
            ctx.globalAlpha = 0.55;
            ctx.fillRect(wx, wy, step, step);
            ctx.globalAlpha = 1;
          }
        }
      }
    }
    /* 近景城市（更深，少量暖窗） */
    for (let i = 0; i < 20; i++) {
      const bw = Math.round((50 + hash(i * 13 + 2) * 110) / step) * step;
      const bhg = Math.round((60 + hash(i * 17 + 5) * 190) / step) * step;
      const x = snap(hash(i * 23 + 7) * w);
      const y = horizon - bhg;
      ctx.fillStyle = "#0c0e13";
      ctx.fillRect(x, y, bw, bhg);
      ctx.fillStyle = "#101218";
      ctx.fillRect(x + step, y + step, bw - step * 2, bhg - step * 2);
      for (let wy = y + step * 3; wy < horizon - step * 2; wy += step * 4) {
        for (let wx = x + step * 2; wx < x + bw - step * 2; wx += step * 4) {
          if (hash(wx * 7 + wy * 3) > 0.82) {
            ctx.fillStyle = "#d9a441";
            ctx.globalAlpha = 0.42 + 0.1 * Math.sin(t * 2 + wx);
            ctx.fillRect(wx, wy, step, step);
            ctx.globalAlpha = 1;
          }
        }
      }
      /* 屋顶天线 / 水塔 */
      if (hash(i * 31) > 0.6) {
        ctx.fillStyle = "#1b1e27";
        ctx.fillRect(x + bw * 0.5, y - step * 4, step, step * 4);
      }
    }
    /* 灯塔电台塔（幸存者据点） */
    const tx = Math.round(w * 0.16), top = Math.round(h * 0.17), base = horizon;
    ctx.fillStyle = "#2a2e36";
    ctx.fillRect(tx, top, step * 2, base - top);
    ctx.fillRect(tx - step * 4, top, step * 10, step * 2);
    ctx.fillStyle = "#3a4149";
    for (let yy = top + step * 4; yy < base; yy += step * 5) {
      const k = (yy - top) / (base - top);
      ctx.fillRect(tx - Math.round(step * 1.5 * (1 - k)), yy, Math.round(step * 2 + step * 3 * (1 - k)), step);
    }
    /* 塔顶红色警示灯（呼吸闪烁） */
    const blink = 0.35 + 0.65 * Math.abs(Math.sin(t * 2.2));
    ctx.globalAlpha = blink;
    ctx.fillStyle = "#ff3a2a";
    ctx.fillRect(tx + step * 6, top - step * 2, step * 2, step * 2);
    ctx.globalAlpha = blink * 0.35;
    ctx.fillRect(tx + step * 5, top - step * 3, step * 4, step * 4);
    ctx.globalAlpha = 1;
    /* 地面 + 雾带 */
    ctx.fillStyle = "#0a0b0f";
    ctx.fillRect(0, horizon, w, h - horizon);
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = 0.05 - i * 0.012;
      ctx.fillStyle = "#c9b48a";
      ctx.fillRect(0, horizon - step * (2 + i * 5), w, step * (2 + i));
    }
    ctx.globalAlpha = 1;
    /* 地面碎石与倒下的路牌 */
    for (let i = 0; i < 40; i++) {
      const x = snap(hash(i * 19 + 3) * w);
      const y = horizon + step * (2 + hash(i * 29) * 18);
      ctx.fillStyle = i % 3 === 0 ? "#232a32" : "#151921";
      ctx.fillRect(x, y, step * (1 + (i % 2)), step);
    }
    /* 左侧铁丝网 */
    const fy = horizon - step * 4;
    ctx.fillStyle = "#2b313a";
    for (let i = 0; i < 7; i++) ctx.fillRect(snap(w * 0.03) + i * step * 9, fy - step * 3, step, step * 9);
    ctx.fillStyle = "#3a4149";
    for (let i = 0; i < 6; i++) {
      const x0 = snap(w * 0.03) + i * step * 9;
      ctx.fillRect(x0, fy, step * 9, step);
      ctx.fillRect(x0, fy + step * 4, step * 9, step);
    }
    /* 主角剪影（用玩家精灵压暗） */
    A.draw(ctx, "player", Math.round(w * 0.3), Math.round(horizon - step * 1.2), {
      unit: step * 2, frame: 0, flip: false, tint: "#04060a", tintAlpha: 1, alpha: 1,
    });
    /* 飘灰 */
    for (let i = 0; i < 70; i++) {
      const sx = (hash(i * 13) * w + t * (8 + (i % 5) * 3)) % w;
      const sy = (hash(i * 29) * h + t * (14 + (i % 7) * 4)) % h;
      ctx.globalAlpha = 0.08 + 0.1 * hash(i * 7);
      ctx.fillStyle = i % 6 === 0 ? "#ffd9a0" : "#c9b48a";
      ctx.fillRect(snap(sx), snap(sy), step, step);
    }
    ctx.globalAlpha = 1;
    /* 暗角 */
    const vg = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.3, w / 2, h * 0.5, Math.max(w, h) * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.62)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  };

  window.ZTS.art = A;
})();
