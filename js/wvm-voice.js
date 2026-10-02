/* ============================================================
   allofus.one · voice chat (v4, Oct 2026)
   Real peer-to-peer WebRTC audio. Signaling rides on Supabase
   realtime (or any transport with send/onMessage). Up to 8
   people per room, echo cancellation + noise suppression,
   distance-based volume in the 3D world, mute, talking lights.
   Audio goes directly between people's browsers: never recorded.
   © 2026 allofus.one
   ============================================================ */
export const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
export const MAX_PEERS = 8;

/* Supabase transport: one realtime channel per voice room */
export function supabaseTransport(sb, myId) {
  let ch = null; const subs = [];
  return {
    async join(room) { ch = sb.channel('voice-' + room, { config: { broadcast: { self: false }, presence: { key: myId } } }); ch.on('broadcast', { event: 'sig' }, ({ payload }) => subs.forEach(f => f(payload))); ch.on('presence', { event: 'leave' }, ({ key }) => subs.forEach(f => f({ t: 'bye', from: key }))); await new Promise((res) => ch.subscribe(async (st) => { if (st === 'SUBSCRIBED') { await ch.track({ at: Date.now() }); res(); } })); },
    send(msg) { if (ch) ch.send({ type: 'broadcast', event: 'sig', payload: msg }); },
    onMessage(f) { subs.push(f); },
    async leave() { if (ch) { try { await ch.untrack(); await sb.removeChannel(ch); } catch (e) { } ch = null; } },
  };
}
/* same-device transport for testing two tabs */
export function localTransport(name = 'wvm-voice-test') {
  let bc = null; const subs = [];
  return { async join(room) { bc = new BroadcastChannel(name + ':' + room); bc.onmessage = (e) => subs.forEach(f => f(e.data)); }, send(m) { if (bc) bc.postMessage(m); }, onMessage(f) { subs.push(f); }, async leave() { if (bc) { bc.close(); bc = null; } } };
}

export function createVoice({ transport, myId, myName = 'Someone', iceServers = ICE, getVolume = null, onChange = () => { } }) {
  const peers = new Map(); let local = null, room = null, muted = false, ctx = null; const levels = new Map();
  const send = (m) => transport.send(Object.assign({ from: myId, name: myName, room }, m));
  const meter = (stream, id) => { try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); const src = ctx.createMediaStreamSource(stream); const an = ctx.createAnalyser(); an.fftSize = 256; src.connect(an); const buf = new Uint8Array(an.frequencyBinCount); levels.set(id, () => { an.getByteFrequencyData(buf); let s = 0; for (const v of buf) s += v; return s / buf.length / 255; }); } catch (e) { } };
  const makePeer = (id, name) => { if (peers.has(id)) return peers.get(id); const pc = new RTCPeerConnection({ iceServers }); const audio = new Audio(); audio.autoplay = true; audio.playsInline = true; const p = { id, name: name || 'Someone', pc, audio, state: 'new', pending: [] };
    local.getTracks().forEach(t => pc.addTrack(t, local));
    pc.onicecandidate = (e) => { if (e.candidate) send({ t: 'ice', to: id, c: e.candidate.toJSON() }); };
    pc.ontrack = (e) => { audio.srcObject = e.streams[0]; audio.play().catch(() => { }); };
    pc.onconnectionstatechange = () => { p.state = pc.connectionState; if (pc.connectionState === 'failed' || pc.connectionState === 'closed') drop(id); onChange(api.status()); };
    peers.set(id, p); onChange(api.status()); return p; };
  const drop = (id) => { const p = peers.get(id); if (!p) return; try { p.pc.close(); } catch (e) { } p.audio.srcObject = null; peers.delete(id); levels.delete(id); onChange(api.status()); };
  const flushIce = async (p) => { for (const c of p.pending) { try { await p.pc.addIceCandidate(c); } catch (e) { } } p.pending = []; };
  transport.onMessage(async (m) => { if (!local || !m || m.from === myId || (m.to && m.to !== myId) || (m.room && m.room !== room)) return;
    try {
      if (m.t === 'hello') { if (peers.size >= MAX_PEERS - 1) return; const p = makePeer(m.from, m.name); const off = await p.pc.createOffer(); await p.pc.setLocalDescription(off); send({ t: 'offer', to: m.from, sdp: p.pc.localDescription.toJSON() }); }
      else if (m.t === 'offer') { const p = makePeer(m.from, m.name); await p.pc.setRemoteDescription(m.sdp); await flushIce(p); const ans = await p.pc.createAnswer(); await p.pc.setLocalDescription(ans); send({ t: 'answer', to: m.from, sdp: p.pc.localDescription.toJSON() }); }
      else if (m.t === 'answer') { const p = peers.get(m.from); if (p && p.pc.signalingState === 'have-local-offer') { await p.pc.setRemoteDescription(m.sdp); await flushIce(p); } }
      else if (m.t === 'ice') { const p = peers.get(m.from); if (!p) return; if (p.pc.remoteDescription) await p.pc.addIceCandidate(m.c); else p.pending.push(m.c); }
      else if (m.t === 'bye') drop(m.from);
    } catch (e) { console.warn('voice', e); } });
  let volT = 0;
  const api = {
    async join(r, constraints) { if (room) await api.leave(); room = r; local = await navigator.mediaDevices.getUserMedia(constraints || { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); meter(local, 'me'); await transport.join(r); send({ t: 'hello' }); clearInterval(volT); volT = setInterval(async () => { for (const p of peers.values()) { try { const st = await api.stats(p.id); if (st) p.lvl = st.level; } catch (e) { } } if (!getVolume) return; for (const p of peers.values()) { const v = getVolume(p.id); if (typeof v === 'number') p.audio.volume = Math.max(0, Math.min(1, v)); } }, 250); onChange(api.status()); return api.status(); },
    async leave() { if (!room) return; send({ t: 'bye' }); for (const id of [...peers.keys()]) drop(id); if (local) local.getTracks().forEach(t => t.stop()); local = null; clearInterval(volT); await transport.leave(); room = null; onChange(api.status()); },
    mute(on = !muted) { muted = on; if (local) local.getAudioTracks().forEach(t => t.enabled = !muted); onChange(api.status()); return muted; },
    level(id = 'me') { if (id !== 'me') { const p = peers.get(id); return p ? (p.lvl || 0) : 0; } const f = levels.get(id); return f ? f() : 0; },
    async stats(id) { const p = peers.get(id); if (!p) return null; const r = await p.pc.getStats(); let out = null; r.forEach(s => { if (s.type === 'inbound-rtp' && s.kind === 'audio') out = { bytes: s.bytesReceived, level: s.audioLevel || 0, packets: s.packetsReceived }; }); return out; },
    status() { return { room, muted, peers: [...peers.values()].map(p => ({ id: p.id, name: p.name, state: p.state })) }; },
  };
  return api;
}
