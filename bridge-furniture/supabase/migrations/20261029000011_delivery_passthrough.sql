-- =====================================================================
-- Bridge Furniture — 11) التوصيل على الزبون، لكنه ليس دخلاً للمعرض
--   * المجموع على الزبون = (السعر المتفق عليه أو مجموع المنتجات) + رسوم التوصيل.
--     فالمتبقي ومبلغ البوليصة يشملان التوصيل.
--   * رسوم التوصيل تذهب لشركة التوصيل: لا تدخل في المبيعات ولا في الربح.
--   * عمود جديد products_total = قيمة المنتجات (بعد السعر المتفق عليه).
--   آمن للتشغيل أكثر من مرة. يحتاج ملف 10 قبله.
-- =====================================================================

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'order_financials' and column_name = 'agreed_total') then
    raise exception 'شغّل ملف 10 (السعر المتفق عليه) أولاً، ثم هذا الملف.';
  end if;
end $$;

create or replace view public.order_totals with (security_invoker = true) as
select
  o.id as order_id,
  coalesce(it.subtotal, 0)::numeric(12,2)                                            as subtotal,
  coalesce(f.delivery_fee, 0)::numeric(12,2)                                         as delivery_fee,
  (coalesce(f.agreed_total, it.subtotal, 0) + coalesce(f.delivery_fee, 0))::numeric(12,2) as total,
  coalesce(pay.paid, 0)::numeric(12,2)                                               as paid,
  (coalesce(f.agreed_total, it.subtotal, 0) + coalesce(f.delivery_fee, 0) - coalesce(pay.paid, 0))::numeric(12,2) as remaining,
  coalesce(pay.pending, 0)::numeric(12,2)                                            as pending,
  f.agreed_total::numeric(12,2)                                                      as agreed_total,
  (coalesce(it.subtotal, 0) - coalesce(f.agreed_total, it.subtotal, 0))::numeric(12,2) as discount,
  coalesce(f.agreed_total, it.subtotal, 0)::numeric(12,2)                            as products_total
from public.orders o
left join lateral (
  select sum(oi.quantity * p.unit_price) as subtotal
  from public.order_items oi
  join public.order_item_prices p on p.order_item_id = oi.id
  where oi.order_id = o.id
) it on true
left join public.order_financials f on f.order_id = o.id
left join lateral (
  select sum(op.amount) filter (where op.status = 'confirmed') as paid,
         sum(op.amount) filter (where op.status = 'pending')   as pending
  from public.order_payments op where op.order_id = o.id
) pay on true;

