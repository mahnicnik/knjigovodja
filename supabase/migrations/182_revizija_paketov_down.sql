-- ═══════════════════════════════════════════════════════════════════════
-- 182 DOWN – obratna migracija za 182_revizija_paketov.sql
-- ═══════════════════════════════════════════════════════════════════════
-- Odstrani VSE, kar je dodala 182, in vrne handle_new_user v prejsnjo
-- obliko (besedilo iz produkcije 6.10.2026). Obstojece politike RLS 182 ni
-- spreminjala, zato jih tu ni treba obnavljati.
--
-- POZOR: z odstranitvijo stolpca obstojeca_pravila se izgubi razlika med
-- obstojecimi in novimi organizacijami. Ponovna uporaba 182 bi VSE takrat
-- obstojece organizacije (tudi tiste, nastale med 182 in down) oznacila kot
-- obstojece. Organizacije, nastale v tem casu, ohranijo svoj paket/preizkus.

drop trigger if exists trg_zasciti_narocnino on public.organizations;
drop trigger if exists trg_omeji_brezplacne_racune on public.issued_invoices;
drop trigger if exists trg_porabi_povabilo on public.org_members;
drop trigger if exists trg_vloga_po_paketu on public.org_members;

drop policy if exists "orders_insert_paket" on public.orders;
drop policy if exists "org_members_insert_nova_org" on public.org_members;
drop policy if exists "org_invites_insert_nova_org" on public.org_invites;
drop policy if exists "org_invites_update_nova_org" on public.org_invites;
drop policy if exists "org_invites_delete_nova_org" on public.org_invites;

drop function if exists public.zasciti_narocnino();
drop function if exists public.omeji_brezplacne_racune();
drop function if exists public.porabi_povabilo();
drop function if exists public.vloga_po_paketu();
drop function if exists public.sme_vstopiti_v_org(uuid, text);
drop function if exists public.sme_urejati_povabila(uuid);
drop function if exists public.pos_narocilo_dovoljeno(uuid);
drop function if exists public.org_dovoljeno(uuid, text);
drop function if exists public.efektivni_paket(uuid);
drop function if exists public.org_je_obstojeca(uuid);
drop function if exists public.je_streznik();

alter table public.organizations drop column if exists preizkus_opomnik_3d_ob;
alter table public.organizations drop column if exists preizkus_opomnik_0d_ob;
alter table public.organizations drop column if exists obstojeca_pravila;

create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
as $function$
declare
  v_org_id uuid;
  v_full_name text;
  v_org_name text;
begin
  v_full_name := coalesce(new.raw_user_meta_data->>'full_name', '');
  v_org_name := coalesce(nullif(v_full_name, ''), split_part(new.email, '@', 1)) || ' s.p.';

  -- PRELET 212: preizkus traja 14 dni in obsega VSE, tudi blagajno.
  -- `trial_ends_at` je locen od `plan_expires_at`: prvi pove, da gre za
  -- preizkus (in da ob izteku pademo na `free`), drugi pa velja za placane
  -- narocnine. Ce bi uporabili isto polje, ob izteku ne bi vedeli, ali je
  -- slo za neplacnika ali za nekoga, ki preizkusa ni podaljsal.
  insert into public.organizations (name, plan, subscription_status, trial_ends_at)
  values (v_org_name, 'solo', 'pro_pos', now() + interval '14 days')
  returning id into v_org_id;

  insert into public.org_members (org_id, user_id, role)
  values (v_org_id, new.id, 'owner');

  return new;
end;
$function$;
