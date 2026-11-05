-- Feature: disposable local/staging regression checks for real database authorization, CAS and quotas.
-- Run as postgres after schema.sql. Everything, including synthetic auth users and sessions, is rolled back.
begin;
-- Feature: authorization assertions must execute even if the session normally disables PL/pgSQL assertions.
set local plpgsql.check_asserts = on;

-- Feature: validate the optional Auth hook's payload checks and narrow execute grant without creating accounts.
do $$
declare
  acceptance jsonb := '{"terms_version":"2026-11-03","privacy_version":"2026-11-03","terms_accepted":true,"privacy_acknowledged":true}';
  event jsonb := pg_catalog.jsonb_build_object('user', pg_catalog.jsonb_build_object('user_metadata', pg_catalog.jsonb_build_object('legal_acceptance', acceptance)));
  invalid jsonb;
begin
  assert pg_catalog.has_schema_privilege('supabase_auth_admin', 'private', 'USAGE'), 'Supabase Auth cannot use the hook schema';
  assert pg_catalog.has_function_privilege('supabase_auth_admin', 'private.require_signup_policy_acknowledgment(jsonb)', 'EXECUTE'), 'Supabase Auth cannot execute the signup hook';
  assert not pg_catalog.has_function_privilege('anon', 'private.require_signup_policy_acknowledgment(jsonb)', 'EXECUTE'), 'Anonymous users can execute the signup hook';
  assert not pg_catalog.has_function_privilege('authenticated', 'private.require_signup_policy_acknowledgment(jsonb)', 'EXECUTE'), 'Signed-in users can execute the signup hook';
  assert not pg_catalog.has_function_privilege('service_role', 'private.require_signup_policy_acknowledgment(jsonb)', 'EXECUTE'), 'The service role can execute the signup hook';

  assert private.require_signup_policy_acknowledgment(event) = '{}'::jsonb, 'Current policy acknowledgment was rejected';
  foreach invalid in array array[
    '{}'::jsonb,
    pg_catalog.jsonb_set(event, '{user,user_metadata,legal_acceptance,terms_version}', '"2026-01-01"'),
    pg_catalog.jsonb_set(event, '{user,user_metadata,legal_acceptance,privacy_version}', '"2026-01-01"'),
    pg_catalog.jsonb_set(event, '{user,user_metadata,legal_acceptance,terms_accepted}', 'false'),
    pg_catalog.jsonb_set(event, '{user,user_metadata,legal_acceptance,privacy_acknowledged}', '"true"'),
    pg_catalog.jsonb_set(event, '{user,user_metadata,legal_acceptance,privacy_acknowledged}', '[true]')
  ] loop
    assert private.require_signup_policy_acknowledgment(invalid) #>> '{error,http_code}' = '400', 'Invalid acknowledgment was accepted';
  end loop;
end;
$$;

insert into auth.users (id, email, aud, role)
values ('55555555-5555-4555-8555-555555555551', 'cloud-security-a@example.invalid', 'authenticated', 'authenticated'),
       ('55555555-5555-4555-8555-555555555552', 'cloud-security-b@example.invalid', 'authenticated', 'authenticated');

-- Feature: roll back synthetic test state to revoke fixture sessions without deleting an existing login session.
set local request.jwt.claims = '{"sub":"55555555-5555-4555-8555-555555555551","role":"authenticated","is_anonymous":false,"session_id":"66666666-6666-4666-8666-666666666661"}';
savepoint active_cloud_session_fixture;
-- Feature: real owner-bound session rows exercise the same JWT session checks as hosted logins.
insert into auth.sessions (id, user_id, created_at, updated_at)
values ('66666666-6666-4666-8666-666666666661', '55555555-5555-4555-8555-555555555551', now(), now()),
       ('66666666-6666-4666-8666-666666666662', '55555555-5555-4555-8555-555555555552', now(), now());

