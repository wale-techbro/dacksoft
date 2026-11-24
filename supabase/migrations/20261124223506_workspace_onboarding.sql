create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users(id, display_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create or replace function public.create_tenant_for_current_user(tenant_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  new_tenant_id uuid := gen_random_uuid();
  cleaned_name text := btrim(tenant_name);
begin
  if current_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if cleaned_name is null or length(cleaned_name) < 2 or length(cleaned_name) > 100 then
    raise exception 'Business name must contain 2 to 100 characters' using errcode = '22023';
  end if;
  if exists (select 1 from public.tenant_memberships where user_id = current_user_id) then
    raise exception 'This account already belongs to a workspace' using errcode = '23505';
  end if;
  insert into public.users(id) values (current_user_id) on conflict (id) do nothing;
  insert into public.business_tenants(id, name, slug, environment)
  values (new_tenant_id, cleaned_name, 'ws-' || replace(new_tenant_id::text, '-', ''), 'production');
  insert into public.tenant_memberships(tenant_id, user_id, role)
  values (new_tenant_id, current_user_id, 'owner');
  return new_tenant_id;
end;
$$;

revoke all on function public.create_tenant_for_current_user(text) from public, anon;
grant execute on function public.create_tenant_for_current_user(text) to authenticated;

create index if not exists conversations_tenant_updated_idx on public.conversations(tenant_id, updated_at desc);
create index if not exists messages_conversation_created_idx on public.messages(tenant_id, conversation_id, created_at);
create index if not exists ai_logs_tenant_created_idx on public.ai_execution_logs(tenant_id, created_at desc);

create table if not exists private.ai_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  request_count integer not null default 0,
  primary key (user_id, window_start)
);
alter table private.ai_rate_limits enable row level security;
revoke all on private.ai_rate_limits from public, anon, authenticated;

create or replace function public.consume_ai_rate_limit()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  bucket timestamptz := to_timestamp(floor(extract(epoch from now()) / 60) * 60);
  current_count integer;
begin
  if caller_id is null then return false; end if;
  insert into private.ai_rate_limits(user_id, window_start, request_count)
  values (caller_id, bucket, 1)
  on conflict (user_id, window_start)
  do update set request_count = private.ai_rate_limits.request_count + 1
  returning request_count into current_count;
  delete from private.ai_rate_limits where window_start < bucket - interval '1 day';
  return current_count <= 10;
end;
$$;
revoke all on function public.consume_ai_rate_limit() from public, anon;
grant execute on function public.consume_ai_rate_limit() to authenticated;
