create schema if not exists extensions;
create extension if not exists vector with schema extensions;

create table public.business_tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  environment text not null default 'production' check (environment in ('demo','production')),
  created_at timestamptz not null default now()
);
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);
create table public.tenant_memberships (
  tenant_id uuid not null references public.business_tenants(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','agent','viewer')),
  created_at timestamptz not null default now(),
  primary key (tenant_id,user_id)
);
create table public.customers (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.business_tenants(id) on delete cascade,
  external_id text not null, full_name text not null, email text not null, phone text,
  created_at timestamptz not null default now(), unique (tenant_id,external_id), unique (tenant_id,email), unique (tenant_id,id)
);
create table public.products (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.business_tenants(id) on delete cascade,
  external_id text not null, name text not null, description text, price_minor bigint not null check (price_minor >= 0), currency text not null default 'NGN',
  created_at timestamptz not null default now(), unique (tenant_id,external_id), unique (tenant_id,id)
);
create table public.orders (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.business_tenants(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null, external_id text not null,
  status text not null, payment_status text not null, fulfilment_status text not null,
  carrier text, tracking_number text, estimated_delivery date, delivered_at date, placed_at timestamptz not null,
  total_minor bigint not null check (total_minor >= 0), currency text not null default 'NGN',
  created_at timestamptz not null default now(), unique (tenant_id,external_id), unique (tenant_id,id),
  foreign key (tenant_id,customer_id) references public.customers(tenant_id,id)
);
create table public.order_items (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.business_tenants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade, product_id uuid references public.products(id) on delete set null,
  quantity integer not null check (quantity > 0), unit_price_minor bigint not null check (unit_price_minor >= 0),
  foreign key (tenant_id,order_id) references public.orders(tenant_id,id) on delete cascade,
  foreign key (tenant_id,product_id) references public.products(tenant_id,id)
);
create table public.support_tickets (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.business_tenants(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null, external_id text not null,
  subject text not null, description text not null, status text not null default 'open', priority text not null default 'normal',
  idempotency_key text, created_at timestamptz not null default now(), unique (tenant_id,external_id), unique (tenant_id,idempotency_key),
  foreign key (tenant_id,customer_id) references public.customers(tenant_id,id)
);
create table public.conversations (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.business_tenants(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  status text not null default 'open' check (status in ('open','ai_handling','needs_human_review','resolved')),
  assigned_to uuid references public.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (tenant_id,id), foreign key (tenant_id,customer_id) references public.customers(tenant_id,id)
);
create table public.messages (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.business_tenants(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('customer','assistant','agent','tool')), content text not null,
  citations jsonb not null default '[]'::jsonb, created_at timestamptz not null default now(),
  foreign key (tenant_id,conversation_id) references public.conversations(tenant_id,id) on delete cascade
);
create table public.documents (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.business_tenants(id) on delete cascade,
  name text not null, mime_type text not null, storage_path text, status text not null default 'queued' check (status in ('queued','processing','ready','error')),
  error_message text, created_at timestamptz not null default now(), deleted_at timestamptz, unique (tenant_id,id)
);
create table public.document_chunks (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.business_tenants(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade, chunk_index integer not null,
  content text not null, page_number integer, section_name text, embedding extensions.vector(768), created_at timestamptz not null default now(),
  unique (document_id,chunk_index), foreign key (tenant_id,document_id) references public.documents(tenant_id,id) on delete cascade
);
create index document_chunks_embedding_idx on public.document_chunks using hnsw (embedding extensions.vector_cosine_ops);
create table public.integrations (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.business_tenants(id) on delete cascade,
  connector_id text not null, kind text not null check (kind in ('demo','external')), display_name text not null,
  status text not null default 'disconnected' check (status in ('connected','disconnected','error')),
  capabilities text[] not null default '{}', credential_ref text, last_tested_at timestamptz, last_error text,
  created_at timestamptz not null default now(), unique (tenant_id,connector_id)
);
create table public.ai_execution_logs (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.business_tenants(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  provider text not null, model text, status text not null, duration_ms integer,
  provider_usage jsonb, trace jsonb not null default '[]'::jsonb, created_at timestamptz not null default now(),
  foreign key (tenant_id,conversation_id) references public.conversations(tenant_id,id)
);

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
create or replace function private.is_tenant_member(target_tenant uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select auth.uid() is not null and exists (select 1 from public.tenant_memberships m where m.tenant_id=target_tenant and m.user_id=(select auth.uid())) $$;
create or replace function private.can_write_tenant(target_tenant uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select auth.uid() is not null and exists (select 1 from public.tenant_memberships m where m.tenant_id=target_tenant and m.user_id=(select auth.uid()) and m.role in ('owner','admin','agent')) $$;
revoke all on function private.is_tenant_member(uuid) from public, anon;
revoke all on function private.can_write_tenant(uuid) from public, anon;
grant execute on function private.is_tenant_member(uuid) to authenticated;
grant execute on function private.can_write_tenant(uuid) to authenticated;

do $$ declare table_name text; begin
  foreach table_name in array array['users','business_tenants','tenant_memberships','customers','products','orders','order_items','support_tickets','conversations','messages','documents','document_chunks','integrations','ai_execution_logs'] loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end $$;
revoke all on all tables in schema public from anon, authenticated;
grant select on public.users, public.business_tenants, public.tenant_memberships to authenticated;
grant select, insert, update, delete on public.customers, public.products, public.orders, public.order_items,
  public.support_tickets, public.conversations, public.messages, public.documents, public.document_chunks,
  public.integrations, public.ai_execution_logs to authenticated;

create policy "members read tenant" on public.business_tenants for select to authenticated using (private.is_tenant_member(id));
create policy "members read memberships" on public.tenant_memberships for select to authenticated using (private.is_tenant_member(tenant_id));
create policy "own profile" on public.users for select to authenticated using (id=(select auth.uid()));

do $$ declare table_name text; begin
  foreach table_name in array array['customers','products','orders','order_items','support_tickets','conversations','messages','documents','document_chunks','integrations','ai_execution_logs'] loop
    execute format('create policy tenant_select on public.%I for select to authenticated using (private.is_tenant_member(tenant_id))', table_name);
    execute format('create policy tenant_insert on public.%I for insert to authenticated with check (private.can_write_tenant(tenant_id))', table_name);
    execute format('create policy tenant_update on public.%I for update to authenticated using (private.can_write_tenant(tenant_id)) with check (private.can_write_tenant(tenant_id))', table_name);
    execute format('create policy tenant_delete on public.%I for delete to authenticated using (private.can_write_tenant(tenant_id))', table_name);
  end loop;
end $$;

-- Re-runnable synthetic seed. These rows are isolated under the explicit demo tenant.
insert into public.business_tenants(id,name,slug,environment)
values ('00000000-0000-4000-8000-000000000001','NexaStore','nexastore-demo','demo') on conflict (slug) do nothing;
insert into public.integrations(tenant_id,connector_id,kind,display_name,status,capabilities)
select id,'nexastore-demo','demo','NexaStore demo connector','connected',array['customers.read','orders.read'] from public.business_tenants where slug='nexastore-demo'
on conflict (tenant_id,connector_id) do nothing;
