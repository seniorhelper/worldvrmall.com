-- ============================================================
-- PROPOSED for allofus.one (NOT in the mall's run order): connection consent guard
-- Today a member's own browser can insert a connections row with status 'accepted', or accept its OWN request
-- (the "update my connections" policy lets either side change status). That skips the other person's consent, and
-- "connected" unlocks DMs, presence and mall visibility. This trigger makes consent server-side:
--   * a member's INSERT always lands as 'pending' (except a connection to or from the founder, which allofus auto-adds)
--   * only the ADDRESSEE may move a row to 'accepted' or 'declined'
--   * changing kind (wave -> connect) by the requester resets the row to 'pending'
-- Security-definer functions (welcome_new_member, claim_my_pages) run as the owner and are not affected.
-- The allofus session should test its flows (aou-flat2.js founder connect, aou-social.js wave -> connect) and then
-- ship this in its own round. Additive, idempotent.
-- ============================================================
create or replace function public.wvm_connections_consent() returns trigger
language plpgsql set search_path = public as $$
declare uid uuid := auth.uid(); f uuid;
begin
  if current_user not in ('anon', 'authenticated') or public.is_admin() then return new; end if;
  begin f := public.founder_id(); exception when others then f := null; end;
  if tg_op = 'INSERT' then
    if new.status <> 'pending' and not (f is not null and f in (new.requester, new.addressee)) then new.status := 'pending'; end if;
    return new;
  end if;
  if new.requester is distinct from old.requester or new.addressee is distinct from old.addressee then
    raise exception 'A connection''s people cannot change.';
  end if;
  if uid = old.requester and uid is distinct from old.addressee then
    if new.kind is distinct from old.kind then new.status := 'pending'; end if;
    if new.status in ('accepted', 'declined') and new.status is distinct from old.status
       and not (f is not null and f = old.addressee) then
      raise exception 'Only the other person can accept or decline.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists wvm_connections_consent on public.connections;
create trigger wvm_connections_consent before insert or update on public.connections for each row execute function public.wvm_connections_consent();
