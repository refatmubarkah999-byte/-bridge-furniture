-- =====================================================================
-- Bridge Furniture — 10) السعر الإجمالي المتفق عليه + التوصيل كمصروف
--   * لكل طلبية "سعر إجمالي متفق عليه" اختياري. إن وُجد فهو ما يدفعه الزبون،
--     وإلا فالمجموع = مجموع (الكمية × سعر القطعة).
--   * تكلفة التوصيل يدفعها المعرض لشركة التوصيل: لا تُضاف على الزبون،
--     وتُطرح من الربح.
--   آمن للتشغيل أكثر من مرة. يحتاج ملف الكتالوجات قبله.
-- =====================================================================

do $$
begin
  if to_regclass('public.fabric_catalogs') is null then
    raise exception 'شغّل ملف الكتالوجات أولاً، ثم هذا الملف.';
  end if;
end $$;

alter table public.order_financials add column if not exists agreed_total numeric(12,2);
alter table public.order_financials drop constraint if exists order_financials_agreed_total_check;
alter table public.order_financials add constraint order_financials_agreed_total_check
  check (agreed_total is null or (agreed_total >= 0 and agreed_total <= 10000000));

-- المجاميع: المجموع = المتفق عليه أو مجموع المنتجات. التوصيل لا يدخل.
--   (نفس ترتيب الأعمدة القديمة، والأعمدة الجديدة في الآخر)
create or replace view public.order_totals with (security_invoker = true) as
select
  o.id as order_id,
  coalesce(it.subtotal, 0)::numeric(12,2)                                            as subtotal,
  coalesce(f.delivery_fee, 0)::numeric(12,2)                                         as delivery_fee,
  coalesce(f.agreed_total, it.subtotal, 0)::numeric(12,2)                            as total,
  coalesce(pay.paid, 0)::numeric(12,2)                                               as paid,
  (coalesce(f.agreed_total, it.subtotal, 0) - coalesce(pay.paid, 0))::numeric(12,2)  as remaining,
  coalesce(pay.pending, 0)::numeric(12,2)                                            as pending,
  f.agreed_total::numeric(12,2)                                                      as agreed_total,
  (coalesce(it.subtotal, 0) - coalesce(f.agreed_total, it.subtotal, 0))::numeric(12,2) as discount
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
-- حفظ الطلبية: + السعر الإجمالي المتفق عليه
-- ---------------------------------------------------------------------
create or replace function public.save_order_draft(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_role        public.app_role := public._require_role('super_admin', 'sales', 'returns');
  v_uid         uuid := auth.uid();
  v_key         uuid;
  v_order       public.orders%rowtype;
  v_found       boolean := false;
  v_order_id    uuid;
  v_customer_id uuid;
  v_c           jsonb := coalesce(p -> 'customer', '{}'::jsonb);
  v_items       jsonb := coalesce(p -> 'items', '[]'::jsonb);
  v_item        jsonb;
  v_pos         int := 0;
  v_product     public.products%rowtype;
  v_color       text;
  v_qty         int;
  v_price       numeric;
  v_fee         numeric;
  v_deposit     numeric;
  v_agreed      numeric;
  v_check       record;
  v_image       text;
  v_item_id     uuid;
  v_date        date;
  v_prev_products uuid[];
  v_prev_cc     uuid[];
  v_cc_id       uuid;
  v_catalog     text;
  v_code        text;
  v_kind        public.order_kind := case when v_role::text = 'returns' then 'return'::public.order_kind else 'regular'::public.order_kind end;
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'invalid_payload'; end if;
  if jsonb_typeof(v_items) <> 'array' or jsonb_typeof(v_c) <> 'object' then raise exception 'invalid_payload'; end if;
  if jsonb_array_length(v_items) > 50 then raise exception 'too_many_items'; end if;

  begin
    v_key := (p ->> 'idempotency_key')::uuid;
    v_date := nullif(p ->> 'expected_delivery_date', '')::date;
    v_fee := coalesce(nullif(p ->> 'delivery_fee', '')::numeric, 0);
    v_deposit := coalesce(nullif(p ->> 'deposit', '')::numeric, 0);
    v_agreed := nullif(p ->> 'agreed_total', '')::numeric;
  exception when others then
    raise exception 'invalid_payload';
  end;
  if v_key is null then raise exception 'invalid_payload'; end if;
  -- المرتجعات لا تُسجَّل عليها دفعات من موظف المرتجعات
  if v_role::text = 'returns' then v_deposit := 0; end if;
  if v_fee < 0 or v_fee > 100000 or v_fee <> round(v_fee, 2) then raise exception 'invalid_delivery_fee'; end if;
  if v_agreed is not null and (v_agreed < 0 or v_agreed > 10000000 or v_agreed <> round(v_agreed, 2)) then
    raise exception 'invalid_agreed_total';
  end if;
  if v_deposit < 0 or v_deposit > 10000000 or v_deposit <> round(v_deposit, 2) then raise exception 'invalid_deposit'; end if;
  if char_length(coalesce(v_c ->> 'full_name', '')) > 100 or char_length(coalesce(v_c ->> 'address', '')) > 300
     or char_length(coalesce(v_c ->> 'city', '')) > 60 or char_length(coalesce(v_c ->> 'phone', '')) > 20
     or char_length(coalesce(v_c ->> 'phone2', '')) > 20
     or char_length(coalesce(p ->> 'customer_notes', '')) > 1000 or char_length(coalesce(p ->> 'internal_notes', '')) > 1000 then
    raise exception 'text_too_long';
  end if;

  if nullif(p ->> 'order_id', '') is not null then
    select * into v_order from public.orders where id = (p ->> 'order_id')::uuid for update;
    v_found := found;
    if not v_found then raise exception 'not_found'; end if;
  else
    select * into v_order from public.orders where idempotency_key = v_key for update;
    v_found := found;
  end if;

  if v_found then
    -- كل دور يعمل على نوع طلبياته فقط (المالك على الكل)
    if v_role::text = 'returns' and v_order.kind <> 'return' then raise exception 'not_found'; end if;
    if v_role::text = 'sales' and v_order.kind <> 'regular' then raise exception 'not_found'; end if;
    if v_order.status = 'draft' then
      if v_order.created_by <> v_uid and v_role <> 'super_admin' then
        raise exception 'forbidden' using errcode = '42501';
      end if;
    else
      if v_order.idempotency_key = v_key and v_order.created_by = v_uid then
        return v_order.id;
      end if;
      -- موظف المرتجعات لا يملك صلاحية تعديل بعد الإرسال أبداً (الصلاحية تُمنح للمبيعات فقط)
      if not (v_role = 'super_admin'
              or (v_role::text = 'sales' and v_order.created_by = v_uid and public.has_permission('edit_submitted_orders'))) then
        raise exception 'order_locked';
      end if;
      if v_order.status in ('delivered', 'cancelled') then raise exception 'order_closed'; end if;
      if v_date is null then raise exception 'delivery_date_required'; end if;
    end if;
    v_order_id := v_order.id;
    v_kind := v_order.kind;
    update public.orders set expected_delivery_date = v_date where id = v_order_id;
  else
    insert into public.orders(expected_delivery_date, created_by, idempotency_key, kind)
    values (v_date, v_uid, v_key, v_kind)
    returning id into v_order_id;
  end if;

  select op.customer_id into v_customer_id from public.order_private op where op.order_id = v_order_id;
  if v_customer_id is null then
    insert into public.customers(full_name, phone, phone2, city, address, created_by)
    values (btrim(coalesce(v_c ->> 'full_name', '')), btrim(coalesce(v_c ->> 'phone', '')),
            nullif(btrim(coalesce(v_c ->> 'phone2', '')), ''), btrim(coalesce(v_c ->> 'city', '')),
            btrim(coalesce(v_c ->> 'address', '')), v_uid)
    returning id into v_customer_id;
    insert into public.order_private(order_id, customer_id, customer_notes, internal_notes)
    values (v_order_id, v_customer_id, nullif(btrim(coalesce(p ->> 'customer_notes', '')), ''),
            nullif(btrim(coalesce(p ->> 'internal_notes', '')), ''));
  else
    update public.customers set
      full_name = btrim(coalesce(v_c ->> 'full_name', '')),
      phone = btrim(coalesce(v_c ->> 'phone', '')),
      phone2 = nullif(btrim(coalesce(v_c ->> 'phone2', '')), ''),
      city = btrim(coalesce(v_c ->> 'city', '')),
      address = btrim(coalesce(v_c ->> 'address', ''))
    where id = v_customer_id;
    update public.order_private set
      customer_notes = nullif(btrim(coalesce(p ->> 'customer_notes', '')), ''),
      internal_notes = nullif(btrim(coalesce(p ->> 'internal_notes', '')), '')
    where order_id = v_order_id;
  end if;

  v_prev_products := array(select oi.product_id from public.order_items oi where oi.order_id = v_order_id);
  v_prev_cc := array(select oi.catalog_color_id from public.order_items oi
                     where oi.order_id = v_order_id and oi.catalog_color_id is not null);
  delete from public.order_items where order_id = v_order_id;

  for v_item in select value from jsonb_array_elements(v_items) loop
    v_pos := v_pos + 1;
    begin
      select * into v_product from public.products where id = (v_item ->> 'product_id')::uuid;
      v_qty := (v_item ->> 'quantity')::int;
      v_price := coalesce(nullif(v_item ->> 'unit_price', '')::numeric, v_product.standard_price);
      v_cc_id := nullif(v_item ->> 'catalog_color_id', '')::uuid;
    exception when others then
      raise exception 'invalid_item';
    end;
    if v_product.id is null then raise exception 'product_not_found'; end if;
    if not v_product.is_active and not (v_product.id = any(v_prev_products)) then
      raise exception 'product_inactive';
    end if;
    if v_cc_id is not null then
      -- اللون من كتالوج القماش: نحفظ اسم الكتالوج ورقم اللون واسمه كما هي وقت الطلب
      select fc.name, cc.code, cc.name into v_catalog, v_code, v_color
      from public.catalog_colors cc join public.fabric_catalogs fc on fc.id = cc.catalog_id
      where cc.id = v_cc_id and ((cc.is_active and fc.is_active) or cc.id = any(v_prev_cc));
      if not found then raise exception 'invalid_color'; end if;
      v_color := coalesce(v_color, '');
    else
      v_catalog := null;
      v_code := null;
      v_color := btrim(coalesce(v_item ->> 'color', ''));
      if not exists (select 1 from public.product_colors pc
                     where pc.product_id = v_product.id and pc.name = v_color
                       and (pc.is_active or v_product.id = any(v_prev_products))) then
        raise exception 'invalid_color';
      end if;
    end if;
    if v_qty is null or v_qty < 1 or v_qty > 999 then raise exception 'invalid_quantity'; end if;
    if v_price is null or v_price < 0 or v_price > 1000000 or v_price <> round(v_price, 2) then
      raise exception 'invalid_price';
    end if;
    if char_length(coalesce(v_item ->> 'notes', '')) > 500 then raise exception 'text_too_long'; end if;

    select pi.storage_path into v_image from public.product_images pi
    where pi.product_id = v_product.id and pi.is_primary;

    insert into public.order_items(order_id, position, product_id, model_name_snapshot, color_snapshot, image_path_snapshot, quantity,
                                   catalog_color_id, catalog_snapshot, color_code_snapshot)
    values (v_order_id, v_pos, v_product.id, v_product.name, v_color, v_image, v_qty, v_cc_id, v_catalog, v_code)
    returning id into v_item_id;

    insert into public.order_item_prices(order_item_id, unit_price, item_notes)
    values (v_item_id, v_price, nullif(btrim(coalesce(v_item ->> 'notes', '')), ''));
  end loop;

  -- السعر الإجمالي المتفق عليه (اختياري) + تكلفة التوصيل (مصروف على الشركة، لا تُضاف على الزبون)
  insert into public.order_financials(order_id, delivery_fee, agreed_total) values (v_order_id, v_fee, v_agreed)
  on conflict (order_id) do update set delivery_fee = excluded.delivery_fee, agreed_total = excluded.agreed_total;

  -- بعد الإرسال: لا يصير المجموع أقل من المدفوع
  if v_found and v_order.status <> 'draft' then
    select t.total, t.paid, t.pending into v_check from public.order_totals t where t.order_id = v_order_id;
    if v_check.paid + v_check.pending > v_check.total then raise exception 'total_below_paid'; end if;
  end if;

  if not v_found or v_order.status = 'draft' then
    delete from public.order_payments where order_id = v_order_id and kind = 'deposit';
    if v_deposit > 0 then
      insert into public.order_payments(order_id, amount, kind, recorded_by)
      values (v_order_id, v_deposit, 'deposit', v_uid);
    end if;
  else
    perform public._audit('order_updated', 'order', v_order_id::text,
                          jsonb_build_object('order_number', v_order.order_number));
    if v_kind = 'regular' then
      perform public._notify_role('factory_admin', 'status_changed', v_order_id,
        'تعديل على الطلبية ' || v_order.order_number, 'تم تعديل المنتجات أو تاريخ التسليم، راجع الطلبية');
    end if;
    perform public._notify_role('super_admin', 'status_changed', v_order_id,
      'تعديل على الطلبية ' || v_order.order_number, 'تم تعديل الطلبية');
  end if;

  return v_order_id;
end $$;

-- ---------------------------------------------------------------------
-- تفاصيل الطلبية: + المتفق عليه والخصم، والربح يطرح التوصيل
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
                                 'agreed_total', t.agreed_total, 'discount', t.discount,
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
        'cost', k.cost, 'delivery_cost', t.delivery_fee, 'profit', (t.total - k.cost - t.delivery_fee), 'items_missing_cost', k.items_missing_cost)
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
-- التقارير المالية: الربح = المجموع − تكلفة المنتجات − التوصيل
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
           t.total, t.subtotal, t.delivery_fee, c.cost, c.items_missing_cost
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
    'profit', (select coalesce(sum(total - cost - delivery_fee), 0) from ranged),
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
        select pr.full_name as name, count(r.id)::int as orders, sum(r.total) as sales, sum(r.total - r.cost - r.delivery_fee) as profit,
               (select coalesce(sum(pa.amount), 0) from pays pa where pa.created_by = pr.id) as collected
        from ranged r join public.profiles pr on pr.id = r.created_by
        group by pr.id, pr.full_name) x),
    'by_month', (select coalesce(jsonb_agg(x order by x.month), '[]'::jsonb) from (
        select m.month,
               coalesce((select sum(total) from ranged r where to_char(r.day, 'YYYY-MM') = m.month), 0) as sales,
               coalesce((select sum(total - cost - delivery_fee) from ranged r where to_char(r.day, 'YYYY-MM') = m.month), 0) as profit,
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
         t.total, k.cost, (t.total - k.cost - t.delivery_fee)::numeric(12,2), t.paid, t.pending, t.remaining, k.items_missing_cost
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
