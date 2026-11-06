-- Feature: install or upgrade cloud sync atomically without deleting existing account workspaces.
-- Run as the database administrator in the SQL Editor; keep `private` OUT of exposed API schemas.
begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Feature: move the original public table in place, retaining its rows and revision history.
do $$
begin
  if pg_catalog.to_regclass('public.cloud_workspaces') is not null then
    if pg_catalog.to_regclass('private.cloud_workspaces') is not null then
      raise exception 'Both cloud workspace tables exist. Review them before upgrading; no data was changed.';
    end if;
    alter table public.cloud_workspaces set schema private;
  end if;
end;
$$;

create table if not exists private.cloud_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  workspace jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);
comment on table private.cloud_workspaces is 'Private, account-owned portable workspaces; only bounded authenticated RPCs may access them.';
alter table private.cloud_workspaces enable row level security;
alter table private.cloud_workspaces force row level security;
revoke all on table private.cloud_workspaces from public, anon, authenticated;
-- Column grants survive table-level REVOKE, so explicitly remove the old version column privileges too.
revoke all (user_id, workspace, revision, updated_at) on private.cloud_workspaces from public, anon, authenticated;
drop policy if exists "Read own cloud workspace" on private.cloud_workspaces;
drop policy if exists "Create own cloud workspace" on private.cloud_workspaces;
drop policy if exists "Update own cloud workspace" on private.cloud_workspaces;

-- Feature: reject malformed or unbounded core records before they enter cloud storage.
-- Optional editor/profile fields receive full portable-format validation again on every client restore.
create or replace function private.valid_cloud_workspace(value jsonb)
returns boolean language plpgsql immutable security invoker set search_path = ''
as $$
declare
  story jsonb;
  chapter jsonb;
  entry jsonb;
  collection text;
begin
  if value is null or pg_catalog.jsonb_typeof(value) <> 'object'
    or value -> 'version' is distinct from '1'::jsonb
    or pg_catalog.jsonb_typeof(value -> 'updatedAt') is distinct from 'string'
    or pg_catalog.jsonb_typeof(value -> 'stories') is distinct from 'array' then return false; end if;
  if pg_catalog.octet_length(value::text) > 20971520 or pg_catalog.jsonb_array_length(value -> 'stories') > 100 then return false; end if;
  for story in select item from pg_catalog.jsonb_array_elements(value -> 'stories') as stories(item) loop
    if pg_catalog.jsonb_typeof(story) is distinct from 'object'
      or pg_catalog.jsonb_typeof(story -> 'id') is distinct from 'string' or pg_catalog.length(story ->> 'id') not between 1 and 256
      or pg_catalog.jsonb_typeof(story -> 'title') is distinct from 'string'
      or pg_catalog.jsonb_typeof(story -> 'description') is distinct from 'string'
      or pg_catalog.jsonb_typeof(story -> 'createdAt') is distinct from 'string'
      or pg_catalog.jsonb_typeof(story -> 'updatedAt') is distinct from 'string'
      or pg_catalog.jsonb_typeof(story -> 'chapters') is distinct from 'array' then return false; end if;
    if pg_catalog.jsonb_array_length(story -> 'chapters') > 10000 then return false; end if;
    for chapter in select item from pg_catalog.jsonb_array_elements(story -> 'chapters') as chapters(item) loop
      if pg_catalog.jsonb_typeof(chapter) is distinct from 'object'
        or pg_catalog.jsonb_typeof(chapter -> 'id') is distinct from 'string' or pg_catalog.length(chapter ->> 'id') not between 1 and 256
        or pg_catalog.jsonb_typeof(chapter -> 'title') is distinct from 'string'
        or pg_catalog.jsonb_typeof(chapter -> 'html') is distinct from 'string'
        or pg_catalog.jsonb_typeof(chapter -> 'updatedAt') is distinct from 'string' then return false; end if;
    end loop;
    foreach collection in array array['characters', 'worldbuilding', 'art', 'notes', 'research'] loop
      if pg_catalog.jsonb_typeof(story -> collection) is distinct from 'array' then return false; end if;
      if pg_catalog.jsonb_array_length(story -> collection) > 10000 then return false; end if;
      for entry in select item from pg_catalog.jsonb_array_elements(story -> collection) as entries(item) loop
        if pg_catalog.jsonb_typeof(entry) is distinct from 'object'
          or pg_catalog.jsonb_typeof(entry -> 'id') is distinct from 'string' or pg_catalog.length(entry ->> 'id') not between 1 and 256
          or pg_catalog.jsonb_typeof(entry -> 'title') is distinct from 'string'
          or pg_catalog.jsonb_typeof(entry -> 'content') is distinct from 'string'
          or pg_catalog.jsonb_typeof(entry -> 'updatedAt') is distinct from 'string'
          or entry ->> 'category' not in ('Major', 'Minor', 'Side character', 'Setting', 'History', 'Faction', 'Family', 'Organization', 'Reference')
          or entry ->> 'category' is null then return false; end if;
      end loop;
    end loop;
  end loop;
  return true;
end;
$$;
revoke all on function private.valid_cloud_workspace(jsonb) from public, anon, authenticated;