-- ---------------------------------------------------------------------
-- تفاصيل الطلبية: الربح = قيمة المنتجات − التكلفة (التوصيل خارج الحساب)
-- ---------------------------------------------------------------------
create or replace function public.get_order_detail(p_order_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_role    text := public._require_role('super_admin', 'sales', 'accountant', 'returns')::text;
  v_finance boolean := v_role in ('super_admin', 'accountant');
  v_order   public.orders%rowtype;
  v_res     jsonb;
begin
  if not public.can_access_order(p_order_id) then raise exception 'not_found'; end if;
  select * into v_order from public.orders where id = p_order_id;
  if not found then raise exception 'not_found'; end if;

  select jsonb_build_object(
    'id', o.id,
    'order_number', o.order_number,
    'kind', o.kind,
    'status', o.status,
    'expected_delivery_date', o.expected_delivery_date,
    'is_delayed', (o.expected_delivery_date < public._local_today() and o.status not in ('draft', 'delivered', 'cancelled')),
    'created_at', o.created_at,
    'submitted_at', o.submitted_at,
    'acknowledged_at', o.acknowledged_at,
    'idempotency_key', o.idempotency_key,
    'created_by', jsonb_build_object('id', pr.id, 'full_name', pr.full_name),
    'customer', jsonb_build_object('full_name', c.full_name, 'phone', c.phone, 'phone2', c.phone2,
                                   'city', c.city, 'address', c.address),
    'customer_notes', op.customer_notes,
    'internal_notes', op.internal_notes,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'position', i.position, 'product_id', i.product_id, 'model', i.model_name_snapshot,
        'color', i.color_snapshot, 'quantity', i.quantity, 'image_path', i.image_path_snapshot,
        'catalog', i.catalog_snapshot, 'color_code', i.color_code_snapshot, 'catalog_color_id', i.catalog_color_id,
        'unit_price', ip.unit_price, 'notes', ip.item_notes, 'line_total', i.quantity * ip.unit_price)
        order by i.position)
      from public.order_items i join public.order_item_prices ip on ip.order_item_id = i.id
      where i.order_id = o.id), '[]'::jsonb),
    'totals', jsonb_build_object('subtotal', t.subtotal, 'delivery_fee', t.delivery_fee,
                                 'agreed_total', t.agreed_total, 'discount', t.discount, 'products_total', t.products_total,
                                 'total', t.total, 'paid', t.paid, 'remaining', t.remaining, 'pending', t.pending),
    'deposit', coalesce((select sum(pp.amount) from public.order_payments pp
                         where pp.order_id = o.id and pp.kind = 'deposit' and pp.status <> 'rejected'), 0),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object('id', pp.id, 'amount', pp.amount, 'kind', pp.kind, 'note', pp.note,
                                          'paid_at', pp.paid_at, 'recorded_by', rb.full_name,
                                          'status', pp.status, 'method', pp.method,
                                          'reviewed_by', vb.full_name, 'review_note', pp.review_note)
                       order by pp.paid_at)
      from public.order_payments pp
      join public.profiles rb on rb.id = pp.recorded_by
      left join public.profiles vb on vb.id = pp.reviewed_by
      where pp.order_id = o.id), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object('from', h.from_status, 'to', h.to_status, 'changed_at', h.changed_at,
                                          'changed_by', hb.full_name, 'note', h.note) order by h.changed_at, h.id)
      from public.order_status_history h join public.profiles hb on hb.id = h.changed_by
      where h.order_id = o.id), '[]'::jsonb),
    'can_edit', (o.status = 'draft' and (o.created_by = auth.uid() or v_role = 'super_admin'))
                or (o.status not in ('draft', 'delivered', 'cancelled')
                    and (v_role = 'super_admin'
                         or (v_role = 'sales' and o.created_by = auth.uid() and public.has_permission('edit_submitted_orders')))),
    'can_record_payment', o.status not in ('draft', 'cancelled')
                          and (v_finance or (v_role = 'sales' and o.created_by = auth.uid())),
    'finance', case when v_finance then jsonb_build_object(
        'cost', k.cost, 'profit', (t.products_total - k.cost), 'items_missing_cost', k.items_missing_cost)
      else null end
  ) into v_res
  from public.orders o
  join public.profiles pr on pr.id = o.created_by
  left join public.order_private op on op.order_id = o.id
  left join public.customers c on c.id = op.customer_id
  left join public.order_totals t on t.order_id = o.id
  left join public.order_costs k on k.order_id = o.id
  where o.id = p_order_id;

  return v_res;
end $$;

