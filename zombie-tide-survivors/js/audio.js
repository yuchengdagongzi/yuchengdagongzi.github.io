/* 音频层：WebAudio 实时合成，零音频文件。 */
window.ZTS = window.ZTS || {};
(function () {
  let ctx = null, masterG = null, sfxG = null, musicG = null;
  let noiseBuf = null;
  let started = false;
  let settings = { master: 0.8, sfx: 0.9, music: 0.45 };
  const lastPlayed = {};
  let musicNodes = null;
  let intensity = 0;

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    masterG = ctx.createGain();
    masterG.gain.value = settings.master;
    masterG.connect(ctx.destination);
    sfxG = ctx.createGain(); sfxG.gain.value = settings.sfx; sfxG.connect(masterG);
    musicG = ctx.createGain(); musicG.gain.value = settings.music; musicG.connect(masterG);

    const len = Math.floor(ctx.sampleRate * 1.2);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  function resume() {
    init();
    if (ctx && ctx.state === "suspended") ctx.resume();
    started = true;
  }

  function setSettings(s) {
    Object.assign(settings, s || {});
    if (masterG) masterG.gain.value = settings.master;
    if (sfxG) sfxG.gain.value = settings.sfx;
    if (musicG) musicG.gain.value = settings.music;
  }

  function now() { return ctx ? ctx.currentTime : 0; }

  function tone(type, f0, f1, dur, vol, opts) {
    if (!ctx) return;
    const t = now() + ((opts && opts.delay) || 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(1, f0), t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + Math.min(0.012, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (opts && opts.pan !== undefined && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, opts.pan));
      o.connect(g); g.connect(p); p.connect(opts.bus || sfxG);
    } else {
      o.connect(g); g.connect((opts && opts.bus) || sfxG);
    }
    o.start(t); o.stop(t + dur + 0.02);
    return node;
  }

  function noise(dur, vol, opts) {
    if (!ctx) return;
    const t = now() + ((opts && opts.delay) || 0);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = (opts && opts.filter) || "lowpass";
    f.frequency.setValueAtTime((opts && opts.f0) || 1200, t);
    if (opts && opts.f1) f.frequency.exponentialRampToValueAtTime(Math.max(40, opts.f1), t + dur);
    f.Q.value = (opts && opts.q) || 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + ((opts && opts.attack) || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g);
    if (opts && opts.pan !== undefined && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, opts.pan));
      g.connect(p); p.connect((opts && opts.bus) || sfxG);
    } else {
      g.connect((opts && opts.bus) || sfxG);
    }
    src.start(t); src.stop(t + dur + 0.02);
  }

  const SFX = {
    pistol: (o) => { noise(0.09, 0.5, { f0: 3200, f1: 400, q: 1.2, pan: o.pan }); tone("square", 220, 60, 0.07, 0.18, { pan: o.pan }); },
    shotgun: (o) => { noise(0.22, 0.75, { f0: 2200, f1: 180, q: 1.0, pan: o.pan }); tone("sine", 130, 40, 0.18, 0.3, { pan: o.pan }); },
    smg: (o) => { noise(0.05, 0.32, { f0: 4200, f1: 900, q: 1.5, pan: o.pan }); },
    rifle: (o) => { noise(0.12, 0.5, { f0: 2800, f1: 320, q: 1.1, pan: o.pan }); tone("square", 180, 70, 0.08, 0.14, { pan: o.pan }); },
    flamer: (o) => { noise(0.16, 0.3, { filter: "bandpass", f0: 700 + Math.random() * 400, q: 0.9, pan: o.pan }); },
    railgun: (o) => { tone("sawtooth", 1800, 120, 0.22, 0.24, { pan: o.pan }); noise(0.2, 0.42, { filter: "highpass", f0: 300, pan: o.pan }); },
    reload: (o) => { noise(0.04, 0.3, { f0: 2600, f1: 1400, q: 2, pan: o.pan }); noise(0.05, 0.3, { f0: 1800, f1: 900, q: 2, delay: 0.16, pan: o.pan }); },
    hit: (o) => { noise(0.05, 0.4, { f0: 900, f1: 200, q: 0.9, pan: o.pan }); },
    crit: (o) => { noise(0.07, 0.5, { f0: 1400, f1: 300, pan: o.pan }); tone("sine", 900, 500, 0.08, 0.16, { pan: o.pan }); },
    zdie: (o) => { tone("sawtooth", 190 + Math.random() * 80, 55, 0.35, 0.22, { pan: o.pan }); noise(0.16, 0.3, { f0: 700, f1: 150, pan: o.pan }); },
    zgroan: (o) => { tone("sawtooth", 110 + Math.random() * 70, 70, 0.7, 0.1, { pan: o.pan }); },
    boom: (o) => { noise(0.5, 0.8, { f0: 900, f1: 60, pan: o.pan }); tone("sine", 150, 30, 0.45, 0.45, { pan: o.pan }); },
    spit: (o) => { noise(0.18, 0.3, { filter: "bandpass", f0: 500, q: 1.4, pan: o.pan }); },
    hurt: (o) => { noise(0.16, 0.5, { f0: 600, f1: 120, pan: o.pan }); tone("sawtooth", 200, 90, 0.16, 0.2, { pan: o.pan }); },
    dash: (o) => { noise(0.2, 0.35, { filter: "bandpass", f0: 900, f1: 2200, q: 0.7, pan: o.pan }); },
    pickup: (o) => { tone("triangle", 780, 1180, 0.09, 0.16, { pan: o.pan }); },
    serum: (o) => { tone("triangle", 900, 900, 0.07, 0.16); tone("triangle", 1350, 1350, 0.12, 0.14, { delay: 0.07 }); },
    medkit: (o) => { tone("sine", 520, 780, 0.3, 0.18); },
    grenade: (o) => { noise(0.14, 0.3, { f0: 1500, f1: 500, pan: o.pan }); },
    levelup: (o) => { tone("triangle", 520, 520, 0.35, 0.2); tone("triangle", 660, 660, 0.35, 0.18, { delay: 0.09 }); tone("triangle", 880, 880, 0.4, 0.16, { delay: 0.18 }); },
    buy: (o) => { tone("triangle", 620, 620, 0.1, 0.2); tone("triangle", 930, 930, 0.14, 0.18, { delay: 0.1 }); },
    deny: (o) => { tone("sawtooth", 180, 120, 0.18, 0.16); },
    click: (o) => { tone("square", 900, 700, 0.04, 0.08); },
    waveClear: (o) => { tone("sawtooth", 262, 262, 0.5, 0.12); tone("sawtooth", 330, 330, 0.5, 0.1, { delay: 0.12 }); tone("sawtooth", 392, 392, 0.7, 0.09, { delay: 0.24 }); },
    boss: (o) => { tone("sawtooth", 80, 40, 1.4, 0.4); tone("sawtooth", 120, 55, 1.4, 0.3, { delay: 0.05 }); noise(1.0, 0.25, { f0: 500, f1: 90 }); },
    train: (o) => { tone("sine", 640, 620, 0.5, 0.16); tone("sine", 780, 760, 0.5, 0.14, { delay: 0.05 }); noise(1.2, 0.28, { f0: 320, f1: 140 }); },
    alarm: (o) => { for (let i = 0; i < 3; i++) tone("square", 700, 420, 0.28, 0.14, { delay: i * 0.34 }); },
    victory: (o) => { [523, 659, 784, 1047].forEach((f, i) => tone("triangle", f, f, 0.5, 0.16, { delay: i * 0.13 })); },
    defeat: (o) => { [330, 262, 208, 165].forEach((f, i) => tone("sawtooth", f, f * 0.96, 0.6, 0.12, { delay: i * 0.18 })); },
    heartbeat: (o) => { tone("sine", 70, 50, 0.12, 0.5); tone("sine", 65, 45, 0.1, 0.35, { delay: 0.18 }); },
    turret: (o) => { noise(0.05, 0.22, { f0: 3000, f1: 800, pan: o.pan }); },
  };

  const MIN_GAP = { hit: 0.03, zdie: 0.045, zgroan: 0.25, pistol: 0.04, smg: 0.035, flamer: 0.06, pickup: 0.04, serum: 0.06, spit: 0.1, tick: 0.2 };

  function sfx(name, opts) {
    if (!ctx || !started) return;
    const fn = SFX[name];
    if (!fn) return;
    const gap = MIN_GAP[name] || 0;
    const t = ctx.currentTime;
    if (gap && lastPlayed[name] && t - lastPlayed[name] < gap) return;
    lastPlayed[name] = t;
    try { fn(opts || {}); } catch (e) { /* 音频失败不影响游戏 */ }
  }

  /* 氛围音乐：低频长音 + 缓慢脉冲，随波次提升强度 */
  function startMusic() {
    if (!ctx || musicNodes) return;
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.value = 0.16;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = 420; f.Q.value = 4;
    const o1 = ctx.createOscillator(); o1.type = "sawtooth"; o1.frequency.value = 55;
    const o2 = ctx.createOscillator(); o2.type = "sawtooth"; o2.frequency.value = 55.7;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.06;
    const lfoG = ctx.createGain(); lfoG.gain.value = 140;
    lfo.connect(lfoG); lfoG.connect(f.frequency);
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(musicG);
    o1.start(t); o2.start(t); lfo.start(t);
    musicNodes = { g, o1, o2, lfo, f };
    musicG.gain.value = settings.music * 0.7;
  }

  function stopMusic() {
    if (!musicNodes) return;
    try {
      musicNodes.o1.stop(); musicNodes.o2.stop(); musicNodes.lfo.stop();
    } catch (e) { /* noop */ }
    musicNodes = null;
  }

  function setIntensity(v) {
    intensity = v;
    if (musicNodes) {
      musicNodes.f.frequency.value = 380 + v * 320;
      musicNodes.g.gain.value = 0.13 + v * 0.08;
    }
  }

  window.ZTS.Audio = { init, resume, sfx, setSettings, startMusic, stopMusic, setIntensity,
    get intensity() { return intensity; } };
})();
