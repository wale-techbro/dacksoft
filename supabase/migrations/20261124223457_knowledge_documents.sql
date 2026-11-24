insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dacksoft-documents', 'dacksoft-documents', false, 8388608, array['application/pdf','text/plain'])
on conflict (id) do nothing;

create policy "Tenant members read knowledge files"
on storage.objects for select to authenticated
using (
  bucket_id = 'dacksoft-documents'
  and private.is_tenant_member(
    case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then ((storage.foldername(name))[1])::uuid else null end
  )
);

create policy "Tenant agents upload knowledge files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'dacksoft-documents'
  and private.can_write_tenant(
    case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then ((storage.foldername(name))[1])::uuid else null end
  )
);

create policy "Tenant agents delete knowledge files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'dacksoft-documents'
  and private.can_write_tenant(
    case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then ((storage.foldername(name))[1])::uuid else null end
  )
);

create or replace function public.match_document_chunks(
  query_embedding extensions.vector(768),
  target_tenant uuid,
  match_count integer default 5,
  match_threshold double precision default 0.35
)
returns table (
  chunk_id uuid,
  document_id uuid,
  document_name text,
  page_number integer,
  section_name text,
  content text,
  similarity double precision
)
language sql
stable
set search_path = ''
as $$
  select c.id, c.document_id, d.name, c.page_number, c.section_name, c.content,
         (1 - (c.embedding OPERATOR(extensions.<=>) query_embedding))::double precision
  from public.document_chunks c
  join public.documents d on d.id = c.document_id and d.tenant_id = c.tenant_id
  where c.tenant_id = target_tenant
    and d.deleted_at is null
    and d.status = 'ready'
    and c.embedding is not null
    and private.is_tenant_member(target_tenant)
    and (1 - (c.embedding OPERATOR(extensions.<=>) query_embedding)) >= match_threshold
  order by c.embedding OPERATOR(extensions.<=>) query_embedding
  limit least(greatest(match_count, 1), 10);
$$;

revoke all on function public.match_document_chunks(extensions.vector, uuid, integer, double precision) from public, anon;
grant execute on function public.match_document_chunks(extensions.vector, uuid, integer, double precision) to authenticated;
