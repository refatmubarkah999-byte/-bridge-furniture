-- =====================================================================
-- Bridge Furniture — 6) المرتجعات وموظف المرتجعات
--   • نوع للطلبية: عادية (regular) أو مرتجع (return)
--   • دور جديد returns: ينشئ ويرسل مرتجعات فقط، ويرى مرتجعاته فقط
--     لا يرى الطلبيات العادية ولا طلبيات غيره، لا يحذف، لا يعدّل بعد الإرسال، لا إعدادات
--   • المالك يرى كل المرتجعات بأسعارها. المصنع والمبيعات لا يرونها (صلاحياتهم كما هي).
--   • المرتجعات لا تدخل في أرقام المبيعات والأرباح؛ تُعرض منفصلة.
-- كل المقارنات مع القيمة الجديدة 'returns' نصية أو داخل plpgsql (نفس سبب ملف المالية).
-- =====================================================================

do $$
begin
  if exists (select 1 from pg_type where typname = 'order_kind' and typnamespace = 'public'::regnamespace) then
    raise exception 'تم تشغيل ملف المرتجعات من قبل، ولا داعي لتشغيله مرة ثانية. لم يتغير شيء.';
  end if;
  if not exists (select 1 from pg_type where typname = 'payment_status' and typnamespace = 'public'::regnamespace) then
    raise exception 'شغّل ملف الإدارة المالية (bridge-finance.sql) أولاً، ثم هذا الملف.';
  end if;
end $$;

alter type public.app_role add value if not exists 'returns';

create type public.order_kind as enum ('regular', 'return');

alter table public.orders add column kind public.order_kind not null default 'regular';
create index orders_kind_idx on public.orders(kind, status);

