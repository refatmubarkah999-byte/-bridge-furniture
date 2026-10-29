-- =====================================================================
-- Bridge Furniture — 8) رابط الدعاية على البوليصة (باركود مربع QR)
-- آمن للتشغيل أكثر من مرة.
-- =====================================================================

alter table public.app_settings
  add column if not exists promo_url  text check (promo_url is null or (char_length(promo_url) <= 300 and promo_url ~* '^https?://')),
  add column if not exists promo_text text check (promo_text is null or char_length(promo_text) <= 80);

-- المالك فقط يغيّر رابط الدعاية ونصّها
create or replace function public.update_promo(p_url text, p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_url  text := nullif(btrim(coalesce(p_url, '')), '');
  v_text text := nullif(btrim(coalesce(p_text, '')), '');
begin
  perform public._require_role('super_admin');
  if v_url is not null and (char_length(v_url) > 300 or v_url !~* '^https?://[^\s]+$') then
    raise exception 'invalid_url';
  end if;
  if char_length(coalesce(v_text, '')) > 80 then raise exception 'text_too_long'; end if;
  update public.app_settings set promo_url = v_url, promo_text = v_text;
  perform public._audit('settings_updated', 'settings', null, jsonb_build_object('promo_url', v_url));
end $$;

revoke execute on function public.update_promo(text, text) from public, anon;
grant execute on function public.update_promo(text, text) to authenticated;
