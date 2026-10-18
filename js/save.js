/* 存档层：localStorage 持久化（玩家档案 + 进行中的一局），支持导出/导入/重置。 */
window.ZTS = window.ZTS || {};
(function () {
  const KEY = window.ZTS.data.GAME.saveKey;
  let profile = null;
  let run = null;
  let memoryOnly = false;

  function defaults() {
    return {
      v: 1,
      profile: {
        serum: 0,
        meta: {},
        heroName: "",
        intel: {},
        endings: {},
        settings: {
          master: 0.8, sfx: 0.9, music: 0.45,
          shake: true, dmgNumbers: true, autoFire: false, reducedMotion: false,
          perfMode: "auto",
        },
        stats: {
          runs: 0, wins: 0, nightmareWins: 0, totalKills: 0, bestRunKills: 0,
          bestWave: 0, bestTimeSec: 0, shotsFired: 0, shotsHit: 0,
          serumTotal: 0, clearedMaps: {}, bestWeaponLevel: 0,
          endlessUnlocked: false, nightmareUnlocked: false, bestEndlessWave: 0,
          bestCombo: 0, curseWins: 0, curseClears: {},
          flags: {}, playTimeSec: 0,
        },
        achievements: {},
        history: [],
      },
      run: null,
    };
  }

  function deepMerge(base, patch) {
    if (patch === null || patch === undefined) return base;
    if (Array.isArray(base) || typeof base !== "object") return patch;
    for (const k of Object.keys(patch)) {
      const bv = base[k], pv = patch[k];
      if (pv && typeof pv === "object" && !Array.isArray(pv) && bv && typeof bv === "object" && !Array.isArray(bv)) {
        deepMerge(bv, pv);
      } else {
        base[k] = pv;
      }
    }
    return base;
  }

  function load() {
    const def = defaults();
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) {
        const data = JSON.parse(raw);
        profile = deepMerge(def.profile, data.profile || {});
        run = data.run || null;
      } else {
        profile = def.profile;
      }
    } catch (e) {
      memoryOnly = true;
      profile = def.profile;
      run = null;
    }
    return profile;
  }

  function save() {
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ v: 1, profile, run, savedAt: Date.now() }));
      return true;
    } catch (e) {
      memoryOnly = true;
      return false;
    }
  }

  const api = {
    get profile() { return profile; },
    get run() { return run; },
    get memoryOnly() { return memoryOnly; },
    hasRun() { return !!run; },
    load, save,
    setRun(snapshot) { run = snapshot; save(); },
    clearRun() { run = null; save(); },
    settings() { return profile.settings; },
    updateSettings(patch) { Object.assign(profile.settings, patch); save(); },

    /* ---- 剧情：主角命名 / 情报日志 / 结局档案 ---- */
    heroName() { return profile.heroName || ""; },
    setHeroName(n) {
      const clean = String(n || "").trim().replace(/\s+/g, " ").slice(0, 12);
      profile.heroName = clean;
      save();
      return clean;
    },
    addIntel(id) {
      if (!id || profile.intel[id]) return false;
      profile.intel[id] = true;
      save();
      return true;
    },
    hasIntel(id) { return !!profile.intel[id]; },
    addEnding(id) {
      if (!id || profile.endings[id]) return false;
      profile.endings[id] = true;
      save();
      return true;
    },
    hasEnding(id) { return !!profile.endings[id]; },
    intelCount() { return Object.keys(profile.intel || {}).length; },
    endingCount() { return Object.keys(profile.endings || {}).length; },

    addSerum(n) {
      profile.serum += n;
      profile.stats.serumTotal += n;
      save();
    },
    spendSerum(n) {
      if (profile.serum < n) return false;
      profile.serum -= n;
      save();
      return true;
    },
    metaLevel(id) { return profile.meta[id] || 0; },
    buyMeta(id) {
      const def = window.ZTS.data.metaById[id];
      if (!def) return { ok: false, reason: "unknown" };
      const lv = api.metaLevel(id);
      if (lv >= def.max) return { ok: false, reason: "max" };
      const cost = def.cost(lv);
      if (profile.serum < cost) return { ok: false, reason: "poor" };
      profile.serum -= cost;
      profile.meta[id] = lv + 1;
      save();
      return { ok: true, level: lv + 1, cost };
    },

    /* 结算一局：写入统计、战绩、解锁，并结算血清 */
    recordRun(summary) {
      const st = profile.stats;
      st.runs += 1;
      st.totalKills += summary.kills;
      if (summary.kills > st.bestRunKills) st.bestRunKills = summary.kills;
      if (summary.wave > st.bestWave) st.bestWave = summary.wave;
      if (summary.timeSec > st.bestTimeSec) st.bestTimeSec = summary.timeSec;
      st.shotsFired += summary.shotsFired || 0;
      st.shotsHit += summary.shotsHit || 0;
      st.playTimeSec += summary.timeSec || 0;
      if (summary.maxWeaponLevel > st.bestWeaponLevel) st.bestWeaponLevel = summary.maxWeaponLevel;
      if ((summary.bestCombo || 0) > (st.bestCombo || 0)) st.bestCombo = summary.bestCombo || 0;
      if (summary.win && summary.curse && summary.curse !== "none") {
        st.curseWins = (st.curseWins || 0) + 1;
        st.curseClears[summary.curse] = (st.curseClears[summary.curse] || 0) + 1;
      }
      if (summary.nohit3) st.flags.nohit3 = true;
      const unlocks = [];
      if (summary.win) {
        st.wins += 1;
        if (summary.difficulty === "nightmare") {
          st.nightmareWins += 1;
        }
        if (!st.clearedMaps[summary.mapId]) {
          st.clearedMaps[summary.mapId] = true;
          unlocks.push("地图：" + (window.ZTS.data.mapById[summary.mapId] || {}).name + " 通关标记");
        }
        if (summary.mapId === "lab") {
          if (!st.endlessUnlocked) { st.endlessUnlocked = true; unlocks.push("无尽模式已解锁"); }
          if (!st.nightmareUnlocked) { st.nightmareUnlocked = true; unlocks.push("噩梦难度已解锁"); }
        }
      }
      if (summary.endlessWave > (st.bestEndlessWave || 0)) st.bestEndlessWave = summary.endlessWave;

      /* 血清结算 */
      const gained = Math.max(0, Math.round(summary.serum || 0));
      profile.serum += gained;
      st.serumTotal += gained;

      profile.history.unshift({
        mapId: summary.mapId, difficulty: summary.difficulty, wave: summary.wave,
        kills: summary.kills, timeSec: Math.round(summary.timeSec), win: !!summary.win,
        serum: gained, date: new Date().toISOString().slice(0, 10),
      });
      if (profile.history.length > 20) profile.history.length = 20;

      /* 成就检查 */
      const newAch = [];
      for (const a of window.ZTS.data.ACHIEVEMENTS) {
        if (!profile.achievements[a.id] && a.check(profile)) {
          profile.achievements[a.id] = true;
          newAch.push(a);
        }
      }
      save();
      return { gainedSerum: gained, unlocks, newAchievements: newAch };
    },

    resetAll() {
      profile = defaults().profile;
      run = null;
      save();
    },
    exportJson() {
      return JSON.stringify({ v: 1, exportedAt: new Date().toISOString(), profile, run }, null, 2);
    },
    importJson(text) {
      const data = JSON.parse(text);
      if (!data || typeof data !== "object" || !data.profile) throw new Error("存档格式不正确");
      profile = deepMerge(defaults().profile, data.profile);
      run = data.run || null;
      save();
      return true;
    },
  };

  window.ZTS.Save = api;
})();
