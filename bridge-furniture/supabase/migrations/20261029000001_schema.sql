-- =====================================================================
-- Bridge Furniture — 1) الجداول والقيود والفهارس
-- المنطقة "طلبية" = ما يحتاجه المصنع. المنطقة "سرية" = الزبون والمال والملاحظات.
-- =====================================================================

create extension if not exists pg_trgm;

create type public.app_role as enum ('super_admin', 'factory_admin', 'sales');

create type public.order_status as enum (
  'draft',             -- مسودة (لا يراها المصنع)
  'new',               -- طلبية جديدة
  'received',          -- تم الاستلام
  'preparing',         -- قيد التجهيز
  'ready',             -- جاهزة
  'out_for_delivery',  -- خرجت للتوصيل
  'delivered',         -- تم التسليم
  'cancelled'          -- ملغية
);

create type public.payment_kind as enum ('deposit', 'payment');

-- ---------------------------------------------------------------------
-- إدارة
-- ---------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text not null unique check (username ~ '^[a-z0-9_.-]{3,32}$'),
  full_name    text not null check (char_length(full_name) between 2 and 100),
  phone        text check (phone is null or phone ~ '^\+?[0-9]{9,15}$'),
  role         public.app_role not null,
  is_active    boolean not null default true,
  last_seen_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.user_permissions (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  permission text not null check (permission in ('view_all_orders', 'edit_submitted_orders')),
  granted_by uuid references public.profiles(id),
  granted_at timestamptz not null default now(),
  primary key (user_id, permission)
);

create table public.app_settings (
  id           boolean primary key default true check (id),
  company_name text not null default 'Bridge Furniture',
  timezone     text not null default 'Asia/Hebron',
  order_prefix text not null default 'BR' check (order_prefix ~ '^[A-Z]{1,5}$'),
  currency     text not null default 'ILS',
  updated_at   timestamptz not null default now()
);
insert into public.app_settings default values;

create sequence public.order_number_seq start 1001;

-- ---------------------------------------------------------------------
-- الكتالوج
-- ---------------------------------------------------------------------
create table public.products (
  id             uuid primary key default gen_random_uuid(),
  name           text not null unique check (char_length(name) between 1 and 80),
  standard_price numeric(12,2) not null default 0 check (standard_price >= 0 and standard_price <= 1000000),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.product_colors (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 40),
  is_active  boolean not null default true,
  unique (product_id, name)
);

-- لا تُحذف صورة مرتبطة بمنتج؛ الطلبيات القديمة تحفظ مسارها في order_items
create table public.product_images (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products(id) on delete restrict,
  storage_path text not null unique,
  is_primary   boolean not null default false,
  created_at   timestamptz not null default now()
);
create unique index product_images_one_primary on public.product_images(product_id) where is_primary;

-- ---------------------------------------------------------------------
-- منطقة الطلبية (يقرؤها المصنع عبر البوابة فقط)
-- ---------------------------------------------------------------------
create table public.orders (
  id                     uuid primary key default gen_random_uuid(),
  order_number           text unique,
  status                 public.order_status not null default 'draft',
  expected_delivery_date date,
  created_by             uuid not null references public.profiles(id),
  idempotency_key        uuid not null unique,
  submitted_at           timestamptz,
  submitted_by           uuid references public.profiles(id),
  acknowledged_at        timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint orders_number_only_when_submitted check ((status = 'draft') = (order_number is null)),
  constraint orders_date_required_when_submitted check (status = 'draft' or expected_delivery_date is not null)
);
create index orders_status_delivery_idx on public.orders(status, expected_delivery_date);
create index orders_created_by_idx on public.orders(created_by);
create index orders_submitted_at_idx on public.orders(submitted_at);

