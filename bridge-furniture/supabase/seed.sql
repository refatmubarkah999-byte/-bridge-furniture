-- بيانات تجريبية للكتالوج فقط (لا بيانات زبائن حقيقية)
-- الصور تُرفع لاحقاً من شاشة الكتالوج.

insert into public.products (name, standard_price) values
  ('Sila', 4200.00),
  ('Nola', 3600.00),
  ('Lina', 2900.00),
  ('Ramah', 5100.00)
on conflict (name) do nothing;

insert into public.product_colors (product_id, name)
select p.id, c.name
from public.products p
cross join (values ('بيج'), ('رمادي'), ('أزرق نيلي'), ('أخضر زيتي')) as c(name)
on conflict (product_id, name) do nothing;
