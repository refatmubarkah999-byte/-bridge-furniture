-- =====================================================================
-- Bridge Furniture — 12) المصاريف: إعلانات، رواتب موظفين، تسويق، أخرى
--   * يسجّلها المالك أو المحاسب فقط، وتُطرح من الربح → صافي الربح.
--   * لا يصل أحد للجدول مباشرة؛ فقط عبر الدوال (والقاعدة تتحقق من الدور).
--   آمن للتشغيل أكثر من مرة.
-- =====================================================================

do $$
begin
  if to_regprocedure('public.is_finance()') is null then
    raise exception 'شغّل ملف المالية أولاً، ثم هذا الملف.';
  end if;
end $$;

create table if not exists public.expenses (
  id         uuid primary key default gen_random_uuid(),
  spent_on   date not null,
  category   text not null check (category in ('ads', 'salaries', 'marketing', 'other')),
  amount     numeric(12,2) not null check (amount > 0 and amount <= 10000000),
  note       text check (note is null or char_length(note) <= 300),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists expenses_spent_on_idx on public.expenses(spent_on desc);

alter table public.expenses enable row level security;
revoke all on public.expenses from anon, authenticated;

-- إضافة مصروف
create or replace function public.add_expense(p_spent_on date, p_category text, p_amount numeric, p_note text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public._require_role('super_admin', 'accountant');
  if p_category is null or p_category not in ('ads', 'salaries', 'marketing', 'other') then raise exception 'invalid_payload'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 10000000 or p_amount <> round(p_amount, 2) then raise exception 'invalid_amount'; end if;
  if p_spent_on is null or p_spent_on > (now() at time zone public._tz())::date + 31 or p_spent_on < date '2020-01-01' then
    raise exception 'invalid_expense_date';
  end if;
  insert into public.expenses(spent_on, category, amount, note, created_by)
  values (p_spent_on, p_category, p_amount, nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  returning id into v_id;
  perform public._audit('expense_added', 'expense', v_id::text,
    jsonb_build_object('category', p_category, 'amount', p_amount, 'spent_on', p_spent_on));
  return v_id;
end $$;

-- حذف مصروف (لو انكتب غلط)
create or replace function public.delete_expense(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v public.expenses;
begin
  perform public._require_role('super_admin', 'accountant');
  delete from public.expenses where id = p_id returning * into v;
  if v.id is null then raise exception 'expense_not_found'; end if;
  perform public._audit('expense_deleted', 'expense', p_id::text,
    jsonb_build_object('category', v.category, 'amount', v.amount, 'spent_on', v.spent_on));
end $$;

-- المصاريف في فترة: المجموع، حسب النوع، حسب الشهر، والقائمة
create or replace function public.finance_expenses(p_from date default null, p_to date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_res jsonb;
begin
  perform public._require_role('super_admin', 'accountant');
  with ranged as (
    select e.* from public.expenses e
    where (p_from is null or e.spent_on >= p_from) and (p_to is null or e.spent_on <= p_to)
  )
  select jsonb_build_object(
    'total', (select coalesce(sum(amount), 0) from ranged),
    'count', (select count(*) from ranged),
    'by_category', jsonb_build_object(
      'ads',       (select coalesce(sum(amount), 0) from ranged where category = 'ads'),
      'salaries',  (select coalesce(sum(amount), 0) from ranged where category = 'salaries'),
      'marketing', (select coalesce(sum(amount), 0) from ranged where category = 'marketing'),
      'other',     (select coalesce(sum(amount), 0) from ranged where category = 'other')),
    'by_month', coalesce((
      select jsonb_agg(jsonb_build_object('month', m, 'total', s) order by m)
      from (select to_char(spent_on, 'YYYY-MM') m, sum(amount) s from ranged group by 1) x), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'spent_on', r.spent_on, 'category', r.category, 'amount', r.amount,
               'note', r.note, 'by', pr.full_name) order by r.spent_on desc, r.created_at desc)
      from (select * from ranged order by spent_on desc, created_at desc limit 500) r
      left join public.profiles pr on pr.id = r.created_by), '[]'::jsonb)
  ) into v_res;
  return v_res;
end $$;

revoke execute on function public.add_expense(date, text, numeric, text) from public, anon;
revoke execute on function public.delete_expense(uuid) from public, anon;
revoke execute on function public.finance_expenses(date, date) from public, anon;
grant execute on function public.add_expense(date, text, numeric, text) to authenticated;
grant execute on function public.delete_expense(uuid) to authenticated;
grant execute on function public.finance_expenses(date, date) to authenticated;