-- ---------------------------------------------------------------------
-- التقارير المالية ولوحة المالك: المبيعات = قيمة المنتجات فقط
-- ---------------------------------------------------------------------
create or replace function public.finance_summary(p_from date default null, p_to date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_tz  text := public._tz();
  v_res jsonb;
begin
  perform public._require_role('super_admin', 'accountant');
  with ranged as (
    select o.id, o.created_by, (o.submitted_at at time zone v_tz)::date as day,
           t.products_total as total, t.subtotal, t.delivery_fee, c.cost, c.items_missing_cost
    from public.orders o
    join public.order_totals t on t.order_id = o.id
    join public.order_costs c on c.order_id = o.id
    where o.status not in ('draft', 'cancelled') and o.kind = 'regular'
      and (p_from is null or (o.submitted_at at time zone v_tz)::date >= p_from)
      and (p_to is null or (o.submitted_at at time zone v_tz)::date <= p_to)
  ), pays as (
    select op.amount, op.method, op.recorded_by, o.created_by, (op.paid_at at time zone v_tz)::date as day
    from public.order_payments op join public.orders o on o.id = op.order_id
    where op.status = 'confirmed' and o.status <> 'draft'
      and (p_from is null or (op.paid_at at time zone v_tz)::date >= p_from)
      and (p_to is null or (op.paid_at at time zone v_tz)::date <= p_to)
  ), items as (
    select i.model_name_snapshot as model, i.quantity, ip.unit_price,
           coalesce(oic.unit_cost, pc.cost_price) as unit_cost
    from ranged r
    join public.order_items i on i.order_id = r.id
    join public.order_item_prices ip on ip.order_item_id = i.id
    left join public.order_item_costs oic on oic.order_item_id = i.id
    left join public.product_costs pc on pc.product_id = i.product_id
  ), returns_ranged as (
    select t.total
    from public.orders o join public.order_totals t on t.order_id = o.id
    where o.status not in ('draft', 'cancelled') and o.kind = 'return'
      and (p_from is null or (o.submitted_at at time zone v_tz)::date >= p_from)
      and (p_to is null or (o.submitted_at at time zone v_tz)::date <= p_to)
  )
  select jsonb_build_object(
    'orders', (select count(*) from ranged),
    'sales', (select coalesce(sum(total), 0) from ranged),
    'items_revenue', (select coalesce(sum(subtotal), 0) from ranged),
    'delivery_fees', (select coalesce(sum(delivery_fee), 0) from ranged),
    'discounts', (select coalesce(sum(subtotal - total), 0) from ranged),
    'cost', (select coalesce(sum(cost), 0) from ranged),
    'profit', (select coalesce(sum(total - cost), 0) from ranged),
    'items_missing_cost', (select coalesce(sum(items_missing_cost), 0) from ranged),
    'collected', (select coalesce(sum(amount), 0) from pays),
    'collected_by_method', (select coalesce(jsonb_object_agg(method, s), '{}'::jsonb)
                              from (select method, sum(amount) s from pays group by method) m),
    'pending', jsonb_build_object(
      'count', (select count(*) from public.order_payments op join public.orders o on o.id = op.order_id
                where op.status = 'pending' and o.status <> 'draft'),
      'amount', (select coalesce(sum(op.amount), 0) from public.order_payments op join public.orders o on o.id = op.order_id
                 where op.status = 'pending' and o.status <> 'draft')),
    'outstanding', (select coalesce(sum(t.remaining), 0) from public.orders o join public.order_totals t on t.order_id = o.id
                    where o.status not in ('draft', 'cancelled') and o.kind = 'regular' and t.remaining > 0),
    'outstanding_orders', (select count(*) from public.orders o join public.order_totals t on t.order_id = o.id
                           where o.status not in ('draft', 'cancelled') and o.kind = 'regular' and t.remaining > 0),
    'returns', jsonb_build_object(
      'count', (select count(*) from returns_ranged),
      'total', (select coalesce(sum(total), 0) from returns_ranged)),
    'by_model', (select coalesce(jsonb_agg(x order by x.revenue desc), '[]'::jsonb) from (
        select model, sum(quantity)::int as qty, sum(quantity * unit_price) as revenue,
               sum(quantity * coalesce(unit_cost, 0)) as cost,
               sum(quantity * unit_price) - sum(quantity * coalesce(unit_cost, 0)) as profit,
               bool_or(unit_cost is null) as missing_cost
        from items group by model) x),
    'by_sales', (select coalesce(jsonb_agg(x order by x.sales desc), '[]'::jsonb) from (
        select pr.full_name as name, count(r.id)::int as orders, sum(r.total) as sales, sum(r.total - r.cost) as profit,
               (select coalesce(sum(pa.amount), 0) from pays pa where pa.created_by = pr.id) as collected
        from ranged r join public.profiles pr on pr.id = r.created_by
        group by pr.id, pr.full_name) x),
    'by_month', (select coalesce(jsonb_agg(x order by x.month), '[]'::jsonb) from (
        select m.month,
               coalesce((select sum(total) from ranged r where to_char(r.day, 'YYYY-MM') = m.month), 0) as sales,
               coalesce((select sum(total - cost) from ranged r where to_char(r.day, 'YYYY-MM') = m.month), 0) as profit,
               coalesce((select sum(amount) from pays pa where to_char(pa.day, 'YYYY-MM') = m.month), 0) as collected
        from (select distinct to_char(day, 'YYYY-MM') as month from ranged
              union select distinct to_char(day, 'YYYY-MM') from pays) m
        order by m.month desc limit 24) x)
  ) into v_res;
  return v_res;
end $$;

create or replace function public.finance_orders(
  p_from date default null, p_to date default null, p_query text default null,
  p_only_due boolean default false, p_limit int default 50, p_offset int default 0)
returns table (order_id uuid, order_number text, status public.order_status, submitted_at timestamptz,
               customer_name text, customer_phone text, sales_name text, total numeric, cost numeric, profit numeric,
               paid numeric, pending numeric, remaining numeric, items_missing_cost int)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_tz text := public._tz();
  v_q  text := nullif(btrim(coalesce(p_query, '')), '');
begin
  perform public._require_role('super_admin', 'accountant');
  return query
  select o.id, o.order_number, o.status, o.submitted_at, c.full_name, c.phone, pr.full_name,
         t.total, k.cost, (t.products_total - k.cost)::numeric(12,2), t.paid, t.pending, t.remaining, k.items_missing_cost
  from public.orders o
  join public.order_totals t on t.order_id = o.id
  join public.order_costs k on k.order_id = o.id
  join public.profiles pr on pr.id = o.created_by
  left join public.order_private op on op.order_id = o.id
  left join public.customers c on c.id = op.customer_id
  where o.status not in ('draft', 'cancelled') and o.kind = 'regular'
    and (p_from is null or (o.submitted_at at time zone v_tz)::date >= p_from)
    and (p_to is null or (o.submitted_at at time zone v_tz)::date <= p_to)
    and (not coalesce(p_only_due, false) or t.remaining > 0)
    and (v_q is null or o.order_number ilike public._like_pattern(v_q)
         or c.full_name ilike public._like_pattern(v_q) or c.phone ilike public._like_pattern(v_q))
  order by o.submitted_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end $$;

-- ---------------------------------------------------------------------
create or replace function public.admin_dashboard_stats(p_from date default null, p_to date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_tz    text := public._tz();
  v_today date := public._local_today();
  v_res   jsonb;
begin
  perform public._require_role('super_admin');
  with ranged as (
    select o.*, t.products_total as total, t.remaining
    from public.orders o join public.order_totals t on t.order_id = o.id
    where o.status <> 'draft' and o.kind = 'regular'
      and (p_from is null or (o.submitted_at at time zone v_tz)::date >= p_from)
      and (p_to is null or (o.submitted_at at time zone v_tz)::date <= p_to)
  ), open_orders as (
    select o.*, t.remaining
    from public.orders o join public.order_totals t on t.order_id = o.id
    where o.status not in ('draft', 'cancelled') and o.kind = 'regular'
  ), returns_ranged as (
    select o.*, t.total
    from public.orders o join public.order_totals t on t.order_id = o.id
    where o.status not in ('draft', 'cancelled') and o.kind = 'return'
      and (p_from is null or (o.submitted_at at time zone v_tz)::date >= p_from)
      and (p_to is null or (o.submitted_at at time zone v_tz)::date <= p_to)
  )
  select jsonb_build_object(
    'total_orders', (select count(*) from ranged),
    'created_today', (select count(*) from public.orders o
                      where o.status <> 'draft' and o.kind = 'regular' and (o.submitted_at at time zone v_tz)::date = v_today),
    'by_status', jsonb_build_object(
      'new', (select count(*) from ranged where status = 'new'),
      'received', (select count(*) from ranged where status = 'received'),
      'preparing', (select count(*) from ranged where status = 'preparing'),
      'ready', (select count(*) from ranged where status = 'ready'),
      'out_for_delivery', (select count(*) from ranged where status = 'out_for_delivery'),
      'delivered', (select count(*) from ranged where status = 'delivered'),
      'cancelled', (select count(*) from ranged where status = 'cancelled')),
    'delayed', (select count(*) from open_orders
                where status <> 'delivered' and expected_delivery_date < v_today),
    'total_sales', (select coalesce(sum(total), 0) from ranged where status <> 'cancelled'),
    'outstanding', (select coalesce(sum(remaining), 0) from open_orders where remaining > 0),
    'unacknowledged', (select count(*) from public.orders o where o.status = 'new' and o.kind = 'regular'),
    'returns', jsonb_build_object(
      'count', (select count(*) from returns_ranged),
      'total', (select coalesce(sum(total), 0) from returns_ranged),
      'open', (select count(*) from public.orders o
               where o.kind = 'return' and o.status not in ('draft', 'delivered', 'cancelled')))
  ) into v_res;
  return v_res;
end $$;
