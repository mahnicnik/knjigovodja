#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# OBJAVI ANDROID APK (15.10.2026)
#
# Nalozi APK v GitHub predizdajo `android` pod STALNIM imenom
# racunko-pos.apk, od koder ga prenese gumb v Nastavitve → Prenosi
# (/api/prenosi/android, glej apps/web/lib/prenosi.ts).
#
# Predizdaja nikoli ne postane "latest": Windows izdaje (v*) je ne
# izpodrinejo, samodejni posodobitelj namizne aplikacije pa je ne vidi.
#
# Uporaba (iz apps/mobile):
#   ./objavi-android.sh                      # zadnji koncan EAS build (profil production)
#   ./objavi-android.sh pot/do/app.apk 1.0.4 # lokalna datoteka (+ neobvezna razlicica)
#
# Potrebno: gh (gh auth login), za EAS pa eas-cli prijava (npx eas-cli login).
# Ob naslednjem EAS buildu samo ponovno zazeni - datoteka se zamenja (--clobber).
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

REPO="mahnicnik/knjigovodja"
OZNAKA="android"
APK_IME="racunko-pos.apk"
INFO_IME="racunko-pos-android.json"

cd "$(dirname "$0")"
DIR="$(mktemp -d)"
trap 'rm -rf "$DIR"' EXIT

command -v gh >/dev/null || { echo "Manjka gh (GitHub CLI): brew install gh && gh auth login"; exit 1; }

VERZIJA=""
GRADNJA=""
if [[ $# -ge 1 ]]; then
  [[ -f "$1" ]] || { echo "Datoteka ne obstaja: $1"; exit 1; }
  [[ "$1" == *.apk ]] || { echo "Pricakujem .apk (AAB se na telefon ne da namestiti): $1"; exit 1; }
  cp "$1" "$DIR/$APK_IME"
  VERZIJA="${2:-}"
else
  echo "→ Iscem zadnji koncan Android build (EAS, profil production)…"
  npx --yes eas-cli build:list --platform android --status finished --build-profile production \
    --limit 1 --json --non-interactive > "$DIR/build.json"
  URL=$(node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1]))[0]||{};process.stdout.write((b.artifacts&&b.artifacts.buildUrl)||"")' "$DIR/build.json")
  VERZIJA=$(node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1]))[0]||{};process.stdout.write(b.appVersion||"")' "$DIR/build.json")
  GRADNJA=$(node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1]))[0]||{};process.stdout.write(String(b.appBuildVersion||""))' "$DIR/build.json")
  [[ -n "$URL" ]] || { echo "EAS ni vrnil nobenega koncanega builda. Zgradi: npx eas-cli build -p android --profile production"; exit 1; }
  [[ "$URL" == *.apk ]] || { echo "Zadnji build ni APK ($URL). Profil production mora imeti android.buildType = apk."; exit 1; }
  echo "→ Prenasam $URL"
  curl -fL --retry 3 -o "$DIR/$APK_IME" "$URL"
fi

VELIKOST=$(wc -c < "$DIR/$APK_IME" | tr -d ' ')
[[ "$VELIKOST" -gt 1000000 ]] || { echo "APK je sumljivo majhen ($VELIKOST B) - prekinjam."; exit 1; }

node -e '
const [verzija, gradnja, velikost, pot] = process.argv.slice(1)
require("fs").writeFileSync(pot, JSON.stringify({
  verzija: verzija ? (gradnja ? `${verzija} (${gradnja})` : verzija) : null,
  velikost: Number(velikost),
  datum: new Date().toISOString(),
}, null, 2))
' "$VERZIJA" "$GRADNJA" "$VELIKOST" "$DIR/$INFO_IME"

if ! gh release view "$OZNAKA" -R "$REPO" >/dev/null 2>&1; then
  echo "→ Ustvarjam predizdajo '$OZNAKA'"
  gh release create "$OZNAKA" -R "$REPO" --prerelease --target main \
    --title "Računko POS za Android" \
    --notes "Stalno mesto za Android aplikacijo. Prenos: Računko → Nastavitve → Prenosi. Datoteko zamenja apps/mobile/objavi-android.sh."
fi
# Vedno predizdaja - sicer bi postala "latest" in pokvarila Windows posodobitve.
gh release edit "$OZNAKA" -R "$REPO" --prerelease >/dev/null

echo "→ Nalagam $APK_IME ($((VELIKOST / 1024 / 1024)) MB) in $INFO_IME"
gh release upload "$OZNAKA" -R "$REPO" --clobber "$DIR/$APK_IME" "$DIR/$INFO_IME"

echo "✓ Objavljeno: https://github.com/$REPO/releases/download/$OZNAKA/$APK_IME"
echo "  Gumb v Računku ga pokaze v najvec 10 minutah."
