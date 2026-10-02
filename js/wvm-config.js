/* ============================================================
   allofus.one · settings
   Leave these blank = DEMO mode (everything saves on the visitor's
   own device, demo residents answer). Paste your Supabase Project
   URL + anon public key = LIVE mode (real accounts, real chat,
   real players walking around). See /SETUP.md.
   The anon key is SAFE to publish (Row Level Security protects
   the data). NEVER paste the service_role key here.
   ============================================================ */
export const CONFIG = {
  SUPABASE_URL: 'https://izfccjaznlcffvjxawya.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_b6KPHJ3aPWaxl3yVz93sTw_c47NzfOF',
  // Optional voice relay for strict networks (a TURN server). Example:
  // TURN: { urls: 'turn:YOUR-TURN-HOST:3478', username: 'user', credential: 'pass' },
  TURN: null,
};