-- Feature: the database owns timestamps/revisions and validates every insert/update, including administrator writes.
create or replace function private.stamp_cloud_workspace()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if not private.valid_cloud_workspace(new.workspace) then
    raise exception using errcode = '22023', message = 'Invalid cloud workspace or cloud storage limit exceeded.';
  end if;
  if tg_op = 'INSERT' then new.revision := 1;
  else
    if new.user_id is distinct from old.user_id then
      raise exception using errcode = '42501', message = 'A cloud workspace cannot change accounts.';
    end if;
    new.revision := old.revision + 1;
  end if;
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;
revoke all on function private.stamp_cloud_workspace() from public, anon, authenticated;
drop trigger if exists stamp_cloud_workspace on private.cloud_workspaces;
create trigger stamp_cloud_workspace before insert or update on private.cloud_workspaces
  for each row execute function private.stamp_cloud_workspace();

-- Feature: per-account quotas bound reads and save attempts across all devices.
create table if not exists private.cloud_request_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null,
  read_count integer not null default 0,
  write_count integer not null default 0
);
alter table private.cloud_request_limits enable row level security;
alter table private.cloud_request_limits force row level security;
revoke all on table private.cloud_request_limits from public, anon, authenticated;

-- Checks execute under the private operation owner; this helper is never granted to API roles.
create or replace function private.check_cloud_request(account_id uuid, is_write boolean)
returns void language plpgsql security invoker set search_path = ''
as $$
declare
  request_time timestamptz := pg_catalog.clock_timestamp();
  limits private.cloud_request_limits;
begin
  insert into private.cloud_request_limits (user_id, window_started_at)
  values (account_id, request_time) on conflict (user_id) do nothing;
  select * into limits from private.cloud_request_limits where user_id = account_id for update;
  if limits.window_started_at <= request_time - interval '1 minute' then
    limits.window_started_at := request_time; limits.read_count := 0; limits.write_count := 0;
  end if;
  if (is_write and limits.write_count >= 60) or (not is_write and limits.read_count >= 120) then
    raise exception using errcode = 'P0429', message = 'Cloud request limit reached. Try again in one minute.';
  end if;
  update private.cloud_request_limits set
    window_started_at = limits.window_started_at,
    read_count = limits.read_count + case when is_write then 0 else 1 end,
    write_count = limits.write_count + case when is_write then 1 else 0 end
  where user_id = account_id;
end;
$$;
revoke all on function private.check_cloud_request(uuid, boolean) from public, anon, authenticated;

-- Feature: private definer operations are the privilege boundary; every operation checks the JWT owner.
-- The API wrappers below are invokers. Clients receive no table privileges or control over SQL identifiers.
create or replace function private.read_cloud_workspace(p_user_id uuid, p_known_revision bigint)
returns table (revision bigint, workspace jsonb, updated_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare account_id uuid := auth.uid();
begin
  if account_id is null or (auth.jwt() ->> 'is_anonymous') = 'true' then
    raise exception using errcode = '28000', message = 'Sign in before accessing cloud saves.';
  end if;
  if p_user_id is distinct from account_id then
    raise exception using errcode = '42501', message = 'The signed-in account changed. Sync again.';
  end if;
  -- Feature: reject access JWTs after logout revokes their server-side login session.
  if not exists (
    select 1 from auth.sessions as session
    where session.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
      and session.user_id = account_id
  ) then
    raise exception using errcode = '28000', message = 'Sign in again before accessing cloud saves.';
  end if;
  if p_known_revision is not null and (p_known_revision < 1 or p_known_revision > 9007199254740991) then
    raise exception using errcode = '22023', message = 'Invalid cloud revision.';
  end if;
  -- Feature: reads must commit their quota charge even if PostgREST permits caller-selected rollback.
  if coalesce(nullif(pg_catalog.current_setting('request.headers', true), '')::jsonb ->> 'prefer', '')
       ~* 'tx[[:space:]]*=[[:space:]]*rollback' then
    raise exception using errcode = '22023', message = 'Cloud reads require a committed request.';
  end if;
  perform private.check_cloud_request(account_id, false);
  return query select cloud.revision,
    case when cloud.revision = p_known_revision then null::jsonb else cloud.workspace end,
    cloud.updated_at from private.cloud_workspaces as cloud where cloud.user_id = account_id;
end;
$$;
revoke all on function private.read_cloud_workspace(uuid, bigint) from public, anon, authenticated;

-- Feature: preserve the save RPC's JSON wire format while committing charges for rejected attempts.
-- PostgreSQL requires a drop/recreate to switch from table rows to a scalar JSON response.
drop function if exists public.save_cloud_workspace(jsonb, bigint, uuid);
drop function if exists private.save_cloud_workspace(jsonb, bigint, uuid);
create function private.save_cloud_workspace(p_workspace jsonb, p_expected_revision bigint, p_user_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  account_id uuid := auth.uid();
  saved private.cloud_workspaces;
  failure_code text;
  failure_message text;
begin
  if account_id is null or (auth.jwt() ->> 'is_anonymous') = 'true' then
    raise exception using errcode = '28000', message = 'Sign in before saving to the cloud.';
  end if;
  if p_user_id is distinct from account_id then
    raise exception using errcode = '42501', message = 'The signed-in account changed. Sync again.';
  end if;
  -- Feature: reject access JWTs after logout revokes their server-side login session.
  if not exists (
    select 1 from auth.sessions as session
    where session.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
      and session.user_id = account_id
  ) then
    raise exception using errcode = '28000', message = 'Sign in again before accessing cloud saves.';
  end if;
  -- Feature: a caller cannot opt out of committed quota charges through PostgREST's transaction preference.
  if coalesce(nullif(pg_catalog.current_setting('request.headers', true), '')::jsonb ->> 'prefer', '')
       ~* 'tx[[:space:]]*=[[:space:]]*rollback' then
    raise exception using errcode = '22023', message = 'Cloud saves require a committed request.';
  end if;
  perform private.check_cloud_request(account_id, true);
  if p_expected_revision is null or p_expected_revision < 0 or p_expected_revision >= 9007199254740991 then
    failure_code := '22023';
    failure_message := 'Invalid cloud revision.';
  else
    -- Feature: the mutation can roll back on expected validation errors without undoing its quota charge.
    begin
      if p_expected_revision = 0 then
        insert into private.cloud_workspaces as cloud (user_id, workspace)
          values (account_id, p_workspace) on conflict (user_id) do nothing
          returning cloud.* into saved;
      else
        update private.cloud_workspaces as cloud set workspace = p_workspace
          where cloud.user_id = account_id and cloud.revision = p_expected_revision
          returning cloud.* into saved;
      end if;
      if not found then
        failure_code := '40001';
        failure_message := 'The cloud copy changed. Sync again before replacing it.';
      end if;
    exception when invalid_parameter_value then
      if sqlerrm <> 'Invalid cloud workspace or cloud storage limit exceeded.' then raise; end if;
      failure_code := sqlstate;
      failure_message := sqlerrm;
    end;
  end if;

  if failure_code is not null then
    perform pg_catalog.set_config('response.status', case when failure_code = '40001' then '409' else '400' end, true);
    return pg_catalog.jsonb_build_object('code', failure_code, 'message', failure_message, 'details', null, 'hint', null);
  end if;
  return pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'revision', saved.revision, 'workspace', saved.workspace, 'updated_at', saved.updated_at
  ));
