// =====================================================================
// اختبارات أمان قاعدة البيانات — تعمل على PostgreSQL حقيقي داخل Node (PGlite)
// بدون Docker وبدون إنترنت:  npm run test:db
//
// تثبت أن حساب المصنع لا يستطيع قراءة بيانات الزبون أو المال بأي طريق:
// لا بالاستعلام المباشر على الجداول، ولا عبر الدوال، ولا في الإشعارات، ولا في قناة التحديث الفوري،
// وأنه لا يستطيع تعديل أي شيء غير الحالة.
// =====================================================================
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const db = new PGlite({ extensions: { pg_trgm } });

// ---------------------------------------------------------------------
// محاكاة البيئة التي توفرها Supabase (أدوار، auth.uid، realtime، storage)
// ---------------------------------------------------------------------
await db.exec(`
  create role anon nologin noinherit;
  create role authenticated nologin noinherit;
  create role service_role nologin noinherit bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;

  create schema realtime;
  create table realtime.messages (id bigserial primary key, topic text, event text, payload jsonb, private boolean);
  alter table realtime.messages enable row level security;
  create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic', true) $$;
  create function realtime.send(payload jsonb, event text, topic text, private boolean default true)
    returns void language sql security definer as $$
    insert into realtime.messages(topic, event, payload, private) values (topic, event, payload, private)
  $$;
  grant usage on schema realtime to authenticated;
  grant select on realtime.messages to authenticated;
  grant execute on all functions in schema realtime to authenticated;

  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  grant usage on schema storage to authenticated;
  grant select, insert on storage.objects to authenticated;

  create publication supabase_realtime;
`);

const migrationsDir = join(root, "supabase", "migrations");
for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
  await db.exec(readFileSync(join(migrationsDir, file), "utf8"));
}
await db.exec(readFileSync(join(root, "supabase", "seed.sql"), "utf8"));

// ---------------------------------------------------------------------
// مستخدمون تجريبيون
// ---------------------------------------------------------------------
const users = {
  owner: { id: randomUUID(), role: "super_admin", name: "المالك التجريبي" },
  sales1: { id: randomUUID(), role: "sales", name: "موظف مبيعات أول" },
  sales2: { id: randomUUID(), role: "sales", name: "موظف مبيعات ثاني" },
  factory: { id: randomUUID(), role: "factory_admin", name: "مدير المصنع" },
  accountant: { id: randomUUID(), role: "accountant", name: "المحاسب التجريبي" },
  returns1: { id: randomUUID(), role: "returns", name: "موظف مرتجعات أول" },
  returns2: { id: randomUUID(), role: "returns", name: "موظف مرتجعات ثاني" },
  disabled: { id: randomUUID(), role: "sales", name: "موظف موقوف", inactive: true },
};
for (const [username, u] of Object.entries(users)) {
  await db.query(`insert into auth.users(id, email) values ($1, $2)`, [u.id, `${username}@test.local`]);
  await db.query(
    `insert into public.profiles(id, username, full_name, role, is_active) values ($1, $2, $3, $4, $5)`,
    [u.id, username, u.name, u.role, !u.inactive]
  );
}
const product = async (name) =>
  (await db.query(`select id from public.products where name = $1`, [name])).rows[0].id;
const SILA = await product("Sila");
const NOLA = await product("Nola");
await db.query(`insert into public.product_images(product_id, storage_path, is_primary) values ($1, 'products/sila/main.jpg', true)`, [SILA]);

// ---------------------------------------------------------------------
// أدوات الاختبار
// ---------------------------------------------------------------------
async function as(user) {
  await db.exec("reset role");
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify(user ? { sub: user.id, role: "authenticated" } : {}),
  ]);
  await db.exec(user ? "set role authenticated" : "set role anon");
}
async function asPostgres() {
  await db.exec("reset role");
}
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await rows(sql, params))[0];

let passed = 0;
const failures = [];
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`  ✗ ${name}\n      ${err.message}`);
  } finally {
    await asPostgres();
  }
}
function assert(cond, message) {
  if (!cond) throw new Error(message);
}
async function expectError(fn, pattern) {
  try {
    await fn();
  } catch (err) {
    if (pattern && !String(err.message).match(pattern)) {
      throw new Error(`خطأ غير متوقع: ${err.message}`);
    }
    return;
  }
  throw new Error(`كان يجب أن تفشل العملية (${pattern})`);
}

