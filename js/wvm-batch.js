/* ============================================================
   DRAW-CALL BATCHING FOR VR (wvm-batch.js) · Nov 22 2026
   Why: on a Quest 3 the island ran at 26 to 30 fps with 1,100 to 1,370 draw calls per frame. The world is built from
   thousands of small primitives (boxes, cylinders, spheres), most with their own copy of the same flat-colour material,
   so nearly every one was its own draw call. This module draws them as a few merged meshes instead.

   How it works (nothing in the world itself is edited):
   1. FIND. Every object's local matrix (and every mesh's material) is sampled three times, one second apart. A mesh is a
      candidate when it is a plain opaque single-material Mesh. If neither it nor any ancestor changed it is STATIC; if
      something in its chain moves (a ride car, a spinning sign, a finger of the robot hands) it is MOVING.
   2. MERGE. Candidates with an identical-looking material (every property compared, textures by identity) are merged.
      STATIC ones go into one BufferGeometry per material look per cell, world transforms baked in. The cell grows with the
      distance the piece stays visible under the VR distance rule (40 m for small props, 80 m for medium, 240 m for walls
      and floors), so a long corridor is a handful of draws, not one per 40 m. A prop with no partner in its cell joins a
      world-wide batch for its look. MOVING ones go into one three.js BatchedMesh per material
      look: one draw call, each piece keeps its own matrix, copied from the original's matrixWorld in the frame it changes
      (no lag, nothing to evict). Untextured materials that differ only in colour share a batch: the colour is written per
      vertex (white material x vertex colour = the same maths). For plain untextured MeshStandardMaterial the glow (emissive x
      intensity), roughness and metalness are written per vertex as well and read by a three-line shader patch on the batch's
      own material, so props that differ only in those still share one draw call. Batches draw with private copies of the
      materials; the originals' materials are never edited.
   3. HIDE THE ORIGINALS WITHOUT TOUCHING THEM. Originals stay in the scene graph, visible, with their own material, so the
      laser, hotspots, collisions and every raycast work exactly as before. Their `layers` object is swapped for a shared one
      whose test() says "no" only to a camera that carries bit 9. Batches live on layer 9. So the whole system is switched by
      one bit on the VR cameras: bit on = batches draw and originals do not; bit off = the untouched original world.
      Every other camera (map, mirrors, flat and 3D screen modes) never sees a batch. The shadow camera has no bit 9 either,
      so shadows are still cast by the originals, exactly as before; batches only receive. That is why cast-shadow is not
      part of a batch's key, and for the patched MeshStandardMaterial receive-shadow is a per-vertex value too.
   4. STAY HONEST. Each merged object keeps its own range of the index buffer (or its own visibility flag in a BatchedMesh).
      If the game hides it (its own `visible`, any ancestor, a zone, an upper level, the engine's distance cull) or the VR
      distance rule (same radii as xrLod) says it is too far, it is switched off inside the batch, and back on when it
      returns. Ancestor visibility is checked every frame (a few thousand flag reads); everything else round-robin, about an
      eighth of the list per frame. If a static object moves, or any object is re-parented or has its material swapped or
      recoloured, it is EVICTED: removed from the batch and given its own layers back, so it draws as itself again. A later
      round may batch it again in its new state.
   5. NEW THINGS. When zones build or objects are added, another find-and-merge round runs. All of it is time-sliced
      (about 2.5 ms a frame in the headset), new shader variants are compiled off-frame before a batch goes live, and
      nothing advances during a ride.
   Never batched: transparent, skinned, instanced, sprites, lines, material arrays, shader materials, custom
   onBeforeRender / onBeforeCompile, morph targets, signs (userData.isSign), the player, the avatar, the VR rig and menus,
   anything with a renderOrder, static things with frustumCulled === false, materials that animate, userData.noBatch.
   opts.include() may return roots under a skipped parent to batch anyway as MOVING (the robot hands under the rig).
   API (app._xrBatch): prepare() build ahead on the 2D page · start() / stop() with the VR session · setEnabled(bool) A/B
   switch · stats() · check() invariants · explain(object) why something is not batched.
   ============================================================ */
