---
modul: pos-paketi-clanarine
naslov: POS – paketi, članarine, karte obiskov, boni, predplačilo, obroki, zamrznitev, samodejna obnova
vloge: [lastnik, vodja, blagajnik]
poti: [/pos]
koda:
  - apps/web/app/pos/page.tsx (StoritveInPaketiSection, PackagesAdminSection, TEMPLATE_TYPES, ACTIVATION_TYPES)
  - apps/web/app/pos/page.tsx (PackagesScreen, SellPackageModal, CustomerPackagesTab, FreezePackageModal, ExtendPackageModal, EditPackageModal, ManualAddCardModal)
  - apps/web/app/api/cron/notifications (opomniki in predračun za obnovo), api/cron/installments (obroki), api/cron/unfreeze-packages (samodejna odmrznitev)
posodobljeno: 2026-10-05
---

# POS – paketi in članarine

## Vrste paketov (predloge)

| Vrsta | Pomen |
|---|---|
| Članarina | velja določeno število dni, obiski se ne štejejo |
| Karta obiskov | npr. 10× vstopnica – vsak obisk odšteje 1 |
| Darilni bon | vrednostni bon (znesek) |
| Storitveni bon | bon za določeno storitev |
| Sezonska | velja od – do datuma sezone |
| Časovna | velja samo v določenih urah in dnevih (npr. jutranja karta) |
| Skupinska | obiski skupinske vadbe |
| Predplačilo | dobroimetje, s katerim stranka plačuje storitve in izdelke |

## Ustvarjanje paketa (predloge)

1. **POS → Nastavitve → Storitve & Paketi**, gumb **+ Paket / Kartica**.
2. Izberi vrsto, vpiši ime (npr. »Letna članarina«, »10× vstopnica«) in ceno.
3. DDV stopnja (pri 0 % obvezen razlog za neobračunan DDV).
4. **Začetek veljavnosti**: Ob nakupu / Ob prvem obisku / Na datum.
5. **Veljavnost (dni od aktivacije)** (npr. 30, 90, 365) – pri sezonski namesto tega začetek in konec sezone.
6. **Število obiskov** (karta obiskov, skupinska); pri časovni še ure in veljavni dnevi.
7. **Opozorilo pred iztekom (dni)** – koliko dni prej stranka dobi opomnik.
8. **Samodejna obnova** – glej spodaj.
9. **Shrani**.

## Kako vklopim samodejno podaljševanje (obnovo) paketa?

V obrazcu paketa (**POS → Nastavitve → Storitve & Paketi → uredi paket**) označi **Samodejna obnova** in shrani.

Pomembno – kaj obnova dejansko naredi: **stranka pred iztekom prejme predračun za podaljšanje** (po e-pošti). Kartica se **ne** podaljša sama in kartica stranke **ni bremenjena**; podaljša se šele, ko stranka predračun plača. Brez obnove stranka prejme le opomnik o izteku. Pri paketu se nato prikaže oznaka »🔄 Predračun ob izteku«.

Ko stranka predračun plača (nakazilo), v blagajni odpri obvestila (**zvonec** v glavi) in pri zahtevku potrdi, da je plačilo prispelo. Takrat se izda račun (po e-pošti stranki), kartica pa se podaljša od dneva po izteku. V obvestilih sta tudi »Pošlji znova« in »Opusti«.

Ali se opomniki pošiljajo samodejno ali jih potrdiš sam, nastaviš v **POS → Nastavitve → Obveščanje → Opomniki o poteku kartice** (»Pošlji samodejno« / »Potrdim sam«). Stranka mora imeti vpisan e-mail.

## Prodaja paketa stranki

1. Zaslon **Paketi** → pri paketu **Prodaj stranki** (ali v profilu stranke na zaslonu **Stranke**).
2. Izberi stranko (iskanje po imenu ali telefonu), začetek veljavnosti, opombo.
3. Plačaj na blagajni (izda se račun) – kartica se aktivira.

### Plačilo v obrokih

1. V oknu prodaje paketa označi **💳 Plačilo v obrokih (odložena plačila)**.
2. **Število obrokov** (2–24) in **Pogostost** (Mesečno / Tedensko).
3. **Prvi obrok**: »💳 plačaj zdaj (blagajna)« ali »📧 pošlji na e-mail«.
4. Kartica se aktivira takoj. Vsak naslednji obrok se stranki samodejno pošlje kot račun z UPN QR kodo nekaj dni pred zapadlostjo.

Pogoja: stranka mora imeti e-mail, podjetje pa IBAN (**portal → Nastavitve → Bančni podatki**) – sicer račun nima QR kode za nakazilo.

## Upravljanje kartice stranke (Stranke → stranka → zavihek paketov)

- **➕ Podaljšaj** – podaljša veljavnost za vpisano število dni.
- **❄️ ZAMRZ.** – zamrzni kartico: »Zamrzni zdaj, odmrznem ročno kadarkoli« ali »Zamrzni do določenega datuma (avtomatsko)«. Ob odmrznitvi se rok izteka premakne naprej za toliko dni, kolikor je bila kartica zamrznjena. Zamrznjene kartice ni mogoče unovčiti.
- **✏️ Popravi** – popravi število obiskov, začetek veljavnosti ali zamenja paket.
- **Deaktiviraj** / **🗑 Briši** – deaktivacija oziroma trajni izbris kartice.
- **Dodaj kartico ročno** – brez računa (npr. migracija iz starega sistema); razlog je obvezen.
- **Predplačilo**: **+ Napolni** doda znesek na stanje; stanje se pri plačilu s »Predplačilo« odšteva samodejno.

## Unovčenje obiska

Na blagajni: pripni stranko, v plačilu izberi **🎟️ Karta obiskov** in kartico – odšteje se 1 obisk (storitev je bila obdavčena že ob nakupu kartice). Obisk lahko odšteje tudi termin v **Koledarju**.

## Omejitve in opozorila

- »Samodejna obnova« ne bremeni kartice in ne podaljša sama – pošlje predračun.
- Unovčenje kartice in predplačila ne deluje brez interneta.
- Zamrznjene ali porabljene kartice ni mogoče unovčiti (gumb je onemogočen z razlago).
- Obroki brez IBAN-a podjetja gredo stranki brez QR kode za plačilo.