-- ---------------------------------------------------------------------
-- من يرى الطلبية
-- ---------------------------------------------------------------------
create or replace function public.can_access_order(p_order_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case public.app_role_of_current_user()::text
    when 'super_admin' then true
    when 'accountant' then exists (select 1 from public.orders o where o.id = p_order_id and o.status <> 'draft')
    when 'sales' then exists (
      select 1 from public.orders o
      where o.id = p_order_id and o.kind = 'regular'
        and (o.created_by = auth.uid()
             or (o.status <> 'draft' and public.has_permission('view_all_orders')))
    )
    when 'returns' then exists (
      select 1 from public.orders o
      where o.id = p_order_id and o.kind = 'return' and o.created_by = auth.uid()
    )
    else false
  end
$$;

-- موظف المرتجعات يقرأ الكتالوج ليختار المنتج واللون (مثل المبيعات)
drop policy products_select on public.products;
create policy products_select on public.products for select to authenticated
  using ((select public.app_role_of_current_user())::text in ('super_admin', 'sales', 'returns'));
drop policy product_colors_select on public.product_colors;
create policy product_colors_select on public.product_colors for select to authenticated
  using ((select public.app_role_of_current_user())::text in ('super_admin', 'sales', 'returns'));
drop policy product_images_select on public.product_images;
create policy product_images_select on public.product_images for select to authenticated
  using ((select public.app_role_of_current_user())::text in ('super_admin', 'sales', 'returns'));

-- ---------------------------------------------------------------------
-- قناة المصنع الفورية لا تحمل المرتجعات
-- ---------------------------------------------------------------------
create or replace function public._broadcast_order_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'draft' or new.kind = 'return' then
    return new;
  end if;
  perform realtime.send(
    jsonb_build_object('order_id', new.id, 'order_number', new.order_number, 'status', new.status),
    'order_changed',
    'factory-orders',
    true
  );
  return new;
end $$;

-- ---------------------------------------------------------------------
-- حفظ المسودة: موظف المرتجعات ينشئ مرتجعات فقط، بلا عربون
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
  delete from public.order_items where order_id = v_order_id;

  for v_item in select value from jsonb_array_elements(v_items) loop
    v_pos := v_pos + 1;
    begin
      select * into v_product from public.products where id = (v_item ->> 'product_id')::uuid;
      v_qty := (v_item ->> 'quantity')::int;
      v_price := coalesce(nullif(v_item ->> 'unit_price', '')::numeric, v_product.standard_price);
    exception when others then
      raise exception 'invalid_item';
    end;
    if v_product.id is null then raise exception 'product_not_found'; end if;
    if not v_product.is_active and not (v_product.id = any(v_prev_products)) then
      raise exception 'product_inactive';
    end if;
    v_color := btrim(coalesce(v_item ->> 'color', ''));
    if not exists (select 1 from public.product_colors pc
                   where pc.product_id = v_product.id and pc.name = v_color
                     and (pc.is_active or v_product.id = any(v_prev_products))) then
      raise exception 'invalid_color';
    end if;
    if v_qty is null or v_qty < 1 or v_qty > 999 then raise exception 'invalid_quantity'; end if;
    if v_price is null or v_price < 0 or v_price > 1000000 or v_price <> round(v_price, 2) then
      raise exception 'invalid_price';
    end if;
    if char_length(coalesce(v_item ->> 'notes', '')) > 500 then raise exception 'text_too_long'; end if;

    select pi.storage_path into v_image from public.product_images pi
    where pi.product_id = v_product.id and pi.is_primary;

    insert into public.order_items(order_id, position, product_id, model_name_snapshot, color_snapshot, image_path_snapshot, quantity)
    values (v_order_id, v_pos, v_product.id, v_product.name, v_color, v_image, v_qty)
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
-- الإرسال: المرتجع يصل المالك فقط (لا المصنع)
-- ---------------------------------------------------------------------
create or replace function public.submit_order(p_order_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_role    public.app_role := public._require_role('super_admin', 'sales', 'returns');
  v_order   public.orders%rowtype;
  v_c       public.customers%rowtype;
  v_count   int;
  v_total   numeric;
  v_paid    numeric;
  v_pending numeric;
  v_number  text;
  v_sales   text;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'not_found'; end if;
  if (v_role::text = 'returns' and v_order.kind <> 'return') or (v_role::text = 'sales' and v_order.kind <> 'regular') then
    raise exception 'not_found';
  end if;
  if v_order.created_by <> auth.uid() and v_role <> 'super_admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_order.status <> 'draft' then
    return jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number, 'already_submitted', true);
  end if;

  select c.* into v_c from public.order_private op join public.customers c on c.id = op.customer_id
  where op.order_id = p_order_id;
  if v_c.id is null or char_length(btrim(v_c.full_name)) < 2 then raise exception 'customer_name_required'; end if;
  if v_c.phone !~ '^\+?[0-9]{9,15}$' then raise exception 'invalid_phone'; end if;
  if v_c.phone2 is not null and v_c.phone2 !~ '^\+?[0-9]{9,15}$' then raise exception 'invalid_phone2'; end if;
  if btrim(v_c.city) = '' then raise exception 'city_required'; end if;
  if btrim(v_c.address) = '' then raise exception 'address_required'; end if;
  if v_order.expected_delivery_date is null then raise exception 'delivery_date_required'; end if;
  if v_order.expected_delivery_date < public._local_today() then raise exception 'delivery_date_in_past'; end if;

  select count(*) into v_count from public.order_items where order_id = p_order_id;
  if v_count = 0 then raise exception 'items_required'; end if;

  select t.total, t.paid, t.pending into v_total, v_paid, v_pending from public.order_totals t where t.order_id = p_order_id;
  if v_paid + v_pending > v_total then raise exception 'deposit_exceeds_total'; end if;

  v_number := (select s.order_prefix from public.app_settings s limit 1) || '-' || nextval('public.order_number_seq');

  update public.orders
     set status = 'new', order_number = v_number, submitted_at = now(), submitted_by = auth.uid()
   where id = p_order_id;

  insert into public.order_status_history(order_id, from_status, to_status, changed_by)
  values (p_order_id, null, 'new', auth.uid());

  select p.full_name into v_sales from public.profiles p where p.id = v_order.created_by;

  if v_order.kind = 'return' then
    perform public._notify_role('super_admin', 'order_new', p_order_id,
      'مرتجع جديد ' || v_number,
      v_c.full_name || ' — ' || v_c.city || ' — ' || public._format_ils(v_total) || ' — ' || coalesce(v_sales, ''));
  else
    perform public._notify_role('super_admin', 'order_new', p_order_id,
      'طلبية جديدة ' || v_number,
      v_c.full_name || ' — ' || v_c.city || ' — ' || public._format_ils(v_total) || ' — ' || coalesce(v_sales, ''));
    perform public._notify_role('factory_admin', 'order_new', p_order_id,
      'طلبية جديدة ' || v_number,
      v_count || ' منتج — التسليم ' || to_char(v_order.expected_delivery_date, 'DD/MM/YYYY'));
  end if;

  if v_pending > 0 then
    perform public._notify_finance('payment_pending', p_order_id,
      'عربون بانتظار التأكيد ' || v_number,
      coalesce(v_sales, '') || ' استلم ' || public._format_ils(v_pending) || ' من ' || v_c.full_name);
  end if;

  perform public._audit('order_submitted', 'order', p_order_id::text,
    jsonb_build_object('order_number', v_number, 'kind', v_order.kind));

  return jsonb_build_object('order_id', p_order_id, 'order_number', v_number, 'already_submitted', false);
end $$;

-- ---------------------------------------------------------------------
-- تغيير الحالة: المصنع لا يصل إلى المرتجعات، ولا تصله إشعاراتها
-- ---------------------------------------------------------------------
create or replace function public.change_order_status(p_order_id uuid, p_new public.order_status, p_note text default null)
returns public.order_status
language plpgsql security definer set search_path = public as $$
declare
  v_role  public.app_role := public._require_role('super_admin', 'factory_admin');
  v_order public.orders%rowtype;
  v_ok    boolean := false;
  v_type  text;
  v_actor text;
  v_title text;
begin
  if char_length(coalesce(p_note, '')) > 300 then raise exception 'text_too_long'; end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.status = 'draft' then raise exception 'not_found'; end if;
  if v_role = 'factory_admin' and v_order.kind <> 'regular' then raise exception 'not_found'; end if;
  if p_new is null or p_new = 'draft' then raise exception 'transition_not_allowed'; end if;
  if p_new = v_order.status then raise exception 'no_change'; end if;

  if v_role = 'factory_admin' then
    v_ok := (p_new = public._next_status(v_order.status));
  else
    v_ok := (p_new = public._next_status(v_order.status))
         or (p_new = public._prev_status(v_order.status))
         or (p_new = 'cancelled' and v_order.status not in ('delivered', 'cancelled'));
  end if;
  if not v_ok then raise exception 'transition_not_allowed'; end if;

  update public.orders
     set status = p_new,
         acknowledged_at = case when v_order.status = 'new' and p_new = 'received' then now() else acknowledged_at end
   where id = p_order_id;

  insert into public.order_status_history(order_id, from_status, to_status, changed_by, note)
  values (p_order_id, v_order.status, p_new, auth.uid(), nullif(btrim(coalesce(p_note, '')), ''));

  v_type := case p_new
    when 'received' then 'order_acknowledged'
    when 'ready' then 'order_ready'
    when 'cancelled' then 'order_cancelled'
    else 'status_changed' end;
  v_title := v_order.order_number || ': ' || public._status_label(p_new);
  select p.full_name into v_actor from public.profiles p where p.id = auth.uid();

  perform public._notify_role('super_admin', v_type, p_order_id, v_title,
    'من ' || public._status_label(v_order.status) || ' إلى ' || public._status_label(p_new) || ' — بواسطة ' || coalesce(v_actor, ''));
  if v_order.kind = 'regular' then
    perform public._notify_role('factory_admin', v_type, p_order_id, v_title,
      'من ' || public._status_label(v_order.status) || ' إلى ' || public._status_label(p_new));
  end if;
  perform public._notify_user(v_order.created_by, v_type, p_order_id, v_title,
    case when v_order.kind = 'return' then 'حالة المرتجع الآن: ' else 'حالة طلبيتك الآن: ' end || public._status_label(p_new));

  perform public._audit('status_changed', 'order', p_order_id::text,
    jsonb_build_object('order_number', v_order.order_number, 'from', v_order.status, 'to', p_new));

  return p_new;
end $$;

-- ---------------------------------------------------------------------
-- بوابة المصنع: الطلبيات العادية فقط
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
                    'quantity', i.quantity, 'image_path', i.image_path_snapshot) order by i.position)
           from public.order_items i where i.order_id = o.id), '[]'::jsonb)
  from public.orders o
  where o.id = p_order_id and o.status <> 'draft' and o.kind = 'regular';