export function installBatch(app, T, opts = {}) {
  const scene = app.scene, R = app.renderer; if (!scene || !R) return null;
  const CELL = opts.cell || 40, MAX_VERTS = 32000, MAX_MESH_VERTS = 12000, MAX_PIECES = 800, CAM_LAYER = 9, CAM = 1 << CAM_LAYER, HIDE_MASK = 1 << (opts.hideLayer || 7);
  const HAS_BM = typeof T.BatchedMesh === 'function' && opts.moving !== false;
  const skip = new Set((opts.skip || []).filter(Boolean));
  const defOBR = T.Object3D.prototype.onBeforeRender, defOAR = T.Object3D.prototype.onAfterRender, defOBC = T.Material.prototype.onBeforeCompile, defCPK = T.Material.prototype.customProgramCacheKey;
  /* the shared stand-in layers: invisible to a camera carrying CAM, otherwise an ordinary layer-0 object. Its mask is not 1 on
     purpose, so the VR distance LOD (which only lists mask === 1) leaves batched originals alone. Setters are inert because it is shared. */
  class NoDraw extends T.Layers { constructor() { super(); this.mask = 0x101; } test(l) { return (l.mask & CAM) === 0 && (l.mask & 1) !== 0; } set() { } enable() { } enableAll() { } toggle() { } disable() { } disableAll() { } }
  class NoHit extends NoDraw { test() { return false; } }
  const NODRAW = new NoDraw(), NOHIT = new NoHit(); /* NOHIT: too far under the VR distance rule = neither drawn nor hit, as before */
  const root = new T.Group(); root.name = 'wvm-batch'; Object.assign(root.userData, { noCull: true, noFreeze: true, noCollide: true, noOcclude: true, keepLOD: true, mapHide: true, noBatch: true }); root.matrixAutoUpdate = false; root.visible = false; scene.add(root);
  const S = { active: false, enabled: true, want: false, gen: null, waitUntil: 0, lastRound: -1e9, rounds: 0, trigZ: -1, trigN: -1, trigT: 0, needRound: true, evicted: 0, evictedAtRound: 0, mi: 0, ni: 0, ki: 0, fullPass: false, noLod: false, warm: 0, warmed: false, maxSlice: 0, buildMs: 0, verts: 0, tris: 0, singles: 0, doa: 0, compiles: 0, why: {} };
  const members = [], batches = [], movers = []; const memberOf = new Map();
  const nObj = [], nPar = [], nExp = [], nCs = [], nVis = [], nChg = [], nMoved = [], nodeIx = new Map(); /* nMoved: 1 moved, 2 re-parented */
  const mats = [], matOf = new Map(); /* watched source materials: { m, cs, bad } */
  const dynSet = new WeakSet(), dynMat = new WeakSet(), sigCache = new WeakMap(); const sigIds = new Map(), batchMats = new Map();
  const _m = new T.Matrix4(), _n3 = new T.Matrix3(), _v = new T.Vector3();
  let deadline = 0, dead = 0;
  const now = () => performance.now();
  const mcs = (e) => e[0] + e[1] * 1.37 + e[2] * 1.71 + e[4] * 2.03 + e[5] * 2.39 + e[6] * 2.77 + e[8] * 3.11 + e[9] * 3.53 + e[10] * 3.89 + e[12] * 4.21 + e[13] * 4.67 + e[14] * 5.03;
  const matCs = (m) => { const c = m.color, e = m.emissive; return m.version * 7 + (c ? c.r + c.g * 2.3 + c.b * 4.1 : 0) + (e ? e.r * 1.7 + e.g * 3.1 + e.b * 5.3 : 0) + (m.emissiveIntensity || 0) * 0.613 + m.opacity * 5.9 + (m.roughness || 0) * 11.3 + (m.metalness || 0) * 13.7 + (m.visible ? 17 : 0) + (m.transparent ? 19 : 0) + (m.map ? m.map.id * 23 : 0) + m.side * 29 + (m.envMapIntensity || 0) * 0.31 + (m.alphaTest || 0) * 37 + (m.depthWrite ? 41 : 0); };
  /* what a material looks like, as a string: every own property (colour optional), textures by identity */
  const sigOf = (m, noColor, noPbr) => { let s = m.type; for (const k in m) { if (k === 'uuid' || k === 'name' || k === 'version' || k === 'userData' || k === '_listeners' || (noColor && k === 'color') || (noPbr && (k === 'emissive' || k === 'emissiveIntensity' || k === 'roughness' || k === 'metalness'))) continue; const v = m[k]; const t = typeof v; if (t === 'function') continue; if (v === null || t !== 'object') { s += '|' + k + '=' + v; continue; } if (v.isColor) s += '|' + k + '=c' + v.r.toFixed(5) + ',' + v.g.toFixed(5) + ',' + v.b.toFixed(5); else if (v.isTexture) s += '|' + k + '=t' + v.id; else { try { s += '|' + k + '=' + JSON.stringify(v); } catch (e) { s += '|' + k + '=?' + m.uuid; } } } return s; };
  const matInfo = (m) => { const cs = matCs(m); let i = sigCache.get(m); if (i && i.cs === cs) return i; let hasTex = false; for (const k in m) { const v = m[k]; if (v && v.isTexture && k !== 'envMap') { hasTex = true; break; } } const colorMerge = !hasTex && !m.vertexColors && !!m.color && !!(m.isMeshStandardMaterial || m.isMeshBasicMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial); const pbr = colorMerge && m.type === 'MeshStandardMaterial' && opts.pbr !== false; const sig = (pbr ? 'V' : colorMerge ? 'C' : 'M') + sigOf(m, colorMerge, pbr); let id = sigIds.get(sig); if (id === undefined) { id = sigIds.size; sigIds.set(sig, id); } i = { cs, id, hasTex, colorMerge, pbr, full: !colorMerge }; sigCache.set(m, i); return i; };
  /* per-vertex glow / roughness / metalness for the batch's own copy of a plain MeshStandardMaterial (attributes bEm, bRm) */
  const pbrPatch = (b) => { b.emissive.setRGB(0, 0, 0); b.emissiveIntensity = 1; b.roughness = 1; b.metalness = 0; b.customProgramCacheKey = () => 'wvm-batch-pbr2'; b.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <common>', 'attribute vec3 bEm;\nattribute vec3 bRm;\nvarying vec3 vBEm;\nvarying vec3 vBRm;\n#include <common>').replace('#include <begin_vertex>', '#include <begin_vertex>\nvBEm = bEm;\nvBRm = bRm;'); sh.fragmentShader = sh.fragmentShader.replace('#include <common>', 'varying vec3 vBEm;\nvarying vec3 vBRm;\n#include <common>').replace('#include <lights_fragment_begin>', '#define receiveShadow (vBRm.z > 0.5)\n#include <lights_fragment_begin>').replace('vec3 totalEmissiveRadiance = emissive;', 'vec3 totalEmissiveRadiance = vBEm;').replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vBRm.x;').replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vBRm.y;'); }; };
  const pbrFill = (o, em, rm, at, cnt) => { const m = o.material, e = m.emissive, k = m.emissiveIntensity === undefined ? 1 : m.emissiveIntensity, r = m.roughness, t = m.metalness, s = o.receiveShadow ? 1 : 0; let d = at * 3; for (let i = 0; i < cnt; i++, d += 3) { em[d] = e.r * k; em[d + 1] = e.g * k; em[d + 2] = e.b * k; rm[d] = r; rm[d + 1] = t; rm[d + 2] = s; } };
  const batchMat = (m, info, moving) => { const key = info.id + (moving ? 'd' : 's'); let b = batchMats.get(key); if (b) return b; b = m.clone(); b.name = 'wvm-batch'; if (info.colorMerge) { b.color.setRGB(1, 1, 1); b.vertexColors = true; } if (info.pbr) pbrPatch(b); b.needsUpdate = true; b.userData = { fresh: true }; batchMats.set(key, b); return b; };
  const okMat = (m) => m && !Array.isArray(m) && !m.transparent && m.visible && m.depthTest && m.depthWrite && m.colorWrite && !m.isShaderMaterial && !m.wireframe && !m.clippingPlanes && !(m.transmission > 0) && m.onBeforeCompile === defOBC && m.customProgramCacheKey === defCPK && !dynMat.has(m);
  const okGeo = (g, info) => { if (!g || !g.isBufferGeometry) return null; const A = g.attributes, p = A.position; if (!p || p.isInterleavedBufferAttribute || !(p.array instanceof Float32Array) || p.itemSize !== 3 || p.count < 3 || p.count > MAX_MESH_VERTS) return null; if (g.morphAttributes && (g.morphAttributes.position || g.morphAttributes.normal)) return null; if (g.drawRange.start !== 0 || g.drawRange.count !== Infinity) return null; if (((g.index ? g.index.count : p.count) % 3) !== 0) return null; if (g.index && g.index.isInterleavedBufferAttribute) return null; const n = A.normal; if (n && (n.isInterleavedBufferAttribute || !(n.array instanceof Float32Array) || n.itemSize !== 3 || n.count !== p.count)) return null; if (!info.full) return n ? 'PN' : 'P'; let key = ''; for (const k of Object.keys(A).sort()) { const a = A[k]; if (k === 'tangent' || a.isInterleavedBufferAttribute || a.normalized || a.count !== p.count) return null; key += k + a.itemSize + ','; } return key; };
  const okMesh = (o) => { if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || o.isBatchedMesh || !o.visible || o.renderOrder !== 0 || o.onBeforeRender !== defOBR || o.onAfterRender !== defOAR || o.customDepthMaterial || o.customDistanceMaterial || o.morphTargetInfluences) return false; const u = o.userData; if (u.isSign || u.noBatch || u.vrfn || u.vrArm || u.introDome || u._wvmBatch) return false; const L = o.layers.mask; return L === 1 || L === HIDE_MASK; };

  /* ---- nodes: the ancestors of batched meshes (parents always before children) ---- */
  const ensureNode = (o) => { if (o === scene) return -1; let i = nodeIx.get(o); if (i !== undefined) return i; const p = ensureNode(o.parent); i = nObj.length; nObj.push(o); nPar.push(p); nExp.push(o.parent); nCs.push(mcs(o.matrix.elements)); nVis.push(1); nChg.push(0); nMoved.push(dynSet.has(o) ? 1 : 0); nodeIx.set(o, i); return i; };

  /* ---- one merged object's place in a batch ---- */
  const dirty = [];
  const mark = (b, s, c) => { if (s < b.pMin) b.pMin = s; if (s + c > b.pMax) b.pMax = s + c; if (!b.dirty) { b.dirty = true; dirty.push(b); } };
  const setShown = (m, show) => { if (m.on === show) return; const b = m.b; m.on = show; b.shown += show ? 1 : -1; if (b.bm) { b.bm.setVisibleAt(m.id, show); if (show) m.wcs = NaN; b.mesh.visible = b.shown > 0; return; } if (show) b.idx.set(b.full.subarray(m.s, m.s + m.c), m.s); else b.idx.fill(0, m.s, m.s + m.c); mark(b, m.s, m.c); };
  const flush = () => { for (let i = 0; i < dirty.length; i++) { const b = dirty[i]; b.dirty = false; const ia = b.ia; if (b.pMax > b.pMin) { if (ia.clearUpdateRanges) { ia.clearUpdateRanges(); ia.addUpdateRange(b.pMin, b.pMax - b.pMin); } ia.needsUpdate = true; } b.mesh.visible = b.shown > 0; } dirty.length = 0; };
  const arm = (m) => { if (m.armed) return; const L = m.o.layers; if (L !== NODRAW && L !== NOHIT) { if (L.mask !== 1) L.mask = 1; m.orig = L; } m.o.layers = m.far ? NOHIT : NODRAW; m.armed = true; };
  const disarm = (m) => { if (!m.armed) return; if (m.orig && (m.o.layers === NODRAW || m.o.layers === NOHIT)) m.o.layers = m.orig; m.armed = false; };
  const evict = (m, why) => { if (m.dead) return; setShown(m, false); disarm(m); m.dead = true; dead++; m.b.live--; memberOf.delete(m.o); S.evicted++; S.why[why] = (S.why[why] || 0) + 1; };
  const evalMember = (m, deep) => {
    const o = m.o;
    if (o.material !== m.mat) return evict(m, 'material swapped'); if (m.me.bad) return evict(m, 'material changed'); if (o.parent !== m.par) return evict(m, 're-parented');
    if (deep) { let j = m.pn; if (m.b.bm) { while (j >= 0) { if (nMoved[j] === 2) return evict(m, 'ancestor re-parented'); j = nPar[j]; } } else { if (mcs(o.matrix.elements) !== m.cs) { dynSet.add(o); return evict(m, 'moved'); } while (j >= 0) { if (nMoved[j]) return evict(m, 'ancestor moved'); j = nPar[j]; } } }
    let far = false; if (m.far2 > 0 && !S.noLod) { const e = o.matrixWorld.elements, P = app.player.position, k = opts.scale ? (opts.scale() || 1) : 1; const dx = e[12] - P.x, dz = e[14] - P.z; far = dx * dx + dz * dz > m.far2 * k * k; }
    if (far !== m.far) { m.far = far; if (m.armed) o.layers = far ? NOHIT : NODRAW; }
    setShown(m, !far && o.visible && (m.pn < 0 || nVis[m.pn] === 1));
  };

  /* ---- the round: find, sample three times, group, merge. One generator, advanced a few ms per frame. ---- */
  const over = () => now() > deadline;
  function* round() {
    S.ph = 'scan'; const t0 = now(); const objs = [], cs = [], mc = []; const stack = [scene]; const seen = new Set();
    let inc = []; try { inc = (opts.include ? opts.include() : []).filter(o => o && o.parent); } catch (e) { }
    for (const r of inc) { let q = r; while (q && q !== scene) q = q.parent; if (q !== scene) continue; q = r; while (q !== scene) { if (!seen.has(q)) { seen.add(q); objs.push(q); } q = q.parent; } dynSet.add(r); stack.push(r); }
    while (stack.length) { const o = stack.pop(); const ch = o.children; for (let i = 0; i < ch.length; i++) { const c = ch[i]; if (c === root || skip.has(c) || c.isCamera || c.userData.noBatch || seen.has(c)) continue; objs.push(c); stack.push(c); } if (over()) yield; }
    S.ph = 'sample'; for (let i = 0; i < objs.length; i++) { const o = objs[i]; cs.push(mcs(o.matrix.elements)); mc.push(o.isMesh && o.material && !Array.isArray(o.material) ? matCs(o.material) : 0); if ((i & 1023) === 0 && over()) yield; }
    for (let pass = 0; pass < 2; pass++) { S.waitUntil = now() + 1000; yield; for (let i = 0; i < objs.length; i++) { const o = objs[i]; const c = mcs(o.matrix.elements); if (c !== cs[i]) { cs[i] = c; dynSet.add(o); } if (mc[i] !== 0) { const m = o.material; const k = m && !Array.isArray(m) ? matCs(m) : -1; if (k !== mc[i]) { mc[i] = k; if (m && !Array.isArray(m)) dynMat.add(m); } } if ((i & 1023) === 0 && over()) yield; } }
    S.ph = 'group'; const csAt = new Map(); for (let i = 0; i < objs.length; i++) { csAt.set(objs[i], cs[i]); if ((i & 2047) === 0 && over()) yield; }
    /* group the candidates */
    const groups = new Map(); const mk = (g) => ({ dyn: g.dyn, tail: g.tail, info: g.info, mat: g.mat, cast: g.cast, recv: g.recv, gk: g.gk, list: [], lods: [], verts: 0, x: g.x, z: g.z });
    const put = (map, base, proto, o, lod, nv) => { let part = 0, g; for (; ;) { g = map.get(base + '#' + part); if (!g) { g = mk(proto); map.set(base + '#' + part, g); break; } if (g.verts + nv <= MAX_VERTS && g.list.length < MAX_PIECES) break; part++; } g.list.push(o); g.lods.push(lod); g.verts += nv; };
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i]; if ((i & 15) === 0 && over()) yield;
      if (!o.isMesh || memberOf.has(o) || !okMesh(o) || !okMat(o.material)) continue;
      let dyn = dynSet.has(o), ok = false, lod = !(o.userData.noCull || o.userData.keepLOD || o.userData.floor) && o.frustumCulled !== false; let q = o.parent;
      while (q) { if (q === scene) { ok = true; break; } if (!csAt.has(q)) break; if (dynSet.has(q)) dyn = true; if (q.userData.noCull || q.userData.keepLOD) lod = false; q = q.parent; }
      if (!ok || (dyn && !HAS_BM) || (!dyn && o.frustumCulled === false)) continue;
      const info = matInfo(o.material); const gk = okGeo(o.geometry, info); if (!gk) continue; if (over()) yield;
      const e = o.matrixWorld.elements; if (!(Math.abs(e[12]) < 1e6) || !(Math.abs(e[13]) < 1e6) || !(Math.abs(e[14]) < 1e6)) continue;
      const tail = '|' + info.id + '|' + (info.pbr ? 'r' : o.receiveShadow ? 1 : 0) + '|' + gk;
      let far = 0; if (lod) { const bs = o.geometry.boundingSphere || (o.geometry.computeBoundingSphere(), o.geometry.boundingSphere); _v.setFromMatrixScale(o.matrixWorld); const r = bs ? bs.radius * Math.max(Math.abs(_v.x), Math.abs(_v.y), Math.abs(_v.z)) : 99; if (r <= 12) far = r < 0.5 ? 22 : r < 1.2 ? 38 : r < 3 ? 70 : r < 6 ? 120 : 170; } lod = far * far;
      const cell = far === 0 || far > 70 ? CELL * 6 : far > 38 ? CELL * 2 : CELL;
      put(groups, (dyn ? 'd' : 'c' + cell + ':' + Math.floor(e[12] / cell) + ',' + Math.floor(e[14] / cell)) + tail, { dyn, tail, info, mat: o.material, cast: o.castShadow, recv: o.receiveShadow, gk, x: e[12], z: e[14] }, o, lod, o.geometry.attributes.position.count);
    }
    /* a static prop with no partner in its own cell joins a world-wide batch for its look */
    { const loose = new Map(); for (const g of groups.values()) { if (g.dyn || g.list.length !== 1) continue; put(loose, 'w' + g.tail, g, g.list[0], g.lods[0], g.verts); g.list.length = 0; } for (const [k, L] of loose) groups.set(k, L); }
    if (over()) yield;
    const P = app.player.position; const todo = [...groups.values()].filter(g => g.list.length > 1).sort((a, b) => ((a.x - P.x) ** 2 + (a.z - P.z) ** 2) - ((b.x - P.x) ** 2 + (b.z - P.z) ** 2));
    for (const g of groups.values()) if (g.list.length === 1) S.singles++;
    if (over()) yield;
    let first = true; S.ph = 'merge';
    for (const g of todo) {
      let nv = 0, ni = 0; for (const o of g.list) { const ge = o.geometry; nv += ge.attributes.position.count; ni += ge.index ? ge.index.count : ge.attributes.position.count; }
      const g0 = g.list[0].geometry; const names = g.info.full ? Object.keys(g0.attributes).sort() : (g.gk === 'PN' ? ['position', 'normal'] : ['position']); const sizes = {}; for (const k of names) sizes[k] = g0.attributes[k].itemSize;
      const bmat = batchMat(g.mat, g.info, g.dyn); let mesh, b;
      if (g.dyn) {
        /* MOVING: one BatchedMesh; every piece is added with its own geometry (colour baked per vertex) and keeps its own matrix */
        const bm = new T.BatchedMesh(g.list.length, nv, ni, bmat); bm.perObjectFrustumCulled = false; bm.sortObjects = false; bm.frustumCulled = false; mesh = bm; b = { mesh, bm, ids: [], shown: 0, live: 0, dirty: false };
        for (let li = 0; li < g.list.length; li++) {
          const o = g.list[li], ge = o.geometry, cnt = ge.attributes.position.count; const tg = new T.BufferGeometry(); for (const k of names) tg.setAttribute(k, ge.attributes[k]);
          if (g.info.colorMerge) { const c = o.material.color, col = new Float32Array(cnt * 3); for (let i = 0, d = 0; i < cnt; i++, d += 3) { col[d] = c.r; col[d + 1] = c.g; col[d + 2] = c.b; } tg.setAttribute('color', new T.BufferAttribute(col, 3)); }
          if (g.info.pbr) { const em = new Float32Array(cnt * 3), rm = new Float32Array(cnt * 3); pbrFill(o, em, rm, 0, cnt); tg.setAttribute('bEm', new T.BufferAttribute(em, 3)); tg.setAttribute('bRm', new T.BufferAttribute(rm, 3)); }
          const flip = o.matrixWorld.determinant() < 0; let ia;
          if (ge.index && !flip) ia = ge.index; else { const n = ge.index ? ge.index.count : cnt, src = ge.index ? ge.index.array : null; const a = nv > 65535 ? new Uint32Array(n) : new Uint16Array(n); for (let j = 0; j < n; j += 3) { const i0 = src ? src[j] : j, i1 = src ? src[j + 1] : j + 1, i2 = src ? src[j + 2] : j + 2; a[j] = i0; a[j + 1] = flip ? i2 : i1; a[j + 2] = flip ? i1 : i2; } ia = new T.BufferAttribute(a, 1); }
          tg.setIndex(ia); if (ge.boundingBox) tg.boundingBox = ge.boundingBox; if (ge.boundingSphere) tg.boundingSphere = ge.boundingSphere; const id = bm.addGeometry(tg); bm.setMatrixAt(id, o.matrixWorld); b.ids.push(id);
          if (over()) yield;
        }
      } else {
        /* STATIC: one merged geometry, world transforms baked in */
        const arrs = {}; for (const k of names) arrs[k] = new Float32Array(nv * sizes[k]);
        const col = g.info.colorMerge ? new Float32Array(nv * 3) : null; const em = g.info.pbr ? new Float32Array(nv * 3) : null, rm = g.info.pbr ? new Float32Array(nv * 3) : null; const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni); const recs = []; let vo = 0, io = 0;
        for (let li = 0; li < g.list.length; li++) {
          const o = g.list[li], ge = o.geometry, pa = ge.attributes.position, cnt = pa.count; _m.copy(o.matrixWorld);
          const e = _m.elements; const src = pa.array, dst = arrs.position; let d = vo * 3;
          for (let i = 0, s = 0; i < cnt; i++, s += 3, d += 3) { const x = src[s], y = src[s + 1], z = src[s + 2]; dst[d] = e[0] * x + e[4] * y + e[8] * z + e[12]; dst[d + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; dst[d + 2] = e[2] * x + e[6] * y + e[10] * z + e[14]; }
          if (arrs.normal) { _n3.getNormalMatrix(_m); const k = _n3.elements, ns = ge.attributes.normal.array, nd = arrs.normal; d = vo * 3; for (let i = 0, s = 0; i < cnt; i++, s += 3, d += 3) { const x = ns[s], y = ns[s + 1], z = ns[s + 2]; const a = k[0] * x + k[3] * y + k[6] * z, bb = k[1] * x + k[4] * y + k[7] * z, c = k[2] * x + k[5] * y + k[8] * z; const l = Math.sqrt(a * a + bb * bb + c * c) || 1; nd[d] = a / l; nd[d + 1] = bb / l; nd[d + 2] = c / l; } }
          for (const k of names) { if (k === 'position' || k === 'normal') continue; arrs[k].set(ge.attributes[k].array.subarray(0, cnt * sizes[k]), vo * sizes[k]); }
          if (col) { const c = o.material.color; d = vo * 3; for (let i = 0; i < cnt; i++, d += 3) { col[d] = c.r; col[d + 1] = c.g; col[d + 2] = c.b; } }
          if (em) pbrFill(o, em, rm, vo, cnt);
          const flip = _m.determinant() < 0; let c = 0;
          if (ge.index) { const ia = ge.index.array; c = ge.index.count; if (flip) for (let j = 0; j < c; j += 3) { idx[io + j] = ia[j] + vo; idx[io + j + 1] = ia[j + 2] + vo; idx[io + j + 2] = ia[j + 1] + vo; } else for (let j = 0; j < c; j++) idx[io + j] = ia[j] + vo; }
          else { c = cnt; if (flip) for (let j = 0; j < c; j += 3) { idx[io + j] = vo + j; idx[io + j + 1] = vo + j + 2; idx[io + j + 2] = vo + j + 1; } else for (let j = 0; j < c; j++) idx[io + j] = vo + j; }
          recs.push(io, c); vo += cnt; io += c;
          if (over()) yield;
        }
        if (over()) yield;
        const geo = new T.BufferGeometry(); for (const k of names) geo.setAttribute(k, new T.BufferAttribute(arrs[k], sizes[k])); if (col) geo.setAttribute('color', new T.BufferAttribute(col, 3)); if (em) { geo.setAttribute('bEm', new T.BufferAttribute(em, 3)); geo.setAttribute('bRm', new T.BufferAttribute(rm, 3)); } const ia = new T.BufferAttribute(idx, 1); geo.setIndex(ia); geo.computeBoundingSphere();
        mesh = new T.Mesh(geo, bmat); b = { mesh, bm: null, geo, ia, idx, full: idx.slice(), recs, shown: 0, live: 0, dirty: false, pMin: Infinity, pMax: -1 }; const bb = b; mesh.onBeforeRender = () => { if (!bb.dirty) { bb.pMin = Infinity; bb.pMax = -1; } };
      }
      mesh.name = 'wvm-batch'; mesh.castShadow = false; mesh.receiveShadow = g.info.pbr ? true : g.recv; mesh.layers.set(CAM_LAYER); mesh.matrixAutoUpdate = false; mesh.matrixWorldAutoUpdate = false; Object.assign(mesh.userData, { _wvmBatch: true, noCollide: true, noOcclude: true, keepLOD: true, noBatch: true }); mesh.visible = false;
      /* a material look seen for the first time: compile its shader off-frame before the batch can appear (no hitch in the headset) */
      if (bmat.userData.fresh) { bmat.userData.fresh = false; S.ph = 'compile'; if (R.compileAsync) { let done = false; const fin = () => { done = true; }; try { S.compiles++; R.compileAsync(mesh, app.camera, scene).then(fin, fin); } catch (e) { done = true; } const tEnd = now() + 5000; while (!done && now() < tEnd) { S.waitUntil = now() + 40; yield; } } }
      S.ph = 'commit';
      /* commit: one go, no yields, so a batch and the hiding of its originals always land in the same frame */
      if (first) { first = false; try { opts.lodReset && opts.lodReset(); } catch (e) { } }
      root.add(mesh); batches.push(b); if (b.bm) movers.push(b); S.verts += nv; S.tris += ni / 3;
      const okNode = new Map(); const still = (q) => { let r = okNode.get(q); if (r === undefined) { r = mcs(q.matrix.elements) === csAt.get(q); okNode.set(q, r); if (!r) dynSet.add(q); } return r; };
      const n0 = members.length;
      for (let li = 0; li < g.list.length; li++) {
        const o = g.list[li]; let good = !!o.parent && !!o.material && !Array.isArray(o.material) && matCs(o.material) === matInfo(o.material).cs && !memberOf.has(o); let q = o; while (good && q && q !== scene) { if (!g.dyn) good = still(q); q = q.parent; } if (good && q !== scene) good = false;
        if (!good) { if (b.bm) b.bm.setVisibleAt(b.ids[li], false); else { const s = b.recs[li * 2], c = b.recs[li * 2 + 1]; b.idx.fill(0, s, s + c); b.full.fill(0, s, s + c); } S.doa++; continue; }
        let me = matOf.get(o.material); if (!me) { me = { m: o.material, cs: matCs(o.material), bad: false }; matOf.set(o.material, me); mats.push(me); }
        const far2 = g.lods[li];
        const m = { o, b, s: b.bm ? 0 : b.recs[li * 2], c: b.bm ? 0 : b.recs[li * 2 + 1], id: b.bm ? b.ids[li] : -1, wcs: NaN, on: true, dead: false, armed: false, far: false, orig: null, par: o.parent, pn: o.parent === scene ? -1 : ensureNode(o.parent), cs: csAt.get(o), mat: o.material, me, far2 }; b.shown++; b.live++; members.push(m); memberOf.set(o, m);
      }
      b.recs = null; b.ids = null;
      if (S.active) { nodePass(false); for (let i = n0; i < members.length; i++) { const m = members[i]; arm(m); evalMember(m, false); } if (!b.bm) mark(b, 0, 0); flush(); b.mesh.visible = b.shown > 0; }
      S.ph = 'merge'; if (over()) yield;
    }
    S.ph = 'done'; try { opts.lodReset && opts.lodReset(); } catch (e) { }
    S.rounds++; S.lastRound = now(); S.buildMs += now() - t0; S.evictedAtRound = S.evicted; S.gen = null;
    if (!S.active && !S.warmed && opts.warm !== false && batches.length) { S.warmed = true; S.warm = 3; start(true); }
  }

  /* ---- per-frame upkeep while switched on ---- */
  const nodePass = (all) => { let any = false; const N = nObj.length; for (let i = 0; i < N; i++) { const o = nObj[i], p = nPar[i]; const v = (o.visible && (p < 0 || nVis[p] === 1)) ? 1 : 0; if (v !== nVis[i]) { nVis[i] = v; nChg[i] = 1; any = true; } else nChg[i] = 0; }
    const n = all ? N : Math.min(N, Math.ceil(N / 8)); for (let c = 0; c < n; c++) { if (S.ni >= N) S.ni = 0; const i = S.ni++; if (nMoved[i] === 2) continue; const o = nObj[i]; if (o.parent !== nExp[i]) { nMoved[i] = 2; S.fullPass = true; } else if (nMoved[i] === 0 && mcs(o.matrix.elements) !== nCs[i]) { nMoved[i] = 1; dynSet.add(o); S.fullPass = true; } }
    return any; };
  /* moving pieces: copy each shown original's world matrix into its BatchedMesh when it changed (runs after three has updated the matrices, before it draws) */
  const moverList = []; let moverN = -1;
  const syncMovers = () => { if (moverN !== members.length) { moverList.length = 0; for (let i = 0; i < members.length; i++) { const m = members[i]; if (m.b.bm) moverList.push(m); } moverN = members.length; } for (let i = 0; i < moverList.length; i++) { const m = moverList[i]; if (!m.on || m.dead) continue; const mw = m.o.matrixWorld, c = mcs(mw.elements); if (c !== m.wcs) { m.wcs = c; m.b.bm.setMatrixAt(m.id, mw); } } };
  const camBits = (on) => { const set = (c) => { if (c && c.layers) { if (on) c.layers.mask |= CAM; else c.layers.mask &= ~CAM; } }; set(app.camera); let xc = null; try { xc = R.xr && R.xr.getCamera ? R.xr.getCamera() : null; } catch (e) { } if (xc) { const eyes = xc.cameras || []; if (on && xc.isArrayCamera && eyes.length === 0) return; /* never flag the pair before both eyes exist, or one frame would draw neither */ set(xc); for (const c of eyes) set(c); } };
  let prevSOBR = null, hooked = false;
  const sceneHook = function (r, s, c, t) { syncMovers(); if (prevSOBR) prevSOBR.call(this, r, s, c, t); };
  const hook = (on) => { if (on && !hooked) { prevSOBR = Object.prototype.hasOwnProperty.call(scene, 'onBeforeRender') ? scene.onBeforeRender : null; scene.onBeforeRender = sceneHook; hooked = true; } else if (!on && hooked) { if (scene.onBeforeRender === sceneHook) { if (prevSOBR) scene.onBeforeRender = prevSOBR; else delete scene.onBeforeRender; } hooked = false; prevSOBR = null; } };
  const compact = () => { if (dead < 200 || dead < members.length * 0.25) return; let w = 0; for (let i = 0; i < members.length; i++) { const m = members[i]; if (!m.dead) members[w++] = m; } members.length = w; dead = 0; S.mi = 0; moverN = -1; for (let i = batches.length - 1; i >= 0; i--) { const b = batches[i]; if (b.live > 0) continue; root.remove(b.mesh); try { b.bm ? b.bm.dispose() : b.geo.dispose(); } catch (e) { } batches.splice(i, 1); const j = movers.indexOf(b); if (j >= 0) movers.splice(j, 1); } };
  const upkeep = () => {
    const anyVis = nodePass(false);
    { const n = Math.min(mats.length, Math.ceil(mats.length / 16)); for (let c = 0; c < n; c++) { if (S.ki >= mats.length) S.ki = 0; const me = mats[S.ki++]; if (!me.bad && matCs(me.m) !== me.cs) { me.bad = true; matOf.delete(me.m); S.fullPass = true; } } }
    const M = members.length;
    if (S.fullPass) { S.fullPass = false; for (let i = 0; i < M; i++) { const m = members[i]; if (!m.dead) evalMember(m, true); } for (let i = mats.length - 1; i >= 0; i--) if (mats[i].bad) mats.splice(i, 1); S.ki = 0; }
    else { if (anyVis) for (let i = 0; i < M; i++) { const m = members[i]; if (!m.dead && m.pn >= 0 && nChg[m.pn]) evalMember(m, false); } const n = Math.min(M, Math.ceil(M / 8)); for (let c = 0; c < n; c++) { if (S.mi >= M) S.mi = 0; const m = members[S.mi++]; if (!m.dead) evalMember(m, true); } }
    flush(); compact();
  };
  const zonesBuilt = () => { let z = 0; const Z = app.zones || []; for (let i = 0; i < Z.length; i++) if (Z[i].built) z++; return z; };
  const update = () => {
    const t = now();
    if (S.active) { if (S.enabled) camBits(true); upkeep(); if (S.warm > 0 && --S.warm === 0 && !(R.xr && R.xr.isPresenting)) stop(); }
    if (!S.want) return;
    if (!S.gen) { if (t - S.trigT > 1000) { S.trigT = t; const z = zonesBuilt(), n = scene.children.length; if (z !== S.trigZ) { S.trigZ = z; S.trigN = n; S.needRound = true; } else if (t - S.lastRound > 20000 && (n !== S.trigN || S.evicted !== S.evictedAtRound)) { S.trigN = n; S.needRound = true; } } if (S.needRound && t - S.lastRound > (S.rounds ? 4000 : 0) && !app.ride && !app.vehicle) { S.needRound = false; S.waitUntil = 0; S.gen = round(); } }
    if (S.gen && t >= S.waitUntil && !app.ride && !app.vehicle) { deadline = t + (R.xr && R.xr.isPresenting ? 2.5 : 7); try { S.gen.next(); } catch (e) { console.error('wvm-batch round', e); S.gen = null; S.lastRound = now(); } const ms = now() - t; if (ms > S.maxSlice) { S.maxSlice = ms; S.maxAt = S.ph; } (S.slow = S.slow || {}); if (ms > 6) S.slow[S.ph] = (S.slow[S.ph] || 0) + 1; }
  };
  /* ---- on / off ---- */
  function start(warm) {
    S.want = true; if (S.active) { if (!warm) { S.warm = 0; S.noLod = false; for (const b of batches) if (!b.bm) b.mesh.frustumCulled = true; } return; } S.active = true; S.noLod = !!warm;
    try { opts.lodReset && opts.lodReset(); } catch (e) { }
    nodePass(true); for (const me of mats) if (!me.bad && matCs(me.m) !== me.cs) { me.bad = true; matOf.delete(me.m); }
    for (let i = 0; i < members.length; i++) { const m = members[i]; if (m.dead) continue; evalMember(m, true); if (!m.dead) arm(m); }
    flush(); for (const b of batches) { b.mesh.visible = b.shown > 0; if (!b.bm) b.mesh.frustumCulled = !warm; } S.fullPass = false; syncMovers();
    root.visible = S.enabled; hook(true); if (S.enabled) camBits(true);
  }
  function stop() {
    if (!S.active) return; S.active = false; S.warm = 0; S.noLod = false; camBits(false); hook(false); root.visible = false;
    for (let i = 0; i < members.length; i++) disarm(members[i]); for (const b of batches) if (!b.bm) b.mesh.frustumCulled = true;
    try { opts.lodReset && opts.lodReset(); } catch (e) { }
  }
  const setEnabled = (on) => { S.enabled = !!on; if (S.active) { root.visible = S.enabled; camBits(S.enabled); } };
  const stats = () => { let live = 0, shown = 0, vis = 0, mv = 0; for (const m of members) if (!m.dead) { live++; if (m.on) shown++; if (m.b.bm) mv++; } for (const b of batches) if (b.mesh.visible) vis++; return { active: S.active, enabled: S.enabled, building: !!S.gen, rounds: S.rounds, batches: batches.length, batchesVisible: vis, movingBatches: movers.length, members: live, movingMembers: mv, shown, evicted: S.evicted, why: S.why, doa: S.doa, singles: S.singles, nodes: nObj.length, materials: batchMats.size, compiles: S.compiles, verts: S.verts, tris: Math.round(S.tris), buildMs: Math.round(S.buildMs), maxSliceMs: +S.maxSlice.toFixed(1), maxSliceAt: S.maxAt, slowSlices: S.slow, multiDraw: !!(R.extensions && R.extensions.has && R.extensions.has('WEBGL_multi_draw')) }; };
  /* invariants: while on, every live member is armed; while off, nothing in the scene still carries the stand-in layers */
  const check = () => { let bad = 0, left = 0; if (S.active) { for (const m of members) if (!m.dead && m.o.layers !== NODRAW && m.o.layers !== NOHIT) bad++; } else scene.traverse(o => { if (o.layers === NODRAW || o.layers === NOHIT) left++; }); const cams = [app.camera]; try { const xc = R.xr.getCamera(); cams.push(xc); for (const c of xc.cameras || []) cams.push(c); } catch (e) { } return { active: S.active, unarmed: bad, leftover: left, camBit: cams.map(c => (c.layers.mask & CAM) ? 1 : 0).join(''), hook: hooked, rootVisible: root.visible }; };
  /* why is this object not in a batch? (debugging aid) */
  const explain = (o) => { if (memberOf.has(o)) return 'batched'; if (!o.isMesh) return 'not a mesh'; const m = o.material; if (Array.isArray(m)) return 'material array'; if (m && dynMat.has(m)) return 'material animates'; if (!okMesh(o)) return o.userData.isSign ? 'sign' : 'mesh kind'; if (m && m.transparent) return 'transparent'; if (!okMat(m)) return 'material kind'; let q = o.parent; while (q && q !== scene) { if (q.userData.noBatch) return 'under noBatch'; q = q.parent; } if (!q) return 'detached'; if (!okGeo(o.geometry, matInfo(m))) return 'geometry kind'; return 'no partner'; };
  app.onUpdate ? app.onUpdate(update) : app.updaters.push(update);
  return { explain, start: () => start(false), stop, prepare: () => { S.want = true; }, setEnabled, stats, check, update, root, state: S };
}
