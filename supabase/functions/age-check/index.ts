// World VR Mall + allofus.one · age-check · Supabase Edge Function (Deno) · v31, Oct 25 2026
// One-time age assurance for live social (voice, live video, The World Fire). Vendor-agnostic: pick the provider with
// safety_settings.age_provider ('none' | 'yoti' | 'persona' | 'test'); the vendor keys live ONLY in Edge Function secrets.
//
// Policy (Zach, Oct 25): Yoti is primary. Facial age estimation with Yoti's passive liveness (anti-spoofing) and a
// Challenge-25 threshold: an estimate of 25+ = adult_verified. Under 25 or uncertain → the same Yoti session falls back to an
// ID document + selfie match (doc scan, 18+). Persona is the documented fallback adapter. We store ONLY the outcome
// (passed / failed, method, age band) and the vendor reference: never the selfie, the video or the document.
//
// Routes (all POST, JSON):
//   { action: 'start', reason?, return_url? }   member JWT in Authorization → { ok, url, ref } or { ok:false, state:'not_configured' }
//   { action: 'poll', ref }                     member JWT → re-fetches the result from the vendor → { ok, status, level }
//   ?webhook=<provider>&k=<AGE_WEBHOOK_SECRET>  vendor notification. The body only tells us WHICH session; the result is
//                                               always re-fetched from the vendor with our server key (bodies are never trusted).
// Deploy: supabase functions deploy age-check --no-verify-jwt   (the function checks the member JWT itself)
// Secrets: AGE_WEBHOOK_SECRET (required) · YOTI_SDK_ID + YOTI_API_KEY (+ optional YOTI_BASE for a sandbox host) · PERSONA_API_KEY + PERSONA_TEMPLATE_ID ·
//          AGE_TEST_MODE=1 (founder-only test adapter) · AGE_RETURN_ORIGINS (default worldvrmall.com,allofus.one)
import { createClient } from "npm:@supabase/supabase-js@2";

const env = (k: string, d = "") => Deno.env.get(k) ?? d;
const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const FOUNDER = "320bf5d4-2d2d-482e-8633-87ced55e4155";
const ORIGINS = env("AGE_RETURN_ORIGINS", "worldvrmall.com,allofus.one").split(",").map((s) => s.trim()).filter(Boolean);
const SELF = env("SUPABASE_URL") + "/functions/v1/age-check";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

type Status = "passed" | "failed" | "pending" | "error" | "cancelled" | "expired";
type Outcome = { status: Status; method?: string; age_band?: string; vendor_status?: string };
interface AgeProvider {
  name: string;
  configured(): boolean;
  start(o: { ref: string; returnUrl: string; notifyUrl: string }): Promise<{ sessionRef: string; url: string }>;
  result(sessionRef: string): Promise<Outcome>;
  refFromWebhook(body: any): string | null;
}