const today = (await one(`select public._local_today()::text as d`)).d;
const inDays = (n) => {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const CUSTOMER = {
  full_name: "زبون سري جداً",
  phone: "0599111222",
  phone2: "0598333444",
  city: "مدينة-سرية",
  address: "شارع العنوان السري 12",
};
const draftPayload = (key, extra = {}) => ({
  idempotency_key: key,
  expected_delivery_date: inDays(10),
  customer: CUSTOMER,
  customer_notes: "ملاحظة-زبون-سرية",
  internal_notes: "ملاحظة-داخلية-سرية",
  delivery_fee: 150,
  deposit: 2000,
  items: [
    { product_id: SILA, color: "بيج", quantity: 3, unit_price: 4200, notes: "ملاحظة-منتج-سرية" },
    { product_id: NOLA, color: "رمادي", quantity: 2, unit_price: 3600 },
  ],
  ...extra,
});

// ---------------------------------------------------------------------
// الاختبارات
// ---------------------------------------------------------------------
console.log("\nإنشاء وإرسال الطلبيات");

const key1 = randomUUID();
let order1;
let order1Number;

await test("موظف المبيعات يحفظ مسودة ويرسلها، ويحصل على رقم BR-1001", async () => {
  await as(users.sales1);
  order1 = (await one(`select public.save_order_draft($1::jsonb) as id`, [JSON.stringify(draftPayload(key1))])).id;
  const r = (await one(`select public.submit_order($1) as r`, [order1])).r;
  order1Number = r.order_number;
  assert(r.order_number === "BR-1001", `الرقم ${r.order_number}`);
  assert(r.already_submitted === false, "يجب أن يكون إرسالاً أولاً");
});

await test("الضغط المزدوج على الإرسال لا يُنشئ طلبية ثانية ولا سجلاً مكرراً", async () => {
  await as(users.sales1);
  const again = (await one(`select public.save_order_draft($1::jsonb) as id`, [JSON.stringify(draftPayload(key1))])).id;
  assert(again === order1, "يجب أن تعود نفس الطلبية");
  const r = (await one(`select public.submit_order($1) as r`, [order1])).r;
  assert(r.already_submitted === true && r.order_number === order1Number, "يجب أن يعيد نفس الرقم");
  await asPostgres();
  const c = await one(`select count(*)::int as n from public.orders where idempotency_key = $1`, [key1]);
  const h = await one(`select count(*)::int as n from public.order_status_history where order_id = $1`, [order1]);
  assert(c.n === 1 && h.n === 1, `طلبيات ${c.n}، سجلات ${h.n}`);
});

await test("المجموع يُحسب في القاعدة (19950)، وعربون موظف المبيعات (2000) بانتظار التأكيد ولا يُنقص المتبقي", async () => {
  await as(users.sales1);
  const t = await one(`select total::text, remaining::text, pending::text from public.order_totals where order_id = $1`, [order1]);
  assert(t.total === "19950.00" && t.remaining === "19950.00" && t.pending === "2000.00", JSON.stringify(t));
  await as(users.owner);
  const n = await rows(`select title from public.notifications where type = 'payment_pending' and order_id = $1`, [order1]);
  assert(n.length === 1, "إشعار للمالك بعربون بانتظار التأكيد");
});

await test("الطلبية تحفظ نسخة من اسم المنتج وصورته؛ تغيير الكتالوج لاحقاً لا يغيّرها", async () => {
  await as(users.owner);
  await db.query(`update public.products set name = 'Sila Plus' where id = $1`, [SILA]);
  const item = await one(`select model_name_snapshot, image_path_snapshot from public.order_items where order_id = $1 and position = 1`, [order1]);
  assert(item.model_name_snapshot === "Sila" && item.image_path_snapshot === "products/sila/main.jpg", JSON.stringify(item));
  await db.query(`update public.products set name = 'Sila' where id = $1`, [SILA]);
});

console.log("\nإدارة المصنع لا تصل إلى أي بيان سري — قراءة مباشرة للجداول");

const confidentialTables = [
  "customers", "order_private", "order_item_prices", "order_financials", "order_payments",
  "orders", "order_items", "order_totals", "order_status_history", "audit_logs",
  "user_permissions", "products", "product_colors", "product_images",
];
for (const table of confidentialTables) {
  await test(`المصنع يقرأ public.${table} → صفر صفوف`, async () => {
    await as(users.factory);
    const r = await one(`select count(*)::int as n from public.${table}`);
    assert(r.n === 0, `رأى ${r.n} صف`);
  });
}

await test("المصنع يرى ملفه الشخصي فقط، لا أسماء موظفي المبيعات", async () => {
  await as(users.factory);
  const r = await rows(`select id from public.profiles`);
  assert(r.length === 1 && r[0].id === users.factory.id, `رأى ${r.length} ملف`);
});

console.log("\nإدارة المصنع لا تستطيع التعديل بالتلاعب بالطلبات");

const factoryWrites = [
  ["تعديل الكمية مباشرة", `update public.order_items set quantity = 99`],
  ["تعديل تاريخ التسليم مباشرة", `update public.orders set expected_delivery_date = current_date`],
  ["تغيير الحالة مباشرة دون الدالة", `update public.orders set status = 'delivered'`],
  ["حذف طلبية", `delete from public.orders`],
  ["تعديل سعر", `update public.order_item_prices set unit_price = 1`],
  ["إضافة دفعة", `insert into public.order_payments(order_id, amount, kind, recorded_by) select id, 1, 'payment', id from public.orders limit 1`],
  ["تعديل الصلاحيات", `insert into public.user_permissions(user_id, permission) values ('${users.factory.id}', 'view_all_orders')`],
  ["رفع دوره إلى مالك", `update public.profiles set role = 'super_admin' where id = '${users.factory.id}'`],
  ["إضافة منتج", `insert into public.products(name) values ('X')`],
];
for (const [label, sql] of factoryWrites) {
  await test(`المصنع: ${label} → مرفوض`, async () => {
    await as(users.factory);
    await expectError(() => db.exec(sql), /permission denied|row-level security/);
  });
}

const factoryRpcs = [
  ["get_order_detail", `select public.get_order_detail('${"00000000-0000-0000-0000-000000000000"}')`],
  ["search_orders", `select * from public.search_orders()`],
  ["admin_dashboard_stats", `select public.admin_dashboard_stats()`],
  ["save_order_draft", `select public.save_order_draft('{"idempotency_key":"${randomUUID()}"}'::jsonb)`],
  ["record_payment", `select public.record_payment('00000000-0000-0000-0000-000000000000', 10)`],
  ["admin_update_employee", `select public.admin_update_employee('${users.factory.id}', 'x', null, 'super_admin', true)`],
  ["notify_delayed_orders (داخلية)", `select public.notify_delayed_orders()`],
  ["_notify_role (داخلية)", `select public._notify_role('factory_admin', 'order_new', null, 't', 'b')`],
];
for (const [label, sql] of factoryRpcs) {
  await test(`المصنع يستدعي ${label} → مرفوض`, async () => {
    await as(users.factory);
    await expectError(() => db.exec(sql), /forbidden|permission denied/);
  });
}

await test("المصنع لا يستطيع إرسال طلبية أو تعديلها حتى برقمها الصحيح", async () => {
  await as(users.factory);
  await expectError(() => db.query(`select public.submit_order($1)`, [order1]), /forbidden/);
  await expectError(
    () => db.query(`select public.save_order_draft($1::jsonb)`, [JSON.stringify(draftPayload(randomUUID(), { order_id: order1 }))]),
    /forbidden/
  );
  await expectError(() => db.query(`select public.get_order_detail($1)`, [order1]), /forbidden/);
});

console.log("\nبوابة المصنع تُرجع الحقول السبعة فقط");

const SECRET_STRINGS = [
  CUSTOMER.full_name, CUSTOMER.phone, CUSTOMER.phone2, CUSTOMER.city, CUSTOMER.address,
  "ملاحظة-زبون-سرية", "ملاحظة-داخلية-سرية", "ملاحظة-منتج-سرية",
  users.sales1.name, "4200", "3600", "19950", "17950", "2000", "150", "₪",
];
function assertNoSecrets(obj, where) {
  const text = JSON.stringify(obj);
  for (const s of SECRET_STRINGS) assert(!text.includes(s), `${where} يحتوي "${s}"`);
}

await test("factory_list_orders: الأعمدة والحقول المسموحة فقط ولا أي قيمة سرية", async () => {
  await as(users.factory);
  const list = await rows(`select * from public.factory_list_orders()`);
  assert(list.length === 1, `عدد الطلبيات ${list.length}`);
  const cols = Object.keys(list[0]).sort().join(",");
  assert(cols === "expected_delivery_date,is_delayed,items,order_id,order_number,status", `أعمدة: ${cols}`);
  for (const item of list[0].items) {
    const keys = Object.keys(item).sort().join(",");
    assert(keys === "color,image_path,model,position,quantity", `حقول المنتج: ${keys}`);
  }
  assert(list[0].items[0].model === "Sila" && list[0].items[0].quantity === 3, "بيانات المنتج");
  assertNoSecrets(list, "نتيجة البوابة");
});

await test("factory_list_orders: البحث برقم الطلبية والموديل والفلترة بالحالة والتاريخ", async () => {
  await as(users.factory);
  assert((await rows(`select 1 from public.factory_list_orders(p_query => 'BR-1001')`)).length === 1, "بالرقم");
  assert((await rows(`select 1 from public.factory_list_orders(p_query => 'nola')`)).length === 1, "بالموديل");
  assert((await rows(`select 1 from public.factory_list_orders(p_query => '${CUSTOMER.full_name}')`)).length === 0, "البحث باسم الزبون يجب ألا يجد شيئاً");
  assert((await rows(`select 1 from public.factory_list_orders(p_query => '0599111222')`)).length === 0, "البحث بالهاتف يجب ألا يجد شيئاً");
  assert((await rows(`select 1 from public.factory_list_orders(p_status => 'ready')`)).length === 0, "بالحالة");
  assert((await rows(`select 1 from public.factory_list_orders(p_from => '${inDays(11)}')`)).length === 0, "بالتاريخ");
});

await test("factory_get_order لا تُرجع إلا الحقول المسموحة", async () => {
  await as(users.factory);
  const r = await rows(`select * from public.factory_get_order($1)`, [order1]);
  assert(r.length === 1, "يجب أن تجد الطلبية");
  assertNoSecrets(r, "factory_get_order");
});

await test("إشعارات المصنع لا تحتوي اسم زبون أو هاتف أو مبلغ أو اسم موظف", async () => {
  await as(users.factory);
  const n = await rows(`select title, body from public.notifications`);
  assert(n.length >= 1, "يجب أن يصل إشعار الطلبية الجديدة");
  assertNoSecrets(n, "إشعارات المصنع");
});

await test("إشعار المالك يحتوي التفاصيل الكاملة", async () => {
  await as(users.owner);
  const n = await one(`select body from public.notifications where type = 'order_new'`);
  assert(n.body.includes(CUSTOMER.full_name) && n.body.includes("₪"), n.body);
});

await test("قناة التحديث الفوري للمصنع تحمل الرقم والحالة فقط", async () => {
  await as(users.factory);
  await db.query(`select set_config('realtime.topic', 'factory-orders', false)`);
  const msgs = await rows(`select payload from realtime.messages`);
  assert(msgs.length >= 1, "يجب أن تصل رسالة");
  for (const m of msgs) {
    assert(Object.keys(m.payload).sort().join(",") === "order_id,order_number,status", JSON.stringify(m.payload));
  }
  assertNoSecrets(msgs, "رسائل القناة");
});

await test("موظف المبيعات لا يستطيع الاستماع لقناة المصنع", async () => {
  await as(users.sales1);
  await db.query(`select set_config('realtime.topic', 'factory-orders', false)`);
  const msgs = await rows(`select payload from realtime.messages`);
  assert(msgs.length === 0, `رأى ${msgs.length} رسالة`);
});

console.log("\nانتقالات الحالة");

await test("المصنع لا يقفز خطوات: جديدة → جاهزة مرفوض", async () => {
  await as(users.factory);
  await expectError(() => db.query(`select public.change_order_status($1, 'ready')`, [order1]), /transition_not_allowed/);
});

await test("المصنع يؤكد الاستلام: جديدة → تم الاستلام، ويُسجَّل وقت الاستلام", async () => {
  await as(users.factory);
  await db.query(`select public.change_order_status($1, 'received')`, [order1]);
  await asPostgres();
  const o = await one(`select status, acknowledged_at from public.orders where id = $1`, [order1]);
  const h = await one(`select from_status, to_status, changed_by from public.order_status_history where order_id = $1 order by id desc limit 1`, [order1]);
  assert(o.status === "received" && o.acknowledged_at, "الحالة أو وقت الاستلام");
  assert(h.from_status === "new" && h.to_status === "received" && h.changed_by === users.factory.id, JSON.stringify(h));
});

await test("المصنع لا يستطيع الإلغاء ولا الرجوع للخلف", async () => {
  await as(users.factory);
  await expectError(() => db.query(`select public.change_order_status($1, 'cancelled')`, [order1]), /transition_not_allowed/);
  await expectError(() => db.query(`select public.change_order_status($1, 'new')`, [order1]), /transition_not_allowed/);
});

await test("موظف المبيعات لا يستطيع تغيير الحالة", async () => {
  await as(users.sales1);
  await expectError(() => db.query(`select public.change_order_status($1, 'preparing')`, [order1]), /forbidden/);
});

await test("المالك يرجع الحالة خطوة لتصحيح خطأ، ثم يتقدم", async () => {
  await as(users.owner);
  await db.query(`select public.change_order_status($1, 'new')`, [order1]);
  await db.query(`select public.change_order_status($1, 'received')`, [order1]);
});

await test("موظف المبيعات صاحب الطلبية يصله إشعار بتغيير الحالة", async () => {
  await as(users.sales1);
  const n = await rows(`select type from public.notifications where order_id = $1`, [order1]);
  assert(n.some((x) => x.type === "order_acknowledged"), JSON.stringify(n));
});

console.log("\nعزل موظفي المبيعات");

await test("موظف مبيعات آخر لا يرى الطلبية ولا زبونها ولا مبالغها", async () => {
  await as(users.sales2);
  for (const t of ["orders", "order_items", "customers", "order_private", "order_item_prices", "order_financials", "order_payments", "order_totals"]) {
    const r = await one(`select count(*)::int as n from public.${t}`);
    assert(r.n === 0, `${t}: ${r.n}`);
  }
  assert((await rows(`select * from public.search_orders()`)).length === 0, "البحث");
  await expectError(() => db.query(`select public.get_order_detail($1)`, [order1]), /not_found/);
});

await test("مع صلاحية 'رؤية كل الطلبيات' يرى الطلبيات المرسلة فقط، لا مسودات غيره", async () => {
  await as(users.sales1);
  const draft = (await one(`select public.save_order_draft($1::jsonb) as id`, [JSON.stringify(draftPayload(randomUUID()))])).id;
  await as(users.owner);
  await db.query(`select public.admin_update_employee($1, $2, null, 'sales', true, array['view_all_orders'])`, [users.sales2.id, users.sales2.name]);
  await as(users.sales2);
  const visible = (await rows(`select id from public.orders`)).map((r) => r.id);
  assert(visible.includes(order1) && !visible.includes(draft), JSON.stringify(visible));
  await as(users.owner);
  await db.query(`select public.admin_update_employee($1, $2, null, 'sales', true, '{}')`, [users.sales2.id, users.sales2.name]);
  await as(users.sales1);
  await db.query(`select public.delete_draft($1)`, [draft]);
});

await test("موظف المبيعات لا يعدّل طلبية مُرسلة دون صلاحية إضافية", async () => {
  await as(users.sales1);
  await expectError(
    () => db.query(`select public.save_order_draft($1::jsonb)`, [JSON.stringify(draftPayload(randomUUID(), { order_id: order1 }))]),
    /order_locked/
  );
});

await test("موظف المبيعات لا يعدّل الكتالوج", async () => {
  await as(users.sales1);
  await expectError(() => db.exec(`insert into public.products(name) values ('Hack')`), /row-level security|permission denied/);
  const r = await db.query(`update public.products set standard_price = 1`);
  assert(r.affectedRows === 0, "يجب ألا يتغير أي صف");
});

console.log("\nالتحقق من المدخلات");

await test("كمية صفر، سعر سالب، لون غير موجود → مرفوضة", async () => {
  await as(users.sales1);
  const bad = (items) => JSON.stringify(draftPayload(randomUUID(), { items }));
  await expectError(() => db.query(`select public.save_order_draft($1::jsonb)`, [bad([{ product_id: SILA, color: "بيج", quantity: 0 }])]), /invalid_quantity/);
  await expectError(() => db.query(`select public.save_order_draft($1::jsonb)`, [bad([{ product_id: SILA, color: "بيج", quantity: 1, unit_price: -5 }])]), /invalid_price/);
  await expectError(() => db.query(`select public.save_order_draft($1::jsonb)`, [bad([{ product_id: SILA, color: "بنفسجي", quantity: 1 }])]), /invalid_color/);
});

await test("الإرسال يرفض: هاتف غير صالح، تاريخ تسليم ماضٍ، عربون أكبر من المجموع، طلبية بلا منتجات", async () => {
  await as(users.sales1);
  const submitWith = async (extra) => {
    const id = (await one(`select public.save_order_draft($1::jsonb) as id`, [JSON.stringify(draftPayload(randomUUID(), extra))])).id;
    try {
      await db.query(`select public.submit_order($1)`, [id]);
    } finally {
      await db.query(`select public.delete_draft($1)`, [id]).catch(() => {});
    }
  };
  await expectError(() => submitWith({ customer: { ...CUSTOMER, phone: "12" } }), /invalid_phone/);
  await expectError(() => submitWith({ expected_delivery_date: inDays(-1) }), /delivery_date_in_past/);
  await expectError(() => submitWith({ deposit: 999999 }), /deposit_exceeds_total/);
  await expectError(() => submitWith({ items: [], deposit: 0 }), /items_required/);
});

console.log("\nالحسابات الموقوفة والزوار");

await test("الحساب الموقوف لا يستطيع فعل أي شيء", async () => {
  await as(users.disabled);
  await expectError(() => db.query(`select public.save_order_draft($1::jsonb)`, [JSON.stringify(draftPayload(randomUUID()))]), /forbidden/);
  assert((await one(`select count(*)::int as n from public.products`)).n === 0, "الكتالوج");
  assert((await one(`select count(*)::int as n from public.orders`)).n === 0, "الطلبيات");
});

await test("زائر غير مسجّل (anon) لا يقرأ أي جدول ولا يشغّل أي دالة", async () => {
  await as(null);
  await expectError(() => db.exec(`select * from public.orders`), /permission denied/);
  await expectError(() => db.exec(`select * from public.customers`), /permission denied/);
  await expectError(() => db.exec(`select * from public.factory_list_orders()`), /permission denied/);
});

console.log("\nالمالك");

await test("المالك يؤكد العربون فيصبح المتبقي 17950، ويصل الموظف إشعار", async () => {
  await as(users.owner);
  const pay = await one(`select payment_id from public.finance_payments('pending')`);
  assert(pay, "دفعة بانتظار التأكيد");
  const st = (await one(`select public.review_payment($1, true) as s`, [pay.payment_id])).s;
  assert(st === "confirmed", st);
  const t = await one(`select remaining::text, pending::text from public.order_totals where order_id = $1`, [order1]);
  assert(t.remaining === "17950.00" && t.pending === "0.00", JSON.stringify(t));
  await as(users.sales1);
  assert((await rows(`select 1 from public.notifications where type = 'payment_confirmed'`)).length === 1, "إشعار التأكيد");
});

await test("المالك يرى كل التفاصيل ولوحة الأرقام", async () => {
  await as(users.owner);
  const d = (await one(`select public.get_order_detail($1) as d`, [order1])).d;
  assert(d.customer.full_name === CUSTOMER.full_name && Number(d.totals.total) === 19950, "التفاصيل");
  assert(d.history.length >= 2, "سجل الحالات");
  const s = (await one(`select public.admin_dashboard_stats() as s`)).s;
  assert(s.total_orders === 1 && Number(s.outstanding) === 17950, JSON.stringify(s));
});

await test("المالك يسجّل دفعة فيتغير المتبقي، ويُسجَّل في سجل التدقيق", async () => {
  await as(users.owner);
  await db.query(`select public.record_payment($1, 5000, 'دفعة ثانية')`, [order1]);
  const t = await one(`select remaining::text from public.order_totals where order_id = $1`, [order1]);
  assert(t.remaining === "12950.00", t.remaining);
  const a = await one(`select count(*)::int as n from public.audit_logs where action = 'payment_recorded'`);
  assert(a.n === 1, "سجل التدقيق");
});

await test("المالك لا يستطيع تعطيل حسابه بالخطأ", async () => {
  await as(users.owner);
  await expectError(() => db.query(`select public.admin_update_employee($1, 'x', null, 'super_admin', false)`, [users.owner.id]), /cannot_change_self/);
});

console.log("\nالإدارة المالية");

await test("إدارة المصنع لا تصل إلى التكاليف ولا الأرباح ولا الدفعات بأي طريق", async () => {
  await as(users.factory);
  for (const t of ["product_costs", "order_item_costs"]) {
    assert((await one(`select count(*)::int as n from public.${t}`)).n === 0, t);
  }
  await expectError(() => db.exec(`select * from public.order_costs`), /permission denied/);
  await expectError(() => db.exec(`select public.finance_summary()`), /forbidden/);
  await expectError(() => db.exec(`select * from public.finance_payments()`), /forbidden/);
  await expectError(() => db.exec(`select * from public.finance_orders()`), /forbidden/);
  await expectError(() => db.exec(`select * from public.finance_product_costs()`), /forbidden/);
  await expectError(() => db.query(`select public.set_product_cost($1, 1)`, [SILA]), /forbidden/);
  await expectError(() => db.query(`select public.record_payment($1, 10)`, [order1]), /forbidden/);
  assert((await rows(`select 1 from public.notifications where type like 'payment_%'`)).length === 0, "إشعارات الدفعات");
});

await test("موظف المبيعات لا يرى التكلفة ولا الربح، ولا يؤكد الدفعات", async () => {
  await as(users.owner);
  await db.query(`select public.set_product_cost($1, 2500)`, [SILA]);
  await as(users.sales1);
  assert((await one(`select count(*)::int as n from public.product_costs`)).n === 0, "تكاليف الموديلات");
  assert((await one(`select count(*)::int as n from public.order_item_costs`)).n === 0, "تكاليف الطلبية");
  await expectError(() => db.exec(`select * from public.order_costs`), /permission denied/);
  const d = (await one(`select public.get_order_detail($1) as d`, [order1])).d;
  assert(d.finance === null && !JSON.stringify(d).includes("2500"), "تفاصيل الطلبية فيها بيانات مالية");
  await expectError(() => db.exec(`select public.finance_summary()`), /forbidden/);
  await expectError(() => db.query(`select public.set_product_cost($1, 1)`, [SILA]), /forbidden/);
  const anyPay = await one(`select id from public.order_payments limit 1`);
  await expectError(() => db.query(`select public.review_payment($1, true)`, [anyPay.id]), /forbidden/);
});

await test("موظف مبيعات لا يسجّل دفعة على طلبية غيره", async () => {
  await as(users.sales2);
  await expectError(() => db.query(`select public.record_payment($1, 100)`, [order1]), /not_found/);
});

await test("دفعة من موظف المبيعات تبقى بانتظار التأكيد، والمالية يصلها إشعار", async () => {
  await as(users.sales1);
  const r = (await one(`select public.record_payment($1, 1000, 'نقداً', 'cash') as r`, [order1])).r;
  assert(r.status === "pending", JSON.stringify(r));
  const t = await one(`select remaining::text, pending::text from public.order_totals where order_id = $1`, [order1]);
  assert(t.remaining === "12950.00" && t.pending === "1000.00", JSON.stringify(t));
  await expectError(() => db.query(`select public.record_payment($1, 999999)`, [order1]), /amount_exceeds_remaining/);
  await as(users.accountant);
  assert((await rows(`select 1 from public.notifications where type = 'payment_pending'`)).length >= 1, "إشعار المحاسب");
});

await test("المحاسب: يرى الطلبيات المرسلة فقط، ولا يغيّر الحالة ولا الموظفين ولا الطلبيات", async () => {
  await as(users.sales1);
  const draft = (await one(`select public.save_order_draft($1::jsonb) as id`, [JSON.stringify(draftPayload(randomUUID()))])).id;
  await as(users.accountant);
  const visible = (await rows(`select id from public.orders`)).map((r) => r.id);
  assert(visible.includes(order1) && !visible.includes(draft), JSON.stringify(visible));
  assert((await rows(`select * from public.search_orders()`)).length === 1, "البحث");
  assert((await one(`select count(*)::int as n from public.audit_logs`)).n === 0, "سجل التدقيق");
  await expectError(() => db.query(`select public.change_order_status($1, 'preparing')`, [order1]), /forbidden/);
  await expectError(() => db.query(`select public.admin_update_employee($1, 'x', null, 'super_admin', true)`, [users.accountant.id]), /forbidden/);
  await expectError(() => db.query(`select public.save_order_draft($1::jsonb)`, [JSON.stringify(draftPayload(randomUUID()))]), /forbidden/);
  await expectError(() => db.query(`select * from public.factory_list_orders()`), /forbidden/);
  await as(users.sales1);
  await db.query(`select public.delete_draft($1)`, [draft]);
});

await test("المحاسب يؤكد دفعة ويرفض أخرى؛ المرفوضة لا تُحسب ولا تُؤكَّد مرتين", async () => {
  await as(users.accountant);
  const p1 = (await one(`select payment_id from public.finance_payments('pending')`)).payment_id;
  await db.query(`select public.review_payment($1, true)`, [p1]);
  await expectError(() => db.query(`select public.review_payment($1, false)`, [p1]), /already_reviewed/);
  await as(users.sales1);
  await db.query(`select public.record_payment($1, 500, null, 'transfer')`, [order1]);
  await as(users.accountant);
  const p2 = (await one(`select payment_id from public.finance_payments('pending')`)).payment_id;
  await db.query(`select public.review_payment($1, false, 'لم يصل التحويل')`, [p2]);
  const t = await one(`select remaining::text, pending::text from public.order_totals where order_id = $1`, [order1]);
  assert(t.remaining === "11950.00" && t.pending === "0.00", JSON.stringify(t));
  await as(users.sales1);
  const n = await rows(`select type, body from public.notifications where type in ('payment_confirmed', 'payment_rejected')`);
  assert(n.filter((x) => x.type === "payment_rejected").length === 1 && n.some((x) => x.body.includes("لم يصل التحويل")), JSON.stringify(n));
});

await test("التكلفة تُحفظ مع الطلبية: تغيير تكلفة الموديل لاحقاً لا يغيّر ربح الطلبيات المحفوظة", async () => {
  await as(users.sales1);
  const o2 = (await one(`select public.save_order_draft($1::jsonb) as id`, [JSON.stringify(draftPayload(randomUUID(), { deposit: 0 }))])).id;
  await db.query(`select public.submit_order($1)`, [o2]);
  await as(users.accountant);
  await db.query(`select public.set_product_cost($1, 3000)`, [SILA]);
  const d2 = (await one(`select public.get_order_detail($1) as d`, [o2])).d;
  assert(Number(d2.finance.cost) === 7500 && d2.finance.items_missing_cost === 1, JSON.stringify(d2.finance));
  // الطلبية الأولى سُجّلت قبل إدخال أي تكلفة، فتُحسب بالتكلفة الحالية
  const d1 = (await one(`select public.get_order_detail($1) as d`, [order1])).d;
  assert(Number(d1.finance.cost) === 9000, JSON.stringify(d1.finance));
  const s = (await one(`select public.finance_summary() as s`)).s;
  assert(s.orders === 2 && Number(s.sales) === 39900 && Number(s.cost) === 16500 && Number(s.profit) === 23400, JSON.stringify(s));
  assert(Number(s.collected) === 8000 && Number(s.collected_by_method.cash) === 8000, `المحصّل ${s.collected}`);
  const sila = s.by_model.find((m) => m.model === "Sila");
  assert(sila && sila.qty === 6 && Number(sila.cost) === 16500, JSON.stringify(s.by_model));
  await as(users.factory);
  const f = await rows(`select * from public.factory_get_order($1)`, [o2]);
  assert(!JSON.stringify(f).includes("7500") && !JSON.stringify(f).includes("3000"), "بوابة المصنع");
});

await test("المالك يلغي الطلبية، ويصل المصنع إشعار إلغاء بلا بيانات سرية", async () => {
  await as(users.owner);
  await db.query(`select public.change_order_status($1, 'cancelled', 'طلب الزبون')`, [order1]);
  await as(users.factory);
  const n = await rows(`select title, body from public.notifications where type = 'order_cancelled'`);
  assert(n.length === 1, "إشعار الإلغاء");
  assertNoSecrets(n, "إشعار الإلغاء");
});

console.log("\nالمرتجعات وموظف المرتجعات");

const RETURN_CUSTOMER = { full_name: "زبون مرتجع", phone: "0597000111", phone2: "", city: "نابلس", address: "شارع المرتجعات 5" };
const returnPayload = (key, extra = {}) => ({
  idempotency_key: key,
  expected_delivery_date: inDays(5),
  customer: RETURN_CUSTOMER,
  customer_notes: "سبب الإرجاع: عيب في القماش",
  internal_notes: "",
  delivery_fee: 0,
  deposit: 500,
  items: [{ product_id: SILA, color: "بيج", quantity: 2, unit_price: 3900 }],
  ...extra,
});
let return1;
let return1Number;
const dashBefore = await (async () => {
  await as(users.owner);
  const s = (await one(`select public.admin_dashboard_stats() as s`)).s;
  await asPostgres();
  return s;
})();

await test("موظف المرتجعات يقرأ الكتالوج، ويحفظ مرتجعاً ويرسله بكل التفاصيل والأسعار", async () => {
  await as(users.returns1);
  assert((await one(`select count(*)::int as n from public.products`)).n > 0, "الكتالوج");
  return1 = (await one(`select public.save_order_draft($1::jsonb) as id`, [JSON.stringify(returnPayload(randomUUID()))])).id;
  const r = (await one(`select public.submit_order($1) as r`, [return1])).r;
  return1Number = r.order_number;
  const d = (await one(`select public.get_order_detail($1) as d`, [return1])).d;
  assert(d.kind === "return" && Number(d.totals.total) === 7800 && d.items[0].quantity === 2, JSON.stringify(d.totals));
  assert(Number(d.deposit) === 0 && d.payments.length === 0, "لا عربون على المرتجع");
  assert(d.can_edit === false && d.can_record_payment === false && d.finance === null, "صلاحيات بعد الإرسال");
  const mine = await rows(`select order_id, kind from public.search_orders()`);
  assert(mine.length === 1 && mine[0].kind === "return", JSON.stringify(mine));
});

await test("موظف المرتجعات لا يرى الطلبيات العادية ولا زبائنها ولا مبالغها", async () => {
  await as(users.returns1);
  const visible = (await rows(`select id from public.orders`)).map((r) => r.id);
  assert(visible.length === 1 && visible[0] === return1, JSON.stringify(visible));
  assert(!(await rows(`select full_name from public.customers`)).some((c) => c.full_name === CUSTOMER.full_name), "زبون الطلبية العادية");
  await expectError(() => db.query(`select public.get_order_detail($1)`, [order1]), /not_found/);
  await expectError(() => db.query(`select public.save_order_draft($1::jsonb)`, [JSON.stringify(draftPayload(randomUUID(), { order_id: order1 }))]), /not_found/);
  await expectError(() => db.query(`select public.submit_order($1)`, [order1]), /not_found/);
});

await test("موظف المرتجعات لا يرى مرتجعات زميله", async () => {
  await as(users.returns2);
  assert((await one(`select count(*)::int as n from public.orders`)).n === 0, "الطلبيات");
  assert((await rows(`select * from public.search_orders()`)).length === 0, "البحث");
  await expectError(() => db.query(`select public.get_order_detail($1)`, [return1]), /not_found/);
});

await test("موظف المرتجعات لا يحذف ولا يعدّل بعد الإرسال ولا يغيّر الحالة ولا يصل للإدارة أو المالية", async () => {
  await as(users.returns1);
  const draft = (await one(`select public.save_order_draft($1::jsonb) as id`, [JSON.stringify(returnPayload(randomUUID()))])).id;
  await expectError(() => db.query(`select public.delete_draft($1)`, [draft]), /forbidden/);
  await expectError(() => db.query(`select public.delete_draft($1)`, [return1]), /forbidden/);
  await expectError(
    () => db.query(`select public.save_order_draft($1::jsonb)`, [JSON.stringify(returnPayload(randomUUID(), { order_id: return1, items: [{ product_id: SILA, color: "بيج", quantity: 2, unit_price: 1 }] }))]),
    /order_locked/
  );
  const price = await one(`select ip.unit_price::text as p from public.order_items i join public.order_item_prices ip on ip.order_item_id = i.id where i.order_id = $1`, [return1]);
  assert(price.p === "3900.00", "السعر تغيّر");
  await expectError(() => db.exec(`update public.order_item_prices set unit_price = 1`), /permission denied/);
  await expectError(() => db.exec(`delete from public.orders`), /permission denied/);
  await expectError(() => db.query(`select public.change_order_status($1, 'received')`, [return1]), /forbidden/);
  await expectError(() => db.query(`select public.record_payment($1, 10)`, [return1]), /forbidden/);
  await expectError(() => db.exec(`select public.admin_dashboard_stats()`), /forbidden/);
  await expectError(() => db.exec(`select public.finance_summary()`), /forbidden/);
  await expectError(() => db.exec(`select public.update_settings('x', 'Asia/Hebron', 'BR')`), /forbidden/);
  await expectError(() => db.query(`select public.admin_update_employee($1, 'x', null, 'super_admin', true)`, [users.returns1.id]), /forbidden/);
  await expectError(() => db.exec(`select * from public.factory_list_orders()`), /forbidden/);
  assert((await one(`select count(*)::int as n from public.audit_logs`)).n === 0, "سجل التدقيق");
  assert((await one(`select count(*)::int as n from public.profiles`)).n === 1, "ملفات الموظفين");
  await asPostgres();
  await db.query(`delete from public.orders where id = $1`, [draft]);
});

await test("المالك يرى كل المرتجعات بأسعارها، ولا تدخل في أرقام المبيعات", async () => {
  await as(users.owner);
  const list = await rows(`select order_id, total::text from public.search_orders(p_kind => 'return')`);
  assert(list.length === 1 && list[0].order_id === return1 && list[0].total === "7800.00", JSON.stringify(list));
  const d = (await one(`select public.get_order_detail($1) as d`, [return1])).d;
  assert(d.kind === "return" && Number(d.items[0].unit_price) === 3900 && d.customer.full_name === RETURN_CUSTOMER.full_name, "التفاصيل");
  const s = (await one(`select public.admin_dashboard_stats() as s`)).s;
  assert(Number(s.total_sales) === Number(dashBefore.total_sales) && s.total_orders === dashBefore.total_orders, "المبيعات تغيّرت");
  assert(s.returns.count === 1 && Number(s.returns.total) === 7800, JSON.stringify(s.returns));
  const n = await rows(`select title from public.notifications where order_id = $1`, [return1]);
  assert(n.some((x) => x.title.startsWith("مرتجع جديد")), "إشعار المالك");
  await db.query(`select public.change_order_status($1, 'received')`, [return1]);
  await as(users.returns1);
  assert((await rows(`select 1 from public.notifications where order_id = $1`, [return1])).length === 1, "إشعار الموظف بالحالة");
});

await test("المصنع والمبيعات لا يرون المرتجعات بأي طريق (بوابة، قناة فورية، إشعارات)", async () => {
  await as(users.factory);
  assert(!(await rows(`select order_id from public.factory_list_orders()`)).some((r) => r.order_id === return1), "قائمة المصنع");
  assert((await rows(`select * from public.factory_get_order($1)`, [return1])).length === 0, "تفاصيل المصنع");
  await expectError(() => db.query(`select public.change_order_status($1, 'preparing')`, [return1]), /not_found/);
  assert((await rows(`select 1 from public.notifications where order_id = $1`, [return1])).length === 0, "إشعارات المصنع");
  await asPostgres();
  const rt = await rows(`select payload from realtime.messages where payload->>'order_id' = $1`, [return1]);
  assert(rt.length === 0, "القناة الفورية");
  await as(users.owner);
  await db.query(`select public.admin_update_employee($1, $2, null, 'sales', true, array['view_all_orders'])`, [users.sales2.id, users.sales2.name]);
  await as(users.sales2);
  assert(!(await rows(`select id from public.orders`)).some((r) => r.id === return1), "المبيعات مع رؤية الكل");
  await expectError(() => db.query(`select public.get_order_detail($1)`, [return1]), /not_found/);
  await as(users.owner);
  await db.query(`select public.admin_update_employee($1, $2, null, 'sales', true, '{}')`, [users.sales2.id, users.sales2.name]);
});

await test("طلبيات المبيعات الجديدة تبقى عادية وتصل المصنع كما كانت", async () => {
  await as(users.sales1);
  const id = (await one(`select public.save_order_draft($1::jsonb) as id`, [JSON.stringify(draftPayload(randomUUID(), { deposit: 0 }))])).id;
  await db.query(`select public.submit_order($1)`, [id]);
  await as(users.factory);
  assert((await rows(`select * from public.factory_get_order($1)`, [id])).length === 1, "المصنع يرى الطلبية العادية");
  await asPostgres();
  assert((await one(`select kind::text from public.orders where id = $1`, [id])).kind === "regular", "النوع");
});

console.log(`\n${passed} نجح، ${failures.length} فشل`);
if (failures.length) {
  process.exitCode = 1;
}
await db.close();
