-- =====================================================================
-- Bridge Furniture — 9) ملاحظات الطلبية تصل إدارة المصنع
--   بطلب المالك: ملاحظات الزبون والملاحظات الداخلية تظهر للمصنع.
--   ما زال المصنع لا يرى: اسم الزبون، الهاتف، العنوان، الأسعار، الدفعات، ملاحظات المنتجات.
--   آمن للتشغيل أكثر من مرة. يحتاج ملف الكتالوجات قبله.
-- =====================================================================

do $$
begin
  if to_regclass('public.fabric_catalogs') is null then
    raise exception 'شغّل ملف الكتالوجات أولاً، ثم هذا الملف.';
  end if;
end $$;

drop function if exists public.factory_list_orders(public.order_status, date, date, text, int, int);
drop function if exists public.factory_get_order(uuid);

create function public.factory_list_orders(
  p_status public.order_status default null,
  p_from   date default null,
  p_to     date default null,
  p_query  text default null,
  p_limit  int default 100,
  p_offset int default 0)
returns table (order_id uuid, order_number text, status public.order_status,
               expected_delivery_date date, is_delayed boolean, items jsonb,
               customer_notes text, internal_notes text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_today date := public._local_today();
  v_q     text := nullif(btrim(coalesce(p_query, '')), '');
begin
  perform public._require_role('factory_admin', 'super_admin');
  return query
  select o.id, o.order_number, o.status, o.expected_delivery_date,
         (o.expected_delivery_date < v_today and o.status not in ('delivered', 'cancelled')),
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'position', i.position, 'model', i.model_name_snapshot, 'color', i.color_snapshot,
                    'catalog', i.catalog_snapshot, 'color_code', i.color_code_snapshot,
                    'quantity', i.quantity, 'image_path', i.image_path_snapshot) order by i.position)
           from public.order_items i where i.order_id = o.id), '[]'::jsonb),
         op.customer_notes, op.internal_notes
  from public.orders o
  left join public.order_private op on op.order_id = o.id
  where o.status <> 'draft' and o.kind = 'regular'
    and (p_status is null or o.status = p_status)
    and (p_from is null or o.expected_delivery_date >= p_from)
    and (p_to is null or o.expected_delivery_date <= p_to)
    and (v_q is null
         or o.order_number ilike public._like_pattern(v_q)
         or exists (select 1 from public.order_items i2
                    where i2.order_id = o.id and i2.model_name_snapshot ilike public._like_pattern(v_q)))
  order by (o.status in ('delivered', 'cancelled')), o.expected_delivery_date, o.order_number
  limit least(greatest(coalesce(p_limit, 100), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end $$;

create function public.factory_get_order(p_order_id uuid)
returns table (order_id uuid, order_number text, status public.order_status,
               expected_delivery_date date, is_delayed boolean, items jsonb,
               customer_notes text, internal_notes text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare v_today date := public._local_today();
begin
  perform public._require_role('factory_admin', 'super_admin');
  return query
  select o.id, o.order_number, o.status, o.expected_delivery_date,
         (o.expected_delivery_date < v_today and o.status not in ('delivered', 'cancelled')),
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'position', i.position, 'model', i.model_name_snapshot, 'color', i.color_snapshot,
                    'catalog', i.catalog_snapshot, 'color_code', i.color_code_snapshot,
                    'quantity', i.quantity, 'image_path', i.image_path_snapshot) order by i.position)
           from public.order_items i where i.order_id = o.id), '[]'::jsonb),
         op.customer_notes, op.internal_notes
  from public.orders o
  left join public.order_private op on op.order_id = o.id
  where o.id = p_order_id and o.status <> 'draft' and o.kind = 'regular';
end $$;

revoke execute on function public.factory_list_orders(public.order_status, date, date, text, int, int) from public, anon;
revoke execute on function public.factory_get_order(uuid) from public, anon;
grant execute on function public.factory_list_orders(public.order_status, date, date, text, int, int) to authenticated;
grant execute on function public.factory_get_order(uuid) to authenticated;