end;
$$;
revoke all on function private.save_cloud_workspace(jsonb, bigint, uuid) from public, anon, authenticated;

-- Feature: replace the old table-returning endpoint without dropping rows; expose only two owner-scoped RPCs.
drop function if exists public.read_cloud_workspace(uuid, bigint);
create function public.read_cloud_workspace(p_user_id uuid, p_known_revision bigint default null)
returns table (revision bigint, workspace jsonb, updated_at timestamptz)
language sql security invoker set search_path = ''
as $$ select * from private.read_cloud_workspace(p_user_id, p_known_revision); $$;
create function public.save_cloud_workspace(p_workspace jsonb, p_expected_revision bigint, p_user_id uuid)
returns jsonb
language sql security invoker set search_path = ''
as $$ select private.save_cloud_workspace(p_workspace, p_expected_revision, p_user_id); $$;
revoke all on function public.read_cloud_workspace(uuid, bigint) from public, anon, authenticated;
revoke all on function public.save_cloud_workspace(jsonb, bigint, uuid) from public, anon, authenticated;
grant usage on schema public, private to authenticated;
grant execute on function private.read_cloud_workspace(uuid, bigint), private.save_cloud_workspace(jsonb, bigint, uuid) to authenticated;
grant execute on function public.read_cloud_workspace(uuid, bigint), public.save_cloud_workspace(jsonb, bigint, uuid) to authenticated;
comment on function public.read_cloud_workspace(uuid, bigint) is 'Signed-in owner read; a known revision returns metadata. No anonymous access.';
comment on function public.save_cloud_workspace(jsonb, bigint, uuid) is 'Signed-in owner CAS write with 20 MiB storage limit and per-account request quotas.';

-- Feature: optionally enforce the current policy acknowledgment at Supabase Auth before creating an account.
-- Enable this Before User Created hook in the dashboard. Keep both versions aligned with policyConsent.ts.
create or replace function private.require_signup_policy_acknowledgment(event jsonb)
returns jsonb
language sql immutable security invoker set search_path = ''
as $$
  select case
    when (event #> '{user,user_metadata,legal_acceptance}') @> '{
      "terms_version": "2026-11-03",
      "privacy_version": "2026-11-03",
      "terms_accepted": true,
      "privacy_acknowledged": true
    }'::jsonb then '{}'::jsonb
    else '{"error":{"http_code":400,"message":"Open the current account form and acknowledge the account policies."}}'::jsonb
  end;
$$;
revoke all on function private.require_signup_policy_acknowledgment(jsonb) from public, anon, authenticated, service_role;
grant usage on schema private to supabase_auth_admin;
grant execute on function private.require_signup_policy_acknowledgment(jsonb) to supabase_auth_admin;

notify pgrst, 'reload schema';
commit;
