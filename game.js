/* ============================================================
   合成大奶蛙 · Merge Meme Blobs
   零依赖 canvas 游戏：合成大西瓜式物理合成 + 奶家人梗阶梯。
   两个相同梗相撞就合成升级，两个飞天奶龙合成「湮灭」→ 暴力清屏。
   ============================================================ */
(function () {
  'use strict';

  /* ---------------------------------------------------------
     1. utils
     --------------------------------------------------------- */
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255;
    let g = (n >> 8) & 255;
    let b = n & 255;
    if (k < 0) { const f = 1 + k; r *= f; g *= f; b *= f; }
    else { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
    return '#' + ((1 << 24) +
      (clamp(Math.round(r), 0, 255) << 16) +
      (clamp(Math.round(g), 0, 255) << 8) +
      clamp(Math.round(b), 0, 255)).toString(16).slice(1);
  }
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  };

  /** 手机震动反馈（Android 支持；iOS Safari 没有，静默跳过） */
  function buzz(ms) {
    try {
      if (Sfx.isMuted()) return;
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(ms);
    } catch (e) { /* 不支持就算了 */ }
  }

  /* ---------------------------------------------------------
     2. 梗阶梯（B站奶家人梗谱系）
     --------------------------------------------------------- */
  const TIERS = [
    { name: '奶墩',     phrase: '这是什么梗？',     color: '#fff3bf', r: 22, score: 0 },
    { name: '奶娃',     phrase: '奶娃之母',         color: '#ffe066', r: 26, score: 2 },
    { name: '奶龙',     phrase: '无敌超长合集',     color: '#ffd43b', r: 31, score: 5 },
    { name: '奶蛙',     phrase: '奶蛙卖油条',       color: '#8ce99a', r: 37, score: 10 },
    { name: '奶蛙大笑', phrase: '看完不笑确诊奶浓症', color: '#51cf66', r: 43, score: 18 },
    { name: '变异奶龙', phrase: '奶龙大笑变异了',   color: '#a9e34b', r: 50, score: 30 },
    { name: '卡皮巴拉', phrase: '情绪稳定',         color: '#b5906b', r: 58, score: 50 },
    { name: '哈基米',   phrase: '哈基米哈基米',     color: '#ffc078', r: 66, score: 80 },
    { name: '飞天奶龙', phrase: '起飞',             color: '#ffd43b', r: 75, score: 130 },
    { name: '湮灭',     phrase: '暴力清屏',         color: '#4b3a7a', r: 86, score: 300 }
  ];
  const MAX_TIER = TIERS.length - 1;
  const DROPPABLE = [0, 1, 2, 3, 4];
  const DROP_WEIGHT = [14, 22, 28, 22, 14];

  /* ---------------------------------------------------------
     3. world + tuning
     --------------------------------------------------------- */
  const WORLD = { w: 350, h: 380 };
  const LEFT = 0;
  const RIGHT = WORLD.w;
  const FLOOR = WORLD.h;
  const CEIL = -120;      // blobs can never fly above this
  const LINE_Y = 95;      // 死亡红线
  const DROP_Y = 56;      // 待投放梗的悬停高度
  const FIELD_TOP = CEIL + 46;  // 罐子的可视上沿（含投放入口）
  const GRAVITY = 2600;
  const REST = 0.08;
  const WALL_REST = 0.16;
  const FRICTION = 0.26;
  const STEP = 1 / 120;
  const DANGER_LIMIT = 1.5;
  const MAX_BODIES = 60;

  /* ---------------------------------------------------------
     4. dom
     --------------------------------------------------------- */
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  const app = $('app');
  const els = {
    score: $('score'), combo: $('combo'), best: $('best'), best2: $('best2'), best3: $('best3'),
    banner: $('banner'), hint: $('hint'), nextCard: $('nextCard'), nextName: $('nextName'),
    soundBtn: $('soundBtn'), bitsBtn: $('bitsBtn'), bitsScreen: $('bitsScreen'), bitsList: $('bitsList'),
    bitsClose: $('bitsClose'), start: $('startScreen'), startBtn: $('startBtn'),
    over: $('overScreen'), overTitle: $('overTitle'), finalScore: $('finalScore'),
    newRecord: $('newRecord'), againBtn: $('againBtn')
  };

  /* ---------------------------------------------------------
     5. audio（全部现场合成）
     --------------------------------------------------------- */
  const Sfx = (function () {
    let ac = null;
    let master = null;
    let muted = store.get('hdnw.muted', '0') === '1';
    function ready() {
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        ac = new AC();
        master = ac.createGain();
        master.gain.value = muted ? 0 : 0.42;
        master.connect(ac.destination);
      }
      if (ac.state === 'suspended') ac.resume();
      return true;
    }
    function tone(o) {
      if (muted || !ready()) return;
      const t0 = ac.currentTime + (o.delay || 0);
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(o.f0, t0);
      if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(24, o.f1), t0 + o.dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(o.gain == null ? 0.26 : o.gain, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
      osc.connect(g); g.connect(master);
      osc.start(t0); osc.stop(t0 + o.dur + 0.03);
    }
    function noise(o) {
      if (muted || !ready()) return;
      const t0 = ac.currentTime + (o.delay || 0);
      const len = Math.max(1, Math.floor(ac.sampleRate * o.dur));
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ac.createBufferSource(); src.buffer = buf;
      const f = ac.createBiquadFilter();
      f.type = o.type || 'bandpass';
      f.frequency.setValueAtTime(o.f0, t0);
      if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t0 + o.dur);
      f.Q.value = o.q == null ? 1 : o.q;
      const g = ac.createGain(); g.gain.value = o.gain == null ? 0.2 : o.gain;
      src.connect(f); f.connect(g); g.connect(master);
      src.start(t0); src.stop(t0 + o.dur);
    }
    return {
      unlock: ready,
      isMuted: () => muted,
      toggle() {
        muted = !muted;
        store.set('hdnw.muted', muted ? '1' : '0');
        if (master) master.gain.value = muted ? 0 : 0.42;
        return muted;
      },
      drop() { noise({ dur: 0.12, f0: 1400, f1: 420, gain: 0.1, type: 'lowpass' }); },
      land(power) {
        tone({ type: 'sine', f0: 200 + power * 90, f1: 90, dur: 0.13, gain: 0.16 + power * 0.1 });
        noise({ dur: 0.05, f0: 700, f1: 220, gain: 0.07, type: 'lowpass' });
      },
      merge(tier, chain) {
        const base = 300 + tier * 62 + Math.min(chain - 1, 6) * 26;
        tone({ type: 'triangle', f0: base, dur: 0.12, gain: 0.2 });
        tone({ type: 'sine', f0: base * 1.5, dur: 0.16, gain: 0.14, delay: 0.05 });
      },
      big() {
        [523, 659, 784, 1046].forEach((f, i) =>
          tone({ type: 'triangle', f0: f, dur: 0.28, gain: 0.16, delay: i * 0.06 }));
      },
      charge() {
        tone({ type: 'sawtooth', f0: 90, f1: 720, dur: 0.45, gain: 0.12 });
        noise({ dur: 0.45, f0: 200, f1: 2400, gain: 0.12 });
      },
      boom() {
        noise({ dur: 0.7, f0: 900, f1: 60, gain: 0.4, type: 'lowpass', q: 0.6 });
        tone({ type: 'sine', f0: 150, f1: 34, dur: 0.8, gain: 0.4 });
        tone({ type: 'square', f0: 420, f1: 60, dur: 0.35, gain: 0.12, delay: 0.02 });
      },
      over() {
        [392, 330, 262, 196].forEach((f, i) =>
          tone({ type: 'triangle', f0: f, dur: 0.3, gain: 0.16, delay: i * 0.11 }));
      }
    };
  })();

  /* ---------------------------------------------------------
     6. viewport
     --------------------------------------------------------- */
  let W = 0, H = 0, DPR = 1, view = 1, originX = 0, originY = 0;
  const shake = { mag: 0, t: 0 };

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth || window.innerWidth;
    H = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.max(1, Math.round(W * DPR));
    canvas.height = Math.max(1, Math.round(H * DPR));
    const padTop = Math.min(120, Math.max(84, H * 0.13));
    const padBottom = Math.min(96, Math.max(58, H * 0.09));
    const fieldH = FLOOR - FIELD_TOP;
    view = clamp(Math.min((W - 24) / WORLD.w, (H - padTop - padBottom) / fieldH), 0.3, 1.7);
    originX = W / 2 - (WORLD.w / 2) * view;
    const slack = Math.max(0, (H - padTop - padBottom) - fieldH * view);
    originY = padTop + slack / 2 - FIELD_TOP * view;
    buildBackground();
    buildField();
  }

  const toScreenX = (wx) => originX + wx * view;
  const toScreenY = (wy) => originY + wy * view;

  /* ---------------------------------------------------------
     7. state
     --------------------------------------------------------- */
  let bodies = [];
  let particles = [];
  let rings = [];
  let texts = [];
  let score = 0;
  let best = parseInt(store.get('hdnw.best', '0'), 10) || 0;
  let unlocked = (function () {
    try { return new Set((JSON.parse(store.get('hdnw.bits', '[]')) || []).filter((n) => n >= 0 && n <= MAX_TIER)); }
    catch (e) { return new Set(); }
  })();
  let state = 'ready';           // ready | idle | over
  let curTier = 0;
  let nextTier = 0;
  let aimX = WORLD.w / 2;
  let dropCooldown = 0;
  let chain = 0;
  let chainTimer = 0;
  let dangerTime = 0;
  let cinematic = 0;             // 湮灭演出期间禁止投放
  let flash = 0;
  let popTimer = 0;
  let bannerTimer = 0;
  let hintTimer = 0;
  let acc = 0;
  let elapsed = 0;
  let mergesTotal = 0;
  let ultimates = 0;
  let shakeT = 0;

  const RNG = mulberry32(
    Number.isFinite(parseInt(new URLSearchParams(location.search).get('seed'), 10))
      ? parseInt(new URLSearchParams(location.search).get('seed'), 10)
      : ((Date.now() ^ ((Math.random() * 0xffffffff) >>> 0)) >>> 0) || 1
  );

  function rollTier() {
    let total = 0;
    for (const w of DROP_WEIGHT) total += w;
    let x = RNG() * total;
    for (let i = 0; i < DROPPABLE.length; i++) {
      x -= DROP_WEIGHT[i];
      if (x <= 0) return DROPPABLE[i];
    }
    return DROPPABLE[0];
  }

  function makeBlob(tier, x, y, vx, vy) {
    const r = TIERS[tier].r;
    return {
      tier, r, m: r * r, x, y,
      vx: vx || 0, vy: vy || 0,
      a: 0, va: 0, pop: 0, age: 0, dead: false, queued: false,
      blast: tier === MAX_TIER ? 0 : -1, blasted: false, shrink: 1, wob: RNG() * TAU
    };
  }

  /* ---------------------------------------------------------
     8. physics
     --------------------------------------------------------- */
  function physicsStep(h) {
    const n = bodies.length;
    for (let i = 0; i < n; i++) {
      const b = bodies[i];
      b.age += h;
      b.vy += GRAVITY * h;
      b.vx *= 0.9992;
      b.vy *= 0.9992;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 2600) { const k = 2600 / sp; b.vx *= k; b.vy *= k; }
      b.x += b.vx * h;
      b.y += b.vy * h;
      b.a += b.va * h;
      b.va *= 0.986;
    }

    for (let i = 0; i < n; i++) clampWalls(bodies[i], true);

    // pairs
    const merges = [];
    for (let i = 0; i < n; i++) {
      const a = bodies[i];
      for (let j = i + 1; j < n; j++) {
        const b = bodies[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const rr = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 <= 1e-9) continue;
        const d = Math.sqrt(d2);

        if (a.tier === b.tier && !a.queued && !b.queued && a.tier < MAX_TIER && d < rr + 0.6) {
          a.queued = true;
          b.queued = true;
          merges.push([a, b]);
          continue;
        }

        const nx = dx / d;
        const ny = dy / d;
        const overlap = rr - d;
        const tm = a.m + b.m;
        const corr = Math.min(overlap * 0.55, 7);
        a.x -= nx * corr * (b.m / tm);
        a.y -= ny * corr * (b.m / tm);
        b.x += nx * corr * (a.m / tm);
        b.y += ny * corr * (a.m / tm);

        const rvx = b.vx - a.vx;
        const rvy = b.vy - a.vy;
        const vn = rvx * nx + rvy * ny;
        if (vn > 0) continue;
        const invA = 1 / a.m;
        const invB = 1 / b.m;
        const jn = -(1 + REST) * vn / (invA + invB);
        a.vx -= nx * jn * invA; a.vy -= ny * jn * invA;
        b.vx += nx * jn * invB; b.vy += ny * jn * invB;

        const tx = -ny;
        const ty = nx;
        const vt = rvx * tx + rvy * ty;
        const jt = -vt * FRICTION / (invA + invB);
        a.vx -= tx * jt * invA; a.vy -= ty * jt * invA;
        b.vx += tx * jt * invB; b.vy += ty * jt * invB;
        a.va -= jt * invA * 0.02;
        b.va += jt * invB * 0.02;
      }
    }

    for (let k = 0; k < merges.length; k++) doMerge(merges[k][0], merges[k][1]);
    if (merges.length) bodies = bodies.filter((b) => !b.dead);

    // second pass: a merge can shove neighbours through a wall, so clamp again
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      clampWalls(b, false);
      // resting damping: kills the jitter that dense piles otherwise never lose
      if (Math.abs(b.vx) < 22) b.vx *= 0.78;
      if (Math.abs(b.vy) < 30) b.vy *= 0.84;
      if (Math.abs(b.va) < 0.4) b.va *= 0.8;
    }
  }

  function clampWalls(b, bounce) {
    if (b.x - b.r < LEFT) {
      b.x = LEFT + b.r;
      if (bounce && b.vx < 0) { b.vx = -b.vx * WALL_REST; b.vy *= 0.985; b.va += b.vy * 0.0004; }
      else if (!bounce && b.vx < 0) b.vx = -b.vx * 0.3;
    } else if (b.x + b.r > RIGHT) {
      b.x = RIGHT - b.r;
      if (bounce && b.vx > 0) { b.vx = -b.vx * WALL_REST; b.vy *= 0.985; b.va -= b.vy * 0.0004; }
      else if (!bounce && b.vx > 0) b.vx = -b.vx * 0.3;
    }
    if (b.y + b.r > FLOOR) {
      b.y = FLOOR - b.r;
      if (bounce && b.vy > 0) {
        if (b.vy > 260) Sfx.land(clamp(b.vy / 1400, 0, 1));
        b.vy = -b.vy * REST;
        b.vx *= 1 - FRICTION;
        b.va += b.vx * 0.0009;
      } else if (!bounce && b.vy > 0) {
        b.vy = -b.vy * 0.15;
      }
    } else if (b.y - b.r < CEIL) {
      b.y = CEIL + b.r;
      if (b.vy < 0) b.vy = -b.vy * 0.2;
    }
  }

  function addScore(v, x, y, label, color) {
    score += v;
    els.score.textContent = String(score);
    els.score.classList.add('pop');
    clearTimeout(popTimer);
    popTimer = setTimeout(() => els.score.classList.remove('pop'), 100);
    if (label) texts.push({ x, y, text: label, color: color || '#e8590c', size: 26, t: 0, life: 950 });
  }

  function doMerge(a, b) {
    a.dead = true;
    b.dead = true;
    const tier = a.tier + 1;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;

    mergesTotal++;
    chain += 1;
    chainTimer = 0.9;
    if (chain < 2) chain = 1;
    const mult = 1 + 0.5 * Math.min(chain - 1, 6);
    const gain = Math.round(TIERS[tier].score * mult);

    const nb = makeBlob(tier, mx, my, (a.vx + b.vx) / 2, (a.vy + b.vy) / 2 - 70);
    nb.pop = 1;
    bodies.push(nb);
    if (bodies.length > MAX_BODIES) bodies.splice(0, bodies.length - MAX_BODIES);

    unlocked.add(tier);
    saveBits();

    const sx = toScreenX(mx);
    const sy = toScreenY(my) - TIERS[tier].r * view - 8;
    const label = '+' + gain + (chain >= 2 ? ' ×' + chain : '');
    addScore(gain, sx, sy, label, chain >= 3 ? '#e8590c' : '#a2680b');
    const cy = toScreenY(my);
    burst(sx, cy, TIERS[tier].color, tier >= 6 ? 26 : 12, tier);
    rings.push({ x: sx, y: cy, r: TIERS[tier].r * view * 0.6, max: TIERS[tier].r * view * (tier >= 6 ? 3.4 : 2.2), color: TIERS[tier].color, t: 0, life: 520, w: 3 });

    if (tier === MAX_TIER) {
      ultimates++;
      cinematic = 2.5;
      Sfx.charge();
      buzz(40);
      showBanner(TIERS[tier].name + ' · ' + TIERS[tier].phrase);
      shakeIt(10, 0.5);
    } else if (tier >= 5) {
      Sfx.big();
      buzz(18);
      showBanner(TIERS[tier].name + '！' + TIERS[tier].phrase);
      shakeIt(4 + tier * 0.5, 0.28);
    } else {
      Sfx.merge(tier, chain);
      shakeIt(1.5 + tier * 0.5, 0.15);
    }
    if (chain >= 3) showBanner('连击 ×' + chain + ' · ' + TIERS[tier].name, 900);
  }

  function blast(b) {
    const R = 380;
    const bx = b.x;
    const by = b.y;
    let cleared = 0;
    for (const o of bodies) {
      if (o === b || o.dead) continue;
      const d = Math.hypot(o.x - bx, o.y - by);
      if (d <= R) {
        o.dead = true;
        cleared++;
        const g = TIERS[o.tier].score * 2 + 5;
        score += g;
        const sx = toScreenX(o.x);
        const sy = toScreenY(o.y);
        burst(sx, sy, TIERS[o.tier].color, 8, o.tier);
        texts.push({ x: sx, y: sy, text: '+' + g, color: '#7a5bd6', size: 20, t: 0, life: 800 });
      }
    }
    bodies = bodies.filter((o) => !o.dead);
    els.score.textContent = String(score);
    Sfx.boom();
    shakeIt(30, 0.8);
    flash = 1;
    rings.push({ x: toScreenX(bx), y: toScreenY(by), r: 20, max: R * view, color: '#b197ff', t: 0, life: 760, w: 9 });
    rings.push({ x: toScreenX(bx), y: toScreenY(by), r: 10, max: R * view * 0.7, color: '#ffffff', t: 0, life: 560, w: 5 });
    for (let i = 0; i < 46; i++) {
      const ang = RNG() * TAU;
      const sp = 120 + RNG() * 420;
      particles.push({
        x: toScreenX(bx), y: toScreenY(by),
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp * 0.7,
        g: 240, r: 2 + RNG() * 4, color: i % 4 === 0 ? '#ffffff' : '#9a7bff',
        t: 0, life: 700 + RNG() * 600
      });
    }
    if (cleared > 0) showBanner('暴力清屏！清掉 ' + cleared + ' 个梗');
    else showBanner('湮灭');
  }

  function burst(sx, sy, color, count, tier) {
    for (let i = 0; i < count; i++) {
      const ang = RNG() * TAU;
      const sp = 70 + RNG() * (170 + (tier || 0) * 26);
      particles.push({
        x: sx, y: sy,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp * 0.75 - 60,
        g: 460, r: 1.6 + RNG() * 3.2, color: i % 3 === 0 ? '#ffffff' : color,
        t: 0, life: 500 + RNG() * 420
      });
    }
  }

  function shakeIt(mag, time) {
    shake.mag = Math.max(shake.mag, mag);
    shake.t = Math.max(shake.t, time);
  }

  function showBanner(text, ms) {
    els.banner.textContent = text;
    els.banner.classList.add('on');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => els.banner.classList.remove('on'), ms || 1300);
  }

  function saveBits() {
    store.set('hdnw.bits', JSON.stringify([...unlocked].sort((a, b) => a - b)));
  }

  /* ---------------------------------------------------------
     9. game flow
     --------------------------------------------------------- */
  function reset() {
    bodies = [];
    particles = [];
    rings = [];
    texts = [];
    score = 0;
    chain = 0;
    chainTimer = 0;
    dangerTime = 0;
    cinematic = 0;
    flash = 0;
    dropCooldown = 0;
    acc = 0;
    mergesTotal = 0;
    ultimates = 0;
    shake.mag = 0;
    shake.t = 0;
    curTier = rollTier();
    nextTier = rollTier();
    aimX = WORLD.w / 2;
    els.score.textContent = '0';
    updateNextCard();
    syncHudFull();
  }

  let hudScore = -1;
  let hudCombo = -1;

  /** 每帧调用：只在真的变了的时候碰 DOM */
  function syncHud() {
    if (hudScore !== score) {
      hudScore = score;
      els.score.textContent = String(score);
    }
    const c = chain >= 2 ? chain : 0;
    if (hudCombo !== c) {
      hudCombo = c;
      if (c >= 2) {
        els.combo.textContent = '连击 ×' + c;
        els.combo.classList.add('on');
      } else {
        els.combo.classList.remove('on');
      }
    }
  }

  /** 只在开局 / 结束时调用：最高分这类不常变的显示 */
  function syncHudFull() {
    els.best.textContent = String(best);
    els.best2.textContent = String(best);
    els.best3.textContent = String(best);
    els.best.parentNode.style.visibility = best > 0 ? 'visible' : 'hidden';
    hudScore = -1;
    hudCombo = -1;
    syncHud();
  }

  function updateNextCard() {
    els.nextName.textContent = TIERS[nextTier].name;
    els.nextCard.style.borderColor = TIERS[nextTier].color;
  }

  function canDrop() {
    return state === 'idle' && dropCooldown <= 0 && cinematic <= 0;
  }

  function drop() {
    if (!canDrop()) return;
    Sfx.unlock();
    const t = curTier;
    const r = TIERS[t].r;
    const x = clamp(aimX, LEFT + r, RIGHT - r);
    const b = makeBlob(t, x, DROP_Y, 0, 120);
    b.age = 0;
    bodies.push(b);
    Sfx.drop();
    buzz(8);
    curTier = nextTier;
    nextTier = rollTier();
    updateNextCard();
    dropCooldown = 0.3;
    hideHint();
  }

  function swap() {
    if (state !== 'idle' || cinematic > 0) return;
    const t = curTier;
    curTier = nextTier;
    nextTier = t;
    updateNextCard();
    Sfx.merge(2, 1);
  }

  function gameOver() {
    if (state === 'over') return;
    state = 'over';
    Sfx.over();
    buzz(55);
    const record = score > best;
    if (record) { best = score; store.set('hdnw.best', String(best)); }
    els.finalScore.textContent = String(score);
    els.newRecord.classList.toggle('hidden', !record || score === 0);
    els.overTitle.textContent = record && score > 0 ? '新纪录！' : '堆满了';
    syncHudFull();
    clearTimeout(overTimer);
    overTimer = setTimeout(() => els.over.classList.remove('hidden'), 420);
  }
  let overTimer = 0;

  function startGame() {
    clearTimeout(overTimer);
    if (app) app.classList.add('playing');
    els.start.classList.add('hidden');
    els.over.classList.add('hidden');
    els.bitsScreen.classList.add('hidden');
    Sfx.unlock();
    reset();
    state = 'idle';
    showHint(4600);
  }

  function showHint(ms) {
    els.hint.classList.add('on');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => els.hint.classList.remove('on'), ms || 4200);
  }
  function hideHint() {
    clearTimeout(hintTimer);
    els.hint.classList.remove('on');
  }

  /* ---------------------------------------------------------
     10. update
     --------------------------------------------------------- */
  function update(dt, now) {
    elapsed += dt;
    if (shake.t > 0) {
      shake.t -= dt / 1000;
      if (shake.t <= 0) shake.mag = 0;
    }
    flash = Math.max(0, flash - dt / 320);
    updateFx(dt);

    if (state !== 'idle') return;

    if (dropCooldown > 0) dropCooldown -= dt / 1000;
    if (cinematic > 0) cinematic -= dt / 1000;
    if (chainTimer > 0) {
      chainTimer -= dt / 1000;
      if (chainTimer <= 0 && chain > 0) { chain = 0; syncHud(); }
    }

    acc += dt / 1000;
    let steps = 0;
    while (acc >= STEP && steps < 10) {
      physicsStep(STEP);
      acc -= STEP;
      steps++;
    }
    if (steps >= 10) acc = 0;

    // 湮灭演出
    for (const b of bodies) {
      if (b.blast < 0) continue;
      b.blast += dt / 1000;
      if (b.blast >= 0.45 && !b.blasted) {
        b.blasted = true;
        blast(b);
      }
      if (b.blast > 1.5) {
        b.shrink = Math.max(0, 1 - (b.blast - 1.5) / 0.7);
        b.r = TIERS[MAX_TIER].r * b.shrink;
        if (b.shrink <= 0.02) b.dead = true;
      }
    }
    if (bodies.some((b) => b.dead)) bodies = bodies.filter((b) => !b.dead);

    // 危险判定
    let risky = 0;
    for (const b of bodies) {
      if (b.age < 0.45) continue;
      if (b.y - b.r < LINE_Y && Math.hypot(b.vx, b.vy) < 80) risky++;
    }
    if (risky > 0) {
      dangerTime += dt / 1000;
      if (dangerTime > DANGER_LIMIT) gameOver();
    } else {
      dangerTime = Math.max(0, dangerTime - dt / 700);
    }
    syncHud();
  }

  function updateFx(dt) {
    const s = dt / 1000;
    for (const b of bodies) if (b.pop > 0) b.pop = Math.max(0, b.pop - dt / 240);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.t += dt;
      p.x += p.vx * s;
      p.y += p.vy * s;
      p.vy += p.g * s;
      if (p.t >= p.life) particles.splice(i, 1);
    }
    for (let i = texts.length - 1; i >= 0; i--) {
      const t = texts[i];
      t.t += dt;
      t.y -= s * 52;
      if (t.t >= t.life) texts.splice(i, 1);
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.t += dt;
      if (r.t >= r.life) rings.splice(i, 1);
    }
  }

  /* ---------------------------------------------------------
     11. 梗角色绘制
     --------------------------------------------------------- */
  function blobPath(r, wob, t) {
    const N = 40;
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * TAU;
      const w = 1 + 0.022 * Math.sin(a * 3 + wob + t * 0.0022) + 0.011 * Math.sin(a * 5 - wob * 1.7);
      const rr = r * w;
      const x = Math.cos(a) * rr;
      const y = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function bodyFill(color, r, wob, t, noStroke) {
    blobPath(r, wob, t);
    ctx.fillStyle = bodyGradient(color, r);
    ctx.fill();
    if (!noStroke) {
      ctx.strokeStyle = shade(color, -0.46);
      ctx.lineWidth = Math.max(1, r * 0.055);
      ctx.stroke();
    }
  }

  /** 每帧给 30 个梗各建一次渐变太贵，按「颜色 + 半径」缓存 */
  const gradCache = new Map();
  function bodyGradient(color, r) {
    const key = color + '|' + Math.round(r);
    let g = gradCache.get(key);
    if (!g) {
      g = ctx.createRadialGradient(-r * 0.32, -r * 0.38, r * 0.08, 0, 0, r * 1.06);
      g.addColorStop(0, shade(color, 0.45));
      g.addColorStop(0.6, color);
      g.addColorStop(1, shade(color, -0.24));
      if (gradCache.size > 400) gradCache.clear();
      gradCache.set(key, g);
    }
    return g;
  }

  function eyes(x1, x2, y, rr, look) {
    for (const x of [x1, x2]) {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2b2417';
      ctx.beginPath(); ctx.arc(x + (look || 0), y, rr * 0.54, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.beginPath(); ctx.arc(x + rr * 0.26, y - rr * 0.28, rr * 0.2, 0, TAU); ctx.fill();
    }
  }
  function dotEyes(x1, x2, y, rr) {
    ctx.fillStyle = '#2b2417';
    for (const x of [x1, x2]) { ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.fill(); }
  }
  function smile(cx, cy, w, h, lw, color) {
    ctx.strokeStyle = color || '#2b2417';
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, cy);
    ctx.quadraticCurveTo(cx, cy + h, cx + w / 2, cy);
    ctx.stroke();
  }
  function arcEyes(x1, x2, y, rr, up) {
    ctx.strokeStyle = '#2b2417';
    ctx.lineWidth = Math.max(1.4, rr * 0.42);
    ctx.lineCap = 'round';
    for (const x of [x1, x2]) {
      ctx.beginPath();
      ctx.moveTo(x - rr, y);
      ctx.quadraticCurveTo(x, y + (up ? -rr : rr), x + rr, y);
      ctx.stroke();
    }
  }

  /** 在本地坐标系（中心在原点，半径 r）里画出第 tier 个梗 */
  function drawMeme(tier, r, t, b) {
    const wob = b ? b.wob : 0;
    const C = TIERS[tier].color;
    switch (tier) {
      case 0: { // 奶墩
        bodyFill(C, r, wob, t);
        dotEyes(-r * 0.3, r * 0.3, -r * 0.1, r * 0.1);
        smile(0, r * 0.22, r * 0.34, r * 0.2, Math.max(1, r * 0.1));
        break;
      }
      case 1: { // 奶娃
        ctx.strokeStyle = shade(C, -0.42);
        ctx.lineWidth = Math.max(1.2, r * 0.09);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.92);
        ctx.quadraticCurveTo(r * 0.3, -r * 1.3, r * 0.05, -r * 1.36);
        ctx.stroke();
        bodyFill(C, r, wob, t);
        dotEyes(-r * 0.32, r * 0.32, -r * 0.08, r * 0.12);
        smile(0, r * 0.24, r * 0.42, r * 0.26, Math.max(1.2, r * 0.11));
        break;
      }
      case 2: { // 奶龙
        ctx.fillStyle = shade(C, -0.22);
        ctx.beginPath();
        ctx.moveTo(-r * 0.68, -r * 0.62);
        ctx.lineTo(-r * 0.46, -r * 1.18);
        ctx.lineTo(-r * 0.16, -r * 0.76);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(r * 0.68, -r * 0.62);
        ctx.lineTo(r * 0.46, -r * 1.18);
        ctx.lineTo(r * 0.16, -r * 0.76);
        ctx.closePath();
        ctx.fill();
        bodyFill(C, r, wob, t);
        eyes(-r * 0.34, r * 0.34, -r * 0.12, r * 0.17);
        smile(0, r * 0.3, r * 0.5, r * 0.3, Math.max(1.4, r * 0.1));
        break;
      }
      case 3: { // 奶蛙
        bodyFill(C, r, wob, t);
        for (const x of [-r * 0.42, r * 0.42]) {
          ctx.fillStyle = C;
          ctx.beginPath(); ctx.arc(x, -r * 0.74, r * 0.27, 0, TAU); ctx.fill();
          ctx.strokeStyle = shade(C, -0.46);
          ctx.lineWidth = Math.max(1, r * 0.055);
          ctx.stroke();
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(x, -r * 0.74, r * 0.18, 0, TAU); ctx.fill();
          ctx.fillStyle = '#2b2417';
          ctx.beginPath(); ctx.arc(x, -r * 0.72, r * 0.1, 0, TAU); ctx.fill();
        }
        smile(0, r * 0.05, r * 0.9, r * 0.42, Math.max(1.4, r * 0.1));
        break;
      }
      case 4: { // 奶蛙大笑
        bodyFill(C, r, wob, t);
        arcEyes(-r * 0.38, r * 0.38, -r * 0.3, r * 0.17, true);
        ctx.fillStyle = '#3b2a1c';
        ctx.beginPath();
        ctx.ellipse(0, r * 0.3, r * 0.46, r * 0.34, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillRect(-r * 0.3, r * 0.02, r * 0.24, r * 0.14);
        ctx.fillRect(r * 0.06, r * 0.02, r * 0.24, r * 0.14);
        ctx.fillStyle = 'rgba(255,120,140,0.5)';
        ctx.beginPath(); ctx.arc(-r * 0.62, r * 0.16, r * 0.15, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(r * 0.62, r * 0.16, r * 0.15, 0, TAU); ctx.fill();
        break;
      }
      case 5: { // 变异奶龙
        ctx.fillStyle = shade(C, -0.3);
        for (let i = -2; i <= 2; i++) {
          const a = -Math.PI / 2 + i * 0.38;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a - 0.14) * r * 0.95, Math.sin(a - 0.14) * r * 0.95);
          ctx.lineTo(Math.cos(a) * r * 1.3, Math.sin(a) * r * 1.3);
          ctx.lineTo(Math.cos(a + 0.14) * r * 0.95, Math.sin(a + 0.14) * r * 0.95);
          ctx.closePath();
          ctx.fill();
        }
        bodyFill(C, r, wob, t);
        eyes(-r * 0.42, r * 0.42, -r * 0.05, r * 0.15);
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(0, -r * 0.52, r * 0.17, 0, TAU); ctx.fill();
        ctx.fillStyle = '#2b2417';
        ctx.beginPath(); ctx.arc(0, -r * 0.52, r * 0.09, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#2b2417';
        ctx.lineWidth = Math.max(1.4, r * 0.075);
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(-r * 0.4, r * 0.42);
        ctx.lineTo(-r * 0.13, r * 0.24);
        ctx.lineTo(r * 0.13, r * 0.46);
        ctx.lineTo(r * 0.4, r * 0.26);
        ctx.stroke();
        break;
      }
      case 6: { // 卡皮巴拉
        // 圆耳朵贴头顶，不是猪耳朵
        for (const x of [-r * 0.5, r * 0.5]) {
          ctx.fillStyle = shade(C, -0.3);
          ctx.beginPath(); ctx.arc(x, -r * 0.82, r * 0.17, 0, TAU); ctx.fill();
          ctx.fillStyle = shade(C, -0.14);
          ctx.beginPath(); ctx.arc(x, -r * 0.82, r * 0.1, 0, TAU); ctx.fill();
        }
        bodyFill(C, r, wob, t);
        // 标志性的大方吻部
        ctx.fillStyle = shade(C, 0.2);
        ctx.beginPath();
        ctx.ellipse(0, r * 0.42, r * 0.44, r * 0.26, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = shade(C, -0.36);
        ctx.lineWidth = Math.max(1, r * 0.035);
        ctx.stroke();
        ctx.fillStyle = shade(C, -0.3);
        ctx.beginPath(); ctx.ellipse(-r * 0.12, r * 0.32, r * 0.05, r * 0.035, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(r * 0.12, r * 0.32, r * 0.05, r * 0.035, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = shade(C, -0.34);
        ctx.lineWidth = Math.max(1, r * 0.035);
        ctx.beginPath();
        ctx.moveTo(-r * 0.1, r * 0.56);
        ctx.lineTo(r * 0.1, r * 0.56);
        ctx.stroke();
        // 情绪稳定：半睁的死鱼眼
        for (const s of [-1, 1]) {
          ctx.fillStyle = '#2b2417';
          ctx.beginPath(); ctx.arc(s * r * 0.36, -r * 0.16, r * 0.085, 0, TAU); ctx.fill();
          ctx.strokeStyle = shade(C, -0.42);
          ctx.lineWidth = Math.max(1.2, r * 0.055);
          ctx.beginPath();
          ctx.moveTo(s * r * 0.2, -r * 0.26);
          ctx.lineTo(s * r * 0.52, -r * 0.26);
          ctx.stroke();
        }
        break;
      }
      case 7: { // 哈基米
        for (const s of [-1, 1]) {
          ctx.fillStyle = C;
          ctx.beginPath();
          ctx.moveTo(s * r * 0.28, -r * 0.82);
          ctx.lineTo(s * r * 0.62, -r * 1.26);
          ctx.lineTo(s * r * 0.74, -r * 0.6);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = shade(C, -0.46);
          ctx.lineWidth = Math.max(1, r * 0.045);
          ctx.stroke();
        }
        bodyFill(C, r, wob, t);
        eyes(-r * 0.36, r * 0.36, -r * 0.14, r * 0.17);
        ctx.strokeStyle = '#2b2417';
        ctx.lineWidth = Math.max(1, r * 0.038);
        ctx.globalAlpha = 0.75;
        for (const s of [-1, 1]) {
          for (let i = -1; i <= 1; i++) {
            ctx.beginPath();
            ctx.moveTo(s * r * 0.14, r * 0.3 + i * r * 0.1);
            ctx.lineTo(s * r * 0.86, r * 0.24 + i * r * 0.18);
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.moveTo(-r * 0.2, r * 0.24);
        ctx.quadraticCurveTo(-r * 0.1, r * 0.4, 0, r * 0.26);
        ctx.quadraticCurveTo(r * 0.1, r * 0.4, r * 0.2, r * 0.24);
        ctx.stroke();
        break;
      }
      case 8: { // 飞天奶龙
        // 起飞光环
        const halo = ctx.createRadialGradient(0, 0, r * 0.7, 0, 0, r * 1.5);
        halo.addColorStop(0, 'rgba(255,238,150,0.5)');
        halo.addColorStop(1, 'rgba(255,238,150,0)');
        ctx.fillStyle = halo;
        ctx.beginPath(); ctx.arc(0, 0, r * 1.5, 0, TAU); ctx.fill();
        // 翅膀要有描边，不然浅色背景上直接隐形
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(s * r * 0.7, -r * 0.42);
          ctx.quadraticCurveTo(s * r * 1.66, -r * 1.02, s * r * 1.44, -r * 0.1);
          ctx.quadraticCurveTo(s * r * 1.34, r * 0.42, s * r * 0.72, r * 0.22);
          ctx.closePath();
          ctx.fillStyle = '#fffdf0';
          ctx.fill();
          ctx.strokeStyle = shade(C, -0.42);
          ctx.lineWidth = Math.max(1.2, r * 0.045);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(s * r * 0.82, -r * 0.2);
          ctx.quadraticCurveTo(s * r * 1.24, -r * 0.34, s * r * 1.34, -r * 0.05);
          ctx.strokeStyle = 'rgba(200,160,60,0.5)';
          ctx.lineWidth = Math.max(1, r * 0.03);
          ctx.stroke();
        }
        ctx.fillStyle = shade(C, -0.22);
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(s * r * 0.5, -r * 0.7);
          ctx.lineTo(s * r * 0.34, -r * 1.2);
          ctx.lineTo(s * r * 0.06, -r * 0.82);
          ctx.closePath();
          ctx.fill();
        }
        bodyFill(C, r, wob, t);
        eyes(-r * 0.34, r * 0.34, -r * 0.14, r * 0.18);
        smile(0, r * 0.3, r * 0.55, r * 0.3, Math.max(1.4, r * 0.1));
        ctx.fillStyle = '#fff6c9';
        ctx.beginPath();
        const a0 = t * 0.0016;
        for (let i = 0; i < 4; i++) {
          const a = a0 + i * (Math.PI / 2);
          ctx.moveTo(Math.cos(a) * r * 1.34, Math.sin(a) * r * 1.34);
          ctx.arc(Math.cos(a) * r * 1.34, Math.sin(a) * r * 1.34, r * 0.09, 0, TAU);
        }
        ctx.fill();
        break;
      }
      default: { // 湮灭
        const g = ctx.createRadialGradient(0, 0, r * 0.05, 0, 0, r);
        g.addColorStop(0, '#100a20');
        g.addColorStop(0.62, '#2a1c4d');
        g.addColorStop(1, '#6f4fd0');
        blobPath(r, wob, t);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = 'rgba(196,170,255,0.85)';
        ctx.lineWidth = Math.max(2, r * 0.035);
        ctx.stroke();
        ctx.save();
        ctx.rotate(t * 0.0012);
        for (let i = 0; i < 3; i++) {
          ctx.strokeStyle = 'rgba(178,150,255,' + (0.42 - i * 0.1) + ')';
          ctx.lineWidth = Math.max(1.4, r * 0.03);
          ctx.beginPath();
          ctx.ellipse(0, 0, r * (0.5 + i * 0.18), r * (0.24 + i * 0.1), i * 0.7, 0, TAU);
          ctx.stroke();
        }
        ctx.restore();
        ctx.fillStyle = '#f0e8ff';
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(s * r * 0.1, -r * 0.2);
          ctx.lineTo(s * r * 0.42, -r * 0.3);
          ctx.lineTo(s * r * 0.4, -r * 0.02);
          ctx.closePath();
          ctx.fill();
        }
        break;
      }
    }
  }

  /* ---------------------------------------------------------
     12. 场景渲染
     --------------------------------------------------------- */
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function newLayer() {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(W * DPR));
    c.height = Math.max(1, Math.round(H * DPR));
    const g = c.getContext('2d');
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    return { c, g };
  }

  let bgCanvas = null;
  let fieldCanvas = null;

  /** 背景是静态的，烘到离屏画布上，避免每帧 4 次全屏渐变填充 */
  function buildBackground() {
    const { c, g } = newLayer();
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#fdfaf3');
    bg.addColorStop(0.55, '#f7f1e6');
    bg.addColorStop(1, '#efe6d5');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    const blob = (x, y, r, color) => {
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, color);
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg;
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    };
    const diag = Math.max(W, H);
    blob(W * 0.16, H * 0.14, diag * 0.46, 'rgba(255,208,110,0.35)');
    blob(W * 0.88, H * 0.24, diag * 0.4, 'rgba(150,220,170,0.28)');
    blob(W * 0.5, H * 1.05, diag * 0.5, 'rgba(255,190,150,0.22)');
    bgCanvas = c;
  }

  /** 罐子也是静态的（阴影/裁剪/渐变都很贵），同样烘一次 */
  function buildField() {
    const { c, g } = newLayer();
    drawContainerStatic(g);
    fieldCanvas = c;
  }

  function drawContainerStatic(g) {
    const x0 = toScreenX(LEFT);
    const x1 = toScreenX(RIGHT);
    const yTop = toScreenY(CEIL + 46);
    const yBot = toScreenY(FLOOR);
    const rad = 22 * view;

    g.save();
    g.shadowColor = 'rgba(150,120,70,0.18)';
    g.shadowBlur = 26 * view;
    g.shadowOffsetY = 10 * view;
    const fill = g.createLinearGradient(0, yTop, 0, yBot);
    fill.addColorStop(0, '#fffdf8');
    fill.addColorStop(0.72, '#fbf5e9');
    fill.addColorStop(1, '#f2e7d3');
    g.fillStyle = fill;
    roundRect(g, x0, yTop, x1 - x0, yBot - yTop, rad);
    g.fill();
    g.restore();

    g.save();
    roundRect(g, x0, yTop, x1 - x0, yBot - yTop, rad);
    g.clip();
    const inner = g.createLinearGradient(x0, 0, x1, 0);
    inner.addColorStop(0, 'rgba(180,150,100,0.16)');
    inner.addColorStop(0.12, 'rgba(180,150,100,0)');
    inner.addColorStop(0.88, 'rgba(180,150,100,0)');
    inner.addColorStop(1, 'rgba(180,150,100,0.16)');
    g.fillStyle = inner;
    g.fillRect(x0, yTop, x1 - x0, yBot - yTop);
    g.restore();

    g.strokeStyle = '#e3d4b8';
    g.lineWidth = 5 * view;
    roundRect(g, x0, yTop, x1 - x0, yBot - yTop, rad);
    g.stroke();
  }

  /** 只有这根线是动态的：随危险度变红发光 */
  function drawDangerLine() {
    const x0 = toScreenX(LEFT);
    const x1 = toScreenX(RIGHT);
    const ly = toScreenY(LINE_Y);
    const danger = clamp(dangerTime / DANGER_LIMIT, 0, 1);
    ctx.save();
    ctx.setLineDash([10 * view, 9 * view]);
    ctx.lineWidth = (1.6 + danger * 1.6) * view;
    ctx.strokeStyle = danger > 0.02
      ? 'rgba(224,49,49,' + (0.42 + danger * 0.55).toFixed(3) + ')'
      : 'rgba(206,110,80,0.4)';
    if (danger > 0.05) {
      ctx.shadowColor = 'rgba(255,90,60,' + (danger * 0.9).toFixed(3) + ')';
      ctx.shadowBlur = (18 * danger + 4) * view;
    }
    ctx.beginPath();
    ctx.moveTo(x0 + 6 * view, ly);
    ctx.lineTo(x1 - 6 * view, ly);
    ctx.stroke();
    ctx.restore();

    if (danger > 0.28) {
      ctx.save();
      ctx.globalAlpha = clamp((danger - 0.28) * 2.2, 0, 1);
      ctx.fillStyle = '#e03131';
      ctx.font = '900 ' + (13 * view + 4).toFixed(0) + 'px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('危险！', x0 + 10 * view, ly - 6 * view);
      ctx.restore();
    }
  }

  function drawBody(b, t) {
    const sx = toScreenX(b.x);
    const sy = toScreenY(b.y);
    const r = b.r * view * (1 + 0.34 * b.pop);
    ctx.save();
    ctx.translate(sx, sy);
    if (b.blast >= 0) {
      const pulse = 1 + 0.05 * Math.sin(t * 0.02);
      ctx.scale(pulse, pulse);
    }
    ctx.rotate(b.a);
    drawMeme(b.tier, r, t, b);
    ctx.restore();
  }

  function drawPending(t) {
    if (state !== 'idle' || cinematic > 0) return;
    const r = TIERS[curTier].r;
    const x = clamp(aimX, LEFT + r, RIGHT - r);
    const sy = toScreenY(DROP_Y);

    ctx.save();
    ctx.setLineDash([6 * view, 10 * view]);
    ctx.strokeStyle = 'rgba(160,140,105,0.4)';
    ctx.lineWidth = Math.max(1, 1.4 * view);
    ctx.beginPath();
    ctx.moveTo(toScreenX(x), sy + r * view);
    ctx.lineTo(toScreenX(x), toScreenY(FLOOR));
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#7a6a4a';
    ctx.beginPath();
    ctx.ellipse(toScreenX(x), sy, r * view * 0.9, r * view * 0.42, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(toScreenX(x), sy);
    ctx.rotate(Math.sin(t * 0.002) * 0.06);
    drawMeme(curTier, r * view, t, null);
    ctx.restore();
  }

  function render(t) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (bgCanvas) ctx.drawImage(bgCanvas, 0, 0, W, H);

    ctx.save();
    if (shake.mag > 0) {
      const m = shake.mag * clamp(shake.t * 3, 0, 1);
      ctx.translate(Math.sin(t * 0.045) * m, Math.cos(t * 0.037) * m);
    }

    if (fieldCanvas) ctx.drawImage(fieldCanvas, 0, 0, W, H);
    drawDangerLine();

    // 梗画在罐子内部（裁剪掉任何暂时的物理溢出）
    ctx.save();
    const fieldTop = CEIL + 46;
    roundRect(ctx, toScreenX(LEFT), toScreenY(fieldTop),
      (RIGHT - LEFT) * view, (FLOOR - fieldTop) * view, 22 * view);
    ctx.clip();
    for (const b of bodies) drawBody(b, t);
    drawPending(t);
    ctx.restore();

    for (const r of rings) {
      const p = r.t / r.life;
      const rad = lerp(r.r, r.max, 1 - Math.pow(1 - p, 2.4));
      ctx.save();
      ctx.globalAlpha = (1 - p) * 0.7;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = (r.w || 3) * (1 - p * 0.5) * view;
      ctx.beginPath();
      ctx.arc(r.x, r.y, rad, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    for (const p of particles) {
      ctx.globalAlpha = clamp(1 - p.t / p.life, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * view, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const tx of texts) {
      const p = tx.t / tx.life;
      const pop = 1 + 0.3 * Math.max(0, 1 - p * 4);
      ctx.save();
      ctx.globalAlpha = p > 0.62 ? clamp((1 - p) / 0.38, 0, 1) : 1;
      ctx.translate(tx.x, tx.y);
      ctx.scale(pop, pop);
      ctx.font = '900 ' + (tx.size * clamp(view, 0.7, 1.3)).toFixed(0) +
        'px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
      ctx.lineWidth = 5 * view;
      ctx.strokeStyle = 'rgba(255,255,255,0.94)';
      ctx.strokeText(tx.text, 0, 0);
      ctx.fillStyle = tx.color;
      ctx.fillText(tx.text, 0, 0);
      ctx.restore();
    }
    ctx.restore();

    if (flash > 0) {
      ctx.fillStyle = 'rgba(210,190,255,' + (flash * 0.45).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }
  }

  /* ---------------------------------------------------------
     13. input
     --------------------------------------------------------- */
  let aiming = false;
  function pointerWorldX(clientX) {
    return (clientX - originX) / view;
  }
  canvas.addEventListener('pointerdown', (e) => {
    if (state !== 'idle') return;
    aiming = true;
    aimX = pointerWorldX(e.clientX);
    if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
    if (e.cancelable) e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (state !== 'idle') return;
    if (aiming || e.pointerType === 'mouse') aimX = pointerWorldX(e.clientX);
  });
  canvas.addEventListener('pointerup', (e) => {
    if (state !== 'idle') { aiming = false; return; }
    aimX = pointerWorldX(e.clientX);
    aiming = false;
    drop();
  });
  canvas.addEventListener('pointercancel', () => { aiming = false; });
  window.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowLeft') { aimX -= 16; e.preventDefault(); }
    else if (e.code === 'ArrowRight') { aimX += 16; e.preventDefault(); }
    else if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) {
        if (state === 'ready' || state === 'over') startGame();
        else drop();
      }
    } else if (e.key === 's' || e.key === 'S') swap();
    else if (e.key === 'r' || e.key === 'R') { if (state !== 'ready') startGame(); }
    else if (e.key === 'Enter') { if (state === 'ready' || state === 'over') startGame(); }
    else if (e.key === 'm' || e.key === 'M') toggleSound();
  });

  function toggleSound() {
    const muted = Sfx.toggle();
    els.soundBtn.textContent = muted ? '🔇' : '🔊';
    els.soundBtn.classList.toggle('off', muted);
  }

  els.soundBtn.addEventListener('click', (e) => { e.preventDefault(); toggleSound(); });
  els.nextCard.addEventListener('click', (e) => { e.preventDefault(); swap(); });
  els.startBtn.addEventListener('click', (e) => { e.preventDefault(); startGame(); });
  els.againBtn.addEventListener('click', (e) => { e.preventDefault(); startGame(); });
  els.bitsBtn.addEventListener('click', (e) => {
    e.preventDefault();
    buildBits();
    els.bitsScreen.classList.remove('hidden');
  });
  els.bitsClose.addEventListener('click', (e) => { e.preventDefault(); els.bitsScreen.classList.add('hidden'); });

  function buildBits() {
    els.bitsList.innerHTML = '';
    for (let i = 0; i < TIERS.length; i++) {
      const t = TIERS[i];
      const row = document.createElement('div');
      row.className = 'bit' + (unlocked.has(i) ? ' got' : '');
      const dot = document.createElement('div');
      dot.className = 'dot';
      dot.style.background = t.color;
      const box = document.createElement('div');
      const nm = document.createElement('div');
      nm.className = 'nm';
      nm.textContent = (unlocked.has(i) ? '' : '？ ') + t.name;
      const qt = document.createElement('div');
      qt.className = 'qt';
      qt.textContent = unlocked.has(i) ? t.phrase : '还没合成过';
      box.appendChild(nm);
      box.appendChild(qt);
      row.appendChild(dot);
      row.appendChild(box);
      els.bitsList.appendChild(row);
    }
  }

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 120);
    nudgeLandscape();
  });
  window.addEventListener('orientationchange', () => setTimeout(() => { resize(); nudgeLandscape(); }, 220));
  window.addEventListener('blur', () => { aiming = false; });

  /** 回到前台时把音频上下文拉起来（iOS 后台会挂起） */
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) Sfx.unlock();
  });

  let nudgedLandscape = false;
  /** 手机横屏时罐子会很小，提醒一句（每次会话只说一次） */
  function nudgeLandscape() {
    if (nudgedLandscape || state !== 'idle') return;
    const portraitish = H > W;
    if (!portraitish && H < 520) {
      nudgedLandscape = true;
      showBanner('竖屏玩更舒服哦', 1800);
    }
  }

  /* ---------------------------------------------------------
     14. loop + boot
     --------------------------------------------------------- */
  let last = performance.now();
  function frame(now) {
    let dt = now - last;
    last = now;
    if (!Number.isFinite(dt) || dt < 0) dt = 16;
    dt = Math.min(dt, 50);
    update(dt, now);
    render(now);
    requestAnimationFrame(frame);
  }

  els.soundBtn.textContent = Sfx.isMuted() ? '🔇' : '🔊';
  els.soundBtn.classList.toggle('off', Sfx.isMuted());
  resize();
  reset();
  state = 'ready';
  buildBits();
  requestAnimationFrame(frame);

  window.MergeMeme = {
    version: '1.0.0',
    get state() { return state; },
    get score() { return score; },
    get best() { return best; },
    get chain() { return chain; },
    get bodies() { return bodies; },
    get unlocked() { return [...unlocked].sort((a, b) => a - b); },
    get aimX() { return aimX; },
    get curTier() { return curTier; },
    get nextTier() { return nextTier; },
    get danger() { return dangerTime; },
    get cinematic() { return cinematic; },
    get layout() { return { view, originX, originY, W, H, fieldTop: FIELD_TOP, fieldBottom: FLOOR, fieldLeft: LEFT, fieldRight: RIGHT }; },
    get merges() { return mergesTotal; },
    get ultimates() { return ultimates; },
    tiers: TIERS,
    constants: { WORLD, LEFT, RIGHT, FLOOR, CEIL, LINE_Y, DROP_Y, DANGER_LIMIT, MAX_BODIES, MAX_TIER },
    start: startGame,
    restart: startGame,
    drop,
    swap,
    setAim(x) { aimX = x; },
    /** debug: 直接放一个指定等级的梗（测试合成链用） */
    spawn(tier, x, y) {
      const b = makeBlob(clamp(tier, 0, MAX_TIER), x, y, 0, 0);
      bodies.push(b);
      return b;
    },
    setMuted(v) {
      if (Sfx.isMuted() !== !!v) toggleSound();
      return Sfx.isMuted();
    },
    /** debug/美术检查用：在当前画布上直接画一个指定等级的梗 */
    drawTier(tier, cx, cy, r) {
      ctx.save();
      ctx.translate(cx, cy);
      drawMeme(clamp(tier, 0, MAX_TIER), r, 0, null);
      ctx.restore();
    },
    buildBits
  };
})();
