-- ============================================================
-- World VR Mall v39 · prize hunt claims + store/investor leads
-- Run once in Supabase → SQL Editor (same allofus.one project). Safe to re-run.
-- No emails or secrets in here: fine to keep in the repo.
-- ============================================================
create table if not exists public.prizes (id text primary key, title text not null, value int, claimed_at timestamptz, claimed_by uuid);
insert into public.prizes (id, title, value) values
  ('wholefoods20', '$20 Whole Foods Market gift card', 20),
  ('painting', 'Original abstract painting by Zachary Wennstedt', 1500),
  ('gas50', '$50 gas card', 50),
  ('funnel5000', 'Optimized sales funnel landing page', 5000)
on conflict (id) do nothing;
alter table public.prizes enable row level security;
drop policy if exists "prizes readable" on public.prizes;
create policy "prizes readable" on public.prizes for select using (true);

create table if not exists public.prize_claims (
  id bigint generated always as identity primary key,
  prize text references public.prizes(id), user_id uuid, name text, email text, phone text, address text,
  code text, page text, status text default 'pending', created_at timestamptz default now());
alter table public.prize_claims enable row level security;
drop policy if exists "admins read claims" on public.prize_claims;
create policy "admins read claims" on public.prize_claims for select using (public.is_admin());
drop policy if exists "admins update claims" on public.prize_claims;
create policy "admins update claims" on public.prize_claims for update using (public.is_admin());

-- first valid claim wins; one prize per person (by account and by email)
create or replace function public.claim_prize(p_prize text, p_name text, p_email text, p_phone text, p_address text, p_code text, p_page text)
returns text language plpgsql security definer set search_path = public as $$
declare taken timestamptz; uid uuid := auth.uid();
begin
  if char_length(coalesce(p_name,'')) < 2 or p_email !~ '^\S+@\S+\.\S+$' then return 'invalid'; end if;
  if exists (select 1 from public.prize_claims c where c.status <> 'rejected' and (lower(c.email) = lower(p_email) or (uid is not null and c.user_id = uid))) then return 'limit'; end if;
  if (select count(*) from public.prize_claims c where c.created_at > now() - interval '1 hour' and lower(c.email) = lower(p_email)) > 3 then return 'limit'; end if;
  select claimed_at into taken from public.prizes where id = p_prize for update;
  if not found then return 'invalid'; end if;
  if taken is not null then
    insert into public.prize_claims (prize, user_id, name, email, phone, address, code, page, status) values (p_prize, uid, left(p_name,80), left(p_email,120), left(p_phone,30), left(p_address,200), left(p_code,60), left(p_page,20), 'late');
    return 'taken'; end if;
  update public.prizes set claimed_at = now(), claimed_by = uid where id = p_prize;
  insert into public.prize_claims (prize, user_id, name, email, phone, address, code, page) values (p_prize, uid, left(p_name,80), left(p_email,120), left(p_phone,30), left(p_address,200), left(p_code,60), left(p_page,20));
  return 'won';
end $$;
grant execute on function public.claim_prize(text,text,text,text,text,text,text) to anon, authenticated;

-- leads: store showrooms, investors, sponsors (insert-only through the function, admins read)
create table if not exists public.leads (
  id bigint generated always as identity primary key,
  kind text, name text, business text, email text, phone text, website text, details jsonb, created_at timestamptz default now(), handled boolean default false);
alter table public.leads enable row level security;
drop policy if exists "admins read leads" on public.leads;
create policy "admins read leads" on public.leads for select using (public.is_admin());
drop policy if exists "admins update leads" on public.leads;
create policy "admins update leads" on public.leads for update using (public.is_admin());
create or replace function public.submit_lead(p_kind text, p_name text, p_business text, p_email text, p_phone text, p_website text, p_details text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if char_length(coalesce(p_name,'')) < 2 or p_email !~ '^\S+@\S+\.\S+$' then return 'invalid'; end if;
  if (select count(*) from public.leads l where lower(l.email) = lower(p_email) and l.created_at > now() - interval '10 minutes') >= 2 then return 'slow down'; end if;
  insert into public.leads (kind, name, business, email, phone, website, details) values (left(p_kind,20), left(p_name,80), left(p_business,120), left(p_email,120), left(p_phone,30), left(p_website,200), coalesce(nullif(p_details,''),'{}')::jsonb);
  return 'ok';
end $$;
grant execute on function public.submit_lead(text,text,text,text,text,text,text) to anon, authenticated;

-- Email alerts: Supabase → Database → Webhooks → new hook on INSERT for prize_claims and for leads → Zapier/Make → Gmail to info@eyetoad.com.
