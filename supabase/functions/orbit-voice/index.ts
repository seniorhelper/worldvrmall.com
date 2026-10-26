// Orbit voice proxy (World VR Mall, Oct 25 2026). Supabase Edge Function `orbit-voice`.
// POST raw audio (audio/webm | audio/mp4 | audio/ogg, <= 600 KB, ~7 s) with the visitor's Supabase JWT.
// 1. signed-in adult only (public.safety_is_adult), rate limits in public.orbit_voice_take (see supabase/wvm-orbit-voice.sql)
// 2. ElevenLabs speech-to-text (Scribe) -> text            (nothing is stored; the transcript is not logged)
// 3. Orbit picks one of his FIXED answers (never repeats the visitor's words, never free-generates)
// 4. a fixed line -> { line } (the browser plays /audio/orbit-<line>.mp3); a store answer -> ElevenLabs TTS mp3 (base64)
// Secrets: ELEVENLABS_API_KEY (required), ORBIT_VOICE_ID (optional, default "Liam"). SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const XI = 'https://api.elevenlabs.io/v1';
const KEY = Deno.env.get('ELEVENLABS_API_KEY') ?? '';
const VOICE = Deno.env.get('ORBIT_VOICE_ID') ?? 'TX3LPaxmHKxFdv7VOQHJ';
const ORIGINS = [/^https:\/\/(www\.)?worldvrmall\.com$/, /^https:\/\/(www\.)?allofus\.one$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
const MAX_BYTES = 600_000;

const cors = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin && ORIGINS.some((r) => r.test(origin)) ? origin : 'https://worldvrmall.com',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
});
const json = (o: unknown, status: number, origin: string | null) => new Response(JSON.stringify(o), { status, headers: { ...cors(origin), 'Content-Type': 'application/json' } });

