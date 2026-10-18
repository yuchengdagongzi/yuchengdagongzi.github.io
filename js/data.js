/* 数据层：武器 / 敌人 / 地图 / 升级 / 永久强化 / 成就 / 波次曲线。纯数据，可独立测试。 */
window.ZTS = window.ZTS || {};
(function () {
  const U = window.ZTS.util;

  const GAME = {
    name: "尸潮幸存者",
    version: "1.0.1",
    saveKey: "zts.save.v1",
    wavesPerMap: 15,
    bossWave: 15,
    intermission: 6,
    maxEnemies: 420,
    maxParticles: 600,
    maxDecals: 320,
    waveCount: (w) => Math.round(12 + 3.5 * w),
    xpNeed: (lvl) => Math.floor(10 * Math.pow(1.22, lvl - 1)),
    endlessBossEvery: 5,
    killRewardSerum: 0.05, // 每次击杀的基础血清期望（再乘难度/词条）
  };

  const PLAYER = {
    hp: 100, speed: 240, radius: 13,
    dashTime: 0.22, dashSpeedMul: 3.1, dashCd: 2.2, iframe: 0.35,
    magnet: 70, regenEvery: 5, thornsR: 90,
  };

  /* ---------- 武器 ---------- */
  const WEAPONS = {
    pistol: {
      id: "pistol", name: "M1911 手枪", cat: "枪械", color: "#ffd9a0", sfx: "pistol",
      desc: "精准单发，可靠的老伙计。",
      dmg: 12, rof: 4.5, speed: 950, spread: 0.03, pellets: 1, mag: 12, reload: 1.1,
      pierce: 0, knock: 90, auto: false, life: 1.1, radius: 3,
      lvDmg: 0.18, lvRof: 0.08, lvMag: 0.15,
      perkName: "穿透弹", perk: (w) => { w.pierce += 1; },
    },
    shotgun: {
      id: "shotgun", name: "双管霰弹枪", cat: "枪械", color: "#ffb46e", sfx: "shotgun",
      desc: "近距一喷清场，击退凶猛。",
      dmg: 7, rof: 1.5, speed: 820, spread: 0.22, pellets: 6, mag: 6, reload: 1.7,
      pierce: 0, knock: 260, auto: false, life: 0.42, radius: 3,
      lvDmg: 0.18, lvRof: 0.08, lvMag: 0.15,
      perkName: "散射强化", perk: (w) => { w.pellets += 2; },
    },
    smg: {
      id: "smg", name: "冲锋枪", cat: "枪械", color: "#8fd4ff", sfx: "smg",
      desc: "高射速压制，扩散不小。",
      dmg: 6, rof: 11, speed: 900, spread: 0.09, pellets: 1, mag: 32, reload: 1.5,
      pierce: 0, knock: 50, auto: true, life: 1.0, radius: 3,
      lvDmg: 0.18, lvRof: 0.08, lvMag: 0.15,
      perkName: "致命连射", perk: (w) => { w.critAdd = (w.critAdd || 0) + 0.15; },
    },
    rifle: {
      id: "rifle", name: "突击步枪", cat: "枪械", color: "#c8ff9a", sfx: "rifle",
      desc: "三连点射，穿透一个目标。",
      dmg: 20, rof: 3.2, speed: 1150, spread: 0.04, pellets: 1, mag: 20, reload: 1.8,
      pierce: 1, knock: 130, auto: false, life: 1.2, radius: 4, burst: 3, burstGap: 0.07,
      lvDmg: 0.18, lvRof: 0.08, lvMag: 0.15,
      perkName: "重型弹头", perk: (w) => { w.pierce += 1; w.knock += 80; },
    },
    flamer: {
      id: "flamer", name: "火焰喷射器", cat: "重型", color: "#ff7a3c", sfx: "flamer",
      kind: "flame",
      desc: "短距火舌，命中点燃。",
      dmg: 5, rof: 10, speed: 330, spread: 0.34, pellets: 1, mag: 120, reload: 2.2,
      pierce: 99, knock: 20, auto: true, life: 0.3, radius: 14,
      lvDmg: 0.18, lvRof: 0.08, lvMag: 0.15,
      perkName: "烈焰风暴", perk: (w) => { w.flameR = 1.35; w.life += 0.1; },
    },
    railgun: {
      id: "railgun", name: "电磁轨道枪", cat: "重型", color: "#b48fff", sfx: "railgun",
      desc: "蓄能重击，穿透一切。",
      dmg: 55, rof: 0.9, speed: 1700, spread: 0.005, pellets: 1, mag: 5, reload: 2.0,
      pierce: 99, knock: 220, auto: false, life: 1.3, radius: 5,
      lvDmg: 0.18, lvRof: 0.08, lvMag: 0.15,
      perkName: "过载爆炸", perk: (w) => { w.explode = 100; },
    },
  };
  const START_WEAPON = "pistol";
  const WEAPON_ORDER = ["pistol", "shotgun", "smg", "rifle", "flamer", "railgun"];

  /* ---------- 敌人 ---------- */
  const ENEMIES = {
    walker: {
      id: "walker", name: "步行尸", hp: 30, speed: 52, dmg: 6, radius: 14, xp: 2,
      atk: "melee", atkCd: 0.8, color: "#6f7f5a", color2: "#556247", head: "#8a9a70",
      speedJitter: 0.22, gib: "#7d2b22",
    },
    runner: {
      id: "runner", name: "疾行尸", hp: 22, speed: 106, dmg: 5, radius: 12, xp: 2,
      atk: "melee", atkCd: 0.65, color: "#8a6f5a", color2: "#6d5645", head: "#a08468",
      speedJitter: 0.12, gib: "#8a3a2a",
    },
    dog: {
      id: "dog", name: "尸犬", hp: 26, speed: 128, dmg: 5, radius: 11, xp: 3,
      atk: "melee", atkCd: 0.6, color: "#7a5a4a", color2: "#5d453a", head: "#96705c",
      speedJitter: 0.05, zigzag: true, gib: "#8a2f1f",
    },
    spitter: {
      id: "spitter", name: "呕吐者", hp: 48, speed: 44, dmg: 9, radius: 15, xp: 4,
      atk: "ranged", atkCd: 2.6, range: 300, projSpeed: 210, projDmg: 9, projR: 6,
      color: "#6a8a4a", color2: "#52703a", head: "#8aa85f", speedJitter: 0.1, gib: "#5f8a33",
    },
    boomer: {
      id: "boomer", name: "自爆尸", hp: 60, speed: 58, dmg: 26, radius: 18, xp: 4,
      atk: "explode", atkCd: 9, boomR: 82, boomDmg: 30, color: "#8a7a4a", color2: "#6d5f38",
      head: "#a89a63", speedJitter: 0.15, glow: "#c9d94f", gib: "#7d6a26",
    },
    brute: {
      id: "brute", name: "装甲尸", hp: 200, speed: 40, dmg: 16, radius: 24, xp: 10,
      atk: "melee", atkCd: 1.0, armor: 2, knockResist: 0.8, color: "#5a6a6a", color2: "#465352",
      head: "#7d8f8f", speedJitter: 0.1, plate: true, gib: "#4a3a30",
    },
    screamer: {
      id: "screamer", name: "尖啸者", hp: 80, speed: 62, dmg: 5, radius: 16, xp: 8,
      atk: "summon", atkCd: 6, summonType: "walker", summonCount: 4, keepAway: 260, summonMax: 3,
      color: "#8a5a7a", color2: "#6d4760", head: "#a87698", speedJitter: 0.1, gib: "#7a2f5a",
    },
  };

  const BOSSES = {
    butcher: {
      id: "butcher", name: "屠夫", hp: 2400, speed: 46, dmg: 28, radius: 40, xp: 120,
      color: "#7a4a3a", color2: "#5d382c", head: "#9a6a52", armor: 4, knockResist: 0.95,
      attacks: ["charge", "slam", "roar"], chargeCd: 6, slamCd: 4.5, roarCd: 11,
      chargeSpeedMul: 3.4, chargeTime: 0.62, telegraph: 0.85, slamR: 150,
      serumDrop: 120,
    },
    hive: {
      id: "hive", name: "母巢", hp: 3000, speed: 26, dmg: 24, radius: 46, xp: 140,
      color: "#5a7a6a", color2: "#45604f", head: "#7aa08a", armor: 2, knockResist: 1.0,
      attacks: ["spawn", "acid", "tendril"], spawnCd: 4.2, acidCd: 6.5, tendrilCd: 8,
      tendrilCount: 4, acidCount: 11, serumDrop: 150,
    },
    tyrant: {
      id: "tyrant", name: "暴君", hp: 3400, speed: 54, dmg: 30, radius: 44, xp: 160,
      color: "#6a4a3a", color2: "#4f382c", head: "#8f6a52", armor: 6, knockResist: 1.0,
      attacks: ["beam", "charge", "spike"],
      beamCd: 9.5, beamTelegraph: 1.1, beamSweep: 2.6, beamDmg: 26, beamRange: 1150, beamHalf: 0.24,
      chargeCd: 6.5, chargeSpeedMul: 3.9, chargeTime: 0.55, telegraph: 0.7,
      spikeCd: 8.5, spikeCount: 12, spikeDist: 230,
      serumDrop: 180,
    },
  };

  /* ---------- 地图 ---------- */
  const MAPS = [
    {
      id: "hospital", num: 1, name: "圣玛丽医院", boss: "butcher",
      size: [2200, 1500], gen: "rooms",
      desc: "疫情爆发的第一现场。病房之间塞满了来不及撤离的病床，走廊里回荡着低吼。",
      theme: {
        floor: "#2b2f36", floor2: "#23272d", wall: "#3a3f47", wallTop: "#4c525c",
        accent: "#7a2b2b", blood: "#5c1414", deco: "#8a9099", dark: 0.2, prop: "bed",
      },
      pool: { walker: 58, runner: 16, spitter: 10, boomer: 10, brute: 6 },
      special: { id: "medkit", name: "医疗补给", desc: "医疗包掉落率大幅提高。" },
      unlock: null,
    },
    {
      id: "subway", num: 2, name: "地铁隧道", boss: "tyrant",
      size: [2700, 1250], gen: "tunnel",
      desc: "末班车没有到站。三条并行车道被遗弃的车厢切断，隧道深处的汽笛还在响。",
      theme: {
        floor: "#242b33", floor2: "#1c2229", wall: "#2e3640", wallTop: "#3d4754",
        accent: "#b08a3c", blood: "#4a1010", deco: "#c9a23c", dark: 0.42, prop: "train",
      },
      pool: { walker: 34, runner: 40, boomer: 14, spitter: 12 },
      special: { id: "train", name: "列车冲撞", desc: "周期性列车驶过车道：汽笛预警后，横扫线上的一切。" },
      unlock: { map: "hospital" },
    },
    {
      id: "base", num: 3, name: "军事基地", boss: "tyrant",
      size: [2400, 1600], gen: "containers",
      desc: "补给线已经断了。集装箱阵和沙袋工事是最后的防线，弹药还可以再撑一阵。",
      theme: {
        floor: "#2e2f26", floor2: "#262720", wall: "#3c4034", wallTop: "#4e5344",
        accent: "#5e7a3c", blood: "#4a1410", deco: "#8a8f6a", dark: 0.18, prop: "container",
      },
      pool: { walker: 34, brute: 20, spitter: 16, dog: 16, boomer: 14 },
      special: { id: "ammo", name: "弹药储备", desc: "弹药箱掉落翻倍：拾取立刻补满弹匣。" },
      unlock: { map: "subway" },
    },
    {
      id: "prison", num: 4, name: "铁壁监狱", boss: "butcher",
      size: [2250, 1600], gen: "cells",
      desc: "牢门全开了，守卫全没了。探照灯还在转，囚室里的东西也已经出来了。",
      theme: {
        floor: "#282e35", floor2: "#21262d", wall: "#343b44", wallTop: "#454e59",
        accent: "#9aa7b5", blood: "#541212", deco: "#aab6c2", dark: 0.34, prop: "cell",
      },
      pool: { walker: 30, runner: 28, brute: 18, dog: 12, screamer: 12 },
      special: { id: "alarm", name: "暴动警报", desc: "每波有概率触发额外增援（警报会提前预警）。" },
      unlock: { map: "base" },
    },
    {
      id: "lab", num: 5, name: "生化研究所", boss: "hive",
      size: [2350, 1550], gen: "lab",
      desc: "一切的起点。培养舱已全部破裂，地面渗出会侵蚀生命的毒雾。",
      theme: {
        floor: "#273136", floor2: "#20282c", wall: "#2c3a3d", wallTop: "#3b4c50",
        accent: "#3ca08a", blood: "#3a1010", deco: "#5fd4b8", dark: 0.3, prop: "tank",
      },
      pool: { walker: 18, runner: 28, spitter: 16, boomer: 16, brute: 14, screamer: 8 },
      special: { id: "toxic", name: "毒雾区", desc: "移动的毒雾持续侵蚀生命：逼你不停走位。" },
      unlock: { map: "prison" },
    },
  ];

  /* ---------- 难度 ---------- */
  const DIFFICULTIES = [
    { id: "recruit", name: "新兵", hpMul: 0.85, dmgMul: 0.8, speedMul: 0.95, spawnMul: 0.9, rewardMul: 0.8,
      desc: "适合第一次进入尸潮。" },
    { id: "veteran", name: "老兵", hpMul: 1.15, dmgMul: 1.0, speedMul: 1.0, spawnMul: 1.0, rewardMul: 1.0,
      desc: "标准难度，推荐从这里开始。" },
    { id: "nightmare", name: "噩梦", hpMul: 1.7, dmgMul: 1.3, speedMul: 1.1, spawnMul: 1.35, rewardMul: 1.5,
      desc: "尸潮不再讲道理。血清收益 +50%。" },
  ];

  /* ---------- 局内升级（三选一） ---------- */
  const UPGRADES = [
    { id: "w_dmg", name: "高爆弹头", cat: "weapon", max: 6, desc: "武器伤害 +18%",
      apply: (m) => { m.dmgMul += 0.18; } },
    { id: "w_rof", name: "快擦枪机", cat: "weapon", max: 6, desc: "射速 +12%",
      apply: (m) => { m.rofMul += 0.12; } },
    { id: "w_mag", name: "双联弹匣", cat: "weapon", max: 4, desc: "弹匣容量 +30%",
      apply: (m) => { m.magMul += 0.3; } },
    { id: "w_reload", name: "快速换弹", cat: "weapon", max: 3, desc: "换弹速度 +20%",
      apply: (m) => { m.reloadMul *= 0.8; } },
    { id: "w_pierce", name: "穿甲弹", cat: "weapon", max: 3, desc: "子弹穿透 +1",
      apply: (m) => { m.pierceAdd += 1; } },
    { id: "w_crit", name: "致命打击", cat: "weapon", max: 5, desc: "暴击率 +8%（暴击 2 倍伤害）",
      apply: (m) => { m.critAdd += 0.08; } },
    { id: "w_burn", name: "燃烧弹", cat: "weapon", max: 1, desc: "命中点燃：3 秒持续伤害",
      apply: (m) => { m.burnAdd += 1; } },
    { id: "w_freeze", name: "冷冻弹", cat: "weapon", max: 1, desc: "命中减速 35%，持续 2 秒",
      apply: (m) => { m.freezeAdd += 1; } },
    { id: "w_new", name: "获得新武器", cat: "weapon", max: 2, desc: "随机获得一把未持有的武器",
      apply: () => { /* 由 Sim.choose 处理：随机授予武器 */ } },

    { id: "p_hp", name: "强化体质", cat: "passive", max: 6, desc: "生命上限 +20（立即回复）",
      apply: (m, w) => { m.maxHpAdd += 20; if (w) { w.player.maxHp += 20; w.player.hp += 20; } } },
    { id: "p_armor", name: "防弹插板", cat: "passive", max: 5, desc: "护甲 +2（按点数减伤，上限 65%）",
      apply: (m, w) => { m.armorAdd += 2; if (w) w.player.armor += 2; } },
    { id: "p_speed", name: "战术靴", cat: "passive", max: 5, desc: "移动速度 +8%",
      apply: (m) => { m.speedMul += 0.08; } },
    { id: "p_regen", name: "再生因子", cat: "passive", max: 4, desc: "每 5 秒回复 1 点生命",
      apply: (m) => { m.regen += 1; } },
    { id: "p_magnet", name: "磁力手套", cat: "passive", max: 4, desc: "拾取范围 +40%",
      apply: (m) => { m.magnetMul += 0.4; } },
    { id: "p_xp", name: "生存激素", cat: "passive", max: 5, desc: "经验获取 +15%",
      apply: (m) => { m.xpMul += 0.15; } },
    { id: "p_thorns", name: "电击护甲", cat: "passive", max: 3, desc: "受击时电击周围敌人",
      apply: (m) => { m.thorns += 14; } },
    { id: "p_luck", name: "幸运护符", cat: "passive", max: 3, desc: "掉落率提升 +25%",
      apply: (m) => { m.luck += 0.25; } },
    { id: "p_dash", name: "战术翻滚", cat: "passive", max: 3, desc: "闪避冷却 -25%",
      apply: (m) => { m.dashCdMul *= 0.75; } },

    { id: "t_grenade", name: "手雷补给", cat: "tactic", max: 5, desc: "立即获得 2 枚手雷",
      apply: (m, w) => { if (w) w.player.grenades += 2; } },
    { id: "t_medkit", name: "战地急救", cat: "tactic", max: 5, desc: "立即获得 1 个医疗包",
      apply: (m, w) => { if (w) w.player.medkits += 1; } },
    { id: "t_turret", name: "自动哨戒炮", cat: "tactic", max: 2, desc: "每波开始时投放一座自动炮台",
      apply: (m) => { m.turrets += 1; } },
    { id: "t_ammo", name: "弹药背包", cat: "tactic", max: 3, desc: "弹匣容量 +20% 并立刻补满",
      apply: (m, w) => {
        m.magMul += 0.2;
        if (w) for (const wp of w.player.weapons) wp.ammo = wp.magSize;
      } },
    { id: "t_heal", name: "应急缝合", cat: "tactic", max: 3, desc: "立即回复 50% 生命",
      apply: (m, w) => { if (w) w.player.hp = Math.min(w.player.maxHp, w.player.hp + w.player.maxHp * 0.5); } },
    { id: "t_serum", name: "血清提纯", cat: "tactic", max: 4, desc: "本局血清收益 +12%",
      apply: (m) => { m.serumMul += 0.12; } },
  ];

  /* ---------- 永久强化（血清购买） ---------- */
  const META = [
    { id: "m_hp", name: "强化体质", max: 5, cost: (lv) => 60 + 40 * lv, desc: "+8 初始生命/级",
      apply: (m, lv) => { m.maxHpAdd += 8 * lv; } },
    { id: "m_dmg", name: "弹道优化", max: 5, cost: (lv) => 80 + 50 * lv, desc: "+4% 伤害/级",
      apply: (m, lv) => { m.dmgMul += 0.04 * lv; } },
    { id: "m_rof", name: "枪械保养", max: 5, cost: (lv) => 80 + 50 * lv, desc: "+3% 射速/级",
      apply: (m, lv) => { m.rofMul += 0.03 * lv; } },
    { id: "m_speed", name: "体能训练", max: 5, cost: (lv) => 60 + 40 * lv, desc: "+2% 移速/级",
      apply: (m, lv) => { m.speedMul += 0.02 * lv; } },
    { id: "m_armor", name: "战术背心", max: 3, cost: (lv) => 120 + 60 * lv, desc: "+1 初始护甲/级",
      apply: (m, lv) => { m.armorAdd += 1 * lv; } },
    { id: "m_magnet", name: "磁力手套", max: 3, cost: (lv) => 60 + 40 * lv, desc: "+15% 拾取范围/级",
      apply: (m, lv) => { m.magnetMul += 0.15 * lv; } },
    { id: "m_xp", name: "生存激素", max: 3, cost: (lv) => 100 + 60 * lv, desc: "+5% 经验/级",
      apply: (m, lv) => { m.xpMul += 0.05 * lv; } },
    { id: "m_start", name: "老兵背包", max: 2, cost: (lv) => 200 + 120 * lv, desc: "起始武器等级 +1/级",
      apply: (m, lv) => { m.startWeaponLevel += lv; } },
    { id: "m_crit", name: "致命训练", max: 3, cost: (lv) => 120 + 70 * lv, desc: "+3% 暴击/级",
      apply: (m, lv) => { m.critAdd += 0.03 * lv; } },
    { id: "m_revive", name: "应激针剂", max: 1, cost: () => 300, desc: "每局复活一次（50% 生命）",
      apply: (m, lv) => { m.revive += lv; } },
    { id: "m_reroll", name: "战术预案", max: 2, cost: (lv) => 150 + 100 * lv, desc: "每局 +1 次三选一刷新（F 键）",
      apply: (m, lv) => { m.rerolls += lv; } },
  ];

  /* ---------- 成就 ---------- */
  const ACHIEVEMENTS = [
    { id: "first_kill", name: "第一滴血", desc: "完成第一次击杀", check: (p) => p.stats.totalKills >= 1 },
    { id: "run_100", name: "清道夫", desc: "单局击杀 100 只丧尸", check: (p) => p.stats.bestRunKills >= 100 },
    { id: "run_400", name: "尸潮粉碎机", desc: "单局击杀 400 只丧尸", check: (p) => p.stats.bestRunKills >= 400 },
    { id: "win_first", name: "幸存者", desc: "首次通关任意地图", check: (p) => p.stats.wins >= 1 },
    { id: "win_nightmare", name: "噩梦终结者", desc: "以噩梦难度通关一次", check: (p) => (p.stats.nightmareWins || 0) >= 1 },
    { id: "weapon_max", name: "满配火力", desc: "把任意武器升到 5 级", check: (p) => (p.stats.bestWeaponLevel || 0) >= 5 },
    { id: "serum_1000", name: "血清银行", desc: "累计获得 1000 血清", check: (p) => p.stats.serumTotal >= 1000 },
    { id: "nohit_3", name: "干净利落", desc: "无伤通过前 3 波", check: (p) => (p.stats.flags && p.stats.flags.nohit3) },
    { id: "combo_50", name: "行刑者", desc: "单局达成 50 连杀", check: (p) => p.stats.bestCombo >= 50 },
    { id: "curse_win", name: "与魔共舞", desc: "带着任意契约通关一次", check: (p) => (p.stats.curseWins || 0) >= 1 },
    { id: "intel_10", name: "档案管理员", desc: "收集 10 条情报日志", check: (p) => Object.keys(p.intel || {}).length >= 10 },
    { id: "story_all", name: "全城尾声", desc: "收录 5 张地图的全部尾声", check: (p) => MAPS.every((m) => p.endings && p.endings[m.id]) },
  ];

  /* ---------- 契约（风险收益：开战前选择，直接拉高难度换收益） ---------- */
  const CURSES = [
    { id: "none", name: "无契约", risk: 0, desc: "标准难度，标准收益。",
      mods: {} },
    { id: "flesh", name: "血肉契约", risk: 1, desc: "生命上限 -30%，血清收益 +35%。命换钱。",
      mods: { maxHpMul: 0.7, serumMul: 1.35 } },
    { id: "tide", name: "狂潮契约", risk: 2, desc: "敌人数量 +35%，经验 +25%，血清 +15%。",
      mods: { spawnMul: 1.35, xpMul: 1.25, serumMul: 1.15 } },
    { id: "veil", name: "暗影契约", risk: 2, desc: "视野陷入黑暗（手电范围减半），敌人速度 +12%，血清 +30%。",
      mods: { darkAdd: 0.45, lightMul: 0.5, speedMul: 1.12, serumMul: 1.3 } },
  ];

  /* ---------- 武器进化（该武器满级 + 指定强化达标 → 自动进化） ---------- */
  const EVOLUTIONS = [
    { weapon: "pistol", req: "w_crit", reqLv: 3, name: "圣裁者", color: "#ffe9a0", sfx: "crit",
      desc: "穿透 +2；20% 概率触发圣裁（三重伤害）",
      apply: (b) => { b.pierce = (b.pierce || 0) + 2; b.holyCrit = 0.2; } },
    { weapon: "shotgun", req: "w_burn", reqLv: 1, name: "龙息霰弹", color: "#ffb46e", sfx: "boom",
      desc: "弹丸 +3，必定点燃，击退强化",
      apply: (b) => { b.pellets = (b.pellets || 0) + 3; b.alwaysBurn = 1; b.knock = (b.knock || 0) + 120; } },
    { weapon: "smg", req: "w_freeze", reqLv: 1, name: "霜冻风暴", color: "#9fe4ff", sfx: "reload",
      desc: "必定减速，弹匣 +50%",
      apply: (b) => { b.alwaysFreeze = 1; b.magMul = (b.magMul || 1) * 1.5; } },
    { weapon: "rifle", req: "w_pierce", reqLv: 2, name: "反器材步枪", color: "#c8ff9a", sfx: "railgun",
      desc: "穿透 +2，命中触发轻型爆炸",
      apply: (b) => { b.pierce = (b.pierce || 0) + 2; b.explode = 72; } },
    { weapon: "flamer", req: "t_ammo", reqLv: 1, name: "地狱火", color: "#ff7a3c", sfx: "boom",
      desc: "火焰范围 +45%，燃烧更狠",
      apply: (b) => { b.flameR = (b.flameR || 1) * 1.45; b.burnPlus = 1; } },
    { weapon: "railgun", req: "w_dmg", reqLv: 3, name: "天罚", color: "#b48fff", sfx: "boom",
      desc: "命中大范围爆炸，伤害 +25%",
      apply: (b) => { b.explode = 160; b.dmgMul = (b.dmgMul || 1) * 1.25; } },
  ];

  /* ---------- 精英词条（精英丧尸随机携带 1-2 条） ---------- */
  const AFFIXES = [
    { id: "berserk", name: "狂暴", color: "#ff6b4a", desc: "速度 +35%，伤害 +15%" },
    { id: "shielded", name: "护盾", color: "#6bb4ff", desc: "受到伤害 -30%" },
    { id: "regen", name: "再生", color: "#6bff9a", desc: "每秒回复 2 点生命" },
    { id: "toxic", name: "剧毒", color: "#c9ff4a", desc: "死亡后留下毒池" },
  ];

  /* ---------- 剧情：人物 / 电台 / 情报日志 / 结局 ----------
     完整设定见 outputs/zombie-tide-survivors-story-bible.zh.md（可直接交给美术 / 配音 / 文案 agent） */
  const STORY = {
    protagonist: { defaultName: "流浪者", title: "零号幸存者" },
    characters: [
      { id: "owl", name: "老鸮", real: "沈戍", role: "灯塔电台台长 · 60 岁", side: "ally", unlock: "start",
        look: "旧呢帽、半张脸埋在围巾里、左手永远搭在电台旋钮上", palette: ["#c9a25a", "#4a5058", "#7a3a30"],
        bio: "前应急广播员。用播报腔掩饰心慌，爱说冷笑话；全场唯一的电台引导者，永远直接喊你的代号。" },
      { id: "man", name: "小满", real: "周满", role: "灯塔电工 · 17 岁", side: "ally", unlock: { map: "hospital" },
        look: "大号工装、身后挂一卷电线、右眼缠纱布", palette: ["#e07a45", "#e8dcc4", "#b87333"],
        bio: "话多、乐观、技术宅。负责波间播报与补给提示；会偷偷给清道队多留半份口粮。" },
      { id: "raven", name: "白鸦", real: "林令仪", role: "前军医 · 34 岁", side: "ally", unlock: { map: "subway" },
        look: "白大褂改的战术外套、总戴着耳机、眼神很冷", palette: ["#dfe6ea", "#5b8db8", "#8a2b2b"],
        bio: "冷静、专业、偶尔毒舌。低血量与医疗播报：\"你自己止血，我够不着你。\"" },
      { id: "anvil", name: "铁砧", real: "郝峦", role: "铁砧残部中士 · 41 岁", side: "ally", unlock: { map: "base" },
        look: "沾泥战术背心、头盔上一道黑杠、左臂是自制机械钩", palette: ["#5e7a3c", "#b7a678", "#2b2b26"],
        bio: "寡言、固执，只相信弹药和距离。与暴君（前指挥官）有旧账未清。" },
      { id: "key", name: "囚徒 07", real: "钥匙", role: "铁壁监狱幸存者 · 年龄不详", side: "ally", unlock: { map: "prison" },
        look: "囚服改的短打、脖子上挂几十把钥匙、腕上纹着 07", palette: ["#c96a2b", "#3a3f47", "#c9a23c"],
        bio: "话痨、滑不留手，但讲义气。在管道口留下标记，指出通往研究所的路。" },
      { id: "butcher", name: "屠戈", real: "屠夫", role: "圣玛丽医院外科主任（变异体）", side: "enemy", unlock: { boss: "butcher" },
        look: "血渍手术服、变形听诊器、右手骨化成锯刃", palette: ["#7a2b2b", "#3c5a4a", "#d9d2c0"],
        bio: "偏执的救世信念——\"切开才能治愈\"。他喊的每一句\"下一个\"，都是在叫病人的号。" },
      { id: "shen", name: "沈副所长", real: "母巢", role: "研究所副所长（变异体）", side: "enemy", unlock: { boss: "hive" },
        look: "半融进肉团的实验服，胸前识别卡上的\"沈\"字被血浸透", palette: ["#5fd4b8", "#4a3a2c", "#8a5aa0"],
        bio: "平静、学者式的冷酷，把尸潮称为\"交付\"。它仍在等一个签名。" },
      { id: "tyrant", name: "铁砧-00", real: "暴君", role: "基地指挥官（变异体）", side: "enemy", unlock: { boss: "tyrant" },
        look: "被撑裂的军官制服、肩章扭曲、脊柱外露成棱刺", palette: ["#5a6470", "#6a4a3a", "#c9b03c"],
        bio: "服下实验血清后被改造成猎杀机器，仍能下达军令——把屠杀称为\"列队\"。" },
    ],
    radio: {
      waveStart: [
        "{name}，尸潮动了。第 {wave} 波，收线前把街道清干净。",
        "听得到吗 {name}？它们在往你那边聚——老规矩，别站着不动。",
        "第 {wave} 波。你这儿的动静，我在灯塔都听得见枪声。",
        "{name}，潮头过来了。要是撑不住，就往开阔地跑。",
        "电台信号有点糊。{name}，回我一句就行，一个字就行。",
        "第 {wave} 波。我把发电机的转速调低了，省点电给你的频道。",
        "{name}，别数它们。数弹药。",
        "灯塔这边下雨了。雨能盖住血腥味——只盖一小会儿。",
        "{name}，小满把你那份口粮又加了半勺。别浪费。",
        "这一波密度高。{name}，先清侧翼，别被包圆。",
        "{name}，我听见尖叫了。那种会喊人的东西，先打它。",
        "第 {wave} 波。撑过这一波，我给你换首歌。",
      ],
      mapIntro: {
        hospital: [
          "第一站：圣玛丽医院。事故当天，第一批人是在这儿被咬的。{name}，进门之前，先喘口气。",
          "医院灯还亮着几盏。别信灯——信你的耳朵。",
        ],
        subway: [
          "地铁隧道。末班车没出去。{name}，注意汽笛，那玩意儿不是来接人的。",
          "断电的车厢里全是它们。站台广播还在循环——听清了吗？请等候下一班。",
        ],
        base: [
          "军事基地。铁砧的人在这儿守过——守到只剩子弹。{name}，别指望补给箱是满的。",
          "{name}，基地的探照灯还能转。那是自动的，不是友军。",
        ],
        prison: [
          "铁壁监狱。囚犯和守卫，最后一夜一起变了。{name}，走廊窄，别恋战。",
          "{name}，监狱下面有管道。钥匙那家伙说，管子一直通到研究所——记住这句话。",
        ],
        lab: [
          "到了。{name}，一切的起点。你把方舟的档案带出来，灯塔就能撑过这个冬天。",
          "{name}，这栋楼里没有幸存者。别听见人声就回头。",
        ],
      },
      elite: [
        "{name}，那个个头不对——是多重变异体。绕它背后。",
        "精英在附近。它比普通货色更快、更硬，也更值钱。",
        "{name}，别硬碰。先清小怪，再收拾它。",
      ],
      boss: {
        hospital: [
          "【老鸮】{name}，我听见手术刀的声音了。小心。",
          "【屠夫】别动。这是手术。{name}——你是今天第一台。",
          "【白鸦】他要拿你开刀。那就先拆了他的手。",
        ],
        subway: [
          "【老鸮】{name}，是铁砧-00。他还在下军令。",
          "【暴君】列队。{name}——你被点名了。",
          "【白鸦】他的光束是三百六十度扫的。贴着光轴切线跑。",
        ],
        base: [
          "【老鸮】{name}，是铁砧-00。他还在下军令。",
          "【暴君】列队。{name}——你被点名了。",
          "【白鸦】他的光束是三百六十度扫的。贴着光轴切线跑。",
        ],
        prison: [
          "【老鸮】{name}，我听见手术刀的声音了。小心。",
          "【屠夫】别动。这是手术。{name}——你是今天第一台。",
          "【白鸦】他要拿你开刀。那就先拆了他的手。",
        ],
        lab: [
          "【老鸮】{name}，里面那个……还在写字。它说它在\"交付\"。",
          "【母巢】别急着走——样本，你还没签字。",
          "【白鸦】别站在毒里。你死得太脏，我不好写记录。",
        ],
      },
      lowHp: [
        "{name}！你的心率我听得到。找掩体！",
        "别死。我这儿已经没有多余的镇痛剂了。",
        "{name}，撤半格，喘两口气。它们不会等你，但我会。",
        "撑住。你的名字我还没写进阵亡名单——我不打算写。",
      ],
      waveClear: [
        "干净。{name}，趁这口气，把地上的东西捡了。",
        "小满把你的补给算好了，比你需要的多半份。",
        "{name}，我在电台上给你记着数呢。别让我记太快。",
      ],
      victory: {
        hospital: "医院清了。{name}，屠戈的怀表里夹着一张研究所门禁卡——你带回来了。",
        subway: "隧道清了。广播录音里提了\"方舟\"两次——{name}，那不是巧合。",
        base: "基地清了。指挥官的军牌上刻着一个\"沈\"字。{name}，有个姓沈的还在研究所。",
        prison: "监狱清了。钥匙说得没错，管道通向研究所。{name}，最后一段路了。",
        lab: "{name}……你出来了。灯塔的发电机还能撑三天。三天，够我们活一次。",
      },
      defeat: [
        "{name}？……{name}，回话。……好吧。我把你的频道留着，一直留着。",
        "灯塔呼叫清道队……频道静默。今晚我们不关电台。",
        "这里是灯塔。{name} 走完了他的路。如果有人还能听见——接着往前走。",
      ],
    },
    intel: [
      { id: "h1", map: "hospital", title: "分诊记录", body: "3 号床，男性，32 岁，咬伤二十分钟内完成转化。备注栏被划掉三次，最后写着：不要再做分类了，来不及。" },
      { id: "h2", map: "hospital", title: "值班表", body: "夜班护士的名字被红笔圈了两个。旁边的字迹很轻：她们两个是我见过唯一没哭的。" },
      { id: "h3", map: "hospital", title: "转诊单", body: "转出机构一栏填的是「德里菲尔德研究所·方舟项目」。签字医生：屠戈。日期是爆发前二十二天。" },
      { id: "h4", map: "hospital", title: "手术日志", body: "最后一页只有一行字——切开，缝合，切开，缝合。他到底想救谁？（字迹不属于屠戈。）" },
      { id: "s1", map: "subway", title: "疏散命令", body: "编号 4471：列车在隧道待命，不得开启车门。签发时间比断电早四十分钟。" },
      { id: "s2", map: "subway", title: "列车时刻", body: "末班车 23:40 发出，之后全是手写补记：23:52 收到汽笛；00:10 还在响。" },
      { id: "s3", map: "subway", title: "乘客留言", body: "贴在车窗内侧的便签：如果我变了，别开门。我叫陈默，我对不起我妈。" },
      { id: "s4", map: "subway", title: "司机日志", body: "最后一条录音转录：车厢里有小孩在唱歌。我知道那不对。可那是这趟车上唯一像活着的声音。" },
      { id: "b1", map: "base", title: "封锁令", body: "第 7 条：对越线者无警告开火。纸角被反复揉过。" },
      { id: "b2", map: "base", title: "弹药清单", body: "实际存量比账面少四成。备注：指挥部的命令是先报满，再想办法。" },
      { id: "b3", map: "base", title: "家书", body: "未寄出。爸，我把津贴都存着。别信新闻，别出门。——铁砧-07" },
      { id: "b4", map: "base", title: "指挥记录", body: "铁砧-00 今天又提了一次「血清方案」。我说那玩意儿没通过伦理审查。他说，现在没有伦理，只有防线。" },
      { id: "p1", map: "prison", title: "值班簿", body: "B 区囚室 7 号被划掉，旁边写「已移交」。移交对象一栏空白。" },
      { id: "p2", map: "prison", title: "越狱计划", body: "路线图画在烟盒背面，终点画着一扇门，门上写着「研究所专用」。" },
      { id: "p3", map: "prison", title: "囚室留言", body: "刻在墙上的字：他们说要给我们「更好的身体」。我这身体就挺好。" },
      { id: "p4", map: "prison", title: "管道图", body: "官用图纸，标注「排水干线→研究所 B2 层」。边角有新鲜的指纹。" },
      { id: "l1", map: "lab", title: "项目纲要", body: "方舟计划目标：以 P-7 实现阵亡士兵的战场再动员。伦理否决栏签着两个名字，其中一个后来被涂掉了。" },
      { id: "l2", map: "lab", title: "实验记录", body: "第 61 次试验，受试者仍保留语言能力，会重复一句话：我什么时候回家。" },
      { id: "l3", map: "lab", title: "伦理否决", body: "正式的否决意见，理由一栏只有一句：我们不是要把死人变成士兵，我们是要拦住死人。" },
      { id: "l4", map: "lab", title: "最后一条日志", body: "沈副所长：今天起我不再记录数字，只记录交付。第 0 号样本还差一次签字。灯塔的无线电太吵了。" },
    ],
    endings: {
      hospital: "屠戈躺在自己搭的手术台上，听诊器垂到血里。{name}摘下了他的怀表——里面夹着一张研究所门禁卡。医院清了，但清单上还差十九个名字。",
      subway: "列车里的广播终于断了。{name}在司机台上找到最后一段录音，里面提到「方舟」两次。隧道清了，回声还在。",
      base: "暴君的军牌上刻着一个「沈」字。{name}把军牌收进口袋，忽然明白灯塔和研究所之间，只隔着一个人的名字。",
      prison: "管道口的标记还在，油漆是新刷的。钥匙说得没错：管子一直通到研究所。{name}把地图折好，最后一段路开始变得清晰。",
      lab: "{name}抱着档案袋走出 B2 层。身后，培养舱的指示灯一盏一盏灭了，像谁终于关掉了一整层的灯。",
    },
    endingTrue: {
      normal: "三个月后，灯塔的发电机还在转。老鸮念完了最后一份情报，把话筒推给{name}——「从今天起，你来播报。」频道那头，有人在回应。",
      nightmare: "{name}在方舟项目组的签字栏上写下自己的代号，然后关上了 B2 层的气密门。灯塔的电台上，老鸮把频率拨到空白段，什么也没说——有些故事，得由活着的人替它安静。",
    },
  };

  /* ---------- 波次 ---------- */
  function waveScaling(wave, diff) {
    return {
      hp: (1 + 0.18 * (wave - 1)) * diff.hpMul,
      dmg: (1 + 0.08 * (wave - 1)) * diff.dmgMul,
      speed: (1 + 0.008 * (wave - 1)) * diff.speedMul * (wave >= 12 ? 1.08 : 1),
    };
  }

  function waveComposition(map, wave, rng) {
    const n = Math.round(GAME.waveCount(wave) * 1);
    const entries = [];
    for (const type of Object.keys(map.pool)) {
      let w = map.pool[type];
      if (wave <= 2 && (type === "brute" || type === "screamer")) w = 0;
      else if (wave <= 4 && (type === "brute" || type === "screamer")) w *= 0.35;
      if (wave <= 3 && (type === "walker" || type === "runner")) w *= 1.6;
      entries.push({ key: type, w });
    }
    const comp = {};
    for (let i = 0; i < n; i++) {
      const t = U.weightedPick(rng, entries).key;
      comp[t] = (comp[t] || 0) + 1;
    }
    const out = Object.keys(comp).map((type) => ({ type, count: comp[type], elite: false }));
    if (wave === 5) {
      out.push({ type: "runner", count: 2, elite: true });
      out.push({ type: "brute", count: 1, elite: true });
    } else if (wave === 10) {
      out.push({ type: "screamer", count: 1, elite: true });
      out.push({ type: "brute", count: 2, elite: true });
    }
    /* 中期开始，每波额外混入精英（压迫感与掉落价值同步提升）；10 波前不投装甲精英，避免纯血量墙 */
    if (wave >= 7 && wave !== 10) {
      const pool = Object.keys(map.pool).filter((t) => wave >= 10 || t !== "brute");
      const t = pool[Math.floor(rng() * pool.length)];
      out.push({ type: t, count: wave >= 12 ? 2 : 1, elite: true });
    }
    return out;
  }

  /* ---------- 查询辅助 ---------- */
  const byId = (arr) => {
    const m = {};
    for (const it of arr) m[it.id] = it;
    return m;
  };
  const mapById = byId(MAPS);
  const metaById = byId(META);
  const upgradeById = byId(UPGRADES);
  const diffById = byId(DIFFICULTIES);
  const enemyById = Object.assign(byId(Object.values(ENEMIES)), byId(Object.values(BOSSES)));

  function isMapUnlocked(profile, mapId) {
    const map = mapById[mapId];
    if (!map) return false;
    if (!map.unlock) return true;
    return !!(profile && profile.stats && profile.stats.clearedMaps && profile.stats.clearedMaps[map.unlock.map]);
  }
  function isDiffUnlocked(profile, diffId) {
    if (diffId !== "nightmare") return true;
    return !!(profile && profile.stats && profile.stats.nightmareUnlocked);
  }
  function isEndlessUnlocked(profile) {
    return !!(profile && profile.stats && profile.stats.endlessUnlocked);
  }

  window.ZTS.data = {
    GAME, PLAYER, WEAPONS, START_WEAPON, WEAPON_ORDER, ENEMIES, BOSSES, MAPS,
    DIFFICULTIES, UPGRADES, META, ACHIEVEMENTS, CURSES, EVOLUTIONS, AFFIXES, STORY,
    waveScaling, waveComposition,
    mapById, metaById, upgradeById, diffById, enemyById,
    isMapUnlocked, isDiffUnlocked, isEndlessUnlocked,
  };
})();
