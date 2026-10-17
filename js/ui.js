/* 界面层：DOM HUD、菜单、升级三选一、结算、商店、设置。 */
window.ZTS = window.ZTS || {};
(function () {
  const U = window.ZTS.util, D = window.ZTS.data, Save = window.ZTS.Save;
  const $ = (id) => document.getElementById(id);
  const UI = { screen: "menu", handlers: {}, backStack: [], touchMode: false, mapSel: null };
  const el = {};
  const ids = ["hud", "hpFill", "hpText", "armorChip", "regenChip", "reviveChip", "waveText", "enemyLeft", "radioBox",
    "comboBox", "comboText", "comboFill",
    "bossBox", "bossName", "bossFill", "bannerBox", "bannerMain", "bannerSub", "timeText", "killText", "serumText",
    "weaponSlots", "consumables", "toasts", "vignette", "lowHpPulse", "touch", "fpsDebug",
    "screen-levelup", "levelupLevel", "levelupTitle", "levelupSub", "btnReroll", "upgradeCards",
    "screen-menu", "btnContinue", "btnNew", "btnMeta",
    "screen-name", "heroNameInput", "btnConfirmName", "menuHero", "btnArchive",
    "screen-archive", "archiveProgress", "archiveChars", "archiveIntel", "archiveEndings",
    "btnStats", "btnSettings", "btnHelp", "menuSerum", "menuRecord", "menuVersion",
    "screen-maps", "mapCards", "mapDetail", "diffButtons", "curseButtons", "curseHint", "btnStartRun", "mapUnlockHint",
    "screen-pause", "btnResume", "btnPauseSaveQuit", "btnPauseSettings", "btnGiveUp",
    "screen-result", "resultTitle", "resultSub", "resultStats", "resultUnlocks", "resultEpilogue", "btnEndless", "btnRetry",
    "btnResultMenu", "btnResultMeta",
    "screen-meta", "metaSerum", "metaList",
    "screen-stats", "statsTotals", "achievements", "historyTable", "btnExport", "btnImport", "importFile", "btnReset",
    "screen-settings", "settingsForm", "screen-help",
    "stickL", "stickR", "touchButtons"];
  const SCREENS = {
    name: "screen-name", menu: "screen-menu", maps: "screen-maps", levelup: "screen-levelup", pause: "screen-pause",
    result: "screen-result", meta: "screen-meta", stats: "screen-stats", settings: "screen-settings", help: "screen-help",
    archive: "screen-archive",
  };
  let lastHud = {};
  let bannerT = null;

  function setText(node, v) {
    if (node && node.textContent !== v) node.textContent = v;
  }
  function btn(node, fn) { if (node) node.addEventListener("click", (e) => { e.preventDefault(); fn(e); }); }

  UI.init = function (handlers) {
    UI.handlers = handlers || {};
    for (const id of ids) el[id] = $(id);
    setText(el.menuVersion, "v" + D.GAME.version);

    btn(el.btnNew, () => { UI.refreshMaps(); UI.showScreen("maps"); });
    btn(el.btnContinue, () => { if (UI.handlers.onContinue) UI.handlers.onContinue(); });
    btn(el.btnMeta, () => { UI.refreshMeta(); UI.backStack.push("menu"); UI.showScreen("meta"); });
    btn(el.btnStats, () => { UI.refreshStats(); UI.backStack.push("menu"); UI.showScreen("stats"); });
    btn(el.btnSettings, () => { UI.refreshSettings(); UI.backStack.push("menu"); UI.showScreen("settings"); });
    btn(el.btnHelp, () => { UI.backStack.push("menu"); UI.showScreen("help"); });
    btn(el.btnArchive, () => { UI.refreshArchive(); UI.backStack.push("menu"); UI.showScreen("archive"); });
    btn(el.btnConfirmName, () => {
      const raw = el.heroNameInput ? el.heroNameInput.value : "";
      const clean = Save.setHeroName(raw);
      if (!clean) Save.setHeroName(D.STORY.protagonist.defaultName);
      UI.refreshMenu();
      UI.showScreen("menu");
    });
    if (el.heroNameInput) {
      el.heroNameInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") el.btnConfirmName.click();
      });
    }
    document.querySelectorAll("[data-back]").forEach((n) => {
      n.addEventListener("click", (e) => { e.preventDefault(); UI.back(); });
    });
    btn(el.btnStartRun, () => {
      if (!UI.mapSel || !UI.mapSel.mapId) return;
      if (UI.handlers.onStartRun) {
        UI.handlers.onStartRun({
          mapId: UI.mapSel.mapId, diffId: UI.mapSel.diffId, curseId: UI.mapSel.curseId || "none",
        });
      }
    });
    btn(el.btnReroll, () => { if (UI.handlers.onReroll) UI.handlers.onReroll(); });
    btn(el.btnResume, () => { if (UI.handlers.onResume) UI.handlers.onResume(); });
    btn(el.btnPauseSaveQuit, () => { if (UI.handlers.onSaveQuit) UI.handlers.onSaveQuit(); });
    btn(el.btnPauseSettings, () => { UI.refreshSettings(); UI.backStack.push("pause"); UI.showScreen("settings"); });
    btn(el.btnGiveUp, () => { confirmTwice(el.btnGiveUp, "放弃本局", () => { if (UI.handlers.onGiveUp) UI.handlers.onGiveUp(); }); });
    btn(el.btnRetry, () => { if (UI.handlers.onRetry) UI.handlers.onRetry(); });
    btn(el.btnResultMenu, () => { if (UI.handlers.onMenu) UI.handlers.onMenu(); });
    btn(el.btnResultMeta, () => { UI.refreshMeta(); UI.backStack.push("result"); UI.showScreen("meta"); });
    btn(el.btnEndless, () => { if (UI.handlers.onEndless) UI.handlers.onEndless(); });

    btn(el.btnExport, () => {
      try {
        const blob = new Blob([Save.exportJson()], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "zombie-tide-survivors-save.json";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        UI.toast("存档已导出", "good");
      } catch (e) { UI.toast("导出失败：" + e.message, "warn"); }
    });
    btn(el.btnImport, () => { if (el.importFile) el.importFile.click(); });
    if (el.importFile) {
      el.importFile.addEventListener("change", () => {
        const file = el.importFile.files && el.importFile.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            Save.importJson(String(reader.result));
            UI.refreshMenu(); UI.refreshStats(); UI.refreshMeta();
            UI.toast("存档已导入", "good");
          } catch (e) { UI.toast("导入失败：" + e.message, "warn"); }
        };
        reader.readAsText(file);
        el.importFile.value = "";
      });
    }
    btn(el.btnReset, () => {
      confirmTwice(el.btnReset, "重置所有存档", () => {
        Save.resetAll();
        UI.refreshMenu(); UI.refreshStats(); UI.refreshMeta();
        UI.toast("存档已重置", "warn");
        if (UI.handlers.onReset) UI.handlers.onReset();
      });
    });

    buildSettings();
  };

  function confirmTwice(node, label, fn) {
    if (node.dataset.armed === "1") {
      node.dataset.armed = "";
      node.textContent = label;
      fn();
      return;
    }
    node.dataset.armed = "1";
    node.textContent = "再次点击确认？";
    setTimeout(() => {
      if (node.dataset.armed === "1") { node.dataset.armed = ""; node.textContent = label; }
    }, 3200);
  }

  /* ---------- 屏幕 ---------- */

  UI.showScreen = function (name) {
    for (const k of Object.keys(SCREENS)) {
      const node = el[SCREENS[k]];
      if (!node) continue;
      if (k === name) node.classList.remove("hidden");
      else node.classList.add("hidden");
    }
    UI.screen = name || null;
  };
  UI.back = function () {
    const prev = UI.backStack.pop() || "menu";
    UI.showScreen(prev);
    if (prev === "menu") UI.refreshMenu();
  };
  UI.setHudVisible = function (v) {
    if (el.hud) el.hud.classList.toggle("hidden", !v);
    if (el.touch) el.touch.classList.toggle("hidden", !v || !UI.touchMode);
  };
  UI.setTouchMode = function (v) {
    UI.touchMode = !!v;
    document.body.classList.toggle("touch-mode", !!v);
  };

  /* ---------- 主菜单 ---------- */

  UI.refreshMenu = function () {
    const p = Save.profile;
    setText(el.menuHero, "清道队员 · " + (Save.heroName() || D.STORY.protagonist.defaultName));
    setText(el.menuSerum, "血清 " + U.fmtNum(p.serum));
    const st = p.stats;
    setText(el.menuRecord, st.wins > 0 ? `通关 ${st.wins} · 最佳第 ${st.bestWave} 波` : `击杀 ${U.fmtNum(st.totalKills)} · 最佳第 ${st.bestWave} 波`);
    const run = Save.run;
    if (run && el.btnContinue) {
      const map = D.mapById[run.mapId] || {};
      const diff = D.diffById[run.difficultyId] || {};
      el.btnContinue.classList.remove("hidden");
      el.btnContinue.textContent = `继续游戏 · ${map.name || ""} · 第 ${run.wave} 波（${diff.name || ""}）`;
    } else if (el.btnContinue) {
      el.btnContinue.classList.add("hidden");
    }
  };

  /* ---------- 地图选择 ---------- */

  UI.refreshMaps = function () {
    const p = Save.profile;
    if (!UI.mapSel) {
      const firstUnlocked = D.MAPS.find((m) => D.isMapUnlocked(p, m.id)) || D.MAPS[0];
      UI.mapSel = { mapId: firstUnlocked.id, diffId: "veteran", curseId: "none" };
    }
    const wrap = el.mapCards;
    wrap.innerHTML = "";
    for (const m of D.MAPS) {
      const unlocked = D.isMapUnlocked(p, m.id);
      const card = document.createElement("div");
      card.className = "map-card" + (m.id === UI.mapSel.mapId ? " selected" : "") + (unlocked ? "" : " locked");
      card.innerHTML =
        `<div class="mc-swatch" style="background:${m.theme.accent}"></div>` +
        `<div class="mc-num">地图 ${m.num} / ${D.MAPS.length}</div>` +
        `<div class="mc-name">${m.name}</div>` +
        `<div class="mc-mech">机制：${m.special.name}</div>` +
        (unlocked ? "" : `<div class="mc-lock">通关「${(D.mapById[m.unlock.map] || {}).name}」后解锁</div>`);
      if (unlocked) {
        card.addEventListener("click", () => { UI.mapSel.mapId = m.id; UI.refreshMaps(); });
      }
      wrap.appendChild(card);
    }
    const m = D.mapById[UI.mapSel.mapId] || D.MAPS[0];
    const boss = D.BOSSES[m.boss] || {};
    const poolNames = Object.keys(m.pool).map((k) => (D.ENEMIES[k] || {}).name).filter(Boolean).join(" · ");
    el.mapDetail.innerHTML =
      `<div class="md-title">${m.name}</div>` +
      `<div class="md-desc">${m.desc}</div>` +
      `<div class="md-mech">◆ ${m.special.name}：${m.special.desc}</div>` +
      `<div class="md-desc">敌人：${poolNames} ｜ Boss：${boss.name || "?"}</div>`;
    const seg = el.diffButtons;
    seg.innerHTML = "";
    for (const dfc of D.DIFFICULTIES) {
      const unlocked = D.isDiffUnlocked(p, dfc.id);
      const b = document.createElement("button");
      b.className = "seg-btn" + (dfc.id === UI.mapSel.diffId ? " active" : "");
      b.textContent = dfc.name;
      b.disabled = !unlocked;
      b.title = unlocked ? dfc.desc : "通关「生化研究所」后解锁";
      if (unlocked) b.addEventListener("click", () => { UI.mapSel.diffId = dfc.id; UI.refreshMaps(); });
      seg.appendChild(b);
    }
    const dfc2 = D.diffById[UI.mapSel.diffId];
    setText(el.mapUnlockHint, dfc2 ? dfc2.desc : "");
    /* 契约：风险收益，直接决定本局压力 */
    const seg2 = el.curseButtons;
    seg2.innerHTML = "";
    for (const cu of D.CURSES) {
      const b = document.createElement("button");
      b.className = "seg-btn" + (cu.id === (UI.mapSel.curseId || "none") ? " active" : "");
      b.textContent = cu.name;
      b.title = cu.desc;
      b.addEventListener("click", () => { UI.mapSel.curseId = cu.id; UI.refreshMaps(); });
      seg2.appendChild(b);
    }
    const cur = D.CURSES.find((c) => c.id === (UI.mapSel.curseId || "none"));
    setText(el.curseHint, cur && cur.id !== "none" ? "◆ 契约收益：" + cur.desc : "◆ 无契约：标准压力与收益");
  };

  /* ---------- HUD ---------- */

  UI.updateHud = function (world) {
    const p = world.player;
    const hpK = U.clamp(p.hp / p.maxHp, 0, 1);
    el.hpFill.style.width = (hpK * 100).toFixed(1) + "%";
    setText(el.hpText, Math.max(0, Math.ceil(p.hp)) + " / " + Math.round(p.maxHp));
    setText(el.armorChip, "护甲 " + p.armor);
    el.regenChip.classList.toggle("hidden", !(p.regen > 0));
    el.reviveChip.classList.toggle("hidden", !(p.reviveLeft > 0));

    const remaining = world.enemies.length + world.spawnQueue.length;
    setText(el.waveText, (world.endless ? "无尽 " : "第 ") + world.wave + " 波");
    if (world.phase === "intermission") setText(el.enemyLeft, "休整 " + Math.ceil(world.waveTimer) + "s");
    else if (world.boss) setText(el.enemyLeft, "Boss 战");
    else setText(el.enemyLeft, "剩余 " + remaining);

    if (world.boss) {
      el.bossBox.classList.remove("hidden");
      setText(el.bossName, world.boss.def.name);
      el.bossFill.style.width = (U.clamp(world.boss.hp / world.boss.maxHp, 0, 1) * 100).toFixed(1) + "%";
    } else {
      el.bossBox.classList.add("hidden");
    }

    /* 连杀：3 连起显示，条随时间衰减 */
    if (world.combo >= 3) {
      el.comboBox.classList.remove("hidden");
      setText(el.comboText, "x" + world.combo + " 连杀");
      el.comboFill.style.width = (U.clamp(world.comboT / 3.5, 0, 1) * 100).toFixed(0) + "%";
    } else {
      el.comboBox.classList.add("hidden");
    }

    setText(el.timeText, U.fmtTime(world.t));
    setText(el.killText, "击杀 " + world.kills);
    setText(el.serumText, "血清 " + Math.floor(world.serumEarned));

    const sig = p.weapons.map((w) => w.id + ":" + w.level).join(",");
    if (lastHud.weaponSig !== sig) {
      lastHud.weaponSig = sig;
      el.weaponSlots.innerHTML = "";
      p.weapons.forEach((wp, i) => {
        const def = D.WEAPONS[wp.id];
        const slot = document.createElement("div");
        slot.className = "wslot";
        slot.innerHTML = `<div class="wname"><span>${def.name}</span><span class="wlvl">Lv.${wp.level}</span></div>
          <div class="wammo"><span class="mag"></span> <span class="reloadtip"></span></div>
          <div class="wbar"><i class="wbarfill"></i></div>`;
        el.weaponSlots.appendChild(slot);
      });
    }
    const slots = el.weaponSlots.children;
    p.weapons.forEach((wp, i) => {
      const slot = slots[i];
      if (!slot) return;
      slot.classList.toggle("active", i === p.weaponIdx);
      const mag = slot.querySelector(".mag");
      const tip = slot.querySelector(".reloadtip");
      if (wp.reloadT > 0) { setText(mag, "换弹中"); setText(tip, ""); }
      else { setText(mag, wp.ammo + " / " + wp.magSize); setText(tip, wp.ammo === 0 ? "（按 R）" : ""); }
      const bar = slot.querySelector(".wbarfill");
      const k = wp.reloadT > 0 ? 0 : wp.ammo / Math.max(1, wp.magSize);
      bar.style.width = (k * 100).toFixed(0) + "%";
    });
    const consSig = p.grenades + "|" + p.medkits;
    if (lastHud.consSig !== consSig) {
      lastHud.consSig = consSig;
      el.consumables.innerHTML =
        `<div class="cons"><span class="ico">✚</span>手雷<span class="cnt">${p.grenades}</span><span class="key">G</span></div>` +
        `<div class="cons"><span class="ico">＋</span>医疗<span class="cnt">${p.medkits}</span><span class="key">H</span></div>` +
        `<div class="cons"><span class="ico">»</span>闪避<span class="cnt dashcnt">就绪</span><span class="key">SPACE</span></div>`;
    }
    const dashCnt = el.consumables.querySelector(".dashcnt");
    if (dashCnt) setText(dashCnt, p.dashCd <= 0 ? "就绪" : p.dashCd.toFixed(1) + "s");

    const low = hpK < 0.35;
    el.vignette.classList.toggle("hidden", !low);
    el.lowHpPulse.classList.toggle("hidden", !low);
  };

  /* ---------- 提示 ---------- */

  UI.banner = function (main, sub, dur) {
    setText(el.bannerMain, main || "");
    setText(el.bannerSub, sub || "");
    el.bannerBox.classList.remove("hidden");
    el.bannerBox.style.animation = "none";
    void el.bannerBox.offsetWidth;
    el.bannerBox.style.animation = "";
    if (bannerT) clearTimeout(bannerT);
    bannerT = setTimeout(() => el.bannerBox.classList.add("hidden"), Math.max(1.2, dur || 2.4) * 1000);
  };

  UI.toast = function (text, cls, brief) {
    const node = document.createElement("div");
    node.className = "toast" + (cls ? " " + cls : "");
    node.textContent = text;
    el.toasts.appendChild(node);
    while (el.toasts.children.length > 5) el.toasts.removeChild(el.toasts.firstChild);
    setTimeout(() => { node.classList.add("out"); setTimeout(() => node.remove(), 420); }, brief ? 900 : 2000);
  };

  /* ---------- 电台（剧情播报） ---------- */

  let radioSeq = 0;
  function pushRadio(text, delay) {
    const seq = ++radioSeq;
    setTimeout(() => {
      if (seq < radioSeq - 6) return; /* 跳过快过期的一批 */
      const node = document.createElement("div");
      node.className = "radio-line";
      node.textContent = text;
      el.radioBox.appendChild(node);
      while (el.radioBox.children.length > 3) el.radioBox.removeChild(el.radioBox.firstChild);
      setTimeout(() => {
        node.classList.add("fade");
        setTimeout(() => node.remove(), 700);
      }, 7200);
    }, delay || 0);
  }

  UI.radio = function (kind, ctx) {
    const st = (D.STORY && D.STORY.radio) || {};
    const c = ctx || {};
    const name = Save.heroName() || D.STORY.protagonist.defaultName;
    const fill = (s) => String(s).replace(/\{name\}/g, name).replace(/\{wave\}/g, c.wave || "");
    if (kind === "boss") {
      const lines = (st.boss && st.boss[c.map]) || [];
      lines.forEach((l, i) => pushRadio(fill(l), i * 1500));
      return;
    }
    let pool = [];
    if (kind === "mapIntro") pool = (st.mapIntro && st.mapIntro[c.map]) || [];
    else if (kind === "victory") pool = st.victory && st.victory[c.map] ? [st.victory[c.map]] : [];
    else pool = st[kind] || [];
    if (!pool.length) return;
    const line = kind === "waveStart" ? pool[(c.wave || 0) % pool.length] : pool[Math.floor(Math.random() * pool.length)];
    pushRadio(fill(line), 0);
  };

  /* ---------- 升级三选一 ---------- */

  UI.showLevelUp = function (choices, level, onPick, opts) {
    const o = opts || {};
    setText(el.levelupTitle, o.source === "supply" ? "空投补给" : "等级提升");
    setText(el.levelupSub, o.source === "supply" ? " — 免费强化，选择一项" : " — 选择一项强化");
    setText(el.levelupLevel, o.source === "supply" ? "" : "Lv." + level);
    const rerolls = o.rerolls === undefined ? 0 : o.rerolls;
    if (el.btnReroll) {
      el.btnReroll.textContent = rerolls > 0 ? "刷新（剩余 " + rerolls + "）" : "刷新（已用尽）";
      el.btnReroll.disabled = rerolls <= 0;
    }
    const wrap = el.upgradeCards;
    wrap.innerHTML = "";
    const catName = { weapon: "武器", passive: "生存", tactic: "战术" };
    const catClass = { weapon: "cat-weapon", passive: "cat-passive", tactic: "cat-tactic" };
    UI.pendingChoices = choices;
    choices.forEach((c, i) => {
      const card = document.createElement("div");
      card.className = "card " + (catClass[c.cat] || "");
      card.innerHTML =
        `<div class="c-key">${i + 1}</div>` +
        `<div class="c-cat">${catName[c.cat] || ""}${c.max ? " · " + c.lv + "/" + c.max : ""}</div>` +
        `<div class="c-name">${c.name}</div>` +
        `<div class="c-desc">${c.desc}</div>` +
        `<div class="c-lv">选择后立即生效</div>`;
      card.addEventListener("click", () => onPick(c.id));
      wrap.appendChild(card);
    });
    UI.showScreen("levelup");
  };
  UI.pickKey = function (n) {
    if (UI.screen !== "levelup" || !UI.pendingChoices) return;
    const c = UI.pendingChoices[n - 1];
    if (!c) return;
    if (UI.handlers.onPickUpgrade) UI.handlers.onPickUpgrade(c.id);
  };

  /* ---------- 结算 ---------- */

  UI.showResult = function (summary, rewards, win) {
    const map = D.mapById[summary.mapId] || {};
    const diff = D.diffById[summary.difficulty] || {};
    el.resultTitle.textContent = win ? "通关" : "阵亡";
    el.resultTitle.className = win ? "win" : "lose";
    const cur = D.CURSES.find((c) => c.id === (summary.curse || "none"));
    const curseTxt = cur && cur.id !== "none" ? " · 契约：" + cur.name : "";
    setText(el.resultSub, `${map.name || ""} · ${diff.name || ""}${curseTxt}${summary.endlessWave ? " · 无尽 +" + summary.endlessWave + " 波" : ""}`);
    const acc = summary.shotsFired > 0 ? Math.round((summary.shotsHit / summary.shotsFired) * 100) : 0;
    const rows = [
      ["抵达波次", summary.wave],
      ["击杀丧尸", U.fmtNum(summary.kills)],
      ["存活时间", U.fmtTime(summary.timeSec)],
      ["血清收益", "+" + U.fmtNum(rewards.gainedSerum)],
      ["命中率", acc + "%"],
      ["最高武器", "Lv." + summary.maxWeaponLevel],
      ["最高连杀", "x" + (summary.bestCombo || 0)],
    ];
    el.resultStats.innerHTML = rows.map(([k, v]) =>
      `<div class="stat-item"><span class="k">${k}</span><span class="v${k === "血清收益" ? " gold" : ""}">${v}</span></div>`).join("");
    let unlockHtml = "";
    for (const u of (rewards.unlocks || [])) unlockHtml += `<div class="unlock-line">★ ${u}</div>`;
    for (const a of (rewards.newAchievements || [])) unlockHtml += `<div class="unlock-line">✓ 成就达成：${a.name} — ${a.desc}</div>`;
    el.resultUnlocks.innerHTML = unlockHtml;
    /* 尾声与结局（通关后解锁，写入档案） */
    const hero = Save.heroName() || D.STORY.protagonist.defaultName;
    let epi = "";
    if (win) {
      const isFinal = summary.mapId === "lab";
      const key = summary.difficulty === "nightmare" ? "nightmare" : "normal";
      const raw = isFinal ? D.STORY.endingTrue[key] : D.STORY.endings[summary.mapId];
      epi = String(raw || "").replace(/\{name\}/g, hero);
      Save.addEnding(isFinal ? "true_" + key : summary.mapId);
    }
    if (epi) {
      el.resultEpilogue.textContent = epi;
      el.resultEpilogue.classList.remove("hidden");
    } else {
      el.resultEpilogue.classList.add("hidden");
    }
    const canEndless = win && !summary.endless;
    el.btnEndless.classList.toggle("hidden", !canEndless);
    el.btnEndless.textContent = D.isEndlessUnlocked(Save.profile) ? "进入无尽模式" : "进入无尽模式（未解锁）";
    el.btnEndless.disabled = !D.isEndlessUnlocked(Save.profile);
    UI.refreshMaps();
    UI.showScreen("result");
  };

  /* ---------- 永久强化 ---------- */

  UI.refreshMeta = function () {
    setText(el.metaSerum, "血清 " + U.fmtNum(Save.profile.serum));
    const wrap = el.metaList;
    wrap.innerHTML = "";
    for (const def of D.META) {
      const lv = Save.metaLevel(def.id);
      const maxed = lv >= def.max;
      const cost = maxed ? 0 : def.cost(lv);
      const item = document.createElement("div");
      item.className = "meta-item" + (maxed ? " maxed" : "");
      item.innerHTML =
        `<div class="mi-body"><div class="mi-name">${def.name}</div>
         <div class="mi-desc">${def.desc}</div>
         <div class="mi-lv">等级 ${lv} / ${def.max}</div></div>`;
      const b = document.createElement("button");
      b.className = "btn";
      if (maxed) { b.textContent = "已满级"; b.disabled = true; }
      else {
        b.textContent = "强化 · " + cost;
        b.disabled = Save.profile.serum < cost;
        b.addEventListener("click", () => { if (UI.handlers.onBuyMeta) UI.handlers.onBuyMeta(def.id); });
      }
      item.appendChild(b);
      wrap.appendChild(item);
    }
  };

  /* ---------- 战绩与成就 ---------- */

  UI.refreshStats = function () {
    const p = Save.profile, st = p.stats;
    const acc = st.shotsFired > 0 ? Math.round((st.shotsHit / st.shotsFired) * 100) : 0;
    el.statsTotals.innerHTML = [
      ["总局数", st.runs], ["通关", st.wins], ["总击杀", U.fmtNum(st.totalKills)],
      ["单局最高击杀", U.fmtNum(st.bestRunKills)], ["最佳波次", st.bestWave], ["最长生存", U.fmtTime(st.bestTimeSec)],
      ["累计血清", U.fmtNum(st.serumTotal)], ["命中率", acc + "%"],
      ["最高连杀", "x" + (st.bestCombo || 0)], ["契约通关", st.curseWins || 0],
    ].map(([k, v]) => `<div class="stat-item"><span class="k">${k}</span><span class="v">${v}</span></div>`).join("");

    el.achievements.innerHTML = D.ACHIEVEMENTS.map((a) => {
      const got = !!p.achievements[a.id];
      return `<div class="ach ${got ? "" : "locked"}"><div class="a-name">${got ? "✓ " : "🔒 "}${a.name}</div><div class="a-desc">${a.desc}</div></div>`;
    }).join("");

    const hist = p.history || [];
    el.historyTable.innerHTML = hist.length
      ? `<table class="hist"><tr><th>日期</th><th>地图</th><th>难度</th><th>波次</th><th>击杀</th><th>用时</th><th>结果</th><th>血清</th></tr>` +
        hist.map((h) => {
          const m = D.mapById[h.mapId] || {}, df = D.diffById[h.difficulty] || {};
          return `<tr><td>${h.date}</td><td>${m.name || h.mapId}</td><td>${df.name || ""}</td><td>${h.wave}</td>
            <td>${h.kills}</td><td>${U.fmtTime(h.timeSec)}</td>
            <td class="${h.win ? "win" : "lose"}">${h.win ? "通关" : "阵亡"}</td><td>+${h.serum}</td></tr>`;
        }).join("") + `</table>`
      : `<div class="dim">还没有战绩，去打一局吧。</div>`;
  };

  /* ---------- 档案室：人物 / 情报日志 / 结局 ---------- */

  UI.bossCleared = function (bossId) {
    const cm = Save.profile.stats.clearedMaps || {};
    return D.MAPS.some((m) => m.boss === bossId && cm[m.id]);
  };
  UI.charUnlocked = function (c) {
    if (c.unlock === "start") return true;
    if (c.unlock && c.unlock.map) return !!(Save.profile.stats.clearedMaps || {})[c.unlock.map];
    if (c.unlock && c.unlock.boss) return UI.bossCleared(c.unlock.boss);
    return true;
  };
  UI.refreshArchive = function () {
    const chars = D.STORY.characters;
    el.archiveChars.innerHTML = chars.map((c) => {
      const on = UI.charUnlocked(c);
      return `<div class="ach ${on ? "" : "locked"}">
        <div class="a-name">${on ? c.name + "（" + c.real + "）" : "？？？"}</div>
        <div class="a-desc">${on ? c.role + " — " + c.bio : "档案未解锁（通关对应地图 / 击败对应首领后收录）"}</div>
      </div>`;
    }).join("");
    el.archiveIntel.innerHTML = D.STORY.intel.map((it) => {
      const on = Save.hasIntel(it.id);
      const mapName = (D.mapById[it.map] || {}).name || it.map;
      return `<div class="intel-item ${on ? "" : "locked"}">
        <div class="i-title">${on ? it.title : "未解密资料"}<span class="i-map">${mapName}</span></div>
        <div class="i-body">${on ? it.body : "在战场上找到这份日志（精英、木箱、空投）后解锁。"}</div>
      </div>`;
    }).join("");
    const endings = D.MAPS.map((m) => ({ id: m.id, name: m.name + " · 尾声" }));
    endings.push({ id: "true_normal", name: "真结局 A · 撤离（通关生物研究所）" });
    endings.push({ id: "true_nightmare", name: "真结局 B · 封存（噩梦难度通关）" });
    el.archiveEndings.innerHTML = endings.map((e) => {
      const on = Save.hasEnding(e.id);
      return `<div class="ach ${on ? "" : "locked"}">
        <div class="a-name">${on ? "✓ " : "🔒 "}${e.name}</div>
        <div class="a-desc">${on ? "已收录结局文本" : "通关后在结算页收录"}</div>
      </div>`;
    }).join("");
    const charOn = chars.filter((c) => UI.charUnlocked(c)).length;
    setText(el.archiveProgress,
      "人物 " + charOn + "/" + chars.length + " · 情报 " + Save.intelCount() + "/" + D.STORY.intel.length +
      " · 结局 " + Save.endingCount() + "/" + endings.length);
  };

  /* ---------- 设置 ---------- */

  function buildSettings() {
    const st = Save.settings();
    const wrap = el.settingsForm;
    wrap.innerHTML = `
      <div class="field"><span class="f-label">主音量</span><input type="range" id="setMaster" min="0" max="100" value="${Math.round(st.master * 100)}"><span class="f-val" id="valMaster">${Math.round(st.master * 100)}</span></div>
      <div class="field"><span class="f-label">音效</span><input type="range" id="setSfx" min="0" max="100" value="${Math.round(st.sfx * 100)}"><span class="f-val" id="valSfx">${Math.round(st.sfx * 100)}</span></div>
      <div class="field"><span class="f-label">氛围音乐</span><input type="range" id="setMusic" min="0" max="100" value="${Math.round(st.music * 100)}"><span class="f-val" id="valMusic">${Math.round(st.music * 100)}</span></div>
      <div class="field"><span class="f-label">屏幕震动</span><label class="switch"><input type="checkbox" id="setShake" ${st.shake ? "checked" : ""}><i></i></label></div>
      <div class="field"><span class="f-label">伤害数字</span><label class="switch"><input type="checkbox" id="setDmg" ${st.dmgNumbers ? "checked" : ""}><i></i></label></div>
      <div class="field"><span class="f-label">自动开火</span><label class="switch"><input type="checkbox" id="setAuto" ${st.autoFire ? "checked" : ""}><i></i></label></div>
      <div class="field"><span class="f-label">降低动态效果</span><label class="switch"><input type="checkbox" id="setMotion" ${st.reducedMotion ? "checked" : ""}><i></i></label></div>
      <div class="field"><span class="f-label">画质模式</span><select id="setPerf" class="name-input name-inline">
        <option value="auto">自动（触屏设备省电）</option>
        <option value="high">标准</option>
        <option value="low">省电（低配手机）</option>
      </select></div>
      <div class="field"><span class="f-label">电台代号</span><input type="text" id="setHeroName" class="name-input name-inline" maxlength="12" value="${(Save.heroName() || "").replace(/"/g, "&quot;")}"><button class="btn" id="btnSetName">更新</button></div>`;
    const patch = (p) => { Save.updateSettings(p); if (UI.handlers.onSettingsChange) UI.handlers.onSettingsChange(p); };
    const bindRange = (id, valId, key) => {
      const r = document.getElementById(id);
      const v = document.getElementById(valId);
      r.addEventListener("input", () => { v.textContent = r.value; patch({ [key]: Number(r.value) / 100 }); });
    };
    bindRange("setMaster", "valMaster", "master");
    bindRange("setSfx", "valSfx", "sfx");
    bindRange("setMusic", "valMusic", "music");
    document.getElementById("setShake").addEventListener("change", (e) => patch({ shake: e.target.checked }));
    document.getElementById("setDmg").addEventListener("change", (e) => patch({ dmgNumbers: e.target.checked }));
    document.getElementById("setAuto").addEventListener("change", (e) => patch({ autoFire: e.target.checked }));
    document.getElementById("setMotion").addEventListener("change", (e) => patch({ reducedMotion: e.target.checked }));
    const bn = document.getElementById("btnSetName");
    const sp = document.getElementById("setPerf");
    if (sp) {
      sp.value = Save.settings().perfMode || "auto";
      sp.addEventListener("change", (e) => patch({ perfMode: e.target.value }));
    }
    if (bn) {
      bn.addEventListener("click", () => {
        const v = document.getElementById("setHeroName").value;
        if (!Save.setHeroName(v)) Save.setHeroName(D.STORY.protagonist.defaultName);
        UI.refreshMenu();
        UI.toast("代号已更新：" + (Save.heroName() || D.STORY.protagonist.defaultName), "good");
      });
    }
  }
  UI.refreshSettings = function () {
    const st = Save.settings();
    const setRange = (id, valId, v) => {
      const r = document.getElementById(id); if (!r) return;
      r.value = Math.round(v * 100);
      document.getElementById(valId).textContent = Math.round(v * 100);
    };
    setRange("setMaster", "valMaster", st.master);
    setRange("setSfx", "valSfx", st.sfx);
    setRange("setMusic", "valMusic", st.music);
    const s1 = document.getElementById("setShake"); if (s1) s1.checked = st.shake;
    const s2 = document.getElementById("setDmg"); if (s2) s2.checked = st.dmgNumbers;
    const s3 = document.getElementById("setAuto"); if (s3) s3.checked = st.autoFire;
    const s4 = document.getElementById("setMotion"); if (s4) s4.checked = st.reducedMotion;
    const hn = document.getElementById("setHeroName");
    if (hn) hn.value = Save.heroName() || "";
    const sp2 = document.getElementById("setPerf");
    if (sp2) sp2.value = st.perfMode || "auto";
  };

  UI.debug = function (text) { setText(el.fpsDebug, text); };
  window.ZTS.UI = UI;
})();
