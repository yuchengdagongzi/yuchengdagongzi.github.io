/* 引导层：主循环、输入映射、事件分发、调试钩子。 */
window.ZTS = window.ZTS || {};
(function () {
  const U = window.ZTS.util, D = window.ZTS.data, Sim = window.ZTS.Sim,
    Save = window.ZTS.Save, Audio = window.ZTS.Audio, Render = window.ZTS.Render, UI = window.ZTS.UI;
  const canvas = document.getElementById("game");
  const minimap = document.getElementById("minimap");
  const params = new URLSearchParams(location.search);

  let world = null, running = false, paused = false, lastRun = null;
  let acc = 0, lastT = performance.now(), autosaveT = 0, fpsAcc = 0, fpsN = 0, fpsShown = 0;
  const keys = {};
  const mouse = { x: 0, y: 0, down: false };
  let prevFiring = false, pressFire = false, debugOn = false;
  const oneShot = { reload: false, dash: false, grenade: false, medkit: false, swap: false };
  const touch = { moveId: null, aimId: null, moveX: 0, moveY: 0, aimDX: 0, aimDY: 1, aimActive: false, firing: false };
  const dust = [];
  for (let i = 0; i < 70; i++) {
    dust.push({
      x: Math.random(), y: Math.random(),
      vx: (Math.random() - 0.5) * 0.012, vy: -0.004 - Math.random() * 0.01,
      s: 1 + Math.random() * 2.4, a: 0.05 + Math.random() * 0.12,
    });
  }

  /* ---------------- 启动 ---------------- */

  function boot() {
    Save.load();
    const st = Save.settings();
    Audio.setSettings({ master: st.master, sfx: st.sfx, music: st.music });
    Render.init(canvas, minimap);
    Render.showDmg = st.dmgNumbers;
    document.body.classList.toggle("reduced-motion", !!st.reducedMotion);

    UI.init({
      onStartRun: (o) => startRun(o.mapId, o.diffId, null, { curseId: o.curseId }),
      onContinue: () => { const r = Save.run; if (r) startRun(r.mapId, r.difficultyId, r); },
      onResume: () => setPaused(false),
      onSaveQuit: () => { saveRun(); setPaused(false); quitToMenu(); UI.toast("已保存并退出", "good"); },
      onGiveUp: () => { Save.clearRun(); setPaused(false); quitToMenu(); UI.toast("本局已放弃", "warn"); },
      onRetry: () => { if (lastRun) startRun(lastRun.mapId, lastRun.diffId, null, { curseId: lastRun.curseId }); },
      onMenu: () => quitToMenu(),
      onEndless: () => { enterEndless(); },
      onBuyMeta: (id) => {
        const res = Save.buyMeta(id);
        if (res.ok) { Audio.sfx("buy"); UI.refreshMeta(); UI.refreshMenu(); }
        else { Audio.sfx("deny"); UI.toast(res.reason === "poor" ? "血清不足" : "已满级", "warn"); }
      },
      onPickUpgrade: (id) => {
        if (!world) return;
        const ok = Sim.choose(world, id);
        if (!ok) return;
        /* 连续升级时，下一组三选一会以事件形式在下一帧送达（update 不再清空未处理事件） */
        if (world.state === "levelup") return;
        UI.showScreen(null);
        UI.setHudVisible(true);
      },
      onReroll: () => {
        if (!world) return;
        Sim.reroll(world); /* 新的三选一会以事件形式在下一帧送达 UI */
      },
      onSettingsChange: (patch) => {
        const st2 = Save.settings();
        Audio.setSettings({ master: st2.master, sfx: st2.sfx, music: st2.music });
        if (patch.dmgNumbers !== undefined) Render.showDmg = patch.dmgNumbers;
        if (patch.reducedMotion !== undefined) document.body.classList.toggle("reduced-motion", !!patch.reducedMotion);
        if (patch.perfMode !== undefined) applyQuality();
      },
      onReset: () => { UI.refreshMenu(); },
    });
    UI.refreshMenu();
    UI.setHudVisible(false);
    UI.setTouchMode(("ontouchstart" in window) || (navigator.maxTouchPoints || 0) > 0);
    bindInput();
    setupTouch();
    applyQuality();
    const bootName = params.get("name");
    if (bootName) Save.setHeroName(bootName);
    UI.refreshMenu();
    if (!Save.heroName()) {
      /* 首次进入：先登记代号（剧情设定：名字贯穿电台/日志/结局） */
      UI.showScreen("name");
      const input = document.getElementById("heroNameInput");
      if (input) { input.value = ""; if (input.focus) input.focus(); }
    } else {
      UI.showScreen("menu");
    }

    if (Save.memoryOnly) setTimeout(() => UI.toast("浏览器存储不可用：本局无法保存进度", "warn"), 600);

    if (params.get("play") === "1") {
      startRun(params.get("map") || "hospital", params.get("diff") || "veteran", null, {
        seed: params.get("seed") ? Number(params.get("seed")) : undefined,
        wave: params.get("wave") ? Number(params.get("wave")) : 1,
        god: params.get("god") === "1",
        curseId: params.get("curse") || "none",
      });
      if (params.get("mute") === "1") { Audio.setSettings({ master: 0, sfx: 0, music: 0 }); }
    }
    window.__ZTS_READY = true;
    requestAnimationFrame(frame);
  }

  /* ---------------- 运行控制 ---------------- */

  function startRun(mapId, diffId, resume, opts2) {
    const curseId = (opts2 && opts2.curseId) || (resume && resume.curseId) || "none";
    try {
      world = Sim.create({
        mapId, difficultyId: diffId,
        seed: (opts2 && opts2.seed) || (resume ? resume.seed : undefined),
        profile: Save.profile,
        resume: resume || null,
        curseId,
      });
    } catch (e) {
      UI.toast("开局失败：" + e.message, "warn");
      console.error(e);
      return;
    }
    lastRun = { mapId, diffId, curseId };
    if (opts2 && opts2.god) world.god = true;
    world.lowFi = qualityMode() === "low";
    if (opts2 && opts2.wave && opts2.wave > 1) devSetWave(opts2.wave);
    Render.setWorld(world);
    UI.setHudVisible(true);
    UI.showScreen(null);
    running = true; paused = false; acc = 0; autosaveT = 0;
    Audio.resume(); Audio.startMusic();
    Save.clearRun();
    Save.setRun(Sim.snapshotRun(world));
  }

  function enterEndless() {
    if (!world) return;
    Sim.enterEndless(world);
    running = true; paused = false;
    UI.showScreen(null);
    UI.setHudVisible(true);
    Audio.startMusic();
  }

  function quitToMenu() {
    running = false; paused = false;
    Audio.stopMusic();
    UI.setHudVisible(false);
    UI.refreshMenu();
    UI.showScreen("menu");
  }

  function setPaused(v) {
    if (!running) return;
    paused = !!v;
    if (paused) { saveRun(); UI.showScreen("pause"); }
    else { UI.showScreen(null); UI.setHudVisible(true); mouse.down = false; }
  }

  function saveRun() {
    if (!world) return;
    if (world.state === "playing" || world.state === "levelup") {
      Save.setRun(Sim.snapshotRun(world));
    }
  }

  function finishRun(summary, win) {
    running = false;
    Audio.stopMusic();
    Save.clearRun();
    const rewards = Save.recordRun(summary);
    UI.setHudVisible(false);
    UI.showResult(summary, rewards, win);
    UI.refreshMenu();
    if (rewards.newAchievements.length) {
      setTimeout(() => UI.toast("成就达成：" + rewards.newAchievements.map((a) => a.name).join("、"), "gold"), 500);
    }
  }

  /* ---------------- 输入 ---------------- */

  function bindInput() {
    window.addEventListener("keydown", (e) => {
      const k = (e.key || "").toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].indexOf(k) >= 0) e.preventDefault();
      keys[k] = true;
      if (e.repeat) return;
      Audio.resume();
      if (k === "f3") {
        debugOn = !debugOn;
        document.getElementById("fpsDebug").classList.toggle("hidden", !debugOn);
        return;
      }
      if (k === "escape") {
        if (UI.screen === "settings" || UI.screen === "meta" || UI.screen === "stats" || UI.screen === "help") { UI.back(); return; }
        if (!running) return;
        setPaused(!paused);
        return;
      }
      if (UI.screen === "levelup") {
        if (k === "1" || k === "2" || k === "3") UI.pickKey(Number(k));
        else if (k === "f") UI.handlers.onReroll();
        return;
      }
      if (!running || paused) return;
      if (k === "r") oneShot.reload = true;
      else if (k === " ") oneShot.dash = true;
      else if (k === "g") oneShot.grenade = true;
      else if (k === "h") oneShot.medkit = true;
      else if (k === "q") oneShot.swap = true;
    });
    window.addEventListener("keyup", (e) => { keys[(e.key || "").toLowerCase()] = false; });
    window.addEventListener("blur", () => {
      mouse.down = false;
      for (const k of Object.keys(keys)) keys[k] = false;
      if (running && !paused && UI.screen === null) setPaused(true);
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        saveRun();
        if (running && !paused && UI.screen === null) setPaused(true);
      }
    });
    window.addEventListener("pagehide", () => saveRun());

    canvas.addEventListener("mousemove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
    canvas.addEventListener("mousedown", (e) => {
      if (e.button === 0) { mouse.down = true; pressFire = true; Audio.resume(); }
    });
    window.addEventListener("mouseup", (e) => { if (e.button === 0) mouse.down = false; });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("wheel", (e) => {
      if (running && !paused && UI.screen === null) { oneShot.swap = true; e.preventDefault(); }
    }, { passive: false });
  }

  function setupTouch() {
    const stickL = document.getElementById("stickL");
    const stickR = document.getElementById("stickR");
    const zoneL = document.getElementById("touchLeft");
    const zoneR = document.getElementById("touchRight");
    const STICK = 150, MAXR = 56;
    const setKnob = (stick, dx, dy) => {
      const knob = stick.querySelector(".knob");
      if (knob) knob.style.transform = "translate(" + dx + "px, " + dy + "px)";
    };
    /* 浮动摇杆：手指按在左/右半屏的任意位置，摇杆就在那里出现 */
    const bindZone = (zone, stick, which) => {
      if (!zone || !stick) return;
      let originX = 0, originY = 0;
      const place = (x, y) => {
        originX = x; originY = y;
        stick.style.left = Math.round(x - STICK / 2) + "px";
        stick.style.top = Math.round(y - STICK / 2) + "px";
      };
      const apply = (x, y) => {
        let dx = x - originX, dy = y - originY;
        const l = Math.hypot(dx, dy);
        if (l > MAXR) { dx = (dx / l) * MAXR; dy = (dy / l) * MAXR; }
        setKnob(stick, dx, dy);
        if (which === "move") { touch.moveX = dx / MAXR; touch.moveY = dy / MAXR; }
        else {
          const nl = Math.hypot(dx, dy);
          if (nl > 8) { touch.aimDX = dx / nl; touch.aimDY = dy / nl; }
          touch.firing = true; /* 轻点 = 朝当前方向持续射击 */
        }
      };
      zone.addEventListener("pointerdown", (e) => {
        /* 触屏笔记本：鼠标点击交给桌面流程，只有真正的手指触摸才走虚拟摇杆 */
        if (e.pointerType && e.pointerType !== "touch" && e.pointerType !== "pen") return;
        e.preventDefault();
        try { zone.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
        Audio.resume();
        if (which === "move") touch.moveId = e.pointerId;
        else { touch.aimId = e.pointerId; touch.aimActive = true; }
        place(e.clientX, e.clientY);
        stick.classList.add("active");
        apply(e.clientX, e.clientY);
      });
      zone.addEventListener("pointermove", (e) => {
        if (which === "move" ? touch.moveId !== e.pointerId : touch.aimId !== e.pointerId) return;
        apply(e.clientX, e.clientY);
      });
      const end = (e) => {
        if (which === "move" ? touch.moveId !== e.pointerId : touch.aimId !== e.pointerId) return;
        stick.classList.remove("active");
        setKnob(stick, 0, 0);
        if (which === "move") { touch.moveId = null; touch.moveX = 0; touch.moveY = 0; }
        else { touch.aimId = null; touch.aimActive = false; touch.firing = false; }
      };
      zone.addEventListener("pointerup", end);
      zone.addEventListener("pointercancel", end);
      zone.addEventListener("lostpointercapture", end);
    };
    bindZone(zoneL, stickL, "move");
    bindZone(zoneR, stickR, "aim");
    const touchBtns = Array.prototype.slice.call(document.querySelectorAll("#touchButtons .tbtn"))
      .concat(Array.prototype.slice.call(document.querySelectorAll("#touchTop .tbtn")));
    touchBtns.forEach((b) => {
      const act = b.dataset.act;
      b.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        Audio.resume();
        if (act === "pause") { setPaused(!paused); return; }
        if (act === "fullscreen") { toggleFullscreen(); return; }
        if (!running || paused || UI.screen !== null) return;
        if (act === "reload") oneShot.reload = true;
        else if (act === "dash") oneShot.dash = true;
        else if (act === "grenade") oneShot.grenade = true;
        else if (act === "medkit") oneShot.medkit = true;
        else if (act === "swap") oneShot.swap = true;
      });
    });
  }

  /* 全屏 + 横屏锁定（手机上体验最佳；不支持的浏览器静默跳过） */
  function toggleFullscreen() {
    try {
      const app = document.getElementById("app") || document.documentElement;
      if (!document.fullscreenElement) {
        const req = app.requestFullscreen || app.webkitRequestFullscreen;
        if (!req) return;
        const p = req.call(app);
        if (p && p.then) {
          p.then(() => {
            if (typeof screen !== "undefined" && screen.orientation && screen.orientation.lock) {
              screen.orientation.lock("landscape").catch(() => {});
            }
          }).catch(() => {});
        }
      } else if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    } catch (e) { /* 忽略 */ }
  }

  /* 画质档：触屏设备默认省电（降低渲染倍率与粒子上限） */
  function qualityMode() {
    const st = Save.settings();
    const m = st.perfMode || "auto";
    return m === "auto" ? (UI.touchMode ? "low" : "high") : m;
  }
  function applyQuality() {
    const q = qualityMode();
    Render.setQuality(q);
    if (world) world.lowFi = (q === "low");
  }

  function buildInput() {
    const st = Save.settings();
    let mx = 0, my = 0;
    if (keys["w"] || keys["arrowup"]) my -= 1;
    if (keys["s"] || keys["arrowdown"]) my += 1;
    if (keys["a"] || keys["arrowleft"]) mx -= 1;
    if (keys["d"] || keys["arrowright"]) mx += 1;
    if (touch.moveId !== null) { mx = touch.moveX; my = touch.moveY; }
    const p = world.player;
    let aimX, aimY;
    if (touch.aimActive) {
      aimX = p.x + touch.aimDX * 420;
      aimY = p.y + touch.aimDY * 420;
    } else {
      const w = Render.screenToWorld(mouse.x, mouse.y);
      aimX = w.x; aimY = w.y;
    }
    const firing = mouse.down || touch.firing || !!st.autoFire;
    const fireEdge = (firing && !prevFiring) || pressFire;
    prevFiring = firing;
    pressFire = false;
    const input = {
      mx, my, aimX, aimY, firing, fireEdge, autoFire: !!st.autoFire,
      reload: oneShot.reload, dash: oneShot.dash, grenade: oneShot.grenade,
      medkit: oneShot.medkit, swap: oneShot.swap,
    };
    oneShot.reload = false; oneShot.dash = false; oneShot.grenade = false;
    oneShot.medkit = false; oneShot.swap = false;
    return input;
  }

  /* ---------------- 事件分发 ---------------- */

  function handleEvents(events) {
    const p = world.player;
    for (const e of events) {
      if (e.type === "sfx") {
        if (e.x === undefined) { Audio.sfx(e.name); continue; }
        const d = U.dist(e.x, e.y, p.x, p.y);
        const vol = U.clamp(1 - d / 1000, 0.12, 1);
        Audio.sfx(e.name, { vol, pan: U.clamp((e.x - p.x) / 720, -1, 1) });
      } else if (e.type === "shake") {
        if (Save.settings().shake) Render.shake(e.mag);
      } else if (e.type === "toast") {
        UI.toast(e.text, e.cls, e.brief);
      } else if (e.type === "banner") {
        UI.banner(e.main, e.sub, e.dur);
      } else if (e.type === "levelup") {
        UI.showLevelUp(e.choices, world.level, (id) => UI.handlers.onPickUpgrade(id),
          { source: e.source, rerolls: e.rerolls });
      } else if (e.type === "autosave") {
        saveRun();
      } else if (e.type === "radio") {
        UI.radio(e.kind, { map: e.map, wave: e.wave });
      } else if (e.type === "intel") {
        const pool = D.STORY.intel.filter((it) => it.map === e.map && !Save.hasIntel(it.id));
        if (pool.length) {
          const pick = pool[Math.floor(Math.random() * pool.length)];
          Save.addIntel(pick.id);
          UI.toast("情报日志解锁：" + pick.title + "（档案室查看）", "gold");
        } else {
          UI.toast("重复情报 · 已归档", "good", true);
        }
      } else if (e.type === "victory") {
        finishRun(e.summary, true);
      } else if (e.type === "gameover") {
        finishRun(e.summary, false);
      }
    }
  }

  /* ---------------- 主循环 ---------------- */

  function step(dt) {
    if (!world) return;
    const input = buildInput();
    const events = Sim.update(world, dt, input);
    handleEvents(events);
    Audio.setIntensity(U.clamp((world.wave - 1) / 14 + (1 - world.player.hp / world.player.maxHp) * 0.3, 0, 1));
  }

  function frame(now) {
    const rawDt = Math.min(0.25, (now - lastT) / 1000);
    lastT = now;
    fpsAcc += rawDt; fpsN++;
    if (fpsAcc >= 0.5) { fpsShown = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }

    if (running && world && !paused) {
      acc += rawDt;
      let steps = 0;
      while (acc >= 1 / 60 && steps < 5) {
        step(1 / 60);
        acc -= 1 / 60;
        steps++;
        if (!running || (world && world.state !== "playing")) break;
      }
      if (acc > 1 / 60) acc = 0;
      autosaveT += rawDt;
      if (autosaveT > 15) { autosaveT = 0; saveRun(); }
      Render.draw(world, rawDt);
      UI.updateHud(world);
      const hpK = world.player.hp / Math.max(1, world.player.maxHp);
      if (world.player.alive && hpK < 0.3) {
        if (Math.floor(world.t * 1.1) !== Math.floor((world.t - rawDt) * 1.1)) Audio.sfx("heartbeat");
      }
    } else if (world && world.state !== "playing" && running === false) {
      Render.draw(world, rawDt);
    } else {
      drawMenuBg(rawDt);
    }
    if (debugOn) {
      const p = world ? world.player : null;
      UI.debug(
        "fps " + fpsShown + "\n" +
        (world
          ? ("state " + world.state + " wave " + world.wave + " t " + world.t.toFixed(1) + "\n" +
             "enemies " + world.enemies.length + " bullets " + world.bullets.length + " fx " + world.particles.length + "\n" +
             "decals " + world.decals.length + " pickups " + world.pickups.length + "\n" +
             "hp " + (p ? p.hp.toFixed(0) : "-") + " xp " + world.xp + "/" + D.GAME.xpNeed(world.level) + " lv " + world.level)
          : "menu")
      );
    }
    requestAnimationFrame(frame);
  }

  function drawMenuBg(dt) {
    const ctx = Render.ctx, v = Render.view;
    window.ZTS.art.menuBackdrop(ctx, v.w, v.h, performance.now() / 1000);
  }

  /* ---------------- 调试钩子（自动化测试用） ---------------- */

  function devSetWave(n) {
    if (!world) return;
    world.wave = Math.max(1, Math.floor(n) - 1);
    world.phase = "intermission";
    world.waveTimer = 0.02;
    world.spawnQueue.length = 0;
    world.enemies.length = 0;
    world.boss = null;
  }

  window.ZTS.dev = {
    start: (mapId, diffId, opts2) => startRun(mapId || "hospital", diffId || "veteran", null, opts2 || {}),
    state: () => (world ? world.state : "menu"),
    world: () => world,
    hud: () => {
      if (!world) return null;
      return {
        state: world.state, wave: world.wave, phase: world.phase,
        hp: Math.round(world.player.hp), maxHp: Math.round(world.player.maxHp),
        px: Math.round(world.player.x), py: Math.round(world.player.y),
        shots: world.shotsFired,
        level: world.level, xp: world.xp, kills: world.kills, enemies: world.enemies.length,
        bullets: world.bullets.length, particles: world.particles.length, decals: world.decals.length,
        pickups: world.pickups.length, serum: Math.floor(world.serumEarned),
        boss: world.boss ? world.boss.def.name : null,
        weapons: world.player.weapons.map((w) => w.id + ":" + w.level),
        choiceCount: world.choices ? world.choices.length : 0,
      };
    },
    setWave: (n) => devSetWave(n),
    god: (v) => { if (world) world.god = v !== false; },
    heal: () => { if (world) world.player.hp = world.player.maxHp; },
    xp: (n) => { if (world) world.xp += n || 50; },
    win: () => { if (world) Sim.devFinish(world, true); },
    lose: () => { if (world) Sim.devFinish(world, false); },
    pick: (i) => { if (world && world.choices && world.choices[i]) UI.handlers.onPickUpgrade(world.choices[i].id); },
    pause: (v) => setPaused(v !== false),
    save: () => saveRun(),
    settings: () => Save.settings(),
    name: (n) => { Save.setHeroName(n || D.STORY.protagonist.defaultName); UI.refreshMenu(); return Save.heroName(); },
    intel: (n) => {
      for (const it of D.STORY.intel.slice(0, n === undefined ? D.STORY.intel.length : n)) Save.addIntel(it.id);
      UI.refreshArchive();
      return Save.intelCount();
    },
    radio: (kind, map) => UI.radio(kind, { map: map || (world ? world.mapId : "hospital"), wave: world ? world.wave : 1 }),
    archive: () => { UI.refreshArchive(); return { intel: Save.intelCount(), endings: Save.endingCount(), chars: D.STORY.characters.filter((c) => UI.charUnlocked(c)).length }; },
  };

  boot();
})();