end $$;

-- ---------------------------------------------------------------------
-- البحث: فلتر النوع، وعمود النوع في النتائج
-- ---------------------------------------------------------------------
drop function public.search_orders(text, public.order_status, date, date, uuid, int, int, boolean);

create function public.search_orders(
  p_query  text default null,
  p_status public.order_status default null,
  p_from   date default null,
  p_to     date default null,
  p_sales  uuid default null,
  p_limit  int default 50,
  p_offset int default 0,
  p_delayed_only boolean default false,
  p_kind   public.order_kind default null)
returns table (order_id uuid, order_number text, status public.order_status, expected_delivery_date date,
               is_delayed boolean, created_at timestamptz, submitted_at timestamptz,
               sales_id uuid, sales_name text, customer_name text, customer_phone text, city text,
               models text, total numeric, remaining numeric, kind public.order_kind)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_today date := public._local_today();
  v_tz    text := public._tz();
  v_q     text := nullif(btrim(coalesce(p_query, '')), '');
begin
  perform public._require_role('super_admin', 'sales', 'accountant', 'returns');
  return query
  select o.id, o.order_number, o.status, o.expected_delivery_date,
         (o.expected_delivery_date < v_today and o.status not in ('draft', 'delivered', 'cancelled')),
         o.created_at, o.submitted_at, o.created_by, pr.full_name,
         c.full_name, c.phone, c.city,
         (select string_agg(i.model_name_snapshot || ' ×' || i.quantity, '، ' order by i.position)
            from public.order_items i where i.order_id = o.id),
         t.total, t.remaining, o.kind
  from public.orders o
  join public.profiles pr on pr.id = o.created_by
  left join public.order_private op on op.order_id = o.id
  left join public.customers c on c.id = op.customer_id
  left join public.order_totals t on t.order_id = o.id
  where public.can_access_order(o.id)
    and (p_kind is null or o.kind = p_kind)
    and (case when p_status is null then o.status <> 'draft'
              when p_status = 'draft' then o.status = 'draft' and o.created_by = auth.uid()
              else o.status = p_status end)
    and (p_sales is null or o.created_by = p_sales)
    and (not coalesce(p_delayed_only, false)
         or (o.expected_delivery_date < v_today and o.status not in ('draft', 'delivered', 'cancelled')))
    and (p_from is null or (coalesce(o.submitted_at, o.created_at) at time zone v_tz)::date >= p_from)
    and (p_to is null or (coalesce(o.submitted_at, o.created_at) at time zone v_tz)::date <= p_to)
    and (v_q is null
         or o.order_number ilike public._like_pattern(v_q)
         or c.full_name ilike public._like_pattern(v_q)
         or c.phone ilike public._like_pattern(v_q)
         or c.phone2 ilike public._like_pattern(v_q)
         or c.city ilike public._like_pattern(v_q)
         or exists (select 1 from public.order_items i2
                    where i2.order_id = o.id and i2.model_name_snapshot ilike public._like_pattern(v_q)))
  order by coalesce(o.submitted_at, o.created_at) desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end $$;

