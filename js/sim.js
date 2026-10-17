/* 模拟层：世界状态、AI、碰撞、波次、掉落、升级、存档快照。不依赖 DOM。 */
window.ZTS = window.ZTS || {};
(function () {
  const U = window.ZTS.util, D = window.ZTS.data, G = D.GAME, PL = D.PLAYER;
  const HASH_CELL = 72;

  function ev(world, e) {
    /* 双缓冲：步内事件进本次返回队列；步外事件（UI 回调 / dev 钩子）先进 pending，下一步合并，避免丢失 */
    if (world.inStep) world.events.push(e);
    else world.pendingEvents.push(e);
  }
  function sfx(world, name, x, y) { ev(world, { type: "sfx", name, x, y }); }

  /* ================= 创建 ================= */

  function makeMods(profile) {
    const m = {
      maxHpAdd: 0, armorAdd: 0, speedMul: 1, dmgMul: 1, rofMul: 1, magMul: 1, reloadMul: 1,
      pierceAdd: 0, critAdd: 0, burnAdd: 0, freezeAdd: 0, regen: 0, magnetMul: 1, xpMul: 1,
      thorns: 0, luck: 0, dashCdMul: 1, turrets: 0, serumMul: 1, startWeaponLevel: 1, revive: 0,
      rerolls: 0, maxHpMul: 1, spawnMul: 1, enemySpeedMul: 1, darkAdd: 0, lightMul: 1,
    };
    if (profile) {
      for (const def of D.META) {
        const lv = profile.meta[def.id] || 0;
        if (lv > 0) def.apply(m, lv);
      }
    }
    return m;
  }

  function applyMods(world) {
    const p = world.player, m = world.mods;
    p.maxHp = Math.round((PL.hp + m.maxHpAdd) * m.maxHpMul);
    p.hp = Math.min(p.hp, p.maxHp);
    p.armor = m.armorAdd;
    p.speed = PL.speed * m.speedMul;
    p.dmgMul = m.dmgMul; p.rofMul = m.rofMul; p.magMul = m.magMul; p.reloadMul = m.reloadMul;
    p.pierceAdd = m.pierceAdd; p.critAdd = m.critAdd; p.burn = m.burnAdd; p.freeze = m.freezeAdd;
    p.regen = m.regen; p.magnet = PL.magnet * m.magnetMul; p.xpMul = m.xpMul; p.thorns = m.thorns;
    p.luck = m.luck; p.dashCdMax = PL.dashCd * m.dashCdMul; p.serumMul = m.serumMul;
    for (const wp of p.weapons) refreshWeapon(p, wp);
  }

  function weaponStats(p, wp) {
    const def = D.WEAPONS[wp.id];
    const lvl = wp.level, b = wp.bonus || {};
    return {
      def,
      dmg: def.dmg * (1 + def.lvDmg * (lvl - 1)) * p.dmgMul * (b.dmgMul || 1),
      rof: def.rof * (1 + def.lvRof * (lvl - 1)) * p.rofMul,
      magSize: Math.max(1, Math.round(def.mag * (1 + def.lvMag * (lvl - 1)) * p.magMul * (b.magMul || 1))),
      reload: def.reload * p.reloadMul,
      pierce: def.pierce + p.pierceAdd + (b.pierce || 0),
      pellets: def.pellets + (b.pellets || 0),
      crit: p.critAdd + (b.critAdd || 0),
      knock: def.knock + (b.knock || 0),
      explode: b.explode || 0,
      flameR: def.radius * (b.flameR || 1),
      life: def.life + (b.life || 0),
      burstGap: def.burstGap || 0.07,
    };
  }

  function refreshWeapon(p, wp) {
    const st = weaponStats(p, wp);
    const prev = wp.magSize || 0;
    wp.magSize = st.magSize;
    if (wp.ammo === undefined) wp.ammo = wp.magSize;
    else if (wp.magSize > prev) wp.ammo = Math.min(wp.magSize, wp.ammo + (wp.magSize - prev));
    wp.ammo = Math.min(wp.ammo, wp.magSize);
  }

  function makeWeapon(id, level, bonus) {
    return { id, level: level || 1, bonus: bonus || {}, ammo: undefined, magSize: 0, cd: 0, reloadT: 0, burstLeft: 0 };
  }

  function create(opts) {
    const map = D.mapById[opts.mapId] || D.MAPS[0];
    const diff = D.diffById[opts.difficultyId] || D.DIFFICULTIES[1];
    const curse = D.CURSES.find((c) => c.id === (opts.curseId || "none")) || D.CURSES[0];
    const seed = (opts.seed >>> 0) || ((Math.random() * 0xffffffff) >>> 0);
    const world = {
      mapId: map.id, map, diff, diffId: diff.id, seed,
      curse, curseId: curse.id, curseMods: Object.assign({}, curse.mods),
      rng: U.mulberry32(seed),
      w: map.size[0], h: map.size[1],
      walls: [], props: [], spawnPoints: [], trainLanes: [], toxics: [],
      enemies: [], bullets: [], eBullets: [], pickups: [], particles: [], floaters: [],
      turrets: [], hazards: [], decals: [],
      t: 0, state: "playing", phase: "fight", wave: 1, waveTimer: 0,
      spawnQueue: [], spawnTimer: 0.6,
      kills: 0, shotsFired: 0, shotsHit: 0, serumEarned: 0,
      xp: 0, level: 1, pendingLevels: 0, upgrades: {}, choices: null,
      choicesSource: "level", rerolls: 0, combo: 0, comboT: 0, comboBest: 0,
      destructibles: [], pools: [],
      boss: null, nohit: true, endless: false,
      mods: makeMods(opts.profile),
      events: [], pendingEvents: [], inStep: false, muzzleT: 0, toxicTick: 0, god: false,
      trainCd: 30, trainWarn: 0, trainActive: false, trainX: 0, trainLane: 0,
      hash: new U.SpatialHash(HASH_CELL), bufA: [], bufB: [], kidSeq: 1,
    };
    buildTerrain(world);
    world.nav = buildNavGrid(world);
    applyCurse(world);
    world.player = makePlayer(world);
    if (opts.resume) {
      const rs = opts.resume;
      for (const id of Object.keys(rs.upgrades || {})) {
        const def = D.upgradeById[id];
        if (def) { for (let i = 0; i < rs.upgrades[id]; i++) def.apply(world.mods, null); }
      }
      world.upgrades = Object.assign({}, rs.upgrades || {});
    }
    applyMods(world);
    world.player.hp = world.player.maxHp;
    world.player.reviveLeft = world.mods.revive;
    world.rerolls = 1 + world.mods.rerolls;
    if (opts.resume) restoreSnapshot(world, opts.resume);
    startWave(world, opts.resume ? Math.max(1, opts.resume.wave || 1) : 1);
    return world;
  }

  /* 契约：把风险收益写进 mods，全流程据此生效 */
  function applyCurse(world) {
    const m = world.mods, cm = world.curseMods || {};
    if (cm.maxHpMul) m.maxHpMul *= cm.maxHpMul;
    if (cm.serumMul) m.serumMul *= cm.serumMul;
    if (cm.xpMul) m.xpMul *= cm.xpMul;
    if (cm.spawnMul) m.spawnMul *= cm.spawnMul;
    if (cm.speedMul) m.enemySpeedMul *= cm.speedMul;
    if (cm.darkAdd) m.darkAdd += cm.darkAdd;
    if (cm.lightMul) m.lightMul *= cm.lightMul;
  }

  function comboMul(world) {
    return 1 + Math.min(world.combo, 60) * 0.01;
  }

  function makePlayer(world) {
    return {
      x: world.w / 2, y: world.h / 2, vx: 0, vy: 0, r: PL.radius,
      hp: PL.hp, maxHp: PL.hp, armor: 0, speed: PL.speed,
      facing: 0, weapons: [makeWeapon(D.START_WEAPON, 1)], weaponIdx: 0,
      grenades: 2, medkits: 1, grenadeCd: 0,
      dashT: 0, dashDirX: 1, dashDirY: 0, dashCd: 0, iframeT: 0, regenT: 0, hurtT: 0,
      dmgMul: 1, rofMul: 1, magMul: 1, reloadMul: 1, pierceAdd: 0, critAdd: 0, burn: 0,
      freeze: 0, regen: 0, magnet: PL.magnet, xpMul: 1, thorns: 0, luck: 0,
      dashCdMax: PL.dashCd, serumMul: 1, reviveLeft: 0, moving: false, alive: true,
    };
  }

  /* ================= 地形生成 ================= */

  function buildTerrain(world) {
    const w = world.w, h = world.h, T = 26;
    const rng = U.mulberry32((world.seed ^ 0x9e3779b9) >>> 0);
    const walls = world.walls, props = world.props;
    walls.push({ x: 0, y: 0, w: w, h: T }, { x: 0, y: h - T, w: w, h: T }, { x: 0, y: 0, w: T, h: h }, { x: w - T, y: 0, w: T, h: h });
    const gen = world.map.gen;

    if (gen === "rooms") {
      for (const yy of [h * 0.36, h * 0.68]) {
        const gw = 300, gx = U.rand(rng, 320, w - 320 - gw);
        wallWithGapsH(walls, yy, T, w - T, T, [[gx, gw], [U.rand(rng, 320, w - 320 - gw), gw]]);
      }
      for (let i = 0; i < 24; i++) {
        props.push({ x: U.rand(rng, 90, w - 90), y: U.rand(rng, 90, h - 90), r: 27, kind: "bed", rot: U.rand(rng, 0, U.TAU) });
      }
      for (let i = 0; i < 5; i++) {
        const s = 62;
        walls.push({ x: U.rand(rng, 120, w - 120 - s), y: U.rand(rng, 120, h - 120 - s), w: s, h: s, crate: true });
      }
    } else if (gen === "tunnel") {
      for (const yy of [h * 0.33, h * 0.66]) {
        wallWithGapsH(walls, yy, T, w - T, T, [
          [U.rand(rng, 260, 700), 230], [U.rand(rng, 950, 1500), 230], [U.rand(rng, 1750, w - 950), 230],
        ]);
      }
      const carSpots = [[w * 0.18, h * 0.165], [w * 0.55, h * 0.165], [w * 0.34, h * 0.5], [w * 0.74, h * 0.83]];
      for (const [cx, cy] of carSpots) {
        walls.push({ x: cx, y: cy - 60, w: 470, h: 120, train: true });
      }
      for (let i = 0; i < 16; i++) {
        props.push({ x: U.rand(rng, 100, w - 100), y: U.rand(rng, 100, h - 100), r: 19, kind: "pillar" });
      }
      world.trainLanes = [h * 0.165, h * 0.5, h * 0.83];
    } else if (gen === "containers") {
      const cols = 4, rows = 3;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (rng() < 0.35) continue;
          const cx = 220 + c * ((w - 440) / (cols - 1)) + U.rand(rng, -60, 60);
          const cy = 260 + r * ((h - 520) / Math.max(1, rows - 1)) + U.rand(rng, -40, 40);
          if (rng() < 0.5) walls.push({ x: cx - 115, y: cy - 55, w: 230, h: 110, container: true });
          else walls.push({ x: cx - 55, y: cy - 115, w: 110, h: 230, container: true });
        }
      }
      for (let i = 0; i < 4; i++) {
        walls.push({ x: U.rand(rng, 150, w - 350), y: U.rand(rng, 150, h - 150), w: 200, h: 34, sandbag: true });
      }
      for (let i = 0; i < 10; i++) {
        props.push({ x: U.rand(rng, 110, w - 110), y: U.rand(rng, 110, h - 110), r: 16, kind: "barrel" });
      }
    } else if (gen === "cells") {
      const cellW = 250, cellH = 200, gap = 40;
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 4; col++) {
          const x = 150 + col * (cellW + gap), y = 170 + row * (cellH + 300);
          walls.push({ x, y, w: cellW, h: 22, cell: true });
          walls.push({ x, y, w: 22, h: cellH, cell: true });
          walls.push({ x: x + cellW - 22, y, w: 22, h: cellH, cell: true });
          if (rng() < 0.5) props.push({ x: x + cellW / 2, y: y + cellH * 0.62, r: 22, kind: "bench" });
        }
      }
      walls.push({ x: w * 0.5 - 300, y: h * 0.5 - 13, w: 600, h: 26, cell: true });
      for (let i = 0; i < 6; i++) {
        props.push({ x: U.rand(rng, 120, w - 120), y: U.rand(rng, 120, h - 120), r: 18, kind: "bench" });
      }
    } else if (gen === "lab") {
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 5; col++) {
          props.push({ x: 260 + col * 440, y: row === 0 ? h * 0.4 : h * 0.6, r: 40, kind: "tank" });
        }
      }
      for (let i = 0; i < 6; i++) {
        const vx = 150 + i * ((w - 300) / 5);
        walls.push({ x: vx - 13, y: h * 0.5 - U.rand(rng, 90, 160), w: 26, h: U.rand(rng, 120, 220), lab: true });
      }
      for (let i = 0; i < 4; i++) {
        world.toxics.push({
          x: U.rand(rng, 300, w - 300), y: U.rand(rng, 300, h - 300),
          r: U.rand(rng, 95, 140), vx: U.rand(rng, -14, 14), vy: U.rand(rng, -14, 14),
        });
      }
    }
    cleanProps(world);
    buildSpawnPoints(world);
    buildDestructibles(world, rng);
  }

  /* 清理与墙体/彼此重叠的道具，避免"柱子长在列车里"这类穿模 */
  function cleanProps(world) {
    const kept = [];
    for (const pr of world.props) {
      let bad = false;
      const pad = pr.r * 0.5;
      for (const wl of world.walls) {
        if (pr.x > wl.x - pad && pr.x < wl.x + wl.w + pad && pr.y > wl.y - pad && pr.y < wl.y + wl.h + pad) {
          bad = true; break;
        }
      }
      if (!bad) {
        for (const o of kept) {
          if (U.dist2(pr.x, pr.y, o.x, o.y) < (pr.r + o.r + 6) * (pr.r + o.r + 6)) { bad = true; break; }
        }
      }
      if (!bad) kept.push(pr);
    }
    world.props = kept;
  }

  /* ===== 可破坏物：油桶（连锁爆炸）与补给木箱（打碎掉物资） ===== */
  function buildDestructibles(world, rng) {
    const nBarrel = 9 + Math.floor(rng() * 7);
    for (let i = 0; i < nBarrel; i++) {
      const x = U.rand(rng, 140, world.w - 140), y = U.rand(rng, 140, world.h - 140);
      if (pointBlocked(world, x, y, 42)) continue;
      world.destructibles.push({ x, y, r: 15, hp: 26, maxHp: 26, type: "barrel", alive: true, hitT: 0 });
    }
    for (let i = 0; i < 5; i++) {
      const x = U.rand(rng, 160, world.w - 160), y = U.rand(rng, 160, world.h - 160);
      if (pointBlocked(world, x, y, 46)) continue;
      world.destructibles.push({ x, y, r: 16, hp: 34, maxHp: 34, type: "crate", alive: true, hitT: 0 });
    }
  }

  function hitDestructible(world, x, y, r) {
    for (const d of world.destructibles) {
      if (!d.alive) continue;
      const rr = d.r + r;
      if (U.dist2(x, y, d.x, d.y) < rr * rr) return d;
    }
    return null;
  }

  function damageDestructible(world, d, dmg, opts) {
    if (!d.alive) return;
    d.hp -= dmg;
    d.hitT = 0.1;
    if (opts && opts.burn) d.hp -= dmg * 0.5;
    if (d.hp > 0) return;
    d.alive = false;
    if (d.type === "barrel") {
      explosionAt(world, d.x, d.y, 124, 60 + 95 * world.diff.dmgMul, true);
    } else {
      for (let i = 0; i < 3; i++) {
        const a = U.rand(world.rng, 0, U.TAU);
        world.pickups.push({ type: "ammo", x: d.x + Math.cos(a) * 18, y: d.y + Math.sin(a) * 18, v: 1, r: 8, t: 0 });
      }
      world.pickups.push({ type: "health", x: d.x, y: d.y, v: 35, r: 8, t: 0 });
      if (world.rng() < 0.35) world.pickups.push({ type: "grenade", x: d.x, y: d.y - 14, v: 1, r: 8, t: 0 });
      if (world.rng() < 0.3) world.pickups.push({ type: "serum", x: d.x + 12, y: d.y + 10, v: 2, r: 9, t: 0 });
      if (world.rng() < 0.15) world.pickups.push({ type: "intel", x: d.x, y: d.y + 16, v: 1, r: 10, t: 0 });
      sfx(world, "pickup", d.x, d.y);
    }
  }

  function updateDestructibles(world, dt) {
    let w2 = 0;
    for (let i = 0; i < world.destructibles.length; i++) {
      const d = world.destructibles[i];
      if (d.hitT > 0) d.hitT -= dt;
      if (d.alive) world.destructibles[w2++] = d;
    }
    world.destructibles.length = w2;
  }

  /* 空投补给：落在玩家附近，拾取后免费三选一 */
  function spawnSupply(world) {
    const pts = world.spawnPoints;
    let best = pts[0];
    for (let i = 0; i < 20; i++) {
      const pt = pts[Math.floor(world.rng() * pts.length)];
      if (!pt) break;
      const d = U.dist(pt.x, pt.y, world.player.x, world.player.y);
      if (d > 380 && d < 900) { best = pt; break; }
      best = pt;
    }
    world.pickups.push({ type: "supply", x: best.x, y: best.y, v: 1, r: 20, t: 0 });
    ev(world, { type: "toast", text: "空投补给已落点 · 小地图金点", cls: "gold" });
  }

  function openSupply(world) {
    if (world.state !== "playing") return;
    world.pickups.push({ type: "intel", x: world.player.x + 70, y: world.player.y, v: 1, r: 10, t: 0 });
    world.choicesSource = "supply";
    world.choices = rollChoices(world);
    world.state = "levelup";
    ev(world, { type: "levelup", choices: world.choices, source: "supply", rerolls: world.rerolls });
  }

  function wallWithGapsH(walls, y, x0, x1, thick, gaps) {
    const sorted = gaps.slice().sort((a, b) => a[0] - b[0]);
    let cur = x0;
    for (const [gx, gw] of sorted) {
      if (gx > cur) walls.push({ x: cur, y, w: gx - cur, h: thick });
      cur = gx + gw;
    }
    if (x1 > cur) walls.push({ x: cur, y, w: x1 - cur, h: thick });
  }

  function pointBlocked(world, x, y, pad) {
    for (const wl of world.walls) {
      if (x > wl.x - pad && x < wl.x + wl.w + pad && y > wl.y - pad && y < wl.y + wl.h + pad) return true;
    }
    for (const pr of world.props) {
      const dx = x - pr.x, dy = y - pr.y;
      if (dx * dx + dy * dy < (pr.r + pad) * (pr.r + pad)) return true;
    }
    return false;
  }

  /* 只判定墙体（子弹可以越过病床、油桶等矮道具） */
  function wallBlocked(world, x, y) {
    for (const wl of world.walls) {
      if (x > wl.x && x < wl.x + wl.w && y > wl.y && y < wl.y + wl.h) return true;
    }
    return false;
  }

  /* ===== 流场寻路：让丧尸绕过墙体找到缺口 ===== */

  function buildNavGrid(world) {
    const cell = 64;
    const cols = Math.ceil(world.w / cell), rows = Math.ceil(world.h / cell);
    const blocked = new Uint8Array(cols * rows);
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const x0 = cx * cell, y0 = cy * cell;
        const pts = [
          [x0 + 6, y0 + 6], [x0 + cell - 6, y0 + 6], [x0 + 6, y0 + cell - 6],
          [x0 + cell - 6, y0 + cell - 6], [x0 + cell / 2, y0 + cell / 2],
        ];
        let hit = false;
        for (const [px, py] of pts) {
          if (wallBlocked(world, px, py)) { hit = true; break; }
        }
        blocked[cy * cols + cx] = hit ? 1 : 0;
      }
    }
    return {
      cell, cols, rows, blocked,
      dist: new Int32Array(cols * rows),
      dir: new Float32Array(cols * rows * 2),
      timer: 0, lastPX: -99999, lastPY: -99999,
    };
  }

  function computeFlow(world) {
    const nav = world.nav, U2 = U;
    const { cols, rows, cell, blocked, dist } = nav;
    dist.fill(-1);
    const p = world.player;
    let pcx = U2.clamp(Math.floor(p.x / cell), 0, cols - 1);
    let pcy = U2.clamp(Math.floor(p.y / cell), 0, rows - 1);
    let start = pcy * cols + pcx;
    if (blocked[start]) {
      let found = -1;
      for (let r = 1; r <= 3 && found < 0; r++) {
        for (let dy = -r; dy <= r && found < 0; dy++) {
          for (let dx = -r; dx <= r && found < 0; dx++) {
            const cx = pcx + dx, cy = pcy + dy;
            if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) continue;
            if (!blocked[cy * cols + cx]) found = cy * cols + cx;
          }
        }
      }
      if (found < 0) return;
      start = found;
    }
    const queue = [start];
    dist[start] = 0;
    let head = 0;
    while (head < queue.length) {
      const cur = queue[head++];
      const cx = cur % cols, cy = (cur - cx) / cols;
      const d = dist[cur];
      for (let k = 0; k < 4; k++) {
        const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0);
        const ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const ni = ny * cols + nx;
        if (blocked[ni] || dist[ni] >= 0) continue;
        dist[ni] = d + 1;
        queue.push(ni);
      }
    }
    for (let i = 0; i < cols * rows; i++) { nav.dir[i * 2] = 0; nav.dir[i * 2 + 1] = 0; }
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const i = cy * cols + cx;
        if (!blocked[i] && dist[i] >= 0) {
          let bd = dist[i], bnx = 0, bny = 0;
          for (let k = 0; k < 4; k++) {
            const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0);
            const ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
            if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
            const ni = ny * cols + nx;
            if (blocked[ni] || dist[ni] < 0) continue;
            if (dist[ni] < bd) {
              bd = dist[ni];
              bnx = k === 0 ? 1 : k === 1 ? -1 : 0;
              bny = k === 2 ? 1 : k === 3 ? -1 : 0;
            }
          }
          nav.dir[i * 2] = bnx; nav.dir[i * 2 + 1] = bny;
        } else {
          /* 被墙占据/不可达的格子：朝 8 邻域里最能接近玩家的格子挪动（逃生方向） */
          let bd = Infinity, bnx = 0, bny = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (!dx && !dy) continue;
              const nx = cx + dx, ny = cy + dy;
              if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
              const ni = ny * cols + nx;
              if (blocked[ni] || dist[ni] < 0) continue;
              if (dist[ni] < bd) { bd = dist[ni]; bnx = dx; bny = dy; }
            }
          }
          const l = Math.hypot(bnx, bny) || 1;
          nav.dir[i * 2] = bnx / l; nav.dir[i * 2 + 1] = bny / l;
        }
      }
    }
    nav.lastPX = p.x; nav.lastPY = p.y;
  }

  function navSteer(world, x, y) {
    const nav = world.nav;
    if (!nav) return null;
    const cx = Math.floor(x / nav.cell), cy = Math.floor(y / nav.cell);
    if (cx < 0 || cy < 0 || cx >= nav.cols || cy >= nav.rows) return null;
    const i = cy * nav.cols + cx;
    const dx = nav.dir[i * 2], dy = nav.dir[i * 2 + 1];
    if (!dx && !dy) return null;
    const l = Math.hypot(dx, dy) || 1;
    return { x: dx / l, y: dy / l };
  }

  function updateNav(world, dt) {
    const nav = world.nav;
    if (!nav) return;
    nav.timer -= dt;
    const p = world.player;
    const movedFar = Math.hypot(p.x - nav.lastPX, p.y - nav.lastPY) > 96;
    if (nav.timer <= 0 || movedFar) {
      nav.timer = 0.35;
      computeFlow(world);
    }
  }

  function hasLOS(world, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const dist = Math.hypot(dx, dy);
    if (dist > 1400) return false;
    const steps = Math.min(56, Math.ceil(dist / 26));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (wallBlocked(world, ax + dx * t, ay + dy * t)) return false;
    }
    return true;
  }

  function buildSpawnPoints(world) {
    const pts = [];
    const step = 120;
    for (let x = 70; x < world.w - 70; x += step) { pts.push({ x, y: 70 }); pts.push({ x, y: world.h - 70 }); }
    for (let y = 70; y < world.h - 70; y += step) { pts.push({ x: 70, y }); pts.push({ x: world.w - 70, y }); }
    for (let i = 0; i < 70; i++) {
      pts.push({ x: U.rand(world.rng, 120, world.w - 120), y: U.rand(world.rng, 120, world.h - 120) });
    }
    world.spawnPoints = pts.filter((p) => !pointBlocked(world, p.x, p.y, 46));
    if (!world.spawnPoints.length) world.spawnPoints.push({ x: 90, y: 90 });
  }

  function collideEntity(world, e) {
    for (const wl of world.walls) {
      const cx = U.clamp(e.x, wl.x, wl.x + wl.w), cy = U.clamp(e.y, wl.y, wl.y + wl.h);
      const dx = e.x - cx, dy = e.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < e.r * e.r) {
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const push = e.r - d;
          e.x += (dx / d) * push; e.y += (dy / d) * push;
        } else {
          const left = e.x - wl.x, right = wl.x + wl.w - e.x, top = e.y - wl.y, bot = wl.y + wl.h - e.y;
          const m = Math.min(left, right, top, bot);
          if (m === left) e.x = wl.x - e.r; else if (m === right) e.x = wl.x + wl.w + e.r;
          else if (m === top) e.y = wl.y - e.r; else e.y = wl.y + wl.h + e.r;
        }
      }
    }
    for (const pr of world.props) {
      const dx = e.x - pr.x, dy = e.y - pr.y;
      const rr = pr.r + e.r * 0.7;
      const d2 = dx * dx + dy * dy;
      if (d2 < rr * rr && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const push = rr - d;
        e.x += (dx / d) * push; e.y += (dy / d) * push;
      }
    }
    e.x = U.clamp(e.x, e.r, world.w - e.r);
    e.y = U.clamp(e.y, e.r, world.h - e.r);
  }

  /* ================= 生成与波次 ================= */

  function pickSpawn(world) {
    const pts = world.spawnPoints;
    const p = world.player;
    let fallback = pts[0];
    for (let t = 0; t < 14; t++) {
      const pt = pts[Math.floor(world.rng() * pts.length)];
      if (!pt) break;
      fallback = pt;
      if (U.dist2(pt.x, pt.y, p.x, p.y) > 380 * 380) return pt;
    }
    return fallback;
  }

  function spawnEnemy(world, type, elite, x, y) {
    const def = D.ENEMIES[type] || D.BOSSES[type];
    if (!def) return null;
    const sc = D.waveScaling(world.wave, world.diff);
    const hp = def.hp * sc.hp * (elite ? 1.9 : 1);
    const e = {
      kid: world.kidSeq++, kind: type, def, x, y,
      r: def.radius * (elite ? 1.25 : 1),
      hp, maxHp: hp,
      speed: def.speed * sc.speed * (elite ? 1.1 : 1) * (world.mods.enemySpeedMul || 1) *
        U.rand(world.rng, 1 - (def.speedJitter || 0), 1 + (def.speedJitter || 0)),
      dmg: def.dmg * sc.dmg * (elite ? 1.3 : 1),
      xp: Math.round(def.xp * (elite ? 2.5 : 1)),
      elite: !!elite, hitT: 0, atkT: U.rand(world.rng, 0.2, 1.0),
      burnT: 0, burnDps: 0, slowT: 0, kvx: 0, kvy: 0, wob: U.rand(world.rng, 0, U.TAU),
      bias: 0, biasT: 0, stuckT: 0,
      boss: !!def.attacks, alive: true, armor: def.armor || 0,
      summonLeft: def.summonMax || 3,
    };
    if (elite) {
      /* 精英词条：高波次与噩梦难度会带 2 条 */
      const count = (world.diffId === "nightmare" || world.wave >= 10) ? 2 : 1;
      e.affixes = U.shuffle(world.rng, D.AFFIXES.map((a) => a.id)).slice(0, count);
      if (e.affixes.indexOf("berserk") >= 0) { e.speed *= 1.35; e.dmg *= 1.15; }
      if (e.affixes.indexOf("shielded") >= 0) e.shielded = true;
      if (e.affixes.indexOf("regen") >= 0) e.regen = 2;
    }
    world.enemies.push(e);
    if (e.boss) {
      e.bstate = "idle"; e.bstateT = 0;
      e.chargeCd = def.chargeCd || 6; e.slamCd = def.slamCd || 4;
      e.roarCd = def.roarCd || 10; e.spawnCd = def.spawnCd || 5;
      e.acidCd = def.acidCd || 7; e.tendrilCd = def.tendrilCd || 8;
      e.beamCd = def.beamCd || 9; e.spikeCd = def.spikeCd || 8;
      world.boss = e;
      ev(world, { type: "boss", name: def.name });
      sfx(world, "boss");
    }
    return e;
  }

  function startWave(world, n) {
    world.wave = n;
    world.phase = "fight";
    world.spawnQueue.length = 0;
    world.spawnTimer = 0.8;
    const comp = D.waveComposition(world.map, n, world.rng);
    for (const c of comp) {
      for (let i = 0; i < Math.round(c.count * world.diff.spawnMul * world.mods.spawnMul); i++) {
        world.spawnQueue.push({ type: c.type, elite: c.elite });
      }
    }
    if (world.map.special.id === "alarm" && n >= 2 && world.rng() < 0.35) {
      const extra = Math.round(world.spawnQueue.length * 0.4);
      const types = Object.keys(world.map.pool);
      for (let i = 0; i < extra; i++) {
        world.spawnQueue.push({ type: types[Math.floor(world.rng() * types.length)], elite: false });
      }
      ev(world, { type: "banner", main: "暴动警报", sub: "增援正在涌入", dur: 3 });
      sfx(world, "alarm");
    }
    const isBossWave = (n === G.bossWave && !world.endless) || (world.endless && n > G.bossWave && (n - G.bossWave) % G.endlessBossEvery === 0);
    if (isBossWave) {
      const bd = D.BOSSES[world.map.boss] || D.BOSSES.butcher;
      const sp = pickSpawn(world);
      const boss = spawnEnemy(world, bd.id, false, sp.x, sp.y);
      if (boss && world.endless) {
        const extra = 1 + ((n - G.bossWave) / G.endlessBossEvery) * 0.8;
        boss.maxHp *= extra; boss.hp = boss.maxHp; boss.dmg *= 1.1;
      }
      ev(world, { type: "banner", main: `第 ${n} 波 · ${bd.name}`, sub: "它来了", dur: 3.2 });
      ev(world, { type: "radio", kind: "boss", map: world.mapId, wave: n });
      ev(world, { type: "autosave" });
    } else if (n > 1) {
      ev(world, { type: "banner", main: `第 ${n} 波`, sub: "", dur: 1.8 });
    }
    if (n === 1) {
      ev(world, {
        type: "banner", main: "生存开始", dur: 2.6,
        sub: world.curseId !== "none" ? "第 1 波 来袭 · 契约：" + world.curse.name : "第 1 波 来袭",
      });
    }
    ev(world, { type: "radio", kind: n === 1 ? "mapIntro" : "waveStart", map: world.mapId, wave: n });
    if (comp.some((c) => c.elite && c.count > 0)) {
      ev(world, { type: "radio", kind: "elite", map: world.mapId, wave: n });
    }
    world.turrets.length = 0;
    for (let i = 0; i < world.mods.turrets; i++) {
      const ang = (i / Math.max(1, world.mods.turrets)) * U.TAU;
      world.turrets.push({ x: world.player.x + Math.cos(ang) * 70, y: world.player.y + Math.sin(ang) * 70, cd: 0.4, angle: 0 });
    }
  }

  /* ================= 武器与战斗 ================= */

  function fire(world, p, wp, st) {
    const def = st.def;
    const b = wp.bonus || {};
    const n = st.pellets;
    const burnOn = def.id === "flamer" || b.alwaysBurn ? 1 : p.burn;
    const burnDps = burnOn ? 5 * p.dmgMul + 2 + (b.burnPlus ? 5 : 0) : 0;
    for (let i = 0; i < n; i++) {
      const a = p.facing + U.rand(world.rng, -def.spread, def.spread);
      let crit = world.rng() < st.crit;
      let dmg = st.dmg * (crit ? 2 : 1);
      if (b.holyCrit && world.rng() < b.holyCrit) { dmg *= 3; crit = true; }
      const speed = def.speed * U.rand(world.rng, 0.94, 1.06);
      world.bullets.push({
        x: p.x + Math.cos(p.facing) * 16, y: p.y + Math.sin(p.facing) * 16,
        vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        r: def.kind === "flame" ? st.flameR : def.radius,
        dmg, pierce: def.kind === "flame" ? 999 : st.pierce, hitIds: [],
        life: st.life, kind: def.kind === "flame" ? "flame" : "bullet",
        color: wp.evoColor || def.color, knock: st.knock, crit,
        burn: burnOn, burnDps, freeze: b.alwaysFreeze ? 1 : p.freeze, explode: st.explode,
      });
    }
    world.shotsFired += n;
    wp.ammo -= 1;
    wp.cd = wp.burstLeft > 0 ? st.burstGap : 1 / Math.max(0.1, st.rof);
    if (wp.burstLeft > 0) wp.burstLeft -= 1;
    world.muzzleT = 0.06;
    sfx(world, def.sfx, p.x, p.y);
    const nP = def.id === "shotgun" ? 6 : 3;
    for (let i = 0; i < nP; i++) {
      const a = p.facing + U.rand(world.rng, -0.4, 0.4);
      world.particles.push({
        x: p.x + Math.cos(p.facing) * 20, y: p.y + Math.sin(p.facing) * 20,
        vx: Math.cos(a) * U.rand(world.rng, 120, 420), vy: Math.sin(a) * U.rand(world.rng, 120, 420),
        r: U.rand(world.rng, 1.5, 3.4), color: def.color, life: 0.14, maxLife: 0.14, kind: "spark",
      });
    }
    if ((def.knock || 0) >= 200) ev(world, { type: "shake", mag: 3 });
  }

  function updateBullets(world, dt) {
    const hash = world.hash;
    for (let i = world.bullets.length - 1; i >= 0; i--) {
      const b = world.bullets[i];
      if (b.kind === "grenade") {
        b.fuse -= dt;
        b.x += b.vx * dt; b.y += b.vy * dt;
        b.vx *= 0.985; b.vy *= 0.985;
        if (wallBlocked(world, b.x, b.y)) { b.vx *= -0.4; b.vy *= -0.4; b.x += b.vx * dt; b.y += b.vy * dt; }
        if (b.fuse <= 0) {
          explosionAt(world, b.x, b.y, 140, b.dmg, false);
          world.bullets.splice(i, 1);
        }
        continue;
      }
      b.life -= dt;
      if (b.life <= 0) { world.bullets.splice(i, 1); continue; }
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (wallBlocked(world, b.x, b.y)) { world.bullets.splice(i, 1); continue; }
      const dst = hitDestructible(world, b.x, b.y, b.r);
      if (dst) {
        damageDestructible(world, dst, b.dmg, b);
        if (b.kind !== "flame") {
          b.pierce -= 1;
          if (b.pierce < 0) { world.bullets.splice(i, 1); continue; }
        }
      }
      hash.query(b.x, b.y, b.r + 34, world.bufB);
      let removed = false;
      for (const e of world.bufB) {
        if (!e.alive || removed) continue;
        if (b.hitIds.indexOf(e.kid) >= 0) continue;
        const rr = b.r + e.r;
        if (U.dist2(b.x, b.y, e.x, e.y) > rr * rr) continue;
        b.hitIds.push(e.kid);
        world.shotsHit += 1;
        damageEnemy(world, e, b.dmg, b);
        if (b.explode) explosionAt(world, b.x, b.y, b.explode, b.dmg * 0.7, false);
        if (b.kind !== "flame") {
          b.pierce -= 1;
          if (b.pierce < 0) { world.bullets.splice(i, 1); removed = true; }
        }
      }
    }
  }

  function updateEBullets(world, dt) {
    const p = world.player;
    for (let i = world.eBullets.length - 1; i >= 0; i--) {
      const b = world.eBullets[i];
      b.life -= dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.life <= 0 || pointBlocked(world, b.x, b.y, 0)) { world.eBullets.splice(i, 1); continue; }
      const rr = b.r + p.r;
      if (U.dist2(b.x, b.y, p.x, p.y) < rr * rr) {
        damagePlayer(world, b.dmg, b.x, b.y);
        world.eBullets.splice(i, 1);
        for (let k = 0; k < 4; k++) {
          world.particles.push({ x: b.x, y: b.y, vx: U.rand(world.rng, -80, 80), vy: U.rand(world.rng, -80, 80), r: 2.5, color: "#7fae3f", life: 0.3, maxLife: 0.3, kind: "spark" });
        }
      }
    }
  }

  /* ================= 伤害与掉落 ================= */

  function damageEnemy(world, e, dmg, opts) {
    if (!e.alive) return;
    let d = dmg;
    if (e.armor) d = Math.max(1, d - e.armor);
    if (e.shielded) d *= 0.7;
    e.hp -= d;
    e.hitT = 0.09;
    const knockResist = e.def.knockResist || 0;
    const k = (opts && opts.knock ? opts.knock : 0) * (1 - knockResist);
    if (k > 0) {
      const a = Math.atan2(e.y - world.player.y, e.x - world.player.x);
      e.kvx += Math.cos(a) * k; e.kvy += Math.sin(a) * k;
    }
    if (opts && opts.burn) {
      e.burnT = Math.max(e.burnT, 3);
      e.burnDps = Math.max(e.burnDps, opts.burnDps || (5 * world.player.dmgMul + 2));
    }
    if (opts && opts.freeze) { e.slowT = Math.max(e.slowT, 2); }
    if (d >= 1 && world.floaters.length < 46) {
      world.floaters.push({ x: e.x + U.rand(world.rng, -8, 8), y: e.y - e.r - 6, v: Math.round(d), crit: !!(opts && opts.crit), t: 0, life: 0.75 });
    }
    sfx(world, opts && opts.crit ? "crit" : "hit", e.x, e.y);
    for (let i = 0; i < (e.elite ? 4 : 2); i++) {
      world.particles.push({
        x: e.x, y: e.y, vx: U.rand(world.rng, -140, 140), vy: U.rand(world.rng, -140, 140),
        r: U.rand(world.rng, 1.6, 3.6), color: e.def.gib || "#7d2b22", life: 0.32, maxLife: 0.32, kind: "blood",
      });
    }
    if (e.hp <= 0) killEnemy(world, e);
  }

  function killEnemy(world, e) {
    if (!e.alive) return;
    e.alive = false;
    world.kills += 1;
    const p = world.player;
    /* 连杀：3.5 秒内持续击杀累积倍率，受击会中断 */
    world.combo += 1;
    world.comboT = 3.5;
    if (world.combo > world.comboBest) world.comboBest = world.combo;
    if (world.combo >= 5 && world.combo % 5 === 0) {
      const comboBonus = world.combo * 0.6;
      world.serumEarned += comboBonus;
      ev(world, { type: "toast", text: "连杀 x" + world.combo + " · 血清 +" + Math.round(comboBonus), cls: "gold" });
      sfx(world, "serum");
    }
    world.serumEarned += G.killRewardSerum * (e.elite ? 6 : 1) * world.diff.rewardMul * p.serumMul * comboMul(world);

    const orbs = e.boss ? 12 : e.elite ? 5 : e.xp >= 6 ? 2 : 1;
    const per = Math.max(1, Math.round(e.xp / orbs));
    for (let i = 0; i < orbs; i++) {
      world.pickups.push({
        type: "xp", x: e.x + U.rand(world.rng, -14, 14), y: e.y + U.rand(world.rng, -14, 14),
        v: per, r: e.boss ? 7 : 5, t: 0,
      });
    }
    const luck = 1 + p.luck;
    const medkitMul = world.map.special.id === "medkit" ? 1.5 : 1;
    const ammoMul = world.map.special.id === "ammo" ? 2 : 1;
    if (world.rng() < 0.05 * luck * medkitMul) world.pickups.push({ type: "health", x: e.x, y: e.y, v: 35, r: 8, t: 0 });
    if (world.rng() < 0.05 * luck * ammoMul) world.pickups.push({ type: "ammo", x: e.x, y: e.y, v: 1, r: 8, t: 0 });
    if (world.rng() < 0.03 * luck) world.pickups.push({ type: "grenade", x: e.x, y: e.y, v: 1, r: 8, t: 0 });
    if (world.rng() < 0.04 * luck) world.pickups.push({ type: "serum", x: e.x, y: e.y, v: 1, r: 8, t: 0 });
    if (e.elite) {
      world.pickups.push({ type: "serum", x: e.x + 12, y: e.y, v: 5, r: 9, t: 0 });
      world.pickups.push({ type: "health", x: e.x - 12, y: e.y, v: 35, r: 8, t: 0 });
      if (world.rng() < 0.35) world.pickups.push({ type: "intel", x: e.x, y: e.y - 8, v: 1, r: 10, t: 0 });
    }

    if (e.boss) {
      world.serumEarned += (e.def.serumDrop || 100) * world.diff.rewardMul * p.serumMul;
      world.pickups.push({ type: "intel", x: e.x + 26, y: e.y + 10, v: 1, r: 10, t: 0 });
      world.pickups.push({ type: "intel", x: e.x - 26, y: e.y - 10, v: 1, r: 10, t: 0 });
      world.boss = null;
      world.hazards = world.hazards.filter((hh) => hh.bossKid !== e.kid);
      e.beamHazard = null;
      ev(world, { type: "bossdead" });
      ev(world, { type: "toast", text: e.def.name + " 已被击杀", cls: "gold" });
    }
    for (let i = 0; i < (e.boss ? 26 : e.elite ? 12 : 7); i++) {
      world.particles.push({
        x: e.x, y: e.y, vx: U.rand(world.rng, -190, 190), vy: U.rand(world.rng, -190, 190),
        r: U.rand(world.rng, 1.6, 4.2), color: e.def.gib || "#7d2b22",
        life: U.rand(world.rng, 0.3, 0.6), maxLife: 0.6, kind: "blood",
      });
    }
    if (world.decals.length < G.maxDecals) {
      world.decals.push({ x: e.x, y: e.y, r: U.rand(world.rng, 9, e.boss ? 46 : 20), color: e.def.gib || "#7d2b22", a: 0.34 });
    }
    if (e.affixes && e.affixes.indexOf("toxic") >= 0) {
      world.pools.push({ x: e.x, y: e.y, r: 64, t: 0, life: 12, tick: 0 });
    }
    if (e.def.atk === "explode") explosionAt(world, e.x, e.y, e.def.boomR, e.dmg * 1.1, true);
    sfx(world, "zdie", e.x, e.y);
  }

  function explosionAt(world, x, y, r, dmg, hurtsPlayer) {
    for (const d of world.destructibles) {
      if (!d.alive) continue;
      if (U.dist2(x, y, d.x, d.y) < (r + d.r) * (r + d.r)) damageDestructible(world, d, dmg * 0.9, {});
    }
    for (const e of world.enemies) {
      if (!e.alive) continue;
      const d2 = U.dist2(x, y, e.x, e.y);
      if (d2 < (r + e.r) * (r + e.r)) {
        const falloff = 1 - (Math.sqrt(d2) / (r + e.r)) * 0.45;
        damageEnemy(world, e, dmg * falloff, {});
      }
    }
    if (hurtsPlayer) {
      const p = world.player;
      if (U.dist2(x, y, p.x, p.y) < (r + p.r) * (r + p.r)) {
        /* 自伤封顶：任何爆炸对玩家最多造成 34% 生命上限的伤害，避免"一桶秒杀" */
        damagePlayer(world, Math.min(dmg, p.maxHp * 0.34), x, y);
      }
    }
    world.hazards.push({ kind: "boom", x, y, r, t: 0, maxT: 0.32 });
    for (let i = 0; i < 14; i++) {
      world.particles.push({
        x, y, vx: U.rand(world.rng, -260, 260), vy: U.rand(world.rng, -260, 260),
        r: U.rand(world.rng, 2, 5.5), color: world.rng() < 0.5 ? "#ffb347" : "#ff6b35",
        life: U.rand(world.rng, 0.2, 0.45), maxLife: 0.45, kind: "spark",
      });
    }
    sfx(world, "boom", x, y);
    ev(world, { type: "shake", mag: 7 });
  }

  function damagePlayer(world, dmg, sx, sy) {
    const p = world.player;
    if (!p.alive || world.god) return;
    if (p.iframeT > 0 || p.dashT > 0) return;
    const reduce = Math.min(dmg * 0.65, p.armor);
    const d = Math.max(1, dmg - reduce);
    p.hp -= d;
    p.hurtT = 0.28;
    p.iframeT = 0.32;
    world.nohit = false;
    if (world.combo >= 5) {
      ev(world, { type: "toast", text: "连杀中断（x" + world.combo + "）", cls: "warn", brief: true });
    }
    world.combo = 0;
    world.comboT = 0;
    if (p.hp / p.maxHp < 0.32 && world.t - (world.lastHpRadioT || -999) > 45) {
      world.lastHpRadioT = world.t;
      ev(world, { type: "radio", kind: "lowHp", map: world.mapId, wave: world.wave });
    }
    if (p.thorns > 0) {
      for (const e of world.enemies) {
        if (!e.alive) continue;
        if (U.dist2(p.x, p.y, e.x, e.y) < PL.thornsR * PL.thornsR) damageEnemy(world, e, p.thorns, {});
      }
    }
    ev(world, { type: "shake", mag: 5 });
    sfx(world, "hurt");
    if (p.hp <= 0) {
      if (p.reviveLeft > 0) {
        p.reviveLeft -= 1;
        p.hp = p.maxHp * 0.5;
        p.iframeT = 2.2;
        ev(world, { type: "toast", text: "应激针剂生效！", cls: "gold" });
        ev(world, { type: "banner", main: "重新站起", sub: "应激针剂已使用", dur: 2.4 });
        sfx(world, "medkit");
      } else {
        p.alive = false;
        p.hp = 0;
        finishRun(world, false);
      }
    }
  }

  /* ================= 敌人 AI ================= */

  function updateEnemies(world, dt) {
    const p = world.player;
    /* 残兵暴走：波次末期只剩少量敌人时，它们会加速扑上来，避免拖节奏 */
    world.enraged = world.phase === "fight" && world.spawnQueue.length === 0 &&
      world.enemies.length > 0 && world.enemies.length <= 6;
    for (const e of world.enemies) {
      if (!e.alive) continue;
      if (e.hitT > 0) e.hitT -= dt;
      if (e.slowT > 0) e.slowT -= dt;
      if (e.regen) e.hp = Math.min(e.maxHp, e.hp + e.regen * dt);
      if (e.burnT > 0) {
        e.burnT -= dt;
        e.hp -= e.burnDps * dt;
        if (world.rng() < 0.25) {
          world.particles.push({ x: e.x, y: e.y - e.r * 0.4, vx: U.rand(world.rng, -20, 20), vy: U.rand(world.rng, -60, -20), r: 2.6, color: "#ff9c3c", life: 0.3, maxLife: 0.3, kind: "flame" });
        }
        if (e.hp <= 0) { killEnemy(world, e); continue; }
      }
      if (e.kvx || e.kvy) {
        e.x += e.kvx * dt; e.y += e.kvy * dt;
        e.kvx *= Math.pow(0.0016, dt); e.kvy *= Math.pow(0.0016, dt);
        if (Math.abs(e.kvx) < 4) e.kvx = 0;
        if (Math.abs(e.kvy) < 4) e.kvy = 0;
      }
      if (e.boss) { updateBoss(world, e, dt); collideEntity(world, e); continue; }

      const dx = p.x - e.x, dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      let dirX = dx / d, dirY = dy / d;
      const def = e.def;
      e.atkT -= dt;
      /* 有视线就直冲；被墙挡住就跟着流场找缺口 */
      e.losT -= dt;
      if (e.losT <= 0) { e.losT = 0.25; e.los = hasLOS(world, e.x, e.y, p.x, p.y); }
      if (!e.los) {
        const nd = navSteer(world, e.x, e.y);
        if (nd) { dirX = nd.x; dirY = nd.y; }
      }
      /* 进度检测：3.5 秒内没有明显接近玩家 → 重新投放到玩家附近的刷新点，保证波次永不僵死 */
      if (!def.keepAway) {
        if (e.progT === undefined) { e.progT = 0; e.lastD = d; }
        e.progT += dt;
        if (e.progT >= 3.5) {
          if (e.lastD - d < 48) {
            const sp3 = pickSpawn(world);
            e.x = sp3.x; e.y = sp3.y;
            world.hazards.push({ kind: "boom", x: e.x, y: e.y, r: 44, t: 0, maxT: 0.25 });
          }
          e.lastD = d;
          e.progT = 0;
        }
      }

      if (def.zigzag) {
        const wob = Math.sin(world.t * 7 + e.wob) * 0.75;
        const nx = dirX - dirY * wob, ny = dirY + dirX * wob * 0.2;
        const l = Math.hypot(nx, ny) || 1;
        dirX = nx / l; dirY = ny / l;
      }
      if (def.atk === "summon" && d < (def.keepAway || 240)) {
        dirX = -dirX; dirY = -dirY;
      }
      const spd = e.speed * (e.slowT > 0 ? 0.65 : 1) * (world.enraged && !e.boss ? 1.65 : 1);
      /* 贴墙滑动：被挡住时加入切向偏置，绕过障碍寻找缺口 */
      let sx = dirX, sy = dirY;
      if (e.biasT > 0) {
        e.biasT -= dt;
        const t = (e.bias || 1) * 1.15;
        sx = dirX - dirY * t; sy = dirY + dirX * t;
        const sl = Math.hypot(sx, sy) || 1;
        sx /= sl; sy /= sl;
      }
      const bx0 = e.x, by0 = e.y;
      e.x += sx * spd * dt; e.y += sy * spd * dt;

      world.hash.query(e.x, e.y, e.r * 1.7, world.bufA);
      let count = 0;
      for (const o of world.bufA) {
        if (o === e || !o.alive || count > 7) continue;
        const ox = e.x - o.x, oy = e.y - o.y;
        const rr = e.r + o.r;
        const od2 = ox * ox + oy * oy;
        if (od2 > 0.01 && od2 < rr * rr) {
          const od = Math.sqrt(od2);
          const push = (rr - od) * 0.5;
          e.x += (ox / od) * push; e.y += (oy / od) * push;
          count++;
        }
      }
      collideEntity(world, e);
      const moved = Math.hypot(e.x - bx0, e.y - by0);
      if (moved < spd * dt * 0.45) {
        e.stuckT += dt;
        if (e.biasT <= 0) { e.bias = world.rng() < 0.5 ? 1 : -1; e.biasT = U.rand(world.rng, 0.55, 1.3); }
      } else {
        e.stuckT = 0;
      }
      if (e.stuckT > 6) {
        /* 反卡死：超过 6 秒几乎没有位移就重新定位到玩家附近的刷新点 */
        const sp2 = pickSpawn(world);
        e.x = sp2.x; e.y = sp2.y; e.stuckT = 0; e.biasT = 0;
        world.hazards.push({ kind: "boom", x: e.x, y: e.y, r: 44, t: 0, maxT: 0.25 });
      }

      if (def.atk === "melee" && d < e.r + p.r + 10) {
        if (e.atkT <= 0) { e.atkT = def.atkCd; damagePlayer(world, e.dmg, e.x, e.y); }
      } else if (def.atk === "ranged") {
        if (d < def.range && e.atkT <= 0) {
          e.atkT = def.atkCd;
          const a = Math.atan2(p.y - e.y, p.x - e.x) + U.rand(world.rng, -0.05, 0.05);
          world.eBullets.push({
            x: e.x + Math.cos(a) * e.r, y: e.y + Math.sin(a) * e.r,
            vx: Math.cos(a) * def.projSpeed, vy: Math.sin(a) * def.projSpeed,
            r: def.projR, dmg: def.projDmg * world.diff.dmgMul, life: 2.4, color: "#8fce4f",
          });
          sfx(world, "spit", e.x, e.y);
        }
      } else if (def.atk === "explode") {
        if (d < e.r + p.r + 8 && e.atkT <= 0) killEnemy(world, e);
      } else if (def.atk === "summon") {
        if (e.atkT <= 0 && d < 620 && e.summonLeft > 0) {
          e.atkT = def.atkCd;
          e.summonLeft -= 1;
          for (let i = 0; i < def.summonCount; i++) {
            const a = U.rand(world.rng, 0, U.TAU);
            spawnEnemy(world, def.summonType, false, e.x + Math.cos(a) * 50, e.y + Math.sin(a) * 50);
          }
          world.hazards.push({ kind: "boom", x: e.x, y: e.y, r: 70, t: 0, maxT: 0.3 });
          sfx(world, "zgroan", e.x, e.y);
        }
      }
    }
    let w2 = 0;
    for (let i = 0; i < world.enemies.length; i++) {
      const e = world.enemies[i];
      if (e.alive) world.enemies[w2++] = e;
    }
    world.enemies.length = w2;
  }

  function updateBoss(world, e, dt) {
    const p = world.player, def = e.def;
    const dx = p.x - e.x, dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const dirX = dx / d, dirY = dy / d;
    e.atkT -= dt;

    if (def.id === "butcher") {
      if (e.bstate === "dash") {
        e.bstateT -= dt;
        e.x += e.dashDx * e.speed * def.chargeSpeedMul * dt;
        e.y += e.dashDy * e.speed * def.chargeSpeedMul * dt;
        if (d < e.r + p.r + 8) damagePlayer(world, e.dmg * 1.15, e.x, e.y);
        if (e.bstateT <= 0) { e.bstate = "idle"; e.chargeCd = def.chargeCd; }
      } else if (e.bstate === "tele") {
        e.bstateT -= dt;
        if (e.bstateT <= 0) {
          e.bstate = "dash"; e.bstateT = def.chargeTime;
          e.dashDx = dirX; e.dashDy = dirY;
          sfx(world, "zgroan", e.x, e.y);
        }
      } else if (e.bstate === "slamTele") {
        e.bstateT -= dt;
        if (e.bstateT <= 0) {
          e.bstate = "idle";
          explosionAt(world, e.x, e.y, def.slamR, e.dmg * 1.35, true);
          for (let i = 0; i < 3; i++) {
            const a = U.rand(world.rng, 0, U.TAU);
            spawnEnemy(world, "walker", false, e.x + Math.cos(a) * 70, e.y + Math.sin(a) * 70);
          }
        }
      } else {
        let mvx = dirX, mvy = dirY;
        if (!hasLOS(world, e.x, e.y, p.x, p.y)) {
          const nd = navSteer(world, e.x, e.y);
          if (nd) { mvx = nd.x; mvy = nd.y; }
        }
        e.x += mvx * e.speed * dt; e.y += mvy * e.speed * dt;
        e.chargeCd -= dt; e.slamCd -= dt; e.roarCd -= dt;
        if (e.chargeCd <= 0 && d > 200) {
          e.bstate = "tele"; e.bstateT = def.telegraph;
          world.hazards.push({ kind: "tele-line", x: e.x, y: e.y, angle: Math.atan2(p.y - e.y, p.x - e.x), len: 1000, w: 90, t: 0, maxT: def.telegraph });
        } else if (e.slamCd <= 0 && d < 230) {
          e.bstate = "slamTele"; e.bstateT = 0.9; e.slamCd = def.slamCd;
          world.hazards.push({ kind: "tele-circle", x: e.x, y: e.y, r: def.slamR, t: 0, maxT: 0.9 });
        } else if (e.roarCd <= 0) {
          e.roarCd = def.roarCd;
          for (let i = 0; i < 6; i++) {
            const a = U.rand(world.rng, 0, U.TAU);
            spawnEnemy(world, "walker", false, e.x + Math.cos(a) * 90, e.y + Math.sin(a) * 90);
          }
          ev(world, { type: "toast", text: "屠夫咆哮，尸群被唤醒", cls: "warn" });
          sfx(world, "zgroan", e.x, e.y);
        }
      }
    } else if (def.id === "hive") {
      e.spawnCd -= dt; e.acidCd -= dt; e.tendrilCd -= dt;
      if (d > 200) {
        let mvx = dirX, mvy = dirY;
        if (!hasLOS(world, e.x, e.y, p.x, p.y)) {
          const nd = navSteer(world, e.x, e.y);
          if (nd) { mvx = nd.x; mvy = nd.y; }
        }
        e.x += mvx * e.speed * dt; e.y += mvy * e.speed * dt;
      }
      if (e.spawnCd <= 0) {
        e.spawnCd = def.spawnCd;
        for (let i = 0; i < 2; i++) {
          const a = U.rand(world.rng, 0, U.TAU);
          spawnEnemy(world, "runner", false, e.x + Math.cos(a) * 70, e.y + Math.sin(a) * 70);
        }
        sfx(world, "zgroan", e.x, e.y);
      }
      if (e.acidCd <= 0) {
        e.acidCd = def.acidCd;
        const base = Math.atan2(dy, dx);
        for (let i = 0; i < def.acidCount; i++) {
          const a = base + (i - (def.acidCount - 1) / 2) * 0.11;
          world.eBullets.push({
            x: e.x + Math.cos(a) * e.r, y: e.y + Math.sin(a) * e.r,
            vx: Math.cos(a) * 240, vy: Math.sin(a) * 240,
            r: 7, dmg: e.dmg * 0.5, life: 2.2, color: "#9fce3f",
          });
        }
        sfx(world, "spit", e.x, e.y);
      }
      if (e.tendrilCd <= 0) {
        e.tendrilCd = def.tendrilCd;
        for (let i = 0; i < def.tendrilCount; i++) {
          const a = U.rand(world.rng, 0, U.TAU);
          const dist = U.rand(world.rng, 120, 420);
          world.hazards.push({
            kind: "tendril",
            x: U.clamp(e.x + Math.cos(a) * dist, 60, world.w - 60),
            y: U.clamp(e.y + Math.sin(a) * dist, 60, world.h - 60),
            r: 74, t: 0, maxT: 1.35,
          });
        }
        ev(world, { type: "toast", text: "地面在震动……", cls: "warn" });
      }
    } else if (def.id === "tyrant") {
      e.beamCd -= dt; e.chargeCd -= dt; e.spikeCd -= dt;
      if (e.bstate === "beam") {
        e.bstateT -= dt;
        const k = 1 - Math.max(0, e.bstateT) / def.beamSweep;
        e.beamAngle = e.beamA0 + (k - 0.5) * 2.3;
        if (e.beamHazard) { e.beamHazard.x = e.x; e.beamHazard.y = e.y; e.beamHazard.angle = e.beamAngle; }
        if (d < def.beamRange) {
          const pa = Math.atan2(p.y - e.y, p.x - e.x);
          if (Math.abs(U.shortestAngle(e.beamAngle, pa)) < def.beamHalf) {
            damagePlayer(world, def.beamDmg * 0.45, e.x, e.y);
          }
        }
        if (e.bstateT <= 0) { e.bstate = "idle"; e.beamCd = def.beamCd; e.beamHazard = null; }
      } else if (e.bstate === "beamTele") {
        e.bstateT -= dt;
        if (e.beamHazard) { e.beamHazard.x = e.x; e.beamHazard.y = e.y; }
        if (e.bstateT <= 0) {
          e.bstate = "beam"; e.bstateT = def.beamSweep;
          e.beamAngle = e.beamA0;
          e.beamHazard = {
            kind: "beam", x: e.x, y: e.y, angle: e.beamAngle, half: def.beamHalf,
            range: def.beamRange, t: 0, maxT: def.beamSweep, bossKid: e.kid,
          };
          world.hazards.push(e.beamHazard);
          sfx(world, "boss");
        }
      } else if (e.bstate === "charge") {
        e.bstateT -= dt;
        e.x += e.dashDx * e.speed * def.chargeSpeedMul * dt;
        e.y += e.dashDy * e.speed * def.chargeSpeedMul * dt;
        if (d < e.r + p.r + 8) damagePlayer(world, e.dmg * 1.2, e.x, e.y);
        if (e.bstateT <= 0) { e.bstate = "idle"; e.chargeCd = def.chargeCd; }
      } else if (e.bstate === "chargeTele") {
        e.bstateT -= dt;
        if (e.bstateT <= 0) {
          e.bstate = "charge"; e.bstateT = def.chargeTime;
          e.dashDx = dirX; e.dashDy = dirY;
          sfx(world, "zgroan", e.x, e.y);
        }
      } else {
        let mvx = dirX, mvy = dirY;
        if (!hasLOS(world, e.x, e.y, p.x, p.y)) {
          const nd = navSteer(world, e.x, e.y);
          if (nd) { mvx = nd.x; mvy = nd.y; }
        }
        e.x += mvx * e.speed * dt; e.y += mvy * e.speed * dt;
        if (e.beamCd <= 0) {
          e.bstate = "beamTele"; e.bstateT = def.beamTelegraph;
          e.beamA0 = Math.atan2(p.y - e.y, p.x - e.x) - 1.15;
          e.beamHazard = {
            kind: "beamTele", x: e.x, y: e.y, angle: e.beamA0, half: def.beamHalf,
            range: def.beamRange, t: 0, maxT: def.beamTelegraph, bossKid: e.kid,
          };
          world.hazards.push(e.beamHazard);
          ev(world, { type: "toast", text: "暴君蓄能中——离开光轴！", cls: "warn" });
        } else if (e.chargeCd <= 0 && d > 220) {
          e.bstate = "chargeTele"; e.bstateT = def.telegraph;
        } else if (e.spikeCd <= 0) {
          e.spikeCd = def.spikeCd;
          for (let i = 0; i < def.spikeCount; i++) {
            const a = (i / def.spikeCount) * U.TAU + U.rand(world.rng, -0.1, 0.1);
            const dist = def.spikeDist + U.rand(world.rng, -40, 40);
            world.hazards.push({
              kind: "tendril",
              x: U.clamp(e.x + Math.cos(a) * dist, 60, world.w - 60),
              y: U.clamp(e.y + Math.sin(a) * dist, 60, world.h - 60),
              r: 62, t: 0, maxT: 1.2,
            });
          }
          ev(world, { type: "toast", text: "地刺环爆！", cls: "warn" });
        }
      }
    }
  }

  /* ================= 玩家 ================= */

  function updatePlayer(world, dt, input) {
    const p = world.player;
    if (!p.alive) return;
    if (p.hurtT > 0) p.hurtT -= dt;
    if (p.iframeT > 0) p.iframeT -= dt;
    if (p.grenadeCd > 0) p.grenadeCd -= dt;
    if (world.muzzleT > 0) world.muzzleT -= dt;
    if (input.aimX !== undefined) p.facing = U.angleTo(p.x, p.y, input.aimX, input.aimY);

    let mx = input.mx || 0, my = input.my || 0;
    const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }
    p.moving = ml > 0.05;

    if (p.dashT > 0) {
      p.dashT -= dt;
      p.x += p.dashDirX * p.speed * PL.dashSpeedMul * dt;
      p.y += p.dashDirY * p.speed * PL.dashSpeedMul * dt;
      if (world.rng() < 0.6) {
        world.particles.push({ x: p.x, y: p.y + 8, vx: U.rand(world.rng, -30, 30), vy: U.rand(world.rng, -30, 30), r: 3, color: "#9fb4c8", life: 0.28, maxLife: 0.28, kind: "smoke" });
      }
    } else {
      p.x += mx * p.speed * dt;
      p.y += my * p.speed * dt;
    }
    if (input.dash && p.dashCd <= 0 && p.dashT <= 0) {
      p.dashCd = p.dashCdMax;
      p.dashT = PL.dashTime;
      p.iframeT = Math.max(p.iframeT, PL.iframe);
      if (ml > 0.05) { p.dashDirX = mx / (ml || 1); p.dashDirY = my / (ml || 1); }
      else { p.dashDirX = Math.cos(p.facing); p.dashDirY = Math.sin(p.facing); }
      sfx(world, "dash", p.x, p.y);
    }
    if (p.dashCd > 0) p.dashCd -= dt;
    collideEntity(world, p);

    if (p.regen > 0) {
      p.regenT += dt;
      if (p.regenT >= PL.regenEvery) {
        p.regenT = 0;
        if (p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + p.regen);
      }
    }

    if (input.swap && p.weapons.length > 1) {
      p.weaponIdx = (p.weaponIdx + 1) % p.weapons.length;
      const w0 = p.weapons[p.weaponIdx];
      w0.cd = Math.max(w0.cd, 0.25);
      w0.burstLeft = 0;
      sfx(world, "click");
    }

    if (input.grenade && p.grenades > 0 && p.grenadeCd <= 0) {
      p.grenades -= 1;
      p.grenadeCd = 0.55;
      world.bullets.push({
        kind: "grenade", x: p.x, y: p.y,
        vx: Math.cos(p.facing) * 430, vy: Math.sin(p.facing) * 430,
        r: 6, fuse: 1.0, dmg: 130 * p.dmgMul, hitIds: [], pierce: 0,
      });
      sfx(world, "grenade", p.x, p.y);
    }
    if (input.medkit && p.medkits > 0 && p.hp < p.maxHp) {
      p.medkits -= 1;
      p.hp = Math.min(p.maxHp, p.hp + 35);
      sfx(world, "medkit");
      world.floaters.push({ x: p.x, y: p.y - 20, v: "+35", crit: false, t: 0, life: 0.9, heal: true });
    }

    const wp = p.weapons[p.weaponIdx];
    if (wp) {
      const st = weaponStats(p, wp);
      wp.cd = Math.max(0, wp.cd - dt);
      if (wp.reloadT > 0) {
        wp.reloadT -= dt;
        if (wp.reloadT <= 0) { wp.ammo = wp.magSize; sfx(world, "reload", p.x, p.y); }
      } else if ((input.reload || wp.ammo <= 0) && wp.ammo < wp.magSize) {
        wp.reloadT = st.reload;
      }
      if (wp.cd <= 0 && wp.reloadT <= 0 && wp.ammo > 0) {
        const def = st.def;
        let shoot = false;
        if (def.burst) {
          if (input.fireEdge || input.autoFire) wp.burstLeft = def.burst;
          if (wp.burstLeft > 0) shoot = true;
        } else if (def.auto) shoot = !!input.firing || !!input.autoFire;
        else shoot = !!input.fireEdge || !!input.autoFire;
        if (shoot) fire(world, p, wp, st);
      }
    }
  }

  /* ================= 拾取 / 粒子 / 浮字 ================= */

  function updatePickups(world, dt) {
    const p = world.player;
    for (let i = world.pickups.length - 1; i >= 0; i--) {
      const it = world.pickups[i];
      it.t += dt;
      const d2 = U.dist2(it.x, it.y, p.x, p.y);
      if (it.type === "xp") {
        const mag = p.magnet * (world.phase === "intermission" ? 8 : 1);
        if (d2 < mag * mag) {
          const a = U.angleTo(it.x, it.y, p.x, p.y);
          const sp = 260 + (1 - Math.sqrt(d2) / mag) * 420;
          it.x += Math.cos(a) * sp * dt; it.y += Math.sin(a) * sp * dt;
        }
      } else if (world.phase === "intermission" && it.type !== "supply") {
        /* 波间清点：其余掉落物也飞向玩家 */
        const a = U.angleTo(it.x, it.y, p.x, p.y);
        it.x += Math.cos(a) * 420 * dt; it.y += Math.sin(a) * 420 * dt;
      }
      if (d2 < 26 * 26) {
        if (it.type === "xp") { world.xp += it.v * p.xpMul * comboMul(world); sfx(world, "pickup", it.x, it.y); }
        else if (it.type === "health") {
          p.hp = Math.min(p.maxHp, p.hp + it.v);
          sfx(world, "medkit");
          ev(world, { type: "toast", text: "+" + it.v + " 生命", cls: "good", brief: true });
        } else if (it.type === "ammo") {
          for (const wp2 of p.weapons) wp2.ammo = wp2.magSize;
          sfx(world, "reload", it.x, it.y);
          ev(world, { type: "toast", text: "弹药补满", cls: "good", brief: true });
        } else if (it.type === "grenade") {
          p.grenades += it.v;
          sfx(world, "pickup");
          ev(world, { type: "toast", text: "手雷 +" + it.v, cls: "good", brief: true });
        } else if (it.type === "serum") {
          world.serumEarned += it.v * world.diff.rewardMul * p.serumMul * comboMul(world);
          sfx(world, "serum");
        } else if (it.type === "supply") {
          sfx(world, "buy");
          openSupply(world);
        } else if (it.type === "intel") {
          world.serumEarned += 8 * world.diff.rewardMul * p.serumMul * comboMul(world);
          sfx(world, "serum");
          ev(world, { type: "intel", map: world.mapId });
        }
        world.pickups.splice(i, 1);
      }
    }
  }

  function updateParticles(world, dt) {
    for (let i = world.particles.length - 1; i >= 0; i--) {
      const pt = world.particles[i];
      pt.life -= dt;
      if (pt.life <= 0) { world.particles.splice(i, 1); continue; }
      pt.x += pt.vx * dt; pt.y += pt.vy * dt;
      pt.vx *= Math.pow(0.02, dt); pt.vy *= Math.pow(0.02, dt);
    }
    const cap = world.lowFi ? 320 : G.maxParticles;
    if (world.particles.length > cap) world.particles.splice(0, world.particles.length - cap);
  }

  function updateFloaters(world, dt) {
    for (let i = world.floaters.length - 1; i >= 0; i--) {
      const f = world.floaters[i];
      f.t += dt;
      if (f.t >= f.life) world.floaters.splice(i, 1);
    }
  }

  function updateTurrets(world, dt) {
    for (const t of world.turrets) {
      t.cd -= dt;
      if (t.cd > 0) continue;
      let best = null, bd = 340 * 340;
      for (const e of world.enemies) {
        if (!e.alive) continue;
        const d2 = U.dist2(t.x, t.y, e.x, e.y);
        if (d2 < bd) { bd = d2; best = e; }
      }
      if (best) {
        t.cd = 0.55;
        t.angle = U.angleTo(t.x, t.y, best.x, best.y);
        const crit = world.rng() < 0.12;
        world.bullets.push({
          x: t.x, y: t.y, vx: Math.cos(t.angle) * 950, vy: Math.sin(t.angle) * 950,
          r: 3, dmg: 9 * world.player.dmgMul * (crit ? 2 : 1), pierce: 0, hitIds: [],
          life: 0.7, kind: "bullet", color: "#8fd4ff", knock: 50, crit,
        });
        sfx(world, "turret", t.x, t.y);
      } else t.cd = 0.2;
    }
  }

  /* ================= 危险区 / 地图机制 ================= */

  /* 毒池：精英「剧毒」词条的产物，持续腐蚀站在其中的玩家 */
  function updatePools(world, dt) {
    const p = world.player;
    for (let i = world.pools.length - 1; i >= 0; i--) {
      const pool = world.pools[i];
      pool.t += dt;
      if (pool.t >= pool.life) { world.pools.splice(i, 1); continue; }
      if (!p.alive) continue;
      if (U.dist2(pool.x, pool.y, p.x, p.y) < pool.r * pool.r) {
        pool.tick -= dt;
        if (pool.tick <= 0) {
          pool.tick = 0.5;
          damagePlayer(world, 6 * world.diff.dmgMul, pool.x, pool.y);
        }
      }
    }
  }

  function updateHazards(world, dt) {
    const p = world.player;
    for (let i = world.hazards.length - 1; i >= 0; i--) {
      const hz = world.hazards[i];
      hz.t += dt;
      if (hz.kind === "tendril" && hz.t >= hz.maxT) {
        explosionAt(world, hz.x, hz.y, hz.r, 26 * world.diff.dmgMul, true);
        world.hazards.splice(i, 1);
        continue;
      }
      if (hz.t >= hz.maxT) world.hazards.splice(i, 1);
    }
    if (world.toxics.length) {
      world.toxicTick += dt;
      for (const tx of world.toxics) {
        tx.x += tx.vx * dt; tx.y += tx.vy * dt;
        if (tx.x < 150 || tx.x > world.w - 150) tx.vx *= -1;
        if (tx.y < 150 || tx.y > world.h - 150) tx.vy *= -1;
        if (p.alive && U.dist2(tx.x, tx.y, p.x, p.y) < tx.r * tx.r) {
          p.hp -= 2.6 * dt;
          if (p.hp <= 0 && !world.god) {
            if (p.reviveLeft > 0) {
              p.reviveLeft -= 1;
              p.hp = p.maxHp * 0.5;
              p.iframeT = 2.2;
              ev(world, { type: "toast", text: "应激针剂生效！", cls: "gold" });
            } else {
              p.alive = false;
              finishRun(world, false);
            }
          }
        }
      }
    }
    if (world.trainLanes.length) {
      if (!world.trainActive && world.trainWarn <= 0) {
        world.trainCd -= dt;
        if (world.trainCd <= 0) {
          world.trainWarn = 3.2;
          world.trainLane = world.trainLanes[Math.floor(world.rng() * world.trainLanes.length)];
          sfx(world, "train");
          ev(world, { type: "banner", main: "列车进站", sub: "远离轨道", dur: 2.4 });
        }
      } else if (world.trainWarn > 0) {
        world.trainWarn -= dt;
        if (world.trainWarn <= 0) { world.trainActive = true; world.trainX = -420; }
      } else if (world.trainActive) {
        world.trainX += 1150 * dt;
        const band = 74;
        if (Math.abs(p.y - world.trainLane) < band && p.x > world.trainX - 60 && p.x < world.trainX + 480) {
          damagePlayer(world, 70, p.x, p.y);
        }
        for (const e of world.enemies) {
          if (!e.alive) continue;
          if (Math.abs(e.y - world.trainLane) < band && e.x > world.trainX - 60 && e.x < world.trainX + 480) {
            damageEnemy(world, e, 260, {});
          }
        }
        if (world.trainX > world.w + 460) {
          world.trainActive = false;
          world.trainCd = U.rand(world.rng, 26, 44);
        }
      }
    }
  }

  /* ================= 波次推进 ================= */

  function updateWaves(world, dt) {
    if (world.phase === "fight") {
      if (world.spawnQueue.length > 0) {
        world.spawnTimer -= dt;
        if (world.spawnTimer <= 0 && world.enemies.length < 170) {
          const batch = 2 + Math.floor(world.wave / 3);
          for (let i = 0; i < batch && world.spawnQueue.length > 0; i++) {
            const item = world.spawnQueue.shift();
            const sp = pickSpawn(world);
            spawnEnemy(world, item.type, item.elite, sp.x + U.rand(world.rng, -30, 30), sp.y + U.rand(world.rng, -30, 30));
          }
          world.spawnTimer = Math.max(0.22, (0.95 - world.wave * 0.045) / world.diff.spawnMul);
        }
      } else if (world.enemies.length === 0) {
        waveCleared(world);
      }
    } else if (world.phase === "intermission") {
      world.waveTimer -= dt;
      if (world.waveTimer <= 0) startWave(world, world.wave + 1);
    }
  }

  function waveCleared(world) {
    const bonus = Math.round((6 + world.wave) * world.diff.rewardMul * world.player.serumMul);
    world.serumEarned += bonus;
    if (world.wave === G.bossWave && !world.endless) {
      finishRun(world, true);
      return;
    }
    if (world.wave % 4 === 0) spawnSupply(world);
    if (world.wave % 3 === 0) ev(world, { type: "radio", kind: "waveClear", map: world.mapId, wave: world.wave });
    world.phase = "intermission";
    world.waveTimer = G.intermission;
    ev(world, { type: "waveclear", wave: world.wave, bonus });
    ev(world, { type: "banner", main: `第 ${world.wave} 波 清理完成`, sub: `休整 ${G.intermission} 秒 · 血清 +${bonus}`, dur: 3.2 });
    ev(world, { type: "autosave" });
    sfx(world, "waveClear");
  }

  function finishRun(world, win) {
    world.state = win ? "victory" : "gameover";
    const summary = makeSummary(world, win);
    ev(world, { type: win ? "victory" : "gameover", summary });
    ev(world, { type: "radio", kind: win ? "victory" : "defeat", map: world.mapId, wave: world.wave });
    sfx(world, win ? "victory" : "defeat");
  }

  function makeSummary(world, win) {
    let maxWl = 0;
    for (const wp of world.player.weapons) maxWl = Math.max(maxWl, wp.level);
    return {
      mapId: world.mapId, difficulty: world.diffId, wave: world.wave, kills: world.kills,
      timeSec: world.t, win: !!win, serum: world.serumEarned,
      shotsFired: world.shotsFired, shotsHit: world.shotsHit,
      maxWeaponLevel: maxWl,
      nohit3: world.nohit && world.wave >= 3,
      endlessWave: world.endless ? Math.max(0, world.wave - G.bossWave) : 0,
      curse: world.curseId,
      bestCombo: world.comboBest,
    };
  }

  function enterEndless(world) {
    world.endless = true;
    world.state = "playing";
    startWave(world, G.bossWave + 1);
    ev(world, { type: "banner", main: "无尽模式", sub: "尸潮不会结束", dur: 3 });
  }

  /* ================= 升级 ================= */

  function rollChoices(world) {
    const pool = [];
    for (const def of D.UPGRADES) {
      const lv = world.upgrades[def.id] || 0;
      if (lv >= def.max) continue;
      if (def.id === "w_new") {
        if (world.player.weapons.length >= 2) continue;
        if (!unownedWeapons(world).length) continue;
      }
      let w = 1;
      if (def.id === "w_new") w = 1.5;
      if (def.cat === "weapon") w *= 1.25;
      pool.push({ key: def.id, w, def });
    }
    for (const wp of world.player.weapons) {
      if (wp.level >= 5) continue;
      pool.push({ key: "wup:" + wp.id, w: 1.35, wp });
    }
    const picked = [];
    const used = {};
    const work = pool.slice();
    while (picked.length < 3 && work.length) {
      const item = U.weightedPick(world.rng, work);
      work.splice(work.indexOf(item), 1);
      if (used[item.key]) continue;
      used[item.key] = true;
      if (item.def) {
        const def = item.def;
        const lv = world.upgrades[def.id] || 0;
        picked.push({
          id: def.id, name: def.name, cat: def.cat, desc: def.desc, lv: lv + 1, max: def.max,
          apply: (w) => { w.upgrades[def.id] = (w.upgrades[def.id] || 0) + 1; def.apply(w.mods, w); applyMods(w); },
        });
      } else {
        const wp = item.wp;
        const wdef = D.WEAPONS[wp.id];
        const nextLv = wp.level + 1;
        const evo = D.EVOLUTIONS.find((x) => x.weapon === wp.id);
        const reqName = evo && D.upgradeById[evo.req] ? D.upgradeById[evo.req].name : "";
        const evoHint = evo && nextLv >= 5
          ? ((world.upgrades[evo.req] || 0) >= evo.reqLv
            ? "★ 满级即进化为「" + evo.name + "」"
            : "进化需 " + reqName + " Lv" + evo.reqLv)
          : "";
        picked.push({
          id: "wup:" + wp.id, name: wdef.name + " Lv." + nextLv, cat: "weapon",
          desc: ((nextLv >= 5 ? "解锁特性：" + wdef.perkName + "；" : "") + "伤害 / 射速 / 弹容提升") +
            (evoHint ? "｜" + evoHint : ""),
          lv: nextLv, max: 5,
          apply: (w) => {
            const target = w.player.weapons.find((x) => x.id === wp.id);
            if (!target) return;
            target.level = Math.min(5, target.level + 1);
            if (target.level >= 5 && wdef.perk) wdef.perk(target.bonus);
            applyMods(w);
          },
        });
      }
    }
    if (!picked.length) {
      picked.push({
        id: "fallback_heal", name: "应急缝合", cat: "tactic", desc: "立即回复 50% 生命", lv: 1, max: 9,
        apply: (w) => { w.player.hp = Math.min(w.player.maxHp, w.player.hp + w.player.maxHp * 0.5); },
      });
    }
    return picked;
  }

  function unownedWeapons(world) {
    const owned = {};
    for (const wp of world.player.weapons) owned[wp.id] = true;
    return D.WEAPON_ORDER.filter((id) => !owned[id]);
  }

  function giveRandomWeapon(world) {
    const cands = unownedWeapons(world);
    if (!cands.length) return null;
    const id = cands[Math.floor(world.rng() * cands.length)];
    const wp = makeWeapon(id, 1);
    world.player.weapons.push(wp);
    applyMods(world);
    wp.ammo = wp.magSize;
    ev(world, { type: "toast", text: "获得武器：" + D.WEAPONS[id].name, cls: "gold" });
    sfx(world, "buy");
    return id;
  }

  function choose(world, choiceId) {
    if (world.state !== "levelup" || !world.choices) return false;
    const choice = world.choices.find((c) => c.id === choiceId);
    if (!choice) return false;
    if (choice.id === "w_new") giveRandomWeapon(world);
    else choice.apply(world);
    checkEvolutions(world);
    world.choices = null;
    if (world.choicesSource === "level") world.pendingLevels -= 1;
    world.choicesSource = "level";
    if (world.pendingLevels > 0) {
      world.choices = rollChoices(world);
      ev(world, { type: "levelup", choices: world.choices, source: "level", rerolls: world.rerolls });
    } else {
      world.state = "playing";
    }
    return true;
  }

  /* 武器进化：满级武器 + 指定强化达标 → 自动进化 */
  function checkEvolutions(world) {
    for (const wp of world.player.weapons) {
      if (wp.evolved || wp.level < 5) continue;
      const evo = D.EVOLUTIONS.find((x) => x.weapon === wp.id);
      if (!evo) continue;
      if ((world.upgrades[evo.req] || 0) < evo.reqLv) continue;
      wp.evolved = true;
      evo.apply(wp.bonus);
      wp.evoName = evo.name;
      wp.evoColor = evo.color;
      applyMods(world);
      ev(world, { type: "banner", main: "武器进化 · " + evo.name, sub: D.WEAPONS[wp.id].name + "：" + evo.desc, dur: 3.6 });
      ev(world, { type: "toast", text: "武器进化：" + evo.name, cls: "gold" });
      ev(world, { type: "shake", mag: 6 });
      sfx(world, evo.sfx || "buy");
    }
  }

  function reroll(world) {
    if (world.state !== "levelup" || !world.choices) return false;
    if (world.rerolls <= 0) return false;
    world.rerolls -= 1;
    world.choices = rollChoices(world);
    ev(world, { type: "levelup", choices: world.choices, source: world.choicesSource, rerolls: world.rerolls });
    sfx(world, "click");
    return true;
  }

  function checkLevelUp(world) {
    if (world.state !== "playing") return;
    while (world.xp >= G.xpNeed(world.level) && world.state === "playing") {
      world.xp -= G.xpNeed(world.level);
      world.level += 1;
      world.pendingLevels += 1;
    }
    if (world.pendingLevels > 0 && world.state === "playing") {
      world.choicesSource = "level";
      world.choices = rollChoices(world);
      world.state = "levelup";
      ev(world, { type: "levelup", choices: world.choices, source: "level", rerolls: world.rerolls });
      sfx(world, "levelup");
    }
  }

  /* ================= 存档快照 ================= */

  function snapshotRun(world) {
    const p = world.player;
    return {
      mapId: world.mapId, difficultyId: world.diffId, seed: world.seed,
      wave: world.wave, t: world.t, kills: world.kills, serumEarned: world.serumEarned,
      xp: world.xp, level: world.level, nohit: world.nohit, endless: world.endless,
      curseId: world.curseId, rerolls: world.rerolls, comboBest: world.comboBest,
      upgrades: Object.assign({}, world.upgrades),
      weapons: p.weapons.map((wp) => ({ id: wp.id, level: wp.level, bonus: Object.assign({}, wp.bonus), ammo: wp.ammo })),
      weaponIdx: p.weaponIdx, grenades: p.grenades, medkits: p.medkits,
      hp: Math.max(1, Math.round(p.hp)), reviveLeft: p.reviveLeft,
      savedAt: Date.now(),
    };
  }

  function restoreSnapshot(world, r) {
    const p = world.player;
    world.t = r.t || 0;
    world.kills = r.kills || 0;
    world.serumEarned = r.serumEarned || 0;
    world.xp = r.xp || 0;
    world.level = r.level || 1;
    world.nohit = r.nohit !== false;
    world.endless = !!r.endless;
    world.rerolls = r.rerolls === undefined ? world.rerolls : r.rerolls;
    world.comboBest = r.comboBest || 0;
    p.weapons = (r.weapons || []).map((w) => makeWeapon(w.id, w.level, w.bonus));
    if (!p.weapons.length) p.weapons = [makeWeapon(D.START_WEAPON, 1)];
    p.weaponIdx = Math.min(r.weaponIdx || 0, p.weapons.length - 1);
    p.grenades = r.grenades || 0;
    p.medkits = r.medkits || 0;
    p.reviveLeft = r.reviveLeft || 0;
    applyMods(world);
    (r.weapons || []).forEach((w, i) => {
      if (p.weapons[i]) p.weapons[i].ammo = Math.min(p.weapons[i].magSize, w.ammo === undefined ? p.weapons[i].magSize : w.ammo);
    });
    p.hp = U.clamp(r.hp === undefined ? p.maxHp : r.hp, 1, p.maxHp);
    const burn = Math.min(4000, (r.wave || 1) * 97);
    for (let i = 0; i < burn; i++) world.rng();
  }

  /* ================= 主更新 ================= */

  function update(world, dt, input) {
    const out = world.events;
    out.length = 0;
    if (world.pendingEvents.length) {
      for (let i = 0; i < world.pendingEvents.length; i++) out.push(world.pendingEvents[i]);
      world.pendingEvents.length = 0;
    }
    if (world.state !== "playing") return out;
    world.inStep = true;
    world.t += dt;
    if (world.comboT > 0) {
      world.comboT -= dt;
      if (world.comboT <= 0) world.combo = 0;
    }
    world.hash.clear();
    for (const e of world.enemies) if (e.alive) world.hash.insert(e.x, e.y, e);
    updatePlayer(world, dt, input);
    updateNav(world, dt);
    updateEnemies(world, dt);
    world.hash.clear();
    for (const e of world.enemies) if (e.alive) world.hash.insert(e.x, e.y, e);
    updateBullets(world, dt);
    updateEBullets(world, dt);
    updateTurrets(world, dt);
    updatePickups(world, dt);
    updateHazards(world, dt);
    updatePools(world, dt);
    updateDestructibles(world, dt);
    updateParticles(world, dt);
    updateFloaters(world, dt);
    updateWaves(world, dt);
    checkLevelUp(world);
    world.inStep = false;
    return out;
  }

  window.ZTS.Sim = {
    create, update, choose, rollChoices, giveRandomWeapon, unownedWeapons,
    makeSummary, snapshotRun, enterEndless, weaponStats,
    reroll, checkEvolutions,
    devFinish: (world, win) => finishRun(world, !!win),
  };
})();