-- Schema grants must deny direct API table access and anonymous RPC execution.
do $$
begin
  assert pg_catalog.to_regclass('public.cloud_workspaces') is null, 'Workspace table is still exposed';
  assert not pg_catalog.has_table_privilege('authenticated', 'private.cloud_workspaces', 'SELECT,INSERT,UPDATE,DELETE'), 'Direct table privileges remain';
  assert not pg_catalog.has_column_privilege('authenticated', 'private.cloud_workspaces', 'workspace', 'INSERT,UPDATE'), 'Legacy column privileges remain';
  assert not pg_catalog.has_function_privilege('anon', 'public.read_cloud_workspace(uuid,bigint)', 'EXECUTE'), 'Anonymous reads are allowed';
  assert not pg_catalog.has_function_privilege('anon', 'public.save_cloud_workspace(jsonb,bigint,uuid)', 'EXECUTE'), 'Anonymous writes are allowed';
end;
$$;

set local role anon;
do $$
begin
  begin
    perform * from public.read_cloud_workspace('55555555-5555-4555-8555-555555555551', null);
    raise exception 'Anonymous read unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;

-- A caller cannot select another account or access tables, and successful saves retain the row-array response.
set local request.jwt.claims = '{"sub":"55555555-5555-4555-8555-555555555551","role":"authenticated","is_anonymous":false,"session_id":"66666666-6666-4666-8666-666666666661"}';
set local role authenticated;
do $$
declare
  snapshot record;
  saved jsonb;
  body jsonb := '{"version":1,"updatedAt":"2026-11-02T00:00:00.000Z","stories":[]}';
begin
  saved := public.save_cloud_workspace(body, 0, '55555555-5555-4555-8555-555555555551');
  assert jsonb_typeof(saved) = 'array' and jsonb_array_length(saved) = 1
    and saved -> 0 -> 'revision' = '1'::jsonb and saved -> 0 -> 'workspace' = body
    and jsonb_typeof(saved -> 0 -> 'updated_at') = 'string', 'First save did not return the expected row array';
  select * into snapshot from public.read_cloud_workspace('55555555-5555-4555-8555-555555555551', 1);
  assert snapshot.revision = 1 and snapshot.workspace is null, 'Known revision did not return metadata only';
  begin
    perform * from public.read_cloud_workspace('55555555-5555-4555-8555-555555555552', null);
    raise exception 'Cross-account read unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  begin
    perform * from private.cloud_workspaces;
    raise exception 'Direct table read unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  begin
    update private.cloud_workspaces set workspace = body;
    raise exception 'Direct table update unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.save_cloud_workspace(body, 0, '55555555-5555-4555-8555-555555555552');
    raise exception 'Cross-account write unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  saved := public.save_cloud_workspace(body, 1, '55555555-5555-4555-8555-555555555551');
  assert saved -> 0 -> 'revision' = '2'::jsonb, 'CAS did not advance revision';
  -- Feature: caller-selected transaction rollback cannot bypass the committed save counter.
  perform set_config('request.headers', '{"prefer":"return=representation, tx=rollback"}', true);
  begin
    perform public.save_cloud_workspace(body, 2, '55555555-5555-4555-8555-555555555551');
    raise exception 'Rollback preference unexpectedly accepted';
  exception when invalid_parameter_value then
    assert sqlerrm = 'Cloud saves require a committed request.', 'Wrong rejection for rollback preference';
  end;
  perform set_config('request.headers', '', true);
end;
$$;
reset role;

-- Feature: rejected saves consume the remaining budget while preserving the API error status and body.
update private.cloud_request_limits set read_count = 120, write_count = 57
where user_id = '55555555-5555-4555-8555-555555555551';
set local role authenticated;
do $$
declare
  rejection jsonb;
  body jsonb := '{"version":1,"updatedAt":"2026-11-02T00:00:00.000Z","stories":[]}';
