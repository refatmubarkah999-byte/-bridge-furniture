-- =====================================================================
-- Bridge Furniture — 7) كتالوجات الأقمشة وأرقام الألوان
--   • قائمة كتالوجات عامة لكل المنتجات، ولكل كتالوج أرقام ألوان (مع اسم اللون اختيارياً)
--   • كل منتج في الطلبية يحفظ: الكتالوج + رقم اللون + اسم اللون، كما كانت وقت الطلب
--   • المصنع يرى الكتالوج ورقم اللون (جزء من تفاصيل اللون التي يحتاجها للتصنيع)
--   • الألوان القديمة الخاصة بكل موديل تبقى تعمل للطلبيات القديمة وكاحتياط
-- =====================================================================

do $$
begin
  if to_regclass('public.fabric_catalogs') is not null then
    raise exception 'تم تشغيل ملف الكتالوجات من قبل، ولا داعي لتشغيله مرة ثانية. لم يتغير شيء.';
  end if;
  if not exists (select 1 from pg_type where typname = 'order_kind' and typnamespace = 'public'::regnamespace) then
    raise exception 'شغّل ملفي المالية والمرتجعات أولاً، ثم هذا الملف.';
  end if;
end $$;

create table public.fabric_catalogs (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (char_length(btrim(name)) between 1 and 60),
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.catalog_colors (
  id         uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.fabric_catalogs(id) on delete cascade,
  code       text not null check (char_length(btrim(code)) between 1 and 20),
  name       text check (name is null or char_length(name) <= 40),
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  unique (catalog_id, code)
);
create index catalog_colors_catalog_idx on public.catalog_colors(catalog_id);

create trigger fabric_catalogs_touch before update on public.fabric_catalogs
for each row execute function public.touch_updated_at();

-- الطلبيات القديمة: هذه الحقول فارغة (لونها من الألوان الخاصة بالموديل)
alter table public.order_items
  add column catalog_color_id    uuid references public.catalog_colors(id) on delete set null,
  add column catalog_snapshot    text check (catalog_snapshot is null or char_length(catalog_snapshot) <= 60),
  add column color_code_snapshot text check (color_code_snapshot is null or char_length(color_code_snapshot) <= 20);

-- الصلاحيات: المالك يدير، المبيعات والمرتجعات يقرؤون. المصنع لا يقرأ الجداول (يرى ما حُفظ في طلبياته فقط)
alter table public.fabric_catalogs enable row level security;
alter table public.catalog_colors  enable row level security;
revoke all on public.fabric_catalogs, public.catalog_colors from anon, authenticated;
grant select, insert, update, delete on public.fabric_catalogs, public.catalog_colors to authenticated;

create policy fabric_catalogs_select on public.fabric_catalogs for select to authenticated
  using ((select public.app_role_of_current_user())::text in ('super_admin', 'sales', 'returns'));
create policy fabric_catalogs_insert on public.fabric_catalogs for insert to authenticated
  with check ((select public.is_admin()));
create policy fabric_catalogs_update on public.fabric_catalogs for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy fabric_catalogs_delete on public.fabric_catalogs for delete to authenticated
  using ((select public.is_admin()));

create policy catalog_colors_select on public.catalog_colors for select to authenticated
  using ((select public.app_role_of_current_user())::text in ('super_admin', 'sales', 'returns'));
create policy catalog_colors_insert on public.catalog_colors for insert to authenticated
  with check ((select public.is_admin()));
create policy catalog_colors_update on public.catalog_colors for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy catalog_colors_delete on public.catalog_colors for delete to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------
-- حفظ المسودة: يقبل catalog_color_id لكل منتج
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
  exception when others then
    raise exception 'invalid_payload';
  end;
  if v_key is null then raise exception 'invalid_payload'; end if;
  -- المرتجعات لا تُسجَّل عليها دفعات من موظف المرتجعات
  if v_role::text = 'returns' then v_deposit := 0; end if;
  if v_fee < 0 or v_fee > 100000 or v_fee <> round(v_fee, 2) then raise exception 'invalid_delivery_fee'; end if;
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

  insert into public.order_financials(order_id, delivery_fee) values (v_order_id, v_fee)
  on conflict (order_id) do update set delivery_fee = excluded.delivery_fee;

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
-- تفاصيل الطلبية: + الكتالوج ورقم اللون
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
        'cost', k.cost, 'profit', (t.total - k.cost), 'items_missing_cost', k.items_missing_cost)
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
-- بوابة المصنع: + الكتالوج ورقم اللون
-- ---------------------------------------------------------------------
create or replace function public.factory_list_orders(
  p_status public.order_status default null,
  p_from   date default null,
  p_to     date default null,
  p_query  text default null,
  p_limit  int default 100,
  p_offset int default 0)
returns table (order_id uuid, order_number text, status public.order_status,
               expected_delivery_date date, is_delayed boolean, items jsonb)
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
           from public.order_items i where i.order_id = o.id), '[]'::jsonb)
  from public.orders o
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

create or replace function public.factory_get_order(p_order_id uuid)
returns table (order_id uuid, order_number text, status public.order_status,
               expected_delivery_date date, is_delayed boolean, items jsonb)
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
           from public.order_items i where i.order_id = o.id), '[]'::jsonb)
  from public.orders o
  where o.id = p_order_id and o.status <> 'draft' and o.kind = 'regular';
end $$;