-- ---------------------------------------------------------------------
-- تفاصيل الطلبية: + النوع، وموظف المرتجعات يرى مرتجعاته
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
-- لوحة المالك: أرقام الطلبيات العادية كما كانت + المرتجعات منفصلة
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
    select o.*, t.total, t.remaining
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

-- ---------------------------------------------------------------------
-- التقرير المالي: المبيعات والأرباح للطلبيات العادية فقط + المرتجعات منفصلة
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
         t.total, k.cost, (t.total - k.cost)::numeric(12,2), t.paid, t.pending, t.remaining, k.items_missing_cost
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
-- تنبيه التأخير اليومي: المصنع للطلبيات العادية فقط
-- ---------------------------------------------------------------------
create or replace function public.notify_delayed_orders() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_today date := public._local_today();
  v_count int := 0;
  r record;
begin
  for r in
    select o.id, o.order_number, o.expected_delivery_date, o.created_by, o.kind
    from public.orders o
    where o.status not in ('draft', 'delivered', 'cancelled')
      and o.expected_delivery_date < v_today
      and not exists (select 1 from public.notifications n
                      where n.order_id = o.id and n.type = 'order_delayed'
                        and (n.created_at at time zone public._tz())::date = v_today)
  loop
    insert into public.notifications(recipient_id, type, order_id, title, body)
    select p.id, 'order_delayed', r.id,
           case when r.kind = 'return' then 'مرتجع متأخر ' else 'طلبية متأخرة ' end || r.order_number,
           'كان الموعد ' || to_char(r.expected_delivery_date, 'DD/MM/YYYY')
    from public.profiles p
    where p.is_active
      and (p.role::text = 'super_admin'
           or (p.role::text = 'factory_admin' and r.kind = 'regular')
           or p.id = r.created_by);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

