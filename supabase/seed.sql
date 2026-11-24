-- Repeatable fictional NexaStore dataset. All values are synthetic.
insert into public.business_tenants(id,name,slug,environment)
values ('00000000-0000-4000-8000-000000000001','NexaStore','nexastore-demo','demo')
on conflict (slug) do nothing;

insert into public.products(tenant_id,external_id,name,description,price_minor,currency)
select '00000000-0000-4000-8000-000000000001'::uuid, p.external_id, p.name, p.description, p.price_minor, 'NGN'
from (values
  ('SKU-101','Everyday Tote','Durable cotton carryall',2400000),
  ('SKU-102','Wireless Earbuds','Compact Bluetooth earbuds',6490000),
  ('SKU-103','Linen Shirt','Relaxed fit linen shirt',3850000),
  ('SKU-104','Ceramic Pour-over Set','Hand-finished coffee set',5200000),
  ('SKU-105','Desk Lamp','Adjustable LED desk lamp',7800000),
  ('SKU-106','Canvas Weekender','Cabin-size canvas bag',9250000)
) as p(external_id,name,description,price_minor)
on conflict (tenant_id,external_id) do update set name=excluded.name,description=excluded.description,price_minor=excluded.price_minor;

insert into public.customers(tenant_id,external_id,full_name,email,phone)
select '00000000-0000-4000-8000-000000000001'::uuid,
  'CUS-' || (1000 + i),
  (array['Amara','Tunde','Zainab','Kelechi','Ifeoma','Chidi','Amina','Emeka','Dara','Yusuf'])[((i-1)%10)+1] || ' ' ||
  (array['Okafor','Adeyemi','Bello','Nwosu','Mensah','Balogun','Eze','Sule','Obi','Danladi'])[(((i-1)/10)%10)+1],
  lower((array['Amara','Tunde','Zainab','Kelechi','Ifeoma','Chidi','Amina','Emeka','Dara','Yusuf'])[((i-1)%10)+1] || '.' ||
    (array['Okafor','Adeyemi','Bello','Nwosu','Mensah','Balogun','Eze','Sule','Obi','Danladi'])[(((i-1)/10)%10)+1] || '@example.test'),
  '+234 80' || (10000000 + (i-1) * 7919)::text
from generate_series(1,40) as g(i)
on conflict (tenant_id,external_id) do update set full_name=excluded.full_name,email=excluded.email,phone=excluded.phone;

insert into public.orders(tenant_id,customer_id,external_id,status,payment_status,fulfilment_status,carrier,tracking_number,estimated_delivery,delivered_at,placed_at,total_minor,currency)
select '00000000-0000-4000-8000-000000000001'::uuid,
  c.id,
  'ORD-' || (1000 + g.i),
  case when g.i=4 then 'in_transit' when g.i=84 or g.i=85 then 'delivered' else (array['in_transit','delivered','delayed','cancelled'])[((g.i-1)%4)+1] end,
  case when g.i=4 then 'paid' when g.i % 4=0 or g.i=85 then 'refunded' else 'paid' end,
  case when g.i=4 then 'shipped' when g.i=84 or g.i=85 or g.i%4=2 then 'delivered' when g.i%4=0 then 'cancelled' else 'shipped' end,
  case when g.i%13=0 then null else 'DHL' end,
  case when g.i=4 then 'NX730004812' when g.i%13=0 then null else 'NX' || (730000000 + (g.i-1)*31)::text end,
  case when g.i=4 then date '2026-11-26' when g.i%4 in (2,0) then null else date '2026-11-01' + ((g.i%22)+4) end,
  case when g.i=84 then date '2026-10-25' when g.i=85 then date '2026-09-01' when g.i%4=2 then date '2026-11-01' + ((g.i-1)%22) else null end,
  case when g.i=4 then timestamptz '2026-11-12 12:00:00+00' when g.i=84 then timestamptz '2026-10-25 12:00:00+00' when g.i=85 then timestamptz '2026-09-01 12:00:00+00' else timestamptz '2026-11-01 12:00:00+00' + ((g.i-1)%22) * interval '1 day' end,
  case when g.i=4 then 6490000 else 1800000 + (((g.i-1)*2347)%11200000) end, 'NGN'
from generate_series(1,85) as g(i)
join public.customers c on c.tenant_id='00000000-0000-4000-8000-000000000001'::uuid and c.external_id='CUS-' || (1001 + (((g.i-1)*7)%40))
on conflict (tenant_id,external_id) do update set customer_id=excluded.customer_id,status=excluded.status,payment_status=excluded.payment_status,
  fulfilment_status=excluded.fulfilment_status,carrier=excluded.carrier,tracking_number=excluded.tracking_number,
  estimated_delivery=excluded.estimated_delivery,delivered_at=excluded.delivered_at,placed_at=excluded.placed_at,total_minor=excluded.total_minor;

insert into public.order_items(tenant_id,order_id,product_id,quantity,unit_price_minor)
select o.tenant_id,o.id,p.id,1,p.price_minor
from public.orders o
join public.products p on p.tenant_id=o.tenant_id and p.external_id='SKU-' || lpad((case when o.external_id='ORD-1004' then 102 else 101 + (substring(o.external_id from 5)::int-1001)%6 end)::text,3,'0')
where o.tenant_id='00000000-0000-4000-8000-000000000001'::uuid
  and not exists (select 1 from public.order_items oi where oi.order_id=o.id and oi.product_id=p.id);
