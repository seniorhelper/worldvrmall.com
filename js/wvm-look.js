/* World VR Mall look layer (2026-11-23): what the world looks like in a headset.
   - round particles: a PointsMaterial with no map draws hard squares, very visible in a headset
   - VR fog that keeps colour: the VR layer pulls fog in to 40-240 m, which turned every building past ~60 m into a flat navy (night) or pale (day) cut-out
   - a sky dome for the 360° photo skies, so the mountain-lake photo's ridge sits above the island's horizon instead of under the ground
   - real stars at night: the 7,885 naked-eye stars of the HYG catalogue (data/night-stars.bin, CC BY-SA 4.0), drawn at the headset's own resolution over the night photo
   No per-frame allocations. Draw calls: the dome replaces the background draw; the stars add one draw at night. */
import { THREE } from '/js/wvm-engine.js?v=59';
const T = THREE;

/* ---------- 1. round particles (installed when this module loads, before any world is built) ---------- */
let ROUND = null;
const roundTex = () => {
  if (ROUND) return ROUND;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); ROUND = new T.CanvasTexture(c); ROUND.colorSpace = T.SRGBColorSpace; return ROUND;
};
try {
  const PM = T.PointsMaterial.prototype; if (!PM._wvmRound) { const sv = PM.setValues; PM._wvmRound = true;
    PM.setValues = function (v) { sv.call(this, v); if (!this.map && !(v && v.map)) { this.map = roundTex(); if (!this.transparent) this.alphaTest = Math.max(this.alphaTest || 0, 0.35); } }; }
} catch (e) { }

/* ---------- 2. VR fog that keeps colour ---------- */
/* Only replaces the VR layer's own 40/240 clamp; anything else that sets fog (the Orbit Deck, the reef, the arrival) is left alone. */
export function vrFog(app, near, far) {
  const R = app.renderer;
  app.onUpdate(() => { const f = app.scene.fog; if (!f || !R.xr.isPresenting) return; if (f.near === 40 && f.far === 240) { f.near = near; f.far = far; } });
}

/* VR draw distance for whole objects: the VR layer sets 220 m; an enclosed mall sees little past 140 m, but stores out there were still drawn (about half the mall's VR draw calls at the Grand Lobby). Only replaces the VR layer's 220; the VR layer puts the page's own value back on exit. */
export function vrCull(app, dist) {
  const R = app.renderer;
  app.onUpdate(() => { if (R.xr.isPresenting && app.opts.cullDist === 220) app.opts.cullDist = dist; });
}

/* ---------- 3. sky dome ---------- */
/* skies: { '/images/x': { lift: 0.075, gain: 1 } }: lift raises the photo's horizon (a fraction of the image height, 0.1 = 18°). */
export function skyDome(app, skies) {
  const geo = new T.SphereGeometry(1, 64, 32); geo.scale(-1, 1, 1);
  const mat = new T.MeshBasicMaterial({ color: 0xffffff, fog: false, toneMapped: false, depthWrite: false, depthTest: false });
  const dome = new T.Mesh(geo, mat); dome.name = 'sky-dome'; dome.renderOrder = -1000; dome.frustumCulled = false; dome.visible = false; dome.castShadow = false; dome.receiveShadow = false;
  Object.assign(dome.userData, { noCull: true, noShadow: true, noOcclude: true, mapHide: true, keepLOD: true, noCollide: true, noMerge: true, noBatch: true });
  dome.raycast = () => { };
  app.scene.add(dome);
  const clones = new Map(); let gain = 1;
  const use = (tex, cfg) => { let c = clones.get(tex); if (!c) { c = tex.clone(); c.mapping = T.UVMapping; c.wrapS = T.RepeatWrapping; c.wrapT = T.ClampToEdgeWrapping; c.offset.y = -(cfg.lift || 0); c.needsUpdate = true; clones.set(tex, c); } return c; };
  /* the photo's own colour just above the horizon, so distant buildings fade into the sky behind them (aerial perspective) instead of into a flat blue */
  const horizon = new Map();
  const horizonOf = (tex, cfg) => { if (horizon.has(tex)) return horizon.get(tex); let c = null; try { const im = tex.image, cv = document.createElement('canvas'); cv.width = 64; cv.height = 64; const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0, 64, 64); const v = 0.5 + 3 / 180 - (cfg.lift || 0), y = Math.max(0, Math.min(61, Math.round((1 - v) * 64) - 1)); const d = g.getImageData(0, y, 64, 3).data; let r = 0, gg = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; } const n = d.length / 4; c = new T.Color().setRGB(r / n / 255, gg / n / 255, b / n / 255, T.SRGBColorSpace); } catch (e) { } horizon.set(tex, c); return c; };
  const ap = app._applySky.bind(app);
  app._applySky = (tex, o) => {
    ap(tex, o); const cfg = skies[app.skyUrl];
    if (cfg && tex && tex.image) { mat.map = use(tex, cfg); mat.needsUpdate = true; gain = cfg.gain || 1; dome.visible = true; app.scene.background = null; const h = horizonOf(tex, cfg); if (h && app.scene.fog) app.scene.fog.color.lerp(h, cfg.fogMix ?? 0.7); }
    else dome.visible = false;
  };
  /* if the sky is already up (the first setSky ran inside the engine's constructor), move it onto the dome */
  try { const bg = app.scene.background; if (bg && bg.isTexture && skies[app.skyUrl]) app._applySky(bg); } catch (e) { }
  const cam = app.camera;
  app.onUpdate(() => {
    if (!dome.visible) return;
    cam.getWorldPosition(dome.position); dome.scale.setScalar(Math.min(700, cam.far * 0.8));
    const bi = app.scene.backgroundIntensity; mat.color.setScalar(gain * (bi === undefined ? 1 : bi)); /* the VR arrival fades the sky in with backgroundIntensity */
  });
  return dome;
}

