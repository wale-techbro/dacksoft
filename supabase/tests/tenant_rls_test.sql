begin;
select plan(6);

insert into auth.users(id,aud,role,email)
values
  ('10000000-0000-4000-8000-000000000001','authenticated','authenticated','viewer@example.test'),
  ('10000000-0000-4000-8000-000000000002','authenticated','authenticated','agent@example.test')
on conflict (id) do nothing;
insert into public.users(id,display_name) values
  ('10000000-0000-4000-8000-000000000001','Demo Viewer'),
  ('10000000-0000-4000-8000-000000000002','Demo Agent')
on conflict (id) do nothing;
insert into public.business_tenants(id,name,slug,environment) values
  ('20000000-0000-4000-8000-000000000001','Tenant One','rls-tenant-one','demo'),
  ('20000000-0000-4000-8000-000000000002','Tenant Two','rls-tenant-two','demo')
on conflict (id) do nothing;
insert into public.tenant_memberships(tenant_id,user_id,role) values
  ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','viewer'),
  ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','agent')
on conflict do nothing;
insert into public.customers(tenant_id,external_id,full_name,email) values
  ('20000000-0000-4000-8000-000000000001','CUS-RLS-ONE','Tenant One Customer','one@example.test'),
  ('20000000-0000-4000-8000-000000000002','CUS-RLS-TWO','Tenant Two Customer','two@example.test')
on conflict (tenant_id,external_id) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select results_eq(
  $$select external_id from public.customers where tenant_id='20000000-0000-4000-8000-000000000001'$$,
  array['CUS-RLS-ONE'::text],
  'viewer can read their tenant row'
);
select is_empty(
  $$select 1 from public.customers where tenant_id='20000000-0000-4000-8000-000000000002'$$,
  'viewer cannot read another tenant'
);
select throws_ok(
  $$insert into public.customers(tenant_id,external_id,full_name,email) values ('20000000-0000-4000-8000-000000000001','CUS-VIEWER-WRITE','Should Be Denied','denied@example.test')$$,
  '42501', null, 'viewer cannot insert tenant records'
);

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select lives_ok(
  $$insert into public.customers(tenant_id,external_id,full_name,email) values ('20000000-0000-4000-8000-000000000002','CUS-AGENT-WRITE','Allowed Agent','agent-write@example.test')$$,
  'agent can insert within their tenant'
);
select is_empty(
  $$select 1 from public.customers where tenant_id='20000000-0000-4000-8000-000000000001'$$,
  'agent cannot read another tenant'
);
select ok(not has_table_privilege('anon','public.customers','select'), 'anonymous role has no customer table access');

select * from finish();
rollback;
