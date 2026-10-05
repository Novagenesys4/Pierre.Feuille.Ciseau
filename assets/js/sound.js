/* Moteur sonore 8-bit (Web Audio API) — aucun fichier audio. Usage : PFCSound.play('win') */
// Original 8-bit sound set (pulse + triangle channels), handheld-RPG flavour.
window.PFCSound = window.PFCSound || (function () {
  let ctx = null; const waves = {};
  const ac = () => {
    if (!ctx) { const A = window.AudioContext || window.webkitAudioContext; if (A) ctx = new A(); }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  };
  const pulse = (c, duty) => {
    const n = 32, re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k++) re[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    return c.createPeriodicWave(re, im);
  };
  const N = n => 440 * Math.pow(2, (n - 69) / 12);
  function note(f, start, dur, o) {
    o = o || {}; const c = ac(); if (!c) return;
    const type = o.type || 'p25', vol = o.vol || 0.07;
    const osc = c.createOscillator(), g = c.createGain();
    if (type[0] === 'p') { const d = { p12: 0.125, p25: 0.25, p50: 0.5 }[type]; waves[type] = waves[type] || pulse(c, d); osc.setPeriodicWave(waves[type]); }
    else osc.type = type;
    const t0 = c.currentTime + start;
    osc.frequency.setValueAtTime(f, t0);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(f * o.slide, t0 + dur);
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.004);
    g.gain.setValueAtTime(vol, t0 + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(c.destination); osc.start(t0); osc.stop(t0 + dur + 0.02);
  }
  const seq = (ns, step, o, at) => ns.forEach((n, i) => { if (n != null) note(N(n), (at || 0) + i * step, step * 0.92, o); });
  const S = {
    select() { note(N(84), 0, 0.045, { type: 'p12', vol: 0.05 }); note(N(91), 0.045, 0.07, { type: 'p12', vol: 0.05 }); },
    move() { note(N(79), 0, 0.04, { type: 'p12', vol: 0.045 }); },
    tick() { note(N(72), 0, 0.06, { type: 'p25', vol: 0.06 }); note(N(45), 0, 0.09, { type: 'triangle', vol: 0.16, slide: 0.5 }); },
    hit() { note(N(57), 0, 0.14, { type: 'triangle', vol: 0.2, slide: 0.35 }); note(N(96), 0, 0.03, { type: 'p12', vol: 0.04 }); },
    win() { S.hit(); seq([72, 76, 79, 84], 0.07, { type: 'p25', vol: 0.06 }, 0.08); seq([48, null, 55, 60], 0.07, { type: 'triangle', vol: 0.13 }, 0.08); },
    lose() { S.hit(); seq([67, 63, 58], 0.12, { type: 'p50', vol: 0.05 }, 0.08); note(N(43), 0.08, 0.36, { type: 'triangle', vol: 0.13, slide: 0.8 }); },
    draw() { S.hit(); seq([74, null, 74], 0.08, { type: 'p25', vol: 0.05 }, 0.08); },
    victory() {
      seq([67, 72, 76, 79, null, 76, 79, null, 84, null, null, null], 0.1, { type: 'p25', vol: 0.06 });
      seq([60, 64, 67, 72, null, 67, 72, null, 76], 0.1, { type: 'p12', vol: 0.035 });
      seq([48, null, 52, null, 55, null, 52, null, 48], 0.1, { type: 'triangle', vol: 0.13 });
    },
    defeat() {
      seq([71, 69, 67, 64, null, 60, null, null], 0.15, { type: 'p50', vol: 0.045 });
      seq([47, 45, 43, 40, null, 36], 0.15, { type: 'triangle', vol: 0.12 });
    },
  };
  return { play(name) { try { S[name] && S[name](); } catch (e) {} } };
})();