/* ---------- 4. real stars ---------- */
const STAR_V = `attribute float aSize; varying vec3 vC; varying float vH; uniform float uScale;
void main(){ vC = color; vH = normalize(position).y; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); p.z = p.w * 0.99999; gl_Position = p; gl_PointSize = aSize * uScale; }`;
const STAR_F = `varying vec3 vC; varying float vH;
void main(){ vec2 d = gl_PointCoord - 0.5; float r2 = dot(d, d) * 4.0; float a = exp(-r2 * 4.0) * (1.0 - r2); if (a < 0.01) discard;
  float ext = smoothstep(-0.02, 0.16, vH); /* thicker air near the horizon: stars fade out as they set */
  gl_FragColor = vec4(vC * a * ext, 1.0);
  #include <colorspace_fragment>
}`;
const bvRGB = (bv, out) => { bv = Math.max(-0.4, Math.min(2, bv)); const t = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62)) / 100; let r, g, b;
  if (t <= 66) { r = 255; g = 99.47 * Math.log(t) - 161.12; } else { r = 329.7 * Math.pow(t - 60, -0.1332); g = 288.12 * Math.pow(t - 60, -0.0755); }
  b = t >= 66 ? 255 : t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04; r = Math.min(255, Math.max(0, r)) / 255; g = Math.min(255, Math.max(0, g)) / 255; b = Math.min(255, Math.max(0, b)) / 255;
  const m = Math.max(r, g, b, 1e-3); out[0] = 0.35 + 0.65 * r / m; out[1] = 0.35 + 0.65 * g / m; out[2] = 0.35 + 0.65 * b / m; return out; };

/* show(app) decides when the stars are up; lat = the observer's latitude in degrees (north is -Z). */
export function nightStars(app, url, show, lat = 39) {
  const R = 600; let pts = null;
  fetch(url).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }).then(buf => {
    const f = new Float32Array(buf), n = Math.floor(f.length / 4); if (!n) return;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), c3 = [0, 0, 0];
    const a = -(Math.PI / 2 - lat * Math.PI / 180), ca = Math.cos(a), sa = Math.sin(a);
    for (let i = 0; i < n; i++) {
      const ra = f[i * 4], dec = f[i * 4 + 1], mag = f[i * 4 + 2], bv = f[i * 4 + 3]; const cd = Math.cos(dec);
      const x = cd * Math.cos(ra), y = Math.sin(dec), z = -cd * Math.sin(ra); /* Y = celestial pole, then tilted down to the latitude */
      pos[i * 3] = x * R; pos[i * 3 + 1] = (y * ca - z * sa) * R; pos[i * 3 + 2] = (y * sa + z * ca) * R;
      const flux = Math.pow(10, -0.4 * mag); const bright = Math.min(1, 0.2 + 0.85 * Math.pow(flux, 0.33));
      bvRGB(bv, c3); col[i * 3] = c3[0] * bright; col[i * 3 + 1] = c3[1] * bright; col[i * 3 + 2] = c3[2] * bright;
      size[i] = Math.min(7, 2.1 + 3.2 * Math.sqrt(flux));
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('color', new T.BufferAttribute(col, 3)); g.setAttribute('aSize', new T.BufferAttribute(size, 1));
    const mat = new T.ShaderMaterial({ uniforms: { uScale: { value: 1 } }, vertexShader: STAR_V, fragmentShader: STAR_F, vertexColors: true, transparent: true, depthWrite: false, depthTest: true, blending: T.AdditiveBlending, fog: false });
    pts = new T.Points(g, mat); pts.name = 'night-stars'; pts.frustumCulled = false; pts.renderOrder = -900; pts.visible = false; pts.raycast = () => { };
    Object.assign(pts.userData, { noCull: true, noShadow: true, noOcclude: true, mapHide: true, keepLOD: true, noCollide: true, noMerge: true, noBatch: true });
    /* point size follows the pixels per degree of whatever draws it: a desktop canvas or one eye of the headset */
    const v2 = new T.Vector2();
    pts.onBeforeRender = (r, s, camera) => { let h; if (camera.viewport && camera.viewport.w) h = camera.viewport.w; else { r.getDrawingBufferSize(v2); h = v2.y; } const fov = 2 * Math.atan(1 / Math.max(0.05, camera.projectionMatrix.elements[5])); mat.uniforms.uScale.value = Math.max(0.6, Math.min(2.4, (h / (fov * 57.2958)) / 16)); };
    app.scene.add(pts);
  }).catch(() => { });
  const cam = app.camera;
  app.onUpdate(() => { if (!pts) return; const on = !!show(app); if (pts.visible !== on) pts.visible = on; if (on) cam.getWorldPosition(pts.position); });
}
