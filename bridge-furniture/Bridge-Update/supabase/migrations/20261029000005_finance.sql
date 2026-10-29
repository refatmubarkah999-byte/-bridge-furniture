-- =====================================================================
-- Bridge Furniture — 5) الإدارة المالية
--   • دور جديد: المحاسب (accountant) — يرى المالية والطلبيات المرسلة، لا يدير الموظفين ولا الحالات
--   • تكلفة لكل موديل + نسخة من التكلفة على كل منتج في الطلبية (الأرقام القديمة لا تتغير)
--   • دفعات المبيعات "بانتظار التأكيد" ولا تُحسب حتى يؤكدها المالك أو المحاسب
--   • تقارير: مبيعات، تكلفة، ربح، محصّل، مستحق — حسب الفترة والموديل والموظف والشهر
--
-- ملاحظة تقنية: هذا الملف يعمل كعملية واحدة. القيمة الجديدة 'accountant' لا يجوز استخدامها كقيمة
-- من نوع app_role داخل نفس العملية، لذلك كل المقارنات هنا نصية (role::text) أو داخل دوال plpgsql
-- التي لا تُنفَّذ إلا لاحقاً.
-- =====================================================================

-- إن شُغّل الملف مرة ثانية بالخطأ: يتوقف برسالة واضحة دون أن يغيّر شيئاً
do $$
begin
  if exists (select 1 from pg_type where typname = 'payment_status' and typnamespace = 'public'::regnamespace) then
    raise exception 'تم تشغيل ملف الإدارة المالية من قبل، ولا داعي لتشغيله مرة ثانية. لم يتغير شيء.';
  end if;
end $$;

alter type public.app_role add value if not exists 'accountant';

create type public.payment_status as enum ('pending', 'confirmed', 'rejected');

-- ---------------------------------------------------------------------
-- دوال الصلاحية
-- ---------------------------------------------------------------------
create function public.is_finance() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.app_role_of_current_user()::text in ('super_admin', 'accountant'), false)
$$;

-- المحاسب يرى كل الطلبيات المرسلة (لا المسودات) ليتابع التحصيل
create or replace function public.can_access_order(p_order_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case public.app_role_of_current_user()::text
    when 'super_admin' then true
    when 'accountant' then exists (select 1 from public.orders o where o.id = p_order_id and o.status <> 'draft')
    when 'sales' then exists (
      select 1 from public.orders o
      where o.id = p_order_id
        and (o.created_by = auth.uid()
             or (o.status <> 'draft' and public.has_permission('view_all_orders')))
    )
    else false
  end
$$;

-- ---------------------------------------------------------------------
-- التكاليف (منطقة مالية: المالك والمحاسب فقط)
-- ---------------------------------------------------------------------
create table public.product_costs (
  product_id uuid primary key references public.products(id) on delete cascade,
  cost_price numeric(12,2) not null check (cost_price >= 0 and cost_price <= 1000000),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

-- نسخة من تكلفة الموديل لحظة حفظ الطلبية: تغيير التكلفة لاحقاً لا يغيّر أرباح الطلبيات القديمة
create table public.order_item_costs (
  order_item_id uuid primary key references public.order_items(id) on delete cascade,
  unit_cost     numeric(12,2) not null check (unit_cost >= 0 and unit_cost <= 1000000)
);

alter table public.product_costs    enable row level security;
alter table public.order_item_costs enable row level security;
revoke all on public.product_costs, public.order_item_costs from anon, authenticated;
grant select on public.product_costs, public.order_item_costs to authenticated;

create policy product_costs_select on public.product_costs for select to authenticated
  using ((select public.is_finance()));
create policy order_item_costs_select on public.order_item_costs for select to authenticated
  using ((select public.is_finance()));

create function public._snapshot_item_cost() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.order_item_costs(order_item_id, unit_cost)
  select new.id, pc.cost_price from public.product_costs pc where pc.product_id = new.product_id;
  return new;
end $$;

create trigger order_items_cost_snapshot
after insert on public.order_items
for each row execute function public._snapshot_item_cost();

-- ---------------------------------------------------------------------
-- الدفعات: حالة التأكيد وطريقة الدفع
-- الدفعات القديمة تُعتبر مؤكدة (سجّلها المالك)
-- ---------------------------------------------------------------------
alter table public.order_payments
  add column status      public.payment_status not null default 'confirmed',
  add column method      text not null default 'cash' check (method in ('cash', 'transfer', 'cheque', 'card')),
  add column reviewed_by uuid references public.profiles(id),
  add column reviewed_at timestamptz,
  add column review_note text check (review_note is null or char_length(review_note) <= 300);
create index order_payments_pending_idx on public.order_payments(status) where status = 'pending';

-- من يسجّل الدفعة يحدد حالتها: المالك/المحاسب = مؤكدة فوراً، المبيعات = بانتظار التأكيد
create function public._payment_defaults() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_role text;
begin
  select p.role::text into v_role from public.profiles p where p.id = new.recorded_by;
  if v_role in ('super_admin', 'accountant') then
    new.status := 'confirmed';
    new.reviewed_by := new.recorded_by;
    new.reviewed_at := now();
  else
    new.status := 'pending';
    new.reviewed_by := null;
    new.reviewed_at := null;
  end if;
  return new;
end $$;

create trigger order_payments_defaults
before insert on public.order_payments
for each row execute function public._payment_defaults();

-- المجاميع: "المدفوع" = المؤكد فقط، و"بانتظار التأكيد" عمود منفصل
create or replace view public.order_totals with (security_invoker = true) as
select
  o.id as order_id,
  coalesce(it.subtotal, 0)::numeric(12,2)                                            as subtotal,
  coalesce(f.delivery_fee, 0)::numeric(12,2)                                         as delivery_fee,
  (coalesce(it.subtotal, 0) + coalesce(f.delivery_fee, 0))::numeric(12,2)            as total,
  coalesce(pay.paid, 0)::numeric(12,2)                                               as paid,
  (coalesce(it.subtotal, 0) + coalesce(f.delivery_fee, 0) - coalesce(pay.paid, 0))::numeric(12,2) as remaining,
  coalesce(pay.pending, 0)::numeric(12,2)                                            as pending
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

-- تكلفة كل طلبية (للمالية فقط): النسخة المحفوظة، وإن لم توجد فالتكلفة الحالية للموديل
create view public.order_costs as
select
  o.id as order_id,
  coalesce(sum(oi.quantity * coalesce(oic.unit_cost, pc.cost_price, 0)), 0)::numeric(12,2) as cost,
  count(oi.id) filter (where oic.order_item_id is null and pc.product_id is null)::int     as items_missing_cost
from public.orders o
left join public.order_items oi on oi.order_id = o.id
left join public.order_item_costs oic on oic.order_item_id = oi.id
left join public.product_costs pc on pc.product_id = oi.product_id
group by o.id;
revoke all on public.order_costs from anon, authenticated;

-- ---------------------------------------------------------------------
-- الإشعارات: أنواع جديدة للدفعات
-- ---------------------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'order_new', 'order_acknowledged', 'status_changed', 'order_ready', 'order_delayed', 'order_cancelled',
  'payment_pending', 'payment_confirmed', 'payment_rejected'));

