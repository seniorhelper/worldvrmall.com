/* ============================================================
   World VR Mall · The World Fire · live video + voice (gather-1, Oct 2026)
   A WebRTC mesh for one fire circle (12 people max = 11 connections each). Signaling rides on the circle's
   voice channel (wvm-gather-net.js). Media goes straight between browsers and is never recorded.
   - Non-trickle ICE: the offer and the answer carry all their candidates, so a pair needs exactly two messages.
   - Each connection opens with an audio and a video transceiver, so turning the mic or camera on later is a
     replaceTrack, never a renegotiation. Mic and camera stay OFF until the person turns them on.
   - Who calls whom: for every pair the larger id sends the offer (no glare). A pair that has not connected after
     15 s is torn down and called again.
   - Voices are spatial: remote audio -> PannerNode (HRTF) at the speaker's seat; the listener follows the camera.
   - STUN: Google + Cloudflare. TURN: CONFIG.TURN in js/wvm-config.js (or window.WVM_TURN), see WORLD-FIRE.md.
   ============================================================ */
import { CONFIG } from '/js/wvm-config.js';

export const MAX = 12;
export const iceServers = () => {
  const L = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
  const t = window.WVM_TURN || (CONFIG && CONFIG.TURN); if (t) [].concat(t).forEach((x) => x && x.urls && L.push(x));
  return L;
};
const VIDEO = { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 15, max: 15 }, facingMode: 'user' };
const AUDIO = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

/* wait for ICE gathering to finish (or 2.5 s, whatever came first): the SDP then carries every candidate */
const iceDone = (pc) => new Promise((res) => { if (pc.iceGatheringState === 'complete') return res(); const t = setTimeout(res, 2500); pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } }); });

