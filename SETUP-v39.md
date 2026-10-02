# World VR Mall v39 · setup
1. Upload this folder to the repo root (replace everything).
2. Supabase (the same allofus.one project) → SQL Editor → run `worldvrmall-v39.sql` (prizes, claims, leads).
3. Optional email alerts: Supabase → Database → Webhooks → INSERT on `prize_claims` and on `leads` → Zapier → Gmail.
4. Prize claims and leads show in Supabase → Table Editor → prize_claims / leads. If the claim system ever fails, players are shown 1-800-481-8638 and info@eyetoad.com with their claim code.