create function public._notify_finance(p_type text, p_order_id uuid, p_title text, p_body text)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications(recipient_id, type, order_id, title, body)
  select p.id, p_type, p_order_id, p_title, p_body
  from public.profiles p
  where p.role::text in ('super_admin', 'accountant') and p.is_active and p.id is distinct from auth.uid()
$$;

create function public._method_label(p_method text) returns text
language sql immutable as $$
  select case p_method when 'cash' then 'نقداً' when 'transfer' then 'تحويل' when 'cheque' then 'شيك' when 'card' then 'بطاقة' else p_method end
$$;

-- ---------------------------------------------------------------------
-- إرسال الطلبية (نفس السابق + العربون بانتظار التأكيد يُحسب في التحقق ويُبلَّغ للمالية)
-- ---------------------------------------------------------------------
create or replace function public.submit_order(p_order_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_role    public.app_role := public._require_role('super_admin', 'sales');
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

  perform public._notify_role('super_admin', 'order_new', p_order_id,
    'طلبية جديدة ' || v_number,
    v_c.full_name || ' — ' || v_c.city || ' — ' || public._format_ils(v_total) || ' — ' || coalesce(v_sales, ''));
  perform public._notify_role('factory_admin', 'order_new', p_order_id,
    'طلبية جديدة ' || v_number,
    v_count || ' منتج — التسليم ' || to_char(v_order.expected_delivery_date, 'DD/MM/YYYY'));

  if v_pending > 0 then
    perform public._notify_finance('payment_pending', p_order_id,
      'عربون بانتظار التأكيد ' || v_number,
      coalesce(v_sales, '') || ' استلم ' || public._format_ils(v_pending) || ' من ' || v_c.full_name);
  end if;

  perform public._audit('order_submitted', 'order', p_order_id::text, jsonb_build_object('order_number', v_number));

  return jsonb_build_object('order_id', p_order_id, 'order_number', v_number, 'already_submitted', false);
end $$;

-- ---------------------------------------------------------------------
-- تسجيل دفعة: المالك والمحاسب (مؤكدة فوراً)، موظف المبيعات على طلبياته فقط (بانتظار التأكيد)
-- ---------------------------------------------------------------------
drop function public.record_payment(uuid, numeric, text);

create function public.record_payment(p_order_id uuid, p_amount numeric, p_note text default null, p_method text default 'cash')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_role    text := public._require_role('super_admin', 'accountant', 'sales')::text;
  v_order   public.orders%rowtype;
  v_total   numeric;
  v_paid    numeric;
  v_pending numeric;
  v_id      uuid;
  v_status  public.payment_status;
  v_sales   text;
  v_customer text;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.status = 'draft' then raise exception 'not_found'; end if;
  if v_role = 'sales' and v_order.created_by <> auth.uid() then raise exception 'not_found'; end if;
  if v_order.status = 'cancelled' then raise exception 'order_closed'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 10000000 or p_amount <> round(p_amount, 2) then
    raise exception 'invalid_amount';
  end if;
  if coalesce(p_method, '') not in ('cash', 'transfer', 'cheque', 'card') then raise exception 'invalid_method'; end if;
  if char_length(coalesce(p_note, '')) > 300 then raise exception 'text_too_long'; end if;

  select t.total, t.paid, t.pending into v_total, v_paid, v_pending from public.order_totals t where t.order_id = p_order_id;
  if p_amount > v_total - v_paid - v_pending then raise exception 'amount_exceeds_remaining'; end if;

  insert into public.order_payments(order_id, amount, kind, note, method, recorded_by)
  values (p_order_id, p_amount, 'payment', nullif(btrim(coalesce(p_note, '')), ''), p_method, auth.uid())
  returning id, status into v_id, v_status;

  if v_status = 'pending' then
    select p.full_name into v_sales from public.profiles p where p.id = auth.uid();
    select c.full_name into v_customer from public.order_private op join public.customers c on c.id = op.customer_id
     where op.order_id = p_order_id;
    perform public._notify_finance('payment_pending', p_order_id,
      'دفعة بانتظار التأكيد ' || v_order.order_number,
      coalesce(v_sales, '') || ' استلم ' || public._format_ils(p_amount) || ' ' || public._method_label(p_method)
        || ' من ' || coalesce(v_customer, ''));
  end if;

  perform public._audit('payment_recorded', 'order', p_order_id::text,
    jsonb_build_object('order_number', v_order.order_number, 'amount', p_amount, 'method', p_method, 'status', v_status));
  return jsonb_build_object('id', v_id, 'status', v_status);
end $$;

-- ---------------------------------------------------------------------
-- تأكيد أو رفض دفعة (المالك والمحاسب)
-- ---------------------------------------------------------------------
create function public.review_payment(p_payment_id uuid, p_approve boolean, p_note text default null)
returns public.payment_status
language plpgsql security definer set search_path = public as $$
declare
  v_pay    public.order_payments%rowtype;
  v_order  public.orders%rowtype;
  v_total  numeric;
  v_paid   numeric;
  v_status public.payment_status;
begin
  perform public._require_role('super_admin', 'accountant');
  if p_approve is null then raise exception 'invalid_payload'; end if;
  if char_length(coalesce(p_note, '')) > 300 then raise exception 'text_too_long'; end if;

  select * into v_pay from public.order_payments where id = p_payment_id for update;
  if not found then raise exception 'not_found'; end if;
  select * into v_order from public.orders where id = v_pay.order_id for update;
  if v_order.status = 'draft' then raise exception 'not_found'; end if;
  if v_pay.status <> 'pending' then raise exception 'already_reviewed'; end if;

  if p_approve then
    select t.total, t.paid into v_total, v_paid from public.order_totals t where t.order_id = v_pay.order_id;
    if v_paid + v_pay.amount > v_total then raise exception 'amount_exceeds_remaining'; end if;
    v_status := 'confirmed';
  else
    v_status := 'rejected';
  end if;

  update public.order_payments
     set status = v_status, reviewed_by = auth.uid(), reviewed_at = now(),
         review_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_payment_id;

  perform public._notify_user(v_pay.recorded_by,
    case when p_approve then 'payment_confirmed' else 'payment_rejected' end, v_pay.order_id,
    case when p_approve then 'تم تأكيد دفعة ' else 'لم تُقبل دفعة ' end || v_order.order_number,
    public._format_ils(v_pay.amount)
      || case when p_approve then ' — تم استلامها' else coalesce(' — ' || nullif(btrim(coalesce(p_note, '')), ''), '') end);

  perform public._audit(case when p_approve then 'payment_confirmed' else 'payment_rejected' end, 'order',
    v_pay.order_id::text, jsonb_build_object('order_number', v_order.order_number, 'amount', v_pay.amount));
  return v_status;
end $$;

-- ---------------------------------------------------------------------
-- تكلفة الموديل
-- ---------------------------------------------------------------------
create function public.set_product_cost(p_product_id uuid, p_cost numeric) returns void
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  perform public._require_role('super_admin', 'accountant');
  if p_cost is null or p_cost < 0 or p_cost > 1000000 or p_cost <> round(p_cost, 2) then raise exception 'invalid_amount'; end if;
  select name into v_name from public.products where id = p_product_id;
  if v_name is null then raise exception 'product_not_found'; end if;
  insert into public.product_costs(product_id, cost_price, updated_by, updated_at)
  values (p_product_id, p_cost, auth.uid(), now())
  on conflict (product_id) do update set cost_price = excluded.cost_price, updated_by = excluded.updated_by, updated_at = now();
  perform public._audit('cost_updated', 'product', p_product_id::text, jsonb_build_object('name', v_name, 'amount', p_cost));
end $$;

create function public.finance_product_costs()
returns table (product_id uuid, name text, standard_price numeric, cost_price numeric, is_active boolean,
               image_path text, updated_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  perform public._require_role('super_admin', 'accountant');
  return query
  select p.id, p.name, p.standard_price, pc.cost_price, p.is_active,
         (select pi.storage_path from public.product_images pi where pi.product_id = p.id and pi.is_primary),
         pc.updated_at
  from public.products p
  left join public.product_costs pc on pc.product_id = p.id
  order by p.is_active desc, p.name;
end $$;

-- ---------------------------------------------------------------------
-- التقرير المالي لفترة (حسب تاريخ إرسال الطلبية؛ المحصّل حسب تاريخ الدفعة)
-- ---------------------------------------------------------------------
create function public.finance_summary(p_from date default null, p_to date default null) returns jsonb
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
    where o.status not in ('draft', 'cancelled')
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
                    where o.status not in ('draft', 'cancelled') and t.remaining > 0),
    'outstanding_orders', (select count(*) from public.orders o join public.order_totals t on t.order_id = o.id
                           where o.status not in ('draft', 'cancelled') and t.remaining > 0),
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

-- ربح كل طلبية
create function public.finance_orders(
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
  where o.status not in ('draft', 'cancelled')
    and (p_from is null or (o.submitted_at at time zone v_tz)::date >= p_from)
    and (p_to is null or (o.submitted_at at time zone v_tz)::date <= p_to)
    and (not coalesce(p_only_due, false) or t.remaining > 0)
    and (v_q is null or o.order_number ilike public._like_pattern(v_q)
         or c.full_name ilike public._like_pattern(v_q) or c.phone ilike public._like_pattern(v_q))
  order by o.submitted_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end $$;

-- الدفعات (بانتظار التأكيد أولاً)
create function public.finance_payments(p_status public.payment_status default null, p_limit int default 100)
returns table (payment_id uuid, order_id uuid, order_number text, customer_name text, amount numeric,
               kind public.payment_kind, method text, note text, status public.payment_status, paid_at timestamptz,
               recorded_by text, reviewed_by text, reviewed_at timestamptz, review_note text, order_remaining numeric)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  perform public._require_role('super_admin', 'accountant');
  return query
  select op.id, o.id, o.order_number, c.full_name, op.amount, op.kind, op.method, op.note, op.status, op.paid_at,
         rb.full_name, vb.full_name, op.reviewed_at, op.review_note, t.remaining
  from public.order_payments op
  join public.orders o on o.id = op.order_id
  join public.order_totals t on t.order_id = o.id
  join public.profiles rb on rb.id = op.recorded_by
  left join public.profiles vb on vb.id = op.reviewed_by
  left join public.order_private opv on opv.order_id = o.id
  left join public.customers c on c.id = opv.customer_id
  where o.status <> 'draft' and (p_status is null or op.status = p_status)
  order by (op.status = 'pending') desc, op.paid_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 300);
end $$;

-- ---------------------------------------------------------------------
-- تحديث دوال موجودة لتشمل المحاسب وحالة الدفعات
-- ---------------------------------------------------------------------
create or replace function public.search_orders(
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
  perform public._require_role('super_admin', 'sales', 'accountant');
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

create or replace function public.get_order_detail(p_order_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_role    text := public._require_role('super_admin', 'sales', 'accountant')::text;
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
                         or (o.created_by = auth.uid() and public.has_permission('edit_submitted_orders')))),
    'can_record_payment', o.status not in ('draft', 'cancelled')
                          and (v_finance or o.created_by = auth.uid()),
    -- التكلفة والربح للمالك والمحاسب فقط
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

create or replace function public.mark_notifications_read(p_ids bigint[] default null) returns int
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  perform public._require_role('super_admin', 'factory_admin', 'sales', 'accountant');
  update public.notifications set read_at = now()
   where recipient_id = auth.uid() and read_at is null and (p_ids is null or id = any(p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ---------------------------------------------------------------------
-- من يستطيع تشغيل ماذا (إعادة ضبط كاملة: الدوال الداخلية لا يشغّلها أحد مباشرة)
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
grant execute on function public.search_orders(text, public.order_status, date, date, uuid, int, int, boolean) to authenticated;
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