create table public.order_items (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders(id) on delete cascade,
  position            smallint not null check (position between 1 and 50),
  product_id          uuid references public.products(id),
  model_name_snapshot text not null,
  color_snapshot      text not null,
  image_path_snapshot text,
  quantity            integer not null check (quantity between 1 and 999),
  unique (order_id, position)
);
create index order_items_order_idx on public.order_items(order_id);
create index order_items_model_trgm on public.order_items using gin (model_name_snapshot gin_trgm_ops);

-- ---------------------------------------------------------------------
-- المنطقة السرية (لا يوجد أي طريق إليها من دور المصنع)
-- ---------------------------------------------------------------------
create table public.customers (
  id         uuid primary key default gen_random_uuid(),
  full_name  text not null default '' check (char_length(full_name) <= 100),
  phone      text not null default '' check (char_length(phone) <= 20),
  phone2     text check (phone2 is null or char_length(phone2) <= 20),
  city       text not null default '' check (char_length(city) <= 60),
  address    text not null default '' check (char_length(address) <= 300),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customers_phone_idx on public.customers(phone);
create index customers_name_trgm on public.customers using gin (full_name gin_trgm_ops);
create index customers_city_idx on public.customers(city);

create table public.order_private (
  order_id       uuid primary key references public.orders(id) on delete cascade,
  customer_id    uuid not null references public.customers(id),
  customer_notes text check (customer_notes is null or char_length(customer_notes) <= 1000),
  internal_notes text check (internal_notes is null or char_length(internal_notes) <= 1000)
);
create index order_private_customer_idx on public.order_private(customer_id);

create table public.order_item_prices (
  order_item_id uuid primary key references public.order_items(id) on delete cascade,
  unit_price    numeric(12,2) not null check (unit_price >= 0 and unit_price <= 1000000),
  item_notes    text check (item_notes is null or char_length(item_notes) <= 500)
);

create table public.order_financials (
  order_id     uuid primary key references public.orders(id) on delete cascade,
  delivery_fee numeric(12,2) not null default 0 check (delivery_fee >= 0 and delivery_fee <= 100000)
);

create table public.order_payments (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  amount      numeric(12,2) not null check (amount > 0 and amount <= 10000000),
  kind        public.payment_kind not null,
  note        text check (note is null or char_length(note) <= 300),
  paid_at     timestamptz not null default now(),
  recorded_by uuid not null references public.profiles(id)
);
create index order_payments_order_idx on public.order_payments(order_id);

-- ---------------------------------------------------------------------
-- السجلات
-- ---------------------------------------------------------------------
create table public.order_status_history (
  id          bigint generated always as identity primary key,
  order_id    uuid not null references public.orders(id) on delete cascade,
  from_status public.order_status,
  to_status   public.order_status not null,
  changed_by  uuid not null references public.profiles(id),
  changed_at  timestamptz not null default now(),
  note        text check (note is null or char_length(note) <= 300)
);
create index order_status_history_order_idx on public.order_status_history(order_id, changed_at);

create table public.notifications (
  id           bigint generated always as identity primary key,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  type         text not null check (type in ('order_new', 'order_acknowledged', 'status_changed', 'order_ready', 'order_delayed', 'order_cancelled')),
  order_id     uuid references public.orders(id) on delete cascade,
  title        text not null,
  body         text not null,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index notifications_recipient_idx on public.notifications(recipient_id, created_at desc);

create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id         bigint generated always as identity primary key,
  actor_id   uuid references public.profiles(id),
  action     text not null,
  entity     text not null,
  entity_id  text,
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs(created_at desc);

-- ---------------------------------------------------------------------
-- تحديث updated_at تلقائياً
-- ---------------------------------------------------------------------
create function public.touch_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger products_touch before update on public.products for each row execute function public.touch_updated_at();
create trigger orders_touch before update on public.orders for each row execute function public.touch_updated_at();
create trigger customers_touch before update on public.customers for each row execute function public.touch_updated_at();
create trigger settings_touch before update on public.app_settings for each row execute function public.touch_updated_at();
