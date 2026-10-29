-- =====================================================================
-- Bridge Furniture — 3) الدوال: حفظ وإرسال الطلبيات، تغيير الحالة، بوابة المصنع، البحث
-- كل دالة تتحقق من الدور أولاً، وتعمل كعملية واحدة لا تتجزأ (transaction).
-- رسائل الأخطاء رموز قصيرة تترجمها الواجهة إلى العربية.
-- =====================================================================

-- ---------------------------------------------------------------------
-- دوال داخلية (غير متاحة للمستخدمين مباشرة)
-- ---------------------------------------------------------------------
create function public._require_role(variadic p_roles public.app_role[]) returns public.app_role
language plpgsql stable security definer set search_path = public as $$
declare v_role public.app_role := public.app_role_of_current_user();
begin
  if v_role is null or not (v_role = any(p_roles)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return v_role;
end $$;

create function public._tz() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select s.timezone from public.app_settings s limit 1), 'Asia/Hebron')
$$;

create function public._local_today() returns date
language sql stable security definer set search_path = public as $$
  select (now() at time zone public._tz())::date
$$;

create function public._like_pattern(p_text text) returns text
language sql immutable as $$
  select '%' || replace(replace(replace(p_text, '\', '\\'), '%', '\%'), '_', '\_') || '%'
$$;

create function public._status_label(p_status public.order_status) returns text
language sql immutable as $$
  select case p_status
    when 'draft' then 'مسودة'
    when 'new' then 'طلبية جديدة'
    when 'received' then 'تم الاستلام'
    when 'preparing' then 'قيد التجهيز'
    when 'ready' then 'جاهزة'
    when 'out_for_delivery' then 'خرجت للتوصيل'
    when 'delivered' then 'تم التسليم'
    when 'cancelled' then 'ملغية'
  end
$$;

create function public._next_status(p_status public.order_status) returns public.order_status
language sql immutable as $$
  select case p_status
    when 'new' then 'received'::public.order_status
    when 'received' then 'preparing'
    when 'preparing' then 'ready'
    when 'ready' then 'out_for_delivery'
    when 'out_for_delivery' then 'delivered'
    else null
  end
$$;

create function public._prev_status(p_status public.order_status) returns public.order_status
language sql immutable as $$
  select case p_status
    when 'received' then 'new'::public.order_status
    when 'preparing' then 'received'
    when 'ready' then 'preparing'
    when 'out_for_delivery' then 'ready'
    when 'delivered' then 'out_for_delivery'
    else null
  end
$$;

create function public._format_ils(p_amount numeric) returns text
language sql immutable as $$
  select '₪' || to_char(coalesce(p_amount, 0), 'FM999G999G990D00')
$$;

create function public._audit(p_action text, p_entity text, p_entity_id text, p_details jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.audit_logs(actor_id, action, entity, entity_id, details)
  values (auth.uid(), p_action, p_entity, p_entity_id, coalesce(p_details, '{}'::jsonb))
$$;

-- إشعار لكل المستخدمين الفعّالين في دور معين (عدا من قام بالعملية)
create function public._notify_role(p_role public.app_role, p_type text, p_order_id uuid, p_title text, p_body text)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications(recipient_id, type, order_id, title, body)
  select p.id, p_type, p_order_id, p_title, p_body
  from public.profiles p
  where p.role = p_role and p.is_active and p.id is distinct from auth.uid()
$$;

create function public._notify_user(p_user uuid, p_type text, p_order_id uuid, p_title text, p_body text)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications(recipient_id, type, order_id, title, body)
  select p.id, p_type, p_order_id, p_title, p_body
  from public.profiles p
  where p.id = p_user and p.is_active and p.id is distinct from auth.uid()
$$;

-- ---------------------------------------------------------------------
-- حفظ الطلبية كمسودة (أو تعديل طلبية مُرسلة لمن يملك الصلاحية)
-- p: { order_id?, idempotency_key, expected_delivery_date?, customer:{full_name, phone, phone2, city, address},
--      customer_notes, internal_notes, delivery_fee, deposit, items:[{product_id, color, quantity, unit_price, notes}] }
-- ---------------------------------------------------------------------
create function public.save_order_draft(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_role        public.app_role := public._require_role('super_admin', 'sales');
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
  if v_fee < 0 or v_fee > 100000 or v_fee <> round(v_fee, 2) then raise exception 'invalid_delivery_fee'; end if;
  if v_deposit < 0 or v_deposit > 10000000 or v_deposit <> round(v_deposit, 2) then raise exception 'invalid_deposit'; end if;
  if char_length(coalesce(v_c ->> 'full_name', '')) > 100 or char_length(coalesce(v_c ->> 'address', '')) > 300
     or char_length(coalesce(v_c ->> 'city', '')) > 60 or char_length(coalesce(v_c ->> 'phone', '')) > 20
     or char_length(coalesce(v_c ->> 'phone2', '')) > 20
     or char_length(coalesce(p ->> 'customer_notes', '')) > 1000 or char_length(coalesce(p ->> 'internal_notes', '')) > 1000 then
    raise exception 'text_too_long';
  end if;

  -- البحث عن الطلبية: برقمها إن وُجد، وإلا برمز الإرسال الفريد (يمنع التكرار عند الضغط المزدوج)
  if nullif(p ->> 'order_id', '') is not null then
    select * into v_order from public.orders where id = (p ->> 'order_id')::uuid for update;
    v_found := found;
    if not v_found then raise exception 'not_found'; end if;
  else
    select * into v_order from public.orders where idempotency_key = v_key for update;
    v_found := found;
  end if;

  if v_found then
    if v_order.status = 'draft' then
      if v_order.created_by <> v_uid and v_role <> 'super_admin' then
        raise exception 'forbidden' using errcode = '42501';
      end if;
    else
      -- نفس النموذج أُرسل مرتين: أرجع نفس الطلبية دون أي تعديل
      if v_order.idempotency_key = v_key and v_order.created_by = v_uid then
        return v_order.id;
      end if;
      if not (v_role = 'super_admin'
              or (v_order.created_by = v_uid and public.has_permission('edit_submitted_orders'))) then
        raise exception 'order_locked';
      end if;
      if v_order.status in ('delivered', 'cancelled') then raise exception 'order_closed'; end if;
      if v_date is null then raise exception 'delivery_date_required'; end if;
    end if;
    v_order_id := v_order.id;
    update public.orders set expected_delivery_date = v_date where id = v_order_id;
  else
    insert into public.orders(expected_delivery_date, created_by, idempotency_key)
    values (v_date, v_uid, v_key)
    returning id into v_order_id;
  end if;

  -- الزبون
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

  -- المنتجات: نحفظ نسخة من الاسم واللون والصورة وقت الطلب
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
    -- العربون يُسجَّل مع المسودة. الدفعات بعد الإرسال تُسجَّل عبر record_payment
    delete from public.order_payments where order_id = v_order_id and kind = 'deposit';
    if v_deposit > 0 then
      insert into public.order_payments(order_id, amount, kind, recorded_by)
      values (v_order_id, v_deposit, 'deposit', v_uid);
    end if;
  else
    perform public._audit('order_updated', 'order', v_order_id::text,
                          jsonb_build_object('order_number', v_order.order_number));
    perform public._notify_role('factory_admin', 'status_changed', v_order_id,
      'تعديل على الطلبية ' || v_order.order_number, 'تم تعديل المنتجات أو تاريخ التسليم، راجع الطلبية');
    perform public._notify_role('super_admin', 'status_changed', v_order_id,
      'تعديل على الطلبية ' || v_order.order_number, 'تم تعديل الطلبية');
  end if;

  return v_order_id;
end $$;

-- ---------------------------------------------------------------------
-- إرسال الطلبية: تحقق كامل، رقم جديد، حالة "جديدة"، سجل، إشعارات — في عملية واحدة
-- الاستدعاء المكرر يُرجع نفس الطلبية ولا يُنشئ نسخة ثانية
-- ---------------------------------------------------------------------
create function public.submit_order(p_order_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_role   public.app_role := public._require_role('super_admin', 'sales');
  v_order  public.orders%rowtype;
  v_c      public.customers%rowtype;
  v_count  int;
  v_total  numeric;
  v_paid   numeric;
  v_number text;
  v_sales  text;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'not_found'; end if;
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

  select t.total, t.paid into v_total, v_paid from public.order_totals t where t.order_id = p_order_id;
  if v_paid > v_total then raise exception 'deposit_exceeds_total'; end if;

  v_number := (select s.order_prefix from public.app_settings s limit 1) || '-' || nextval('public.order_number_seq');

  update public.orders
     set status = 'new', order_number = v_number, submitted_at = now(), submitted_by = auth.uid()
   where id = p_order_id;

  insert into public.order_status_history(order_id, from_status, to_status, changed_by)
  values (p_order_id, null, 'new', auth.uid());

  select p.full_name into v_sales from public.profiles p where p.id = v_order.created_by;

  -- إشعار المالك: كامل
  perform public._notify_role('super_admin', 'order_new', p_order_id,
    'طلبية جديدة ' || v_number,
    v_c.full_name || ' — ' || v_c.city || ' — ' || public._format_ils(v_total) || ' — ' || coalesce(v_sales, ''));
  -- إشعار المصنع: الحقول المسموحة فقط (رقم، عدد المنتجات، تاريخ التسليم)
  perform public._notify_role('factory_admin', 'order_new', p_order_id,
    'طلبية جديدة ' || v_number,
    v_count || ' منتج — التسليم ' || to_char(v_order.expected_delivery_date, 'DD/MM/YYYY'));

  perform public._audit('order_submitted', 'order', p_order_id::text, jsonb_build_object('order_number', v_number));

  return jsonb_build_object('order_id', p_order_id, 'order_number', v_number, 'already_submitted', false);
end $$;

-- ---------------------------------------------------------------------
-- تغيير الحالة — الطريق الوحيد لتعديل أي شيء من حساب المصنع
-- المصنع: خطوة واحدة للأمام فقط. المالك: للأمام، أو خطوة للخلف، أو إلغاء.
-- ---------------------------------------------------------------------
create function public.change_order_status(p_order_id uuid, p_new public.order_status, p_note text default null)
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
  perform public._notify_role('factory_admin', v_type, p_order_id, v_title,
    'من ' || public._status_label(v_order.status) || ' إلى ' || public._status_label(p_new));
  perform public._notify_user(v_order.created_by, v_type, p_order_id, v_title,
    'حالة طلبيتك الآن: ' || public._status_label(p_new));

  perform public._audit('status_changed', 'order', p_order_id::text,
    jsonb_build_object('order_number', v_order.order_number, 'from', v_order.status, 'to', p_new));

  return p_new;
end $$;

-- ---------------------------------------------------------------------
-- بوابة المصنع: تُرجع فقط رقم الطلبية، الحالة، تاريخ التسليم، والمنتجات (موديل، لون، كمية، صورة)
-- ---------------------------------------------------------------------
create function public.factory_list_orders(
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
  where o.status <> 'draft'
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
  where o.id = p_order_id and o.status <> 'draft';
end $$;

-- ---------------------------------------------------------------------
-- البحث للمالك والمبيعات (المبيعات ترى طلبياتها فقط)
-- ---------------------------------------------------------------------
create function public.search_orders(
  p_query  text default null,
  p_status public.order_status default null,
  p_from   date default null,
  p_to     date default null,
  p_sales  uuid default null,
  p_limit  int default 50,
  p_offset int default 0,
  p_delayed_only boolean default false)
returns table (order_id uuid, order_number text, status public.order_status, expected_delivery_date date,
               is_delayed boolean, created_at timestamptz, submitted_at timestamptz,
               sales_id uuid, sales_name text, customer_name text, customer_phone text, city text,
               models text, total numeric, remaining numeric)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_today date := public._local_today();
  v_tz    text := public._tz();
  v_q     text := nullif(btrim(coalesce(p_query, '')), '');
begin
  perform public._require_role('super_admin', 'sales');
  return query
  select o.id, o.order_number, o.status, o.expected_delivery_date,
         (o.expected_delivery_date < v_today and o.status not in ('draft', 'delivered', 'cancelled')),
         o.created_at, o.submitted_at, o.created_by, pr.full_name,
         c.full_name, c.phone, c.city,
         (select string_agg(i.model_name_snapshot || ' ×' || i.quantity, '، ' order by i.position)
            from public.order_items i where i.order_id = o.id),
         t.total, t.remaining
  from public.orders o
  join public.profiles pr on pr.id = o.created_by
  left join public.order_private op on op.order_id = o.id
  left join public.customers c on c.id = op.customer_id
  left join public.order_totals t on t.order_id = o.id
  where public.can_access_order(o.id)
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
-- تفاصيل طلبية كاملة (المالك، أو موظف المبيعات صاحبها)
-- ---------------------------------------------------------------------
create function public.get_order_detail(p_order_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_role  public.app_role := public._require_role('super_admin', 'sales');
  v_order public.orders%rowtype;
  v_res   jsonb;
begin
  if not public.can_access_order(p_order_id) then raise exception 'not_found'; end if;
  select * into v_order from public.orders where id = p_order_id;
  if not found then raise exception 'not_found'; end if;

  select jsonb_build_object(
    'id', o.id,
    'order_number', o.order_number,
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
                                 'total', t.total, 'paid', t.paid, 'remaining', t.remaining),
    'deposit', coalesce((select sum(pp.amount) from public.order_payments pp
                         where pp.order_id = o.id and pp.kind = 'deposit'), 0),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object('id', pp.id, 'amount', pp.amount, 'kind', pp.kind, 'note', pp.note,
                                          'paid_at', pp.paid_at, 'recorded_by', rb.full_name) order by pp.paid_at)
      from public.order_payments pp join public.profiles rb on rb.id = pp.recorded_by
      where pp.order_id = o.id), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object('from', h.from_status, 'to', h.to_status, 'changed_at', h.changed_at,
                                          'changed_by', hb.full_name, 'note', h.note) order by h.changed_at, h.id)
      from public.order_status_history h join public.profiles hb on hb.id = h.changed_by
      where h.order_id = o.id), '[]'::jsonb),
    'can_edit', (o.status = 'draft' and (o.created_by = auth.uid() or v_role = 'super_admin'))
                or (o.status not in ('draft', 'delivered', 'cancelled')
                    and (v_role = 'super_admin'
                         or (o.created_by = auth.uid() and public.has_permission('edit_submitted_orders'))))
  ) into v_res
  from public.orders o
  join public.profiles pr on pr.id = o.created_by
  left join public.order_private op on op.order_id = o.id
  left join public.customers c on c.id = op.customer_id
  left join public.order_totals t on t.order_id = o.id
  where o.id = p_order_id;

  return v_res;
end $$;

-- حذف مسودة (الطلبيات المرسلة لا تُحذف أبداً، تُلغى فقط)
create function public.delete_draft(p_order_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role  public.app_role := public._require_role('super_admin', 'sales');
  v_order public.orders%rowtype;
  v_customer uuid;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'not_found'; end if;
  if v_order.status <> 'draft' then raise exception 'order_locked'; end if;
  if v_order.created_by <> auth.uid() and v_role <> 'super_admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select customer_id into v_customer from public.order_private where order_id = p_order_id;
  delete from public.orders where id = p_order_id;
  if v_customer is not null then
    delete from public.customers c where c.id = v_customer
      and not exists (select 1 from public.order_private op where op.customer_id = c.id);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- الدفعات (المالك فقط بعد الإرسال)
-- ---------------------------------------------------------------------
create function public.record_payment(p_order_id uuid, p_amount numeric, p_note text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders%rowtype;
  v_id    uuid;
begin
  perform public._require_role('super_admin');
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.status = 'draft' then raise exception 'not_found'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 10000000 or p_amount <> round(p_amount, 2) then
    raise exception 'invalid_amount';
  end if;
  if char_length(coalesce(p_note, '')) > 300 then raise exception 'text_too_long'; end if;
  insert into public.order_payments(order_id, amount, kind, note, recorded_by)
  values (p_order_id, p_amount, 'payment', nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  returning id into v_id;
  perform public._audit('payment_recorded', 'order', p_order_id::text,
    jsonb_build_object('order_number', v_order.order_number, 'amount', p_amount));
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- أرقام لوحة المالك. p_from/p_to تواريخ محلية حسب توقيت الشركة
-- ---------------------------------------------------------------------
create function public.admin_dashboard_stats(p_from date default null, p_to date default null) returns jsonb
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
    where o.status <> 'draft'
      and (p_from is null or (o.submitted_at at time zone v_tz)::date >= p_from)
      and (p_to is null or (o.submitted_at at time zone v_tz)::date <= p_to)
  ), open_orders as (
    select o.*, t.remaining
    from public.orders o join public.order_totals t on t.order_id = o.id
    where o.status not in ('draft', 'cancelled')
  )
  select jsonb_build_object(
    'total_orders', (select count(*) from ranged),
    'created_today', (select count(*) from public.orders o
                      where o.status <> 'draft' and (o.submitted_at at time zone v_tz)::date = v_today),
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
    'unacknowledged', (select count(*) from public.orders o where o.status = 'new')
  ) into v_res;
  return v_res;
end $$;

-- ---------------------------------------------------------------------
-- الإشعارات والنشاط والإعدادات
-- ---------------------------------------------------------------------
create function public.mark_notifications_read(p_ids bigint[] default null) returns int
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  perform public._require_role('super_admin', 'factory_admin', 'sales');
  update public.notifications set read_at = now()
   where recipient_id = auth.uid() and read_at is null and (p_ids is null or id = any(p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end $$;

create function public.touch_last_seen() returns void
language sql security definer set search_path = public as $$
  update public.profiles set last_seen_at = now()
   where id = auth.uid() and is_active
     and (last_seen_at is null or last_seen_at < now() - interval '5 minutes')
$$;

create function public.update_settings(p_company_name text, p_timezone text, p_order_prefix text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_role('super_admin');
  if not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'invalid_timezone';
  end if;
  update public.app_settings set company_name = btrim(p_company_name), timezone = p_timezone,
                                  order_prefix = upper(btrim(p_order_prefix));
  perform public._audit('settings_updated', 'settings', null,
    jsonb_build_object('timezone', p_timezone, 'order_prefix', p_order_prefix));
end $$;

-- تعديل بيانات موظف وصلاحياته (المالك فقط، ولا يستطيع تعطيل نفسه أو تغيير دوره)
create function public.admin_update_employee(
  p_user_id uuid, p_full_name text, p_phone text, p_role public.app_role,
  p_is_active boolean, p_permissions text[] default '{}')
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_role('super_admin');
  if p_user_id = auth.uid() and (not p_is_active or p_role <> 'super_admin') then
    raise exception 'cannot_change_self';
  end if;
  update public.profiles set full_name = btrim(p_full_name), phone = nullif(btrim(coalesce(p_phone, '')), ''),
                             role = p_role, is_active = p_is_active
   where id = p_user_id;
  if not found then raise exception 'not_found'; end if;
  delete from public.user_permissions where user_id = p_user_id;
  if p_role = 'sales' then
    insert into public.user_permissions(user_id, permission, granted_by)
    select p_user_id, perm, auth.uid() from unnest(coalesce(p_permissions, '{}')) perm
    where perm in ('view_all_orders', 'edit_submitted_orders');
  end if;
  perform public._audit('employee_updated', 'profile', p_user_id::text,
    jsonb_build_object('role', p_role, 'is_active', p_is_active, 'permissions', p_permissions));
end $$;

-- ---------------------------------------------------------------------
-- تنبيه يومي بالطلبيات المتأخرة (تُشغَّل بجدولة pg_cron، ليست متاحة للمستخدمين)
-- ---------------------------------------------------------------------
create function public.notify_delayed_orders() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_today date := public._local_today();
  v_count int := 0;
  r record;
begin
  for r in
    select o.id, o.order_number, o.expected_delivery_date, o.created_by
    from public.orders o
    where o.status not in ('draft', 'delivered', 'cancelled')
      and o.expected_delivery_date < v_today
      and not exists (select 1 from public.notifications n
                      where n.order_id = o.id and n.type = 'order_delayed'
                        and (n.created_at at time zone public._tz())::date = v_today)
  loop
    insert into public.notifications(recipient_id, type, order_id, title, body)
    select p.id, 'order_delayed', r.id, 'طلبية متأخرة ' || r.order_number,
           'كان موعد التسليم ' || to_char(r.expected_delivery_date, 'DD/MM/YYYY')
    from public.profiles p
    where p.is_active and (p.role in ('super_admin', 'factory_admin') or p.id = r.created_by);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- ---------------------------------------------------------------------
-- من يستطيع تشغيل ماذا
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.app_role_of_current_user() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.has_permission(text) to authenticated;
grant execute on function public.can_access_order(uuid) to authenticated;

grant execute on function public.save_order_draft(jsonb) to authenticated;
grant execute on function public.submit_order(uuid) to authenticated;
grant execute on function public.delete_draft(uuid) to authenticated;
grant execute on function public.change_order_status(uuid, public.order_status, text) to authenticated;
grant execute on function public.factory_list_orders(public.order_status, date, date, text, int, int) to authenticated;
grant execute on function public.factory_get_order(uuid) to authenticated;
grant execute on function public.search_orders(text, public.order_status, date, date, uuid, int, int, boolean) to authenticated;
grant execute on function public.get_order_detail(uuid) to authenticated;
grant execute on function public.record_payment(uuid, numeric, text) to authenticated;
grant execute on function public.admin_dashboard_stats(date, date) to authenticated;
grant execute on function public.mark_notifications_read(bigint[]) to authenticated;
grant execute on function public.touch_last_seen() to authenticated;
grant execute on function public.update_settings(text, text, text) to authenticated;
grant execute on function public.admin_update_employee(uuid, text, text, public.app_role, boolean, text[]) to authenticated;