create or replace function public.mark_notifications_read(p_ids bigint[] default null) returns int
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  perform public._require_role('super_admin', 'factory_admin', 'sales', 'accountant', 'returns');
  update public.notifications set read_at = now()
   where recipient_id = auth.uid() and read_at is null and (p_ids is null or id = any(p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ---------------------------------------------------------------------
-- من يستطيع تشغيل ماذا (إعادة ضبط كاملة)
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.app_role_of_current_user() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_finance() to authenticated;
grant execute on function public.has_permission(text) to authenticated;
grant execute on function public.can_access_order(uuid) to authenticated;

grant execute on function public.save_order_draft(jsonb) to authenticated;
grant execute on function public.submit_order(uuid) to authenticated;
grant execute on function public.delete_draft(uuid) to authenticated;
grant execute on function public.change_order_status(uuid, public.order_status, text) to authenticated;
grant execute on function public.factory_list_orders(public.order_status, date, date, text, int, int) to authenticated;
grant execute on function public.factory_get_order(uuid) to authenticated;
grant execute on function public.search_orders(text, public.order_status, date, date, uuid, int, int, boolean, public.order_kind) to authenticated;
grant execute on function public.get_order_detail(uuid) to authenticated;
grant execute on function public.record_payment(uuid, numeric, text, text) to authenticated;
grant execute on function public.review_payment(uuid, boolean, text) to authenticated;
grant execute on function public.set_product_cost(uuid, numeric) to authenticated;
grant execute on function public.finance_product_costs() to authenticated;
grant execute on function public.finance_summary(date, date) to authenticated;
grant execute on function public.finance_orders(date, date, text, boolean, int, int) to authenticated;
grant execute on function public.finance_payments(public.payment_status, int) to authenticated;
grant execute on function public.admin_dashboard_stats(date, date) to authenticated;
grant execute on function public.mark_notifications_read(bigint[]) to authenticated;
grant execute on function public.touch_last_seen() to authenticated;
grant execute on function public.update_settings(text, text, text) to authenticated;
grant execute on function public.admin_update_employee(uuid, text, text, public.app_role, boolean, text[]) to authenticated;