export function createMesh({ net, myId, onChange = () => { }, canPeer = () => true }) {
  const peers = new Map(); const local = { mic: null, cam: null, camStream: null, talking: false };
  let ctx = null; const want = new Set(); let alive = true;
  const audioCtx = () => { if (ctx) return ctx; try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; } return ctx; };
  const changed = () => { try { onChange(api); } catch (e) { } };

  const attachLocal = (p) => { try { if (p.aT) p.aT.sender.replaceTrack(local.mic); if (p.vT) p.vT.sender.replaceTrack(local.cam); } catch (e) { } };
  const capVideo = (p) => { try { const s = p.vT && p.vT.sender; if (!s || !s.getParameters) return; const prm = s.getParameters(); if (!prm.encodings || !prm.encodings.length) prm.encodings = [{}]; prm.encodings[0].maxBitrate = 220000; prm.encodings[0].maxFramerate = 15; s.setParameters(prm).catch(() => { }); } catch (e) { } };

  const remoteAudio = (p, track) => {
    if (p.audioNodes) { try { p.audioNodes.src.disconnect(); } catch (e) { } p.audioNodes = null; }
    const ms = new MediaStream([track]);
    /* Chrome only pumps a remote WebRTC track into WebAudio while some media element plays it: a muted <audio> does that */
    p.audioEl.srcObject = ms; p.audioEl.muted = true; p.audioEl.play().catch(() => { });
    const c = audioCtx();
    if (!c) { p.audioEl.muted = false; return; }
    try {
      const src = c.createMediaStreamSource(ms); const gain = c.createGain(); const pan = c.createPanner(); const an = c.createAnalyser();
      pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.refDistance = 1.6; pan.maxDistance = 30; pan.rolloffFactor = 1.1;
      an.fftSize = 256; src.connect(an); src.connect(gain); gain.connect(pan); pan.connect(c.destination);
      p.audioNodes = { src, gain, pan, an, buf: new Uint8Array(an.frequencyBinCount) }; gain.gain.value = p.vol;
    } catch (e) { p.audioEl.muted = false; }
  };

  const makePeer = (id) => {
    let p = peers.get(id); if (p) return p;
    const pc = new RTCPeerConnection({ iceServers: iceServers(), bundlePolicy: 'max-bundle' });
    const audioEl = document.createElement('audio'); audioEl.autoplay = true; audioEl.playsInline = true;
    const video = document.createElement('video'); video.autoplay = true; video.playsInline = true; video.muted = true; video.setAttribute('playsinline', '');
    p = { id, pc, aT: null, vT: null, audioEl, video, vStream: new MediaStream(), state: 'new', born: Date.now(), vol: 1, audioNodes: null };
    video.srcObject = p.vStream;
    pc.ontrack = (e) => {
      if (e.track.kind === 'audio') remoteAudio(p, e.track);
      else { p.vStream.getVideoTracks().forEach((t) => p.vStream.removeTrack(t)); p.vStream.addTrack(e.track); video.play().catch(() => { }); }
      changed();
    };
    pc.onconnectionstatechange = () => { p.state = pc.connectionState; if (p.state === 'connected') capVideo(p); if (p.state === 'failed') drop(id); changed(); };
    peers.set(id, p); return p;
  };
  const drop = (id) => { const p = peers.get(id); if (!p) return; peers.delete(id); try { p.pc.close(); } catch (e) { } try { if (p.audioNodes) p.audioNodes.src.disconnect(); } catch (e) { } p.audioEl.srcObject = null; p.video.srcObject = null; changed(); };

  const call = async (id) => {
    const p = makePeer(id);
    p.aT = p.pc.addTransceiver('audio', { direction: 'sendrecv' }); p.vT = p.pc.addTransceiver('video', { direction: 'sendrecv' }); attachLocal(p);
    const off = await p.pc.createOffer(); await p.pc.setLocalDescription(off); await iceDone(p.pc);
    if (!alive || peers.get(id) !== p) return;
    net.send('sig', { to: id, t: 'offer', sdp: p.pc.localDescription.sdp });
  };
  const answer = async (id, sdp) => {
    if (peers.has(id)) drop(id); const p = makePeer(id);
    await p.pc.setRemoteDescription({ type: 'offer', sdp });
    for (const tr of p.pc.getTransceivers()) { const k = tr.receiver && tr.receiver.track && tr.receiver.track.kind; tr.direction = 'sendrecv'; if (k === 'audio') p.aT = tr; else if (k === 'video') p.vT = tr; }
    attachLocal(p);
    const ans = await p.pc.createAnswer(); await p.pc.setLocalDescription(ans); await iceDone(p.pc);
    if (!alive || peers.get(id) !== p) return;
    net.send('sig', { to: id, t: 'answer', sdp: p.pc.localDescription.sdp });
  };
  const early = new Map(); /* an offer that beat the presence sync: held 8 s, answered once the sender shows up in the circle */
  const onSig = async (m) => {
    if (!alive || !m || m.to !== myId || !m.from || !canPeer(m.from)) return;
    if (!want.has(m.from)) { if (m.t === 'offer') early.set(m.from, Object.assign({ at: Date.now() }, m)); return; }
    try {
      if (m.t === 'offer' && m.from > myId) await answer(m.from, m.sdp);
      else if (m.t === 'answer') { const p = peers.get(m.from); if (p && p.pc.signalingState === 'have-local-offer') await p.pc.setRemoteDescription({ type: 'answer', sdp: m.sdp }); }
      else if (m.t === 'poke' && myId > m.from && !peers.has(m.from)) await call(m.from);
    } catch (e) { console.warn('fire rtc', e); }
  };
  net.on('sig', onSig);

  /* keep the mesh equal to the circle: call the new ones, drop the gone, retry the stuck */
  const sweep = () => {
    if (!alive) return; const now = Date.now();
    for (const [id, m] of early) { if (now - m.at > 8000) early.delete(id); else if (want.has(id)) { early.delete(id); onSig(m); } }
    for (const id of [...peers.keys()]) if (!want.has(id) || !canPeer(id)) drop(id);
    for (const id of want) {
      if (id === myId || !canPeer(id)) continue; const p = peers.get(id);
      if (p && p.state !== 'connected' && now - p.born > 15000) drop(id);
      if (!peers.has(id)) { if (myId > id) call(id).catch((e) => console.warn('fire call', e)); else net.send('sig', { to: id, t: 'poke' }); }
    }
  };
  const sweepT = setInterval(sweep, 5000);

  const getTrack = async (kind) => { const s = await navigator.mediaDevices.getUserMedia(kind === 'audio' ? { audio: AUDIO } : { video: VIDEO }); return s; };
  const api = {
    peers, _early: early,
    /* the people in this circle right now (ids, me included): the mesh follows it */
    setMembers(ids) { want.clear(); ids.slice(0, MAX).forEach((id) => want.add(id)); const now = Date.now(); for (const [id, m] of early) { early.delete(id); if (now - m.at < 8000 && want.has(id)) onSig(m); } sweep(); },
    async micOn() { if (local.mic) return true; try { const s = await getTrack('audio'); local.mic = s.getAudioTracks()[0]; local.mic.enabled = !api.ptt || local.talking; for (const p of peers.values()) attachLocal(p); audioCtx() && ctx.resume && ctx.resume(); changed(); return true; } catch (e) { console.warn('mic', e); return false; } },
    micOff() { if (!local.mic) return; local.mic.stop(); local.mic = null; for (const p of peers.values()) attachLocal(p); changed(); },
    async camOn() { if (local.cam) return true; try { const s = await getTrack('video'); local.camStream = s; local.cam = s.getVideoTracks()[0]; for (const p of peers.values()) attachLocal(p); changed(); return true; } catch (e) { console.warn('cam', e); return false; } },
    camOff() { if (!local.cam) return; local.cam.stop(); local.cam = null; local.camStream = null; for (const p of peers.values()) attachLocal(p); changed(); },
    ptt: false,
    setPTT(on) { api.ptt = !!on; if (local.mic) local.mic.enabled = !api.ptt || local.talking; changed(); },
    talk(down) { local.talking = !!down; if (local.mic) local.mic.enabled = !api.ptt || local.talking; },
    get micLive() { return !!(local.mic && local.mic.enabled); }, get hasMic() { return !!local.mic; }, get hasCam() { return !!local.cam; }, get camStream() { return local.camStream; },
    resume() { const c = audioCtx(); if (c && c.state === 'suspended') c.resume().catch(() => { }); },
    /* spatial voices: world positions for each speaker and for the listener (call every frame or two) */
    place(id, x, y, z) { const p = peers.get(id); const n = p && p.audioNodes; if (!n) return; const P = n.pan; if (P.positionX) { P.positionX.value = x; P.positionY.value = y; P.positionZ.value = z; } else P.setPosition(x, y, z); },
    listener(pos, fwd) { const c = ctx; if (!c) return; const L = c.listener; if (L.positionX) { L.positionX.value = pos.x; L.positionY.value = pos.y; L.positionZ.value = pos.z; L.forwardX.value = fwd.x; L.forwardY.value = fwd.y; L.forwardZ.value = fwd.z; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; } else { L.setPosition(pos.x, pos.y, pos.z); L.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0); } },
    volume(id, v) { const p = peers.get(id); if (!p) return; p.vol = v; if (p.audioNodes) p.audioNodes.gain.gain.value = v; else p.audioEl.volume = Math.max(0, Math.min(1, v)); },
    level(id) { const p = peers.get(id); const n = p && p.audioNodes; if (!n) return 0; n.an.getByteFrequencyData(n.buf); let s = 0; for (let i = 0; i < n.buf.length; i++) s += n.buf[i]; return s / n.buf.length / 255; },
    video(id) { const p = peers.get(id); return p ? p.video : null; },
    connected(id) { const p = peers.get(id); return !!(p && p.state === 'connected'); },
    stats() { return [...peers.values()].map((p) => ({ id: p.id, state: p.state })); },
    async close() { alive = false; clearInterval(sweepT); for (const id of [...peers.keys()]) drop(id); api.micOff(); api.camOff(); if (ctx) { try { await ctx.close(); } catch (e) { } ctx = null; } },
  };
  return api;
}
