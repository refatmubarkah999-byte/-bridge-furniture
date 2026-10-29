-- =====================================================================
-- Bridge Furniture — 2) الصلاحيات وسياسات RLS
-- القاعدة: كل شيء ممنوع إلا ما سُمح به صراحة.
-- دور المصنع (factory_admin) ليس له أي سياسة على جداول الطلبيات والزبائن والمال.
-- =====================================================================

-- ---------------------------------------------------------------------
-- دوال مساعدة للتحقق من الدور (تُستخدم داخل السياسات)
-- ---------------------------------------------------------------------
create function public.app_role_of_current_user() returns public.app_role
language sql stable security definer set search_path = public as $$
  select p.role from public.profiles p where p.id = auth.uid() and p.is_active
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.app_role_of_current_user() = 'super_admin', false)
$$;

create function public.has_permission(p_permission text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_permissions up
    join public.profiles p on p.id = up.user_id
    where up.user_id = auth.uid() and p.is_active and up.permission = p_permission
  )
$$;

-- هل يحق للمستخدم الحالي رؤية هذه الطلبية بكامل تفاصيلها؟ (المصنع: لا، دائماً)
create function public.can_access_order(p_order_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case public.app_role_of_current_user()
    when 'super_admin' then true
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
-- الصلاحيات على مستوى الجداول
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon;
alter default privileges in schema public revoke execute on functions from public, anon;

-- لا كتابة مباشرة على الطلبيات أو الزبائن أو المال أو السجلات؛ كل الكتابة عبر دوال مراقَبة
revoke insert, update, delete, truncate, references, trigger on
  public.orders, public.order_items, public.customers, public.order_private,
  public.order_item_prices, public.order_financials, public.order_payments,
  public.order_status_history, public.notifications, public.audit_logs,
  public.profiles, public.user_permissions, public.app_settings
from authenticated;
revoke truncate, references, trigger on all tables in schema public from authenticated;

grant select on all tables in schema public to authenticated;
grant insert, update on public.products, public.product_colors, public.product_images to authenticated;
grant delete on public.product_colors, public.product_images to authenticated;
grant select, insert, delete on public.push_subscriptions to authenticated;

grant execute on function public.app_role_of_current_user() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.has_permission(text) to authenticated;
grant execute on function public.can_access_order(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- تفعيل RLS على كل الجداول
-- ---------------------------------------------------------------------
alter table public.profiles             enable row level security;
alter table public.user_permissions     enable row level security;
alter table public.app_settings         enable row level security;
alter table public.products             enable row level security;
alter table public.product_colors       enable row level security;
alter table public.product_images       enable row level security;
alter table public.orders               enable row level security;
alter table public.order_items          enable row level security;
alter table public.customers            enable row level security;
alter table public.order_private        enable row level security;
alter table public.order_item_prices    enable row level security;
alter table public.order_financials     enable row level security;
alter table public.order_payments       enable row level security;
alter table public.order_status_history enable row level security;
alter table public.notifications        enable row level security;
alter table public.push_subscriptions   enable row level security;
alter table public.audit_logs           enable row level security;

-- إدارة
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

create policy user_permissions_select on public.user_permissions for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

create policy app_settings_select on public.app_settings for select to authenticated
  using ((select public.app_role_of_current_user()) is not null);

-- الكتالوج: المالك يدير، المبيعات تقرأ. المصنع لا يقرأ الكتالوج (يرى صور طلبياته عبر البوابة)
create policy products_select on public.products for select to authenticated
  using ((select public.app_role_of_current_user()) in ('super_admin', 'sales'));
create policy products_insert on public.products for insert to authenticated
  with check ((select public.is_admin()));
create policy products_update on public.products for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy product_colors_select on public.product_colors for select to authenticated
  using ((select public.app_role_of_current_user()) in ('super_admin', 'sales'));
create policy product_colors_insert on public.product_colors for insert to authenticated
  with check ((select public.is_admin()));
create policy product_colors_update on public.product_colors for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy product_colors_delete on public.product_colors for delete to authenticated
  using ((select public.is_admin()));

create policy product_images_select on public.product_images for select to authenticated
  using ((select public.app_role_of_current_user()) in ('super_admin', 'sales'));
create policy product_images_insert on public.product_images for insert to authenticated
  with check ((select public.is_admin()));
create policy product_images_update on public.product_images for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy product_images_delete on public.product_images for delete to authenticated
  using ((select public.is_admin()));

-- الطلبيات: المالك كل شيء، المبيعات طلبياتها. المصنع: لا سياسة = صفر صفوف.
create policy orders_select on public.orders for select to authenticated
  using (public.can_access_order(id));
create policy order_items_select on public.order_items for select to authenticated
  using (public.can_access_order(order_id));

-- المنطقة السرية
create policy customers_select on public.customers for select to authenticated
  using (
    (select public.is_admin())
    or exists (select 1 from public.order_private op
               where op.customer_id = customers.id and public.can_access_order(op.order_id))
  );
create policy order_private_select on public.order_private for select to authenticated
  using (public.can_access_order(order_id));
create policy order_item_prices_select on public.order_item_prices for select to authenticated
  using (exists (select 1 from public.order_items oi
                 where oi.id = order_item_prices.order_item_id and public.can_access_order(oi.order_id)));
create policy order_financials_select on public.order_financials for select to authenticated
  using (public.can_access_order(order_id));
create policy order_payments_select on public.order_payments for select to authenticated
  using (public.can_access_order(order_id));
create policy order_status_history_select on public.order_status_history for select to authenticated
  using (public.can_access_order(order_id));

-- إشعارات كل مستخدم له وحده (نص إشعار المصنع يُبنى من الحقول المسموحة فقط)
create policy notifications_select on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()));

create policy push_subscriptions_all on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (select public.app_role_of_current_user()) is not null);

create policy audit_logs_select on public.audit_logs for select to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------
-- عرض المجاميع: يُحسب في القاعدة ويخضع لنفس سياسات RLS (security_invoker)
-- ---------------------------------------------------------------------
create view public.order_totals with (security_invoker = true) as
select
  o.id as order_id,
  coalesce(it.subtotal, 0)::numeric(12,2)                                            as subtotal,
  coalesce(f.delivery_fee, 0)::numeric(12,2)                                         as delivery_fee,
  (coalesce(it.subtotal, 0) + coalesce(f.delivery_fee, 0))::numeric(12,2)            as total,
  coalesce(pay.paid, 0)::numeric(12,2)                                               as paid,
  (coalesce(it.subtotal, 0) + coalesce(f.delivery_fee, 0) - coalesce(pay.paid, 0))::numeric(12,2) as remaining
from public.orders o
left join lateral (
  select sum(oi.quantity * p.unit_price) as subtotal
  from public.order_items oi
  join public.order_item_prices p on p.order_item_id = oi.id
  where oi.order_id = o.id
) it on true
left join public.order_financials f on f.order_id = o.id
left join lateral (
  select sum(op.amount) as paid from public.order_payments op where op.order_id = o.id
) pay on true;

revoke all on public.order_totals from anon;
grant select on public.order_totals to authenticated;