begin
  rejection := public.save_cloud_workspace(body, 9, '55555555-5555-4555-8555-555555555551');
  assert rejection = '{"code":"40001","message":"The cloud copy changed. Sync again before replacing it.","details":null,"hint":null}'::jsonb
    and current_setting('response.status', true) = '409', 'Stale revision error changed';
  perform set_config('response.status', '', true);
  rejection := public.save_cloud_workspace('{}'::jsonb, 2, '55555555-5555-4555-8555-555555555551');
  assert rejection = '{"code":"22023","message":"Invalid cloud workspace or cloud storage limit exceeded.","details":null,"hint":null}'::jsonb
    and current_setting('response.status', true) = '400', 'Invalid workspace error changed';
  perform set_config('response.status', '', true);
  rejection := public.save_cloud_workspace(body, -1, '55555555-5555-4555-8555-555555555551');
  assert rejection = '{"code":"22023","message":"Invalid cloud revision.","details":null,"hint":null}'::jsonb
    and current_setting('response.status', true) = '400', 'Invalid revision error changed';
  perform set_config('response.status', '', true);
  begin
    perform * from public.read_cloud_workspace('55555555-5555-4555-8555-555555555551', null);
    raise exception 'Read quota unexpectedly bypassed';
  exception when sqlstate 'P0429' then null; end;
  begin
    perform public.save_cloud_workspace(body, 2, '55555555-5555-4555-8555-555555555551');
    raise exception 'Rejected saves did not exhaust the write quota';
  exception when sqlstate 'P0429' then null; end;
end;
$$;
reset role;
do $$
begin
  assert (select write_count from private.cloud_request_limits where user_id = '55555555-5555-4555-8555-555555555551') = 60,
    'Rejected saves did not retain quota charges';
  assert (select revision from private.cloud_workspaces where user_id = '55555555-5555-4555-8555-555555555551') = 2,
    'Rejected saves changed the workspace';
end;
$$;
set local request.jwt.claims = '{"sub":"55555555-5555-4555-8555-555555555552","role":"authenticated","is_anonymous":true,"session_id":"66666666-6666-4666-8666-666666666662"}';
set local role authenticated;
do $$
begin
  begin
    perform * from public.read_cloud_workspace('55555555-5555-4555-8555-555555555552', null);
    raise exception 'Anonymous sign-in unexpectedly accepted';
  exception when invalid_authorization_specification then null; end;
end;
$$;
reset role;

-- Feature: missing session claims and another account's existing session cannot authorize either RPC.
set local role authenticated;
do $$
declare
  invalid_claims jsonb;
  body jsonb := '{"version":1,"updatedAt":"2026-11-02T00:00:00.000Z","stories":[]}';
begin
  for invalid_claims in
    select value from pg_catalog.jsonb_array_elements('[
      {"sub":"55555555-5555-4555-8555-555555555551","role":"authenticated","is_anonymous":false},
      {"sub":"55555555-5555-4555-8555-555555555551","role":"authenticated","is_anonymous":false,"session_id":"66666666-6666-4666-8666-666666666662"}
    ]'::jsonb) as claims(value)
  loop
    perform pg_catalog.set_config('request.jwt.claims', invalid_claims::text, true);
    begin
      perform * from public.read_cloud_workspace('55555555-5555-4555-8555-555555555551', null);
      raise exception 'Missing or wrong-owner session unexpectedly authorized a read';
    exception when invalid_authorization_specification then null; end;
    begin
      perform * from public.save_cloud_workspace(body, 2, '55555555-5555-4555-8555-555555555551');
      raise exception 'Missing or wrong-owner session unexpectedly authorized a write';
    exception when invalid_authorization_specification then null; end;
  end loop;
end;
$$;
reset role;

-- Feature: roll back fixture sessions, workspace and quotas; the original JWT claims survive unchanged.
rollback to savepoint active_cloud_session_fixture;
set local role authenticated;
do $$
begin
  begin
    perform * from public.read_cloud_workspace('55555555-5555-4555-8555-555555555551', null);
    raise exception 'Revoked session unexpectedly authorized a read';
  exception when invalid_authorization_specification then null; end;
  begin
    perform * from public.save_cloud_workspace('{"version":1,"updatedAt":"2026-11-02T00:00:00.000Z","stories":[]}', 2, '55555555-5555-4555-8555-555555555551');
    raise exception 'Revoked session unexpectedly authorized a write';
  exception when invalid_authorization_specification then null; end;
end;
$$;
reset role;
rollback;
