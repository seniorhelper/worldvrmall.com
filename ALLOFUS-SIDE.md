# What allofus.one needs for the mall social bridge

Written by the World VR Mall social-bridge session (Oct 25 2026, branch `claude/wvm-social-7f3001`) for whoever owns the allofus.one repo. Nothing here has been changed in the allofus repo. The mall side is done and works without these, but these four pieces make the round trip feel like one place.

allofus.one is at sw v130 (Oct 25). Ship these in your next round with `V` bumped past v130, so returning visitors get the new hand-off code. Any SQL you add for them is numbered v31+ (production is at v30). The mall's own `wvm-social-v31.sql` follows that numbering.

Both sites share one Supabase project. The mall reuses allofus tables directly: `connections`, `messages`, `circles`, `circle_members`, `presence`, `profiles.blocked` and `member_safety`. There are no copies. A DM sent in the mall is an ordinary `public.messages` row and shows up in the allofus Comm Hub and DM page as it is.

---

## 1. "Back to the mall" (required for the hand-off)

The mall sends people to allofus with:

```
https://allofus.one/?from=mall&back=<url-encoded path>#aou_sso=…
```

`back` is a path on worldvrmall.com that puts them back where they were, for example `/mall/?mode=3d&at=12.4,-30.1,0` (x, z, floor) or `/?mode=3d&at=…` for the island. `#aou_sso=` is the existing session hand-off. `aou-sso.js` already accepts it, because the visitor arrives with a worldvrmall.com referrer.

Add to allofus:

1. On load, if `from=mall` and `back` pass the check below, keep it in `sessionStorage.aou_mall_back` for this visit and remove `back` from the address bar (`history.replaceState`).
2. While `aou_mall_back` is set, show a **"🏬 Back to the mall"** chip. Put it on the top strip or as the first item of the bottom nav "Worlds" group, in the same style as the existing Mall links. In the allofus VR menu, put it in the "Far / Mall" tab.
3. The chip opens `https://worldvrmall.com` + `back` **through `ssoHref()`**, so they arrive signed in. From inside VR, use the same leave-VR-then-navigate path that the existing Mall links use (`app.go`).

Strict check for `back` (never accept a full URL, so it can never become an open redirect):

```js
/* allofus.one · mall return path (paste into aou-sso.js or the rail) */
const MALL = 'https://worldvrmall.com';
const MALL_KEYS = new Set(['mode', 'at', 'to', 'store', 'with', 'thread', 'vr']);
export function mallBack(raw) {
  try {
    if (!raw || raw.length > 200 || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return null;
    const u = new URL(raw, MALL);
    if (u.origin !== MALL) return null;
    if (!/^\/(mall\/|stores\/[a-z0-9-]{1,60}\/)?$/.test(u.pathname)) return null;
    for (const k of [...u.searchParams.keys()]) if (!MALL_KEYS.has(k)) u.searchParams.delete(k);
    const at = u.searchParams.get('at'); if (at && !/^-?\d{1,4}(\.\d)?,-?\d{1,4}(\.\d)?(,-?\d{1,2})?$/.test(at)) u.searchParams.delete('at');
    for (const k of ['with', 'thread']) { const v = u.searchParams.get(k); if (v && !/^[0-9a-f-]{36}$/i.test(v)) u.searchParams.delete(k); }
    return u.href;
  } catch (e) { return null; }
}
```

If there's no `back` but `from=mall` is present, the chip goes to `https://worldvrmall.com/mall/?mode=3d`.

## 2. "Join them in the mall" (connections who are in the mall now)

While someone is in the mall, the mall writes their allofus `presence` row about once a minute: `where = 'mall'`, `page = '/mall/'` or `'/'` (the island) or `'/stores/<slug>/'`. Your existing "v26 presence connections only" policy already limits who can read it.

Wherever allofus shows a connection's online state (Posting lately faces, Comm Hub, profile, the 3D world's friend list):

- `presence.where === 'mall'` and `last_seen` within 3 minutes → show **"🛍️ In World VR Mall"** and a **"Join them"** button.
- The button opens, through `ssoHref()`, `https://worldvrmall.com` + `page` + `?mode=3d&with=<their user id>`. Only accept `page` values that match `^/(mall/|stores/[a-z0-9-]{1,60}/)?$`; otherwise use `/mall/`.
- In the mall, `?with=` looks the person up with `wvm_people()`, which runs the server rules, and teleports you next to them. If they've left, or the rules say no, it says so and nothing happens.

The exact spot is never shown on allofus. It lives only in `wvm_presence`, which only people allowed to see you can read.

## 3. "Reply in the mall" (optional)

On a DM thread with someone who is in the mall, add a small link: `https://worldvrmall.com/mall/?mode=3d&thread=<their user id>` (through `ssoHref()`). The mall opens the same conversation in its People panel.

The mall's "Continue on allofus.one" in a chat already opens `/?v=dm&with=<username>` (your existing DM deep link) with `from=mall&back=…`, so the chip from §1 brings them straight back.

## 4. Connection consent guard (please review and adopt)

**The issue:** today a member's browser can insert a `connections` row with `status = 'accepted'`. It can also accept its *own* request, because the "update my connections" policy lets either side change `status`. That skips the other person's consent. Being "connected" unlocks DMs, presence, and now visibility in the mall.

**The fix** is in the mall repo at `supabase/wvm-social-consent-guard.sql`. It's a trigger, `wvm_connections_consent`, that does three things:

- forces a member's insert to `pending` (except a row to or from `founder_id()`, which allofus adds automatically)
- lets only the **addressee** set `accepted` or `declined`
- resets a requester's wave → connect change to `pending`

Security-definer functions (`welcome_new_member`, `claim_my_pages`) aren't affected.

It is **not** in the mall's run order, because it changes allofus behaviour. Before shipping it in an allofus round, check:

- `js/aou-flat2.js:131`: the founder connect insert (allowed by the founder exception)
- `js/aou-flat2.js:166`: `update({ status: 'accepted', kind: 'connect' })`. Make sure only the addressee runs this.
- `js/aou-social.js:105`: `update({ kind: 'connect' })` on a wave the requester sent. It now needs the other person to accept again (that's the point).

It passed in PGlite against the real policies: a self-inserted `accepted` lands as `pending`, a requester can't self-accept, and the addressee can accept.

## 5. Nothing else to change

- **18+ stays the rule.** Every mall social feature requires `safety_is_adult()` on both sides and honours `profiles.blocked` both ways. Minors see no one and can't be messaged or connected; that matches allofus v26.
- **Circles:** the mall treats "you are in a Circle I own" or "I am in a Circle you own" as "may see each other in the mall". It reads `circle_members` only inside security-definer functions; no policy changes.
- **Text:** the mall refuses links, emails and pictures in messages it sends, and hides links in messages it shows. Messages written on allofus can still contain links. If you want the same rule server-side, a restrictive insert policy or trigger on `messages` would do it. That's your call.
- **Realtime:** the mall's private topics are `wvm-u:<uid>` (this branch) and `wvm:*` (the shield branch). Their policies never return true for allofus topics, so `rt_topic_allowed()` is unaffected.
