/* ============================================================
   VR SCREENS · Oct 22 2026
   A canvas on a plane that two pointers drive the same way: the VR laser (shared layer xr-v9: trigger = down / up, the beam = hover,
   every frame while it rests on the screen) and the desktop / phone pointer on the 3D page (mouse or finger, raycast from the camera).
   makeScreen(app, { w, h, px, py, hover(u, v, info), down(u, v, info), up(u, v, info), leave(info) })
     -> { mesh, canvas, g (2d context), tex, w, h, pw, ph, dirty(), px(u, v) -> [x, y] canvas pixels, enabled }
   u, v are texture coordinates (0..1, v = 1 at the TOP edge of the plane as three.js maps a PlaneGeometry); px() flips v for you.
   info: { hd: 'left' | 'right' | 'mouse', ctl, point (world), pressed, t }. up(-1, -1) = released off the screen.
   Add the mesh to the scene yourself (position, rotation, obstacles). Keep canvases <= 1024 px on the long side (Quest 3 texture budget).
   Same file lives in the allofus.one repo as js/aou-screen.js (only this header line differs).
   ============================================================ */
import * as THREE from 'three';
const T = THREE;

export function makeScreen(app, o = {}) {
  const w = o.w || 2, h = o.h || 1.5, pw = o.px || 512, ph = o.py || Math.round(pw * h / w);
  const c = document.createElement('canvas'); c.width = pw; c.height = ph; const g = c.getContext('2d');
  const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4; tex.generateMipmaps = false; tex.minFilter = T.LinearFilter; tex.magFilter = T.LinearFilter;
  const mat = new T.MeshBasicMaterial({ map: tex, transparent: !!o.transparent, toneMapped: false, side: o.doubleSide ? T.DoubleSide : T.FrontSide });
  const mesh = new T.Mesh(new T.PlaneGeometry(w, h), mat);
  const sc = { mesh, canvas: c, g, tex, w, h, pw, ph, enabled: true, hover: o.hover, down: o.down, up: o.up, leave: o.leave, dirty: () => { tex.needsUpdate = true; }, px: (u, v) => [u * pw, (1 - v) * ph] };
  mesh.userData.screen = sc; mesh.userData.noFreeze = true; mesh.userData.noOcclude = true;
  (app.vrScreens = app.vrScreens || []).push(mesh);
  installPointer(app);
  return sc;
}

/* a plain mesh (a table top, a target board) as a screen without a canvas: the pointer callbacks only */
export function screenOn(app, mesh, o = {}) {
  const sc = { mesh, enabled: true, hover: o.hover, down: o.down, up: o.up, leave: o.leave };
  mesh.userData.screen = sc; mesh.userData.noFreeze = true; mesh.userData.noOcclude = true;
  (app.vrScreens = app.vrScreens || []).push(mesh);
  installPointer(app);
  return sc;
}

export function removeScreen(app, mesh) { const L = app.vrScreens || []; const i = L.indexOf(mesh); if (i >= 0) L.splice(i, 1); if (mesh.userData) delete mesh.userData.screen; }

/* the desktop / phone pointer: one set of listeners per app, in the capture phase so the engine's own tap-to-walk never fires on a screen */
let installedFor = null;
function installPointer(app) {
  if (installedFor === app) return; installedFor = app;
  const go = () => {
    const cv = app.renderer && app.renderer.domElement; if (!cv) { setTimeout(go, 300); return; }
    const rc = new T.Raycaster(), ndc = new T.Vector2(); const info = { ctl: null, hd: 'mouse', point: new T.Vector3(), pressed: false, t: 0 }; let press = null, on = null;
    const cast = (e) => { try { if (app.renderer.xr && app.renderer.xr.isPresenting) return null; const r = cv.getBoundingClientRect(); if (!r.width || !r.height) return null; ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); rc.setFromCamera(ndc, app.camera); rc.far = 45; const L = (app.vrScreens || []).filter((m) => m.visible && m.userData.screen && m.userData.screen.enabled !== false); if (!L.length) return null; const hits = rc.intersectObjects(L, false); return hits.length && hits[0].uv ? hits[0] : null; } catch (err) { return null; } };
    cv.addEventListener('pointerdown', (e) => { if (app.paused) return; const h = cast(e); if (!h) return; const sc = h.object.userData.screen; press = sc; on = sc; info.pressed = true; info.point.copy(h.point); info.t = app.t; try { sc.down && sc.down(h.uv.x, h.uv.y, info); } catch (err) { console.warn('screen down', err); } e.stopImmediatePropagation(); e.preventDefault(); }, { capture: true });
    cv.addEventListener('pointermove', (e) => { const h = cast(e); const sc = h ? h.object.userData.screen : null; if (on && on !== sc) { try { on.leave && on.leave(info); } catch (err) { } if (press && press === on) { try { press.up && press.up(-1, -1, info); } catch (err) { } press = null; info.pressed = false; } } on = sc; if (!sc) return; info.point.copy(h.point); info.pressed = press === sc; info.t = app.t; try { sc.hover && sc.hover(h.uv.x, h.uv.y, info); } catch (err) { } if (press) e.stopImmediatePropagation(); }, { capture: true });
    const up = (e) => { if (!press) return; const h = cast(e); const sc = press; press = null; info.pressed = false; const same = h && h.object.userData.screen === sc; try { sc.up && sc.up(same ? h.uv.x : -1, same ? h.uv.y : -1, info); } catch (err) { } e.stopImmediatePropagation(); };
    cv.addEventListener('pointerup', up, { capture: true }); cv.addEventListener('pointercancel', up, { capture: true });
  };
  go();
}
