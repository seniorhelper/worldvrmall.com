/* 🪐 ORBIT in 3D + VR (Oct 2026). The Feed's helper, now a real object in the world: a little moon-station that
   drifts at your right shoulder, never in front of you. Trench line, glowing dish eye with iris, two-lens glasses,
   a real smile, a slow halo of three counter-rotating rings, a comet trail of light motes, and his own light.
   Click / laser him → his knowledge panel (same intents as the Feed's Orbit), as an engine popup so it works in VR.
   Cheap: ~1,600 triangles, one point light, 120 particles. */
import { THREE } from './wvm-engine.js';
const T = THREE;
const PHONE = '1-800-481-8638';
const QA = [
  [/join|sign ?up|account|log ?in/i, 'Join free on the Feed at allofus.one — name, @username, email. Your house and character come with it.'],
  [/brand|business|page|seo|website|market/i, 'Brand pages run from your profile: allofus.one → Brand. Build it yourself, or the experts build it fully optimized in 24-48 hours. Call ' + PHONE + '.'],
  [/mall|store|shop|lease|product/i, 'World VR Mall: walk the hall, tap a storefront to visit the real store. Lease a store at worldvrmall.com/lease — set up in about ten minutes.'],
  [/coaster|ride|chiller|thrill/i, 'Rides: open the menu (Y in VR, map on screen) → Ride the coaster. Life-size on rides, always.'],
  [/vr|laser|menu|controller|turn|teleport|floor/i, 'VR: left stick walks, right stick turns, trigger clicks the laser, grip pulls you there, Y = menu, X = views, B = bug report. Raise / Lower my view fixes the floor.'],
  [/house|home|build|land|character|avatar/i, 'Your house: My house on the Feed, or the Customize button here for your character, land and home.'],
  [/hearts|dating|single|match/i, 'Hearts (18+): mind-first matching at allofus.one/hearts. Questions first, faces later, two yeses = a match.'],
  [/bug|broken|glitch|stuck/i, 'Press B in VR or tap the bug button on screen — one line is plenty, your position comes along. A person reads every report.'],
  [/human|phone|call|person|help/i, 'A real person answers ' + PHONE + '. We always try to pick up.'],
];
export function spawnOrbit(app, opts = {}) {
  if (app._orbit3d) return app._orbit3d;
  const g = new T.Group(); g.userData.noCull = true; g.userData.noOcclude = true; g.userData.noCollide = true; g.name = 'orbit3d';
  const shell = new T.MeshStandardMaterial({ color: 0x9aa7bf, roughness: 0.42, metalness: 0.55, envMapIntensity: 1.2 });
  const dark = new T.MeshStandardMaterial({ color: 0x1c2333, roughness: 0.6, metalness: 0.5 });
  const neon = new T.MeshStandardMaterial({ color: 0x38f0ff, emissive: 0x38f0ff, emissiveIntensity: 2.2, roughness: 0.3 });
  const body = new T.Mesh(new T.SphereGeometry(0.34, 40, 28), shell); g.add(body);
  /* trench */ const trench = new T.Mesh(new T.TorusGeometry(0.341, 0.012, 8, 72), dark); trench.rotation.x = Math.PI / 2; trench.position.y = -0.06; g.add(trench);
  const seam = new T.Mesh(new T.TorusGeometry(0.343, 0.003, 6, 72), neon); seam.rotation.x = Math.PI / 2; seam.position.y = -0.06; g.add(seam);
  /* the dish eye: recessed bowl, glowing iris, pupil */ const eye = new T.Group(); eye.position.set(-0.13, 0.12, 0.27); eye.lookAt(-0.6, 0.45, 1.6); g.add(eye);
  const bowl = new T.Mesh(new T.SphereGeometry(0.11, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), new T.MeshStandardMaterial({ color: 0x0b1a3a, roughness: 0.35, metalness: 0.7, side: T.BackSide })); bowl.rotation.x = -Math.PI / 2; eye.add(bowl);
  const iris = new T.Mesh(new T.CircleGeometry(0.075, 32), new T.MeshBasicMaterial({ color: 0x0ea5e9 })); iris.position.z = 0.02; eye.add(iris);
  const irisGlow = new T.Mesh(new T.RingGeometry(0.055, 0.085, 32), new T.MeshBasicMaterial({ color: 0x38f0ff, transparent: true, opacity: 0.7, blending: T.AdditiveBlending, depthWrite: false })); irisGlow.position.z = 0.021; eye.add(irisGlow);
  const pupil = new T.Mesh(new T.CircleGeometry(0.028, 24), new T.MeshBasicMaterial({ color: 0x0b1a3a })); pupil.position.z = 0.022; eye.add(pupil);
  const glint = new T.Mesh(new T.CircleGeometry(0.009, 12), new T.MeshBasicMaterial({ color: 0xffffff })); glint.position.set(0.02, 0.02, 0.023); eye.add(glint);
  /* glasses: two lenses + bridge + arms, sitting on the face */ const frame = new T.MeshStandardMaterial({ color: 0x14183a, roughness: 0.4, metalness: 0.6 });
  const lensL = new T.Mesh(new T.TorusGeometry(0.11, 0.014, 10, 36), frame); lensL.position.set(-0.13, 0.12, 0.33); lensL.rotation.y = -0.35; g.add(lensL);
  const lensR = new T.Mesh(new T.TorusGeometry(0.1, 0.014, 10, 36), frame); lensR.position.set(0.14, 0.12, 0.32); lensR.rotation.y = 0.35; g.add(lensR);
  const bridge = new T.Mesh(new T.CylinderGeometry(0.01, 0.01, 0.07, 8), frame); bridge.rotation.z = Math.PI / 2; bridge.position.set(0.005, 0.13, 0.35); g.add(bridge);
  const glassMat = new T.MeshPhysicalMaterial({ color: 0xbfefff, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1, clearcoat: 1 });
  const glR = new T.Mesh(new T.CircleGeometry(0.095, 24), glassMat); glR.position.copy(lensR.position); glR.rotation.y = 0.35; g.add(glR);
  /* right "eye": a simple friendly dot behind the right lens */ const eyeR = new T.Mesh(new T.SphereGeometry(0.03, 12, 10), new T.MeshBasicMaterial({ color: 0x14183a })); eyeR.position.set(0.15, 0.12, 0.3); g.add(eyeR); const glintR = new T.Mesh(new T.SphereGeometry(0.009, 8, 6), new T.MeshBasicMaterial({ color: 0xffffff })); glintR.position.set(0.165, 0.135, 0.325); g.add(glintR);
  /* the smile: a tube along a curve, plus a pink tongue */ const smilePts = []; for (let i = 0; i <= 16; i++) { const a = -0.9 + i / 16 * 1.8; smilePts.push(new T.Vector3(Math.sin(a) * 0.2, -0.12 - Math.cos(a) * 0.09 + 0.09, 0.34 - Math.abs(Math.sin(a)) * 0.06)); }
  const smile = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(smilePts), 24, 0.016, 8, false), frame); g.add(smile);
  const tongue = new T.Mesh(new T.SphereGeometry(0.05, 14, 10), new T.MeshStandardMaterial({ color: 0xff8aa6, roughness: 0.6 })); tongue.scale.set(1.3, 0.55, 0.6); tongue.position.set(0, -0.17, 0.32); g.add(tongue);
  /* craters */ for (let i = 0; i < 9; i++) { const c = new T.Mesh(new T.CircleGeometry(0.012 + Math.random() * 0.02, 10), dark); const a = Math.random() * Math.PI * 2, b = (Math.random() - 0.5) * 2.4; c.position.set(Math.cos(a) * Math.cos(b) * 0.341, Math.sin(b) * 0.341, Math.sin(a) * Math.cos(b) * 0.341); if (c.position.z > 0.15 && c.position.y > -0.2) c.position.z = -c.position.z; c.lookAt(c.position.clone().multiplyScalar(2)); g.add(c); }
  /* halo: three thin counter-rotating rings */ const rings = []; [[0.52, 0x38f0ff, 0.9], [0.6, 0xffd23f, 0.5], [0.7, 0xff4fd8, 0.4]].forEach(([r, col, op], i) => { const rm = new T.Mesh(new T.TorusGeometry(r, 0.0045, 6, 90), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: op, blending: T.AdditiveBlending, depthWrite: false })); rm.rotation.x = Math.PI / 2 + (i - 1) * 0.5; g.add(rm); rings.push(rm); });
  /* comet trail: motes that lag behind him */ const N = 120; const pos = new Float32Array(N * 3); const trail = []; for (let i = 0; i < N; i++) trail.push(new T.Vector3()); const pg = new T.BufferGeometry(); pg.setAttribute('position', new T.BufferAttribute(pos, 3)); const motes = new T.Points(pg, new T.PointsMaterial({ color: 0x9fe8ff, size: 0.035, transparent: true, opacity: 0.8, blending: T.AdditiveBlending, depthWrite: false })); motes.frustumCulled = false; app.scene.add(motes);
  const light = new T.PointLight(0x7ee8ff, 1.4, 6, 1.8); g.add(light);
  g.traverse(o => { o.userData.noOcclude = true; o.frustumCulled = false; o.castShadow = false; });
  app.scene.add(g);
  /* where he sits: right shoulder, slightly behind and above eye level; eases there, never crosses in front */
  const want = new T.Vector3(), _v = new T.Vector3(), headPos = new T.Vector3(); let t0 = 0, seen = false; const ask = () => { app.popup && app.popup('🪐 Orbit', '<p>Hey! I am Orbit. I know every corner of allofus.one and World VR Mall. Pick a topic, or press B anywhere for a bug report.</p>', [{ label: 'Join / sign in', fn: () => app.toast(QA[0][1], 6000) }, { label: 'Brand page', fn: () => app.toast(QA[1][1], 6000) }, { label: 'The mall', fn: () => app.toast(QA[2][1], 6000) }, { label: 'VR controls', fn: () => app.toast(QA[4][1], 7000) }, { label: 'Rides', fn: () => app.toast(QA[3][1], 5000) }, { label: 'Hearts 18+', fn: () => app.toast(QA[6][1], 6000) }, { label: '📞 A human', fn: () => app.toast(QA[8][1], 6000) }]); };
  app.addHotspot && app.addHotspot(body, { fn: ask, title: '🪐 Orbit · tap for help' });
  app.onUpdate((dt, t) => { if (opts.hidden && opts.hidden()) { g.visible = false; motes.visible = false; return; } g.visible = true; motes.visible = true; const cam = app.renderer.xr.isPresenting ? app.renderer.xr.getCamera() : app.camera; cam.getWorldPosition(headPos); cam.getWorldDirection(_v); _v.y = 0; if (_v.lengthSq() < 1e-4) _v.set(0, 0, -1); _v.normalize(); const right = new T.Vector3(-_v.z, 0, _v.x); const xr = app.renderer.xr.isPresenting; want.copy(headPos).addScaledVector(_v, xr ? 0.9 : 2.4).addScaledVector(right, xr ? 1.05 : 1.6); want.y = headPos.y + (xr ? 0.1 : 0.3) + Math.sin(t * 1.3) * 0.06; if (!seen) { g.position.copy(want); seen = true; } else g.position.lerp(want, Math.min(1, dt * 2.2)); g.lookAt(headPos.x, g.position.y, headPos.z); g.rotation.y += Math.sin(t * 0.7) * 0.06; g.rotation.z = Math.sin(t * 0.9) * 0.05; rings[0].rotation.z = t * 0.6; rings[1].rotation.y = t * 0.45; rings[2].rotation.x = Math.PI / 2 + Math.sin(t * 0.5) * 0.6; irisGlow.material.opacity = 0.5 + Math.sin(t * 2.4) * 0.25; pupil.scale.setScalar(0.85 + Math.sin(t * 0.9) * 0.15); if ((Math.floor(t * 2) % 7) === 0) { eyeR.scale.y = 0.15; } else eyeR.scale.y = 1; light.intensity = 1.2 + Math.sin(t * 3.1) * 0.3; /* trail */ trail.pop(); trail.unshift(g.position.clone().add(new T.Vector3((Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.08))); for (let i = 0; i < N; i++) { const p = trail[i]; pos[i * 3] = p.x; pos[i * 3 + 1] = p.y - i * 0.004; pos[i * 3 + 2] = p.z; } pg.attributes.position.needsUpdate = true; });
  app._orbit3d = { group: g, ask }; return app._orbit3d;
}