// Orbit's fixed answers. `line` = a pre-made mp3 in /audio/; text = what the toast shows (matches the mp3).
const FIXED: Record<string, { line: string; text: string; words: RegExp }> = {
  vr: { line: 'vr', text: 'In VR: left stick walks, right stick turns, trigger clicks the laser, grip pulls you to a spot. Y = menu, X = views, B = bug report.', words: /\b(vr|headset|quest|controller|laser|teleport|turn|stick|trigger|menu)\b/i },
  rides: { line: 'rides', text: 'Open the menu (or the map on screen) and pick Ride the coaster. You always ride life-size.', words: /\b(ride|rides|coaster|roller|chiller|wheel|thrill)\b/i },
  brand: { line: 'brand', text: 'Rent a walk-in storefront from $99 a month: worldvrmall.com/lease, or call 1-800-481-8638 and a real person picks up.', words: /\b(rent|lease|my (store|business|shop)|sell|storefront|price|cost|advertis)/i },
  join: { line: 'join', text: 'Looking around needs no account. Joining is free: one login works here and on allofus.one.', words: /\b(join|sign ?up|sign ?in|log ?in|account|register)\b/i },
  bug: { line: 'bug', text: 'Press B in VR or tap the bug button. One line is plenty; a person reads every report.', words: /\b(bug|broken|glitch|stuck|crash|error|not working)\b/i },
  mall: { line: 'mall', text: 'Walk the hall and tap any storefront to visit the real store; every buy button opens the brand\'s own site.', words: /\b(mall|store|stores|shop|shopping|buy|where|find)\b/i },
};
// The open storefronts (real businesses) and where they are. Place ids match app.places in the 3D mall.
const STORES: [string, string, string][] = [
  ['eye-to-ad-media', 'Eye To Ad Media', 'by the Grand Lobby'], ['showers4less', 'Showers4Less', 'just inside, on the left past the lobby'],
  ['buyweburl', 'BuyWebURL', 'on the right on the way to the Atrium'], ['search-converts', 'Search Converts', 'in the Americas Wing'],
  ['a-nu-do-salon', 'A Nu Do Salon', 'in the Americas Wing'], ['bear-creek-auto-glass', 'Bear Creek Auto Glass', 'in the Americas Wing'],
  ['bighorn-painting', 'Bighorn Painting', 'in the Americas Wing'], ['my-sales-help', 'MySalesHelp', 'in the Americas Wing'],
  ['aging-safely-baths', 'Aging Safely Baths', 'in the Americas Wing'], ['gnomad-promotions', 'Gnomad Promotions', 'in the Americas Wing'],
  ['hawaii-snorkeling', 'Best Hawaii Snorkeling', 'in the Asia, Africa and Islands Wing'], ['belize-adventures', 'Best Belize Adventures', 'in the Asia, Africa and Islands Wing'],
  ['costa-rica-escapes', 'Costa Rica Escapes', 'in the Asia, Africa and Islands Wing'], ['puerto-plata-getaways', 'Puerto Plata Getaways', 'in the Asia, Africa and Islands Wing'],
];
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
function answer(heard: string): { line?: string; text: string; place?: string } {
  const h = norm(heard);
  if (!h) return { line: 'sorry', text: 'I did not catch that. Ask about stores, rides, VR controls or renting a store.' };
  for (const [id, name, where] of STORES) {
    const n = norm(name), key = n.split(' ').filter((w) => w.length > 3);
    if (h.includes(n) || (key.length && key.every((w) => h.includes(w))) || h.includes(n.replace(/ /g, ''))) return { text: `${name} is ${where}. I will walk you there.`, place: id };
  }
  for (const k of ['vr', 'rides', 'brand', 'join', 'bug', 'mall']) if (FIXED[k].words.test(h)) return { line: FIXED[k].line, text: FIXED[k].text };
  return { line: 'sorry', text: 'I did not catch that. Ask about stores, rides, VR controls or renting a store.' };
}
const ttsCache = new Map<string, string>();
async function tts(text: string): Promise<string | null> {
  if (ttsCache.has(text)) return ttsCache.get(text)!;
  const r = await fetch(`${XI}/text-to-speech/${VOICE}?output_format=mp3_22050_32`, { method: 'POST', headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' }, body: JSON.stringify({ text, model_id: 'eleven_flash_v2_5' }) });
  if (!r.ok) return null;
  const u8 = new Uint8Array(await r.arrayBuffer()); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  const b64 = btoa(s); if (ttsCache.size < 200) ttsCache.set(text, b64); return b64;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== 'POST') return json({ error: 'method' }, 405, origin);
  if (!KEY) return json({ error: 'not configured' }, 503, origin);
  const type = (req.headers.get('content-type') || '').split(';')[0].trim();
  if (!/^audio\/(webm|mp4|ogg|mpeg|wav|x-m4a)$/.test(type)) return json({ error: 'audio only' }, 415, origin);
  const len = Number(req.headers.get('content-length') || 0); if (len > MAX_BYTES) return json({ error: 'too long' }, 413, origin);

  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: u } = await admin.auth.getUser(jwt); const uid = u?.user?.id;
  if (!uid) return json({ error: 'sign in' }, 401, origin);
  const { data: adult } = await admin.rpc('safety_is_adult', { uid }); if (adult !== true) return json({ error: 'adults only' }, 403, origin);
  const { data: take } = await admin.rpc('orbit_voice_take', { p_user: uid }); if (!take || take.ok !== true) return json({ error: 'busy', why: take?.why ?? 'limit' }, 429, origin);

  const audio = new Uint8Array(await req.arrayBuffer()); if (audio.length > MAX_BYTES || audio.length < 800) return json({ error: 'size' }, 413, origin);
  const fd = new FormData(); fd.append('model_id', 'scribe_v1'); fd.append('tag_audio_events', 'false'); fd.append('file', new Blob([audio], { type }), 'ask.' + (type.split('/')[1] || 'webm'));
  const s = await fetch(`${XI}/speech-to-text`, { method: 'POST', headers: { 'xi-api-key': KEY }, body: fd });
  if (!s.ok) return json({ error: 'stt' }, 502, origin);
  const heard = String((await s.json())?.text ?? '').slice(0, 200);
  const a = answer(heard);
  const out: Record<string, unknown> = { heard: heard.slice(0, 140), reply: a.text };
  if (a.line) out.line = a.line; else { const b = await tts(a.text); if (b) out.audio = b; }
  if (a.place) out.place = a.place;
  return json(out, 200, origin);
});
