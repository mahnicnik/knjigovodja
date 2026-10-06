---
modul: ekipa-vloge-osebje
naslov: Ekipa v portalu (vabila, vloge) in osebje blagajne (PIN, vloge, dovoljenja)
vloge: [lastnik, admin]
poti: [/nastavitve?tab=ekipa, /nastavitve/ekipa, /pos, /invite/[id]]
koda:
  - apps/web/components/nastavitve/Ekipa.tsx (portalna ekipa in vabila)
  - apps/web/lib/role-access.ts (katere strani sme posamezna vloga)
  - apps/web/app/pos/page.tsx (StaffSection, CFG.rolePresets, CFG.permissionGroups)
  - apps/web/components/nastavitve/Blagajna.tsx (zavihek Osebje blagajne)
posodobljeno: 2026-10-06
---

# Ekipa in vloge

V Računku sta **dve ločeni ravni** dostopa – to je pogost vir zmede:

1. **Člani ekipe v portalu** – osebe z lastnim e-mailom in geslom za Računko (**Nastavitve → Ekipa**).
2. **Osebje blagajne** – osebe, ki se na blagajno prijavijo s **PIN-om** (**POS → Nastavitve → Zaposleni & PIN**). Nimajo nujno lastnega računa v Računku.

## 1. Člani ekipe v portalu

**Nastavitve → Ekipa** → vpiši e-mail, izberi vlogo, **Pošlji povabilo**. Oseba prejme e-mail s povezavo (velja 7 dni), ustvari račun ali se prijavi in takoj dobi dostop.

| Vloga | Dostop |
|---|---|
| Lastnik | vse |
| Admin | vse razen nastavitev plačil in brisanja organizacije |
| Blagajnik | samo POS blagajna (`/pos`) |
| Gledalec | samo ogled (portal računovodje, izvoz, blagajna), brez urejanja |
| Računovodja | ogled in izvoz: portal računovodje, izvoz, KPO knjiga, računi, stroški – brez izdajanja ali urejanja računov |

Vlogo člana spremeniš ali ga odstraniš na istem mestu; čakajoče povabilo lahko prekličeš.

**Paket (samo računi, odprti po oktobru 2026):** vlogi **Računovodja** in **Gledalec** zahtevata paket Pro, **Blagajnik** paket Pro + POS; vloge, ki jih paket ne vsebuje, so v Ekipi sive z oznako »Potreben paket …«. Pri prej odprtih računih so na voljo vse vloge kot doslej.

## 2. Osebje blagajne (PIN)

1. **POS → Nastavitve → Zaposleni & PIN** (razdelek vidi samo lastnik) → **Nov zaposleni**.
2. **Ime in priimek**, **Vloga**, **PIN koda** (1–4 števke, ne iz samih enakih števk, ne sme biti enaka PIN-u drugega zaposlenega), barva.
3. **Dovoljenja** – privzeto po vlogi; posamezne pravice lahko spremeniš (oznaka »Odstopa od vloge«).
4. **Shrani**.

Isto osebje lahko urejaš tudi v portalu: **Nastavitve → Davčna blagajna → Osebje blagajne**.

### Privzete pravice po vlogah blagajne

| Vloga | Prodaja | Odpri blagajno | Storno | Vračilo | Dnevni zaključek | Termini |
|---|---|---|---|---|---|---|
| Lastnik | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Vodja | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Blagajnik | ✓ | ✓ | – | – | – | ✓ |
| Trener | – | – | – | – | – | ✓ |
| Terapevt | – | – | – | – | – | ✓ |

Skupine dovoljenj v obrazcu: Blagajna & Prodaja (prodaja, odpri blagajno, storno, vračilo, ročni popust, dnevni zaključek), Člani & Termini, Finance (promet, prihodki, poročila, izvoz), Nastavitve (cenik, zaposleni, prostori & mize, sistem).

Zaposleni z vlogo **Trener** ali **Terapevt** se pojavijo v koledarju in kot filter v poročilih.

## Omejitve in opozorila

- Razdelki blagajne **Zaposleni & PIN**, **Prostori & Mize**, **FURS & DDV** in **Interni akt** so vidni samo lastniku.
- Blagajna dejansko preverja pravice za **storno**, **vračilo**, **dnevni zaključek** in **prikaz prometa** v glavi; ostale pravice v obrazcu so zaenkrat informativne.
- PIN ni geslo za internet – do blagajne pride samo uporabnik, ki je že prijavljen v Računko; PIN loči osebje za pultom.