// ── Yoti Age Verification (https://developers.yoti.com/age-verification) ──
// YOTI_BASE: https://age.yoti.com (live) unless Yoti gives you a different host for your sandbox SDK; set it as a secret then
const YOTI_BASE = env("YOTI_BASE", "https://age.yoti.com").replace(/\/+$/, "");
const YOTI_API = YOTI_BASE + "/api/v1";
const yoti: AgeProvider = {
  name: "yoti",
  configured: () => !!(env("YOTI_SDK_ID") && env("YOTI_API_KEY")),
  async start({ ref, returnUrl, notifyUrl }) {
    const body = {
      type: "OVER", ttl: 900, reference_id: ref,
      // Challenge 25: the face estimate must say 25+ (passive liveness = Yoti's anti-spoofing on the selfie)…
      age_estimation: { allowed: true, threshold: 25, level: "PASSIVE", retry_limit: 1 },
      // …otherwise an ID document + selfie match proves 18+
      doc_scan: { allowed: true, threshold: 18, authenticity: "AUTO", level: "PASSIVE", retry_limit: 1 },
      digital_id: { allowed: false, threshold: 18, retry_limit: 1 }, credit_card: { allowed: false, retry_limit: 1 }, mobile: { allowed: false, retry_limit: 1 },
      callback: { auto: true, url: returnUrl }, cancel_url: returnUrl, notification_url: notifyUrl,
    };
    const r = await fetch(YOTI_API + "/sessions", { method: "POST", headers: { Authorization: "Bearer " + env("YOTI_API_KEY"), "Yoti-SDK-Id": env("YOTI_SDK_ID"), "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.id) throw new Error("yoti session " + r.status);
    return { sessionRef: j.id, url: `${YOTI_BASE}?sessionId=${encodeURIComponent(j.id)}&sdkId=${encodeURIComponent(env("YOTI_SDK_ID"))}` };
  },
  async result(id) {
    const r = await fetch(`${YOTI_API}/sessions/${encodeURIComponent(id)}/result`, { headers: { Authorization: "Bearer " + env("YOTI_API_KEY"), "Yoti-SDK-Id": env("YOTI_SDK_ID"), "Content-Type": "application/json" } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { status: "error", vendor_status: "http " + r.status };
    const s = String(j.status || "").toUpperCase(); const method = j.method ? String(j.method) : undefined;
    const map: Record<string, Status> = { COMPLETE: "passed", FAIL: "failed", PENDING: "pending", IN_PROGRESS: "pending", CANCELLED: "cancelled", EXPIRED: "expired", ERROR: "error" };
    const status = map[s] ?? "error";
    const age_band = status === "passed" ? (method === "AGE_ESTIMATION" ? "25+ (face estimate, liveness)" : "18+ (" + (method || "document") + ")") : undefined;
    return { status, method, age_band, vendor_status: s };
  },
  refFromWebhook: (b) => b?.session_id ?? b?.sessionId ?? b?.id ?? null,
};

// ── Persona (documented fallback; the inquiry template must require 18+ with selfie + government ID) ──
const persona: AgeProvider = {
  name: "persona",
  configured: () => !!(env("PERSONA_API_KEY") && env("PERSONA_TEMPLATE_ID")),
  async start({ ref, returnUrl }) {
    const r = await fetch("https://withpersona.com/api/v1/inquiries", { method: "POST", headers: { Authorization: "Bearer " + env("PERSONA_API_KEY"), "Persona-Version": "2023-01-05", "Content-Type": "application/json" },
      body: JSON.stringify({ data: { attributes: { "inquiry-template-id": env("PERSONA_TEMPLATE_ID"), "reference-id": ref, "redirect-uri": returnUrl } } }) });
    const j = await r.json().catch(() => ({}));
    const id = j?.data?.id; if (!r.ok || !id) throw new Error("persona inquiry " + r.status);
    return { sessionRef: id, url: "https://withpersona.com/verify?inquiry-id=" + encodeURIComponent(id) };
  },
  async result(id) {
    const r = await fetch("https://withpersona.com/api/v1/inquiries/" + encodeURIComponent(id), { headers: { Authorization: "Bearer " + env("PERSONA_API_KEY"), "Persona-Version": "2023-01-05" } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { status: "error", vendor_status: "http " + r.status };
    const s = String(j?.data?.attributes?.status || "").toLowerCase();
    const status: Status = ["approved", "completed"].includes(s) ? "passed" : ["declined", "failed"].includes(s) ? "failed" : s === "expired" ? "expired" : ["created", "pending", "needs_review"].includes(s) ? "pending" : "error";
    return { status, method: "persona", age_band: status === "passed" ? "18+ (selfie + ID)" : undefined, vendor_status: s };
  },
  refFromWebhook: (b) => b?.data?.attributes?.payload?.data?.id ?? null,
};

// ── test adapter: founder account only, and only while AGE_TEST_MODE=1 (for QA of the whole flow without a vendor) ──
const test: AgeProvider = {
  name: "test",
  configured: () => env("AGE_TEST_MODE") === "1",
  async start({ ref, returnUrl }) { return { sessionRef: "test-" + ref, url: returnUrl + (returnUrl.includes("?") ? "&" : "?") + "age_check=done" }; },
  async result() { return { status: "passed", method: "TEST", age_band: "test" }; },
  refFromWebhook: () => null,
};
const PROVIDERS: Record<string, AgeProvider> = { yoti, persona, test };

async function chosen(): Promise<AgeProvider | null> {
  const { data } = await admin.from("safety_settings").select("value").eq("key", "age_provider").maybeSingle();
  const name = String((data?.value as string) ?? "none");
  const p = PROVIDERS[name];
  return p && p.configured() ? p : null;
}
async function member(req: Request) {
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data } = await admin.auth.getUser(jwt);
  return data?.user ?? null;
}
const safeReturn = (u: unknown) => { try { const x = new URL(String(u)); const h = x.hostname.replace(/^www\./, ""); if (x.protocol === "https:" && ORIGINS.some((o) => h === o || h.endsWith("." + o))) { x.hash = ""; return x.toString(); } } catch (_) { /* fall through */ } return "https://worldvrmall.com/"; };

async function apply(p: AgeProvider, ref: string) {
  const out = await p.result(ref);
  const { data, error } = await admin.rpc("age_check_result", { p_provider: p.name, p_ref: ref, p_result: out });
  return { out, applied: data, error: error?.message };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  const url = new URL(req.url);

  // vendor notification: authenticated by our secret in the URL; the result is re-fetched, never read from the body
  const hook = url.searchParams.get("webhook");
  if (hook) {
    if (!env("AGE_WEBHOOK_SECRET") || url.searchParams.get("k") !== env("AGE_WEBHOOK_SECRET")) return json({ ok: false }, 401);
    const p = PROVIDERS[hook]; if (!p || !p.configured()) return json({ ok: false, error: "provider" }, 400);
    const body = await req.json().catch(() => ({})); const ref = p.refFromWebhook(body);
    if (!ref) return json({ ok: true, ignored: true });
    const r = await apply(p, String(ref));
    return json({ ok: !r.error, status: r.out.status });
  }

  const user = await member(req);
  if (!user) return json({ ok: false, error: "Sign in with allofus first." }, 401);
  const body = await req.json().catch(() => ({}));
  const p = await chosen();
  if (!p) return json({ ok: false, state: "not_configured", error: "Age verification is not switched on yet." });
  if (p.name === "test" && user.id !== FOUNDER) return json({ ok: false, state: "not_configured", error: "Age verification is not switched on yet." });

  if (body.action === "start") {
    // only adults (DOB 18+) or members asked to re-check after a may-be-a-minor report may start a (paid) check
    const { data: ms } = await admin.from("member_safety").select("age_recheck").eq("user_id", user.id).maybeSingle();
    const { data: adult } = await admin.rpc("safety_is_adult", { uid: user.id });
    if (!adult && !ms?.age_recheck) return json({ ok: false, error: "Age checks are for adult accounts. Add your date of birth first." });
    const ref = crypto.randomUUID();
    const returnUrl = safeReturn(body.return_url);
    try {
      const s = await p.start({ ref, returnUrl, notifyUrl: `${SELF}?webhook=${p.name}&k=${encodeURIComponent(env("AGE_WEBHOOK_SECRET"))}` });
      const { data: logged, error } = await admin.rpc("age_check_start", { p_user: user.id, p_provider: p.name, p_ref: s.sessionRef, p_reason: String(body.reason || "").slice(0, 60) });
      if (error || !logged?.ok) return json({ ok: false, error: logged?.error || "Could not start the check." });
      return json({ ok: true, url: s.url, ref: s.sessionRef, provider: p.name });
    } catch (e) {
      console.warn("age-check start", p.name, String(e));
      return json({ ok: false, error: "The age-check service did not answer. Please try again in a minute." });
    }
  }

  if (body.action === "poll") {
    let ref = String(body.ref || "");
    if (!ref) { const { data } = await admin.from("age_checks").select("session_ref").eq("user_id", user.id).eq("provider", p.name).order("id", { ascending: false }).limit(1).maybeSingle(); ref = data?.session_ref || ""; }
    const { data: own } = await admin.from("age_checks").select("id").eq("user_id", user.id).eq("session_ref", ref).maybeSingle();
    if (!own) return json({ ok: false, error: "No age check in progress." });
    const r = await apply(p, ref);
    const { data: level } = await admin.rpc("safety_age_level", { uid: user.id });
    return json({ ok: !r.error, status: r.out.status, level });
  }
  return json({ ok: false, error: "unknown action" }, 400);
});
