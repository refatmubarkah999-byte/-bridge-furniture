-- =====================================================================
-- Bridge Furniture — 4) إعدادات خاصة بمنصة Supabase: التحديث الفوري، تخزين الصور، الجدولة
-- =====================================================================

-- ---------------------------------------------------------------------
-- التحديث الفوري
-- المالك والمبيعات: Postgres Changes على orders وnotifications (تخضع لـ RLS، فالمصنع لا يستقبل شيئاً منها)
-- المصنع: قناة خاصة "factory-orders" لا تحمل إلا رقم الطلبية وحالتها
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.orders, public.notifications;

create function public._broadcast_order_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'draft' then
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
revoke execute on function public._broadcast_order_change() from public, anon, authenticated;

create trigger orders_broadcast_factory
after insert or update on public.orders
for each row execute function public._broadcast_order_change();

-- من يستطيع الاستماع لقناة المصنع: حسابات المصنع والمالك فقط
create policy factory_channel_listen on realtime.messages
for select to authenticated
using (
  realtime.topic() = 'factory-orders'
  and public.app_role_of_current_user() in ('factory_admin', 'super_admin')
);

-- ---------------------------------------------------------------------
-- تخزين صور المنتجات: مخزن خاص (غير عام)، الصور تُعرض بروابط مؤقتة موقّعة
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy product_images_read on storage.objects
for select to authenticated
using (bucket_id = 'product-images' and public.app_role_of_current_user() is not null);

create policy product_images_upload on storage.objects
for insert to authenticated
with check (bucket_id = 'product-images' and public.is_admin());

-- لا سياسة حذف ولا تعديل: الصور لا تُحذف لأن الطلبيات القديمة تشير إليها

-- ---------------------------------------------------------------------
-- تنبيه يومي بالطلبيات المتأخرة الساعة 07:00 بتوقيت UTC (09:00 تقريباً بالتوقيت المحلي)
-- إن لم يكن pg_cron مفعّلاً تُتجاوز هذه الخطوة دون فشل، وتُفعَّل لاحقاً من لوحة Supabase
-- ---------------------------------------------------------------------
do $$
begin
  create extension if not exists pg_cron;
  execute $cron$ select cron.schedule('notify-delayed-orders', '0 7 * * *', 'select public.notify_delayed_orders()') $cron$;
exception when others then
  raise notice 'pg_cron غير متاح: فعّله من Database → Extensions ثم أعد تشغيل هذا الجزء';
end $$;
