#!/usr/bin/env bash
#
# Zagon testov Računko.
#
# Ključa ni treba vpisovati v ukaz — skripta ga prebere iz apps/web/.env.local,
# ki ni v repozitoriju. Tako ključ ne konča v zgodovini ukazov ali v pogovoru.
#
# Prva uporaba:
#   1. V apps/web/.env.local dodaj vrstico:
#        SUPABASE_SERVICE_ROLE_KEY=eyJ...
#      (ključ najdeš v Supabase: Settings → API → service_role → Reveal)
#   2. Zaženi:  ./testi.sh
#
set -euo pipefail
cd "$(dirname "$0")/apps/web"

echo "═══ 1/2  Davčni izračuni ═══"
echo "    (formule — ne potrebujejo baze)"
echo
npx playwright test tests/davki.spec.ts --reporter=list || DAVKI_PADLI=1

echo
echo "═══ 2/2  Pravila v bazi ═══"

if [ -f .env.local ]; then
  # Preberi samo spremenljivki, ki ju potrebujemo — ostalih ne izpostavljamo.
  KEY=$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
  URL=$(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
fi

URL="${URL:-https://yvpvrhwodskvbqmgsghy.supabase.co}"

if [ -z "${KEY:-}" ]; then
  echo
  echo "    Ključa ni v apps/web/.env.local — testi baze bodo preskočeni."
  echo
  echo "    Da jih omogočiš, dodaj v apps/web/.env.local vrstico:"
  echo "      SUPABASE_SERVICE_ROLE_KEY=eyJ..."
  echo
  echo "    Ključ: Supabase → Settings → API → service_role → Reveal"
  echo
  exit "${DAVKI_PADLI:-0}"
fi

echo "    (uporabljam ključ iz .env.local)"
echo
NEXT_PUBLIC_SUPABASE_URL="$URL" \
SUPABASE_SERVICE_ROLE_KEY="$KEY" \
npx playwright test tests/baza.spec.ts --reporter=list || BAZA_PADLI=1

echo
if [ -n "${DAVKI_PADLI:-}" ] || [ -n "${BAZA_PADLI:-}" ]; then
  echo "═══ Nekateri testi so padli — glej izpis zgoraj ═══"
  exit 1
fi
echo "═══ Vsi testi so prestali ═══"
