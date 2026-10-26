/* ============================================================
   VOICE BOX · Oct 25 2026
   A little neon dashboard that lights up when something talks: mirrored stacks of LED segments,
   cyan at the bottom fading to magenta at the top, tallest in the middle, driven by an AnalyserNode.
   Idle it breathes three dim dots. One canvas (256 x 80) on a plane; redrawn at most 30 times a second
   and only while the level is moving. Works in VR (it is just a mesh).
   makeVoiceBox({ w, h, bars }) -> { mesh, setSource(analyser | null), level(), update(t) }
   ============================================================ */
import * as THREE from 'three';
const T = THREE;

export function makeVoiceBox(o = {}) {
  const w = o.w || 0.5, h = o.h || w * 0.31, N = o.bars || 9, SEG = 7, PW = 256, PH = 80;
  const c = document.createElement('canvas'); c.width = PW; c.height = PH; const g = c.getContext('2d');
  const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace; tex.generateMipmaps = false; tex.minFilter = T.LinearFilter;
  const mesh = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false, side: T.DoubleSide }));
  mesh.renderOrder = 5; mesh.userData.noOcclude = true; mesh.userData.noCull = true; mesh.frustumCulled = false;
  let an = null, buf = null, last = -1, drawn = '', idleT = -1;
  const lv = new Float32Array(N), pk = new Float32Array(N);
  const segCol = (k) => { const f = k / (SEG - 1); const r = Math.round(56 + (255 - 56) * f), gg = Math.round(240 - (240 - 79) * f), b = Math.round(255 - (255 - 216) * f); return `rgb(${r},${gg},${b})`; };
  const frame = () => { g.clearRect(0, 0, PW, PH); g.fillStyle = 'rgba(6,12,32,0.82)'; g.beginPath(); g.roundRect(2, 2, PW - 4, PH - 4, 14); g.fill(); g.strokeStyle = 'rgba(56,240,255,0.55)'; g.lineWidth = 2; g.stroke(); };
  function draw(t) {
    frame(); const bw = (PW - 40) / N, sh = (PH - 22) / SEG;
    let any = 0; for (let i = 0; i < N; i++) any = Math.max(any, lv[i]);
    if (any < 0.04) { /* idle: three slow dots */ for (let k = 0; k < 3; k++) { const a = 0.25 + 0.2 * Math.sin(t * 2 + k * 1.3); g.fillStyle = `rgba(56,240,255,${a})`; g.beginPath(); g.arc(PW / 2 + (k - 1) * 22, PH / 2, 5, 0, 6.283); g.fill(); } return; }
    g.shadowBlur = 8;
    for (let i = 0; i < N; i++) {
      const on = Math.round(lv[i] * SEG), x = 20 + i * bw + 3;
      for (let k = 0; k < SEG; k++) {
        const lit = k < on, col = segCol(k), y = PH - 11 - (k + 1) * sh + 2;
        g.shadowColor = lit ? col : 'transparent'; g.fillStyle = lit ? col : 'rgba(56,240,255,0.08)'; g.fillRect(x, y, bw - 6, sh - 3);
      }
      const p = Math.min(SEG - 1, Math.round(pk[i] * SEG)); if (p > on) { g.shadowColor = '#fff'; g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(x, PH - 11 - (p + 1) * sh + 2, bw - 6, 2); }
    }
    g.shadowBlur = 0;
  }
  const api = {
    mesh,
    setSource(a) { an = a || null; buf = an ? new Uint8Array(an.frequencyBinCount) : null; },
    level() { let s = 0; for (let i = 0; i < N; i++) s += lv[i]; return s / N; },
    update(t) {
      if (t - last < 1 / 30) return; last = t;
      if (an) { an.getByteFrequencyData(buf); const sr = an.context.sampleRate, hz = sr / 2 / buf.length; const half = Math.ceil(N / 2);
        for (let j = 0; j < half; j++) { /* speech bands 250 Hz .. 3.2 kHz, log spaced; the middle bars get the low (loudest) bands */
          const f0 = 250 * Math.pow(12.8, j / half), f1 = 250 * Math.pow(12.8, (j + 1) / half); let s = 0, n = 0; for (let b = Math.floor(f0 / hz); b <= Math.ceil(f1 / hz) && b < buf.length; b++) { s += buf[b]; n++; }
          const v = Math.min(1, Math.max(0, (s / Math.max(1, n) / 255 - 0.18) * 1.9)); const m = Math.floor(N / 2);
          for (const i of [m - j, m + j]) if (i >= 0 && i < N) { lv[i] = Math.max(v, lv[i] * 0.72); pk[i] = Math.max(lv[i], pk[i] - 0.03); } }
      } else for (let i = 0; i < N; i++) { lv[i] *= 0.7; pk[i] = Math.max(lv[i], pk[i] - 0.05); }
      const key = Array.from(lv, (v) => Math.round(v * SEG)).join('') + Array.from(pk, (v) => Math.round(v * SEG)).join('');
      const idle = !/[1-9]/.test(key); /* idle dots breathe at 4 fps; a lit box redraws only when a segment changes */
      if (key === drawn && !(idle && t - idleT > 0.25)) return;
      if (idle) idleT = t; drawn = key; draw(t); tex.needsUpdate = true;
    },
  };
  draw(0); tex.needsUpdate = true;
  return api;
}
