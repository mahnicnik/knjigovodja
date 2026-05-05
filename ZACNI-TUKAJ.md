# KNJIGOVODJA.SI — Navodila za začetek
# Za nekoga brez programerskega znanja

===========================================================
## KAJ BOSTE NAREDILI DANES (60-90 minut)
===========================================================

1. Namestite Node.js (5 min)
2. Namestite Cursor (5 min)  
3. Ustvarite Supabase projekt + baza (15 min)
4. Nastavite projekt (10 min)
5. Zaženete aplikacijo — vidite jo v brskalniku (5 min)

===========================================================
## KORAK 1: Namestite Node.js
===========================================================

1. Pojdite na: https://nodejs.org
2. Kliknite gumb "LTS" (leva možnost — priporočena)
3. Prenesite in namestite — kliknite "Next" do konca
4. Ko je nameščen, nadaljujte

===========================================================
## KORAK 2: Namestite Cursor
===========================================================

1. Pojdite na: https://cursor.com
2. Kliknite "Download" 
3. Namestite (brezplačno — Hobby plan zadostuje)
4. Odprite Cursor
5. Prijavite se z Google računom

===========================================================
## KORAK 3: Ustvarite Supabase projekt
===========================================================

1. Pojdite na: https://supabase.com
2. Kliknite "Start your project" → prijavite se z GitHub ali Google
3. Kliknite "New project"
4. Izpolnite:
   - Name: "knjigovodja"
   - Database Password: izmislite si geslo in ga SHRANITE!
   - Region: izberite "Frankfurt (eu-central-1)"
5. Kliknite "Create new project" — počakajte ~2 minuti

6. Ko je projekt ustvarjen:
   - V meniju levo kliknite "SQL Editor"
   - Kliknite "New query"
   - ODPRITE datoteko: supabase/migrations/001_initial_schema.sql
   - Kopirajte VSO vsebino (Ctrl+A, Ctrl+C)
   - Prilepite v SQL Editor (Ctrl+V)
   - Kliknite "Run" (zeleni gumb)
   - Videti morate: "Success. No rows returned"

7. Preverite: V meniju levo kliknite "Table Editor"
   - Videti morate 12 tabel (organizations, employees, ...)
   - Če jih vidite — baza dela! ✓

8. Pridobite ključe (potrebujemo jih za aplikacijo):
   - V meniju levo kliknite "Project Settings" (zobnik)
   - Kliknite "API"
   - Kopirajte in shranite:
     * Project URL (npr. https://xxxx.supabase.co)
     * anon public (dolg niz)
     * service_role secret (POZOR: tega ne delite z nikomer!)

===========================================================
## KORAK 4: Nastavite projekt v Cursor
===========================================================

1. V Cursor: File → Open Folder → izberite mapo "knjigovodja"

2. V Cursor kliknite "Terminal" v meniju (ali Ctrl+`)
   - Odpre se črno okno spodaj — to je terminal

3. V terminal prilepite ta ukaz in pritisnite Enter:
   npm install

   (Počakajte ~1-2 minuti — namešča knjižnice)

4. Ustvarite datoteko .env.local:
   - V Cursor levo vidite drevesno strukturo datotek
   - Desni klik na "apps/web" → New File → .env.local
   - Prilepite in dopolnite z vašimi Supabase ključi:

NEXT_PUBLIC_SUPABASE_URL=https://VAŠA-URL.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=vaš-anon-ključ
SUPABASE_SERVICE_ROLE_KEY=vaš-service-role-ključ
ANTHROPIC_API_KEY=vaš-claude-api-ključ
NEXT_PUBLIC_APP_URL=http://localhost:3000

===========================================================
## KORAK 5: Zaženete aplikacijo
===========================================================

V terminal v Cursor prilepite:
   npm run dev

Ko vidite:
   ✓ Ready in 2.3s
   - Local: http://localhost:3000

Odprite brskalnik in pojdite na: http://localhost:3000

🎉 Vaša aplikacija dela!

===========================================================
## PRIDOBITEV CLAUDE API KLJUČA
===========================================================

1. Pojdite na: https://console.anthropic.com
2. Registrirajte se
3. Kliknite "API Keys" → "Create Key"
4. Kopirajte ključ v .env.local

(Za začetek dobite brezplačnih $5 kreditov — zadostuje za razvoj)

===========================================================
## ČE GRE KAJ NAROBE
===========================================================

Prilepite napako sem (v Claude chat) in jo bom popravil!
Večina napak je:
- Napačen ključ v .env.local → preverite da ste pravilno kopirali
- Pozabili npm install → zaženite ga
- Node.js ni nameščen → namestite ga

===========================================================
## NASLEDNJI KORAK PO TEM
===========================================================

Ko vidite aplikacijo v brskalniku, mi napišite "dela" in
začnemo graditi prvi zakon — prijavo in registracijo s.p.!
