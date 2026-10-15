/**
 * PRENOSI APLIKACIJ – Windows in Android (15.10.2026)
 *
 * NAPAKA: stranka v Nastavitve → Prenosi ni mogla prenesti ne Android ne
 * Windows aplikacije.
 *
 *   1. ANDROID: stran /prenosi je APK iskala med datotekami ZADNJE GitHub
 *      izdaje. Tja ga ni nalagal nihce - izdaje gradi `electron-build.yml`
 *      (samo Windows), APK pa gradi Expo EAS in ostane na expo.dev. Gumb je
 *      zato dobil href="#" in ob kliku se ni zgodilo nic.
 *   2. WINDOWS: povezavo na .exe je iskal BRSKALNIK STRANKE prek
 *      api.github.com (60 klicev/uro na IP, brez prijave). Ce klic ni uspel,
 *      je namesto gumba pisalo "Ni na voljo".
 *
 * POPRAVEK - brez GitHub API, samo stalni URL-ji, ki jih GitHub streze s CDN:
 *
 *   WINDOWS: `releases/latest/download/latest.yml` (isto datoteko bere
 *   samodejni posodobitelj namizne aplikacije) pove razlicico in ime .exe.
 *   `/releases/latest` vedno kaze na zadnjo NE-predizdajo, zato nova Windows
 *   izdaja ne potrebuje nobenega dodatnega koraka.
 *
 *   ANDROID: APK je v locenji izdaji z oznako `android`, oznaceni kot
 *   PREDIZDAJA, pod stalnim imenom `racunko-pos.apk`. Predizdaja nikoli ne
 *   postane "latest", zato je nova Windows izdaja ne izpodrine - in obratno:
 *   samodejni posodobitelj (electron-updater) bere `/releases/latest`, zato
 *   Android izdaje ne vidi. Oznaka `android` se ne ujema z `v*`, zato ne
 *   sprozi gradnje Windows. Objava: `apps/mobile/objavi-android.sh`.
 *
 * Datoteke so javne (repozitorij je javen), zato poti /api/prenosi ne
 * preverjajo paketa - to stori stran /prenosi pri prikazu gumbov.
 */

export const REPO_URL = 'https://github.com/mahnicnik/knjigovodja'

/** Oznaka in stalno ime datotek Android izdaje (predizdaja). */
export const ANDROID_OZNAKA = 'android'
export const ANDROID_APK = 'racunko-pos.apk'
export const ANDROID_INFO = 'racunko-pos-android.json'

export const URL_WINDOWS_YML = `${REPO_URL}/releases/latest/download/latest.yml`
export const URL_WINDOWS_REZERVA = `${REPO_URL}/releases/latest`
export const URL_ANDROID_APK = `${REPO_URL}/releases/download/${ANDROID_OZNAKA}/${ANDROID_APK}`
export const URL_ANDROID_INFO = `${REPO_URL}/releases/download/${ANDROID_OZNAKA}/${ANDROID_INFO}`

/** Kako dolgo streznik hrani podatke o izdajah (sekunde). */
export const OSVEZI_S = 600

export type WindowsIzdaja = {
  verzija: string
  datoteka: string
  url: string
  velikost: number | null
  datum: string | null
}

export type AndroidIzdaja = {
  verzija: string | null
  url: string
  velikost: number | null
  datum: string | null
}

export type StanjePrenosov = {
  windows: WindowsIzdaja | null
  android: AndroidIzdaja | null
}

/** Vrednost kljuca iz preprostega YAML (electron-builder latest.yml). */
function yamlVrednost(yml: string, kljuc: string): string | null {
  const m = yml.match(new RegExp(`^\\s*-?\\s*${kljuc}:\\s*(.+?)\\s*$`, 'm'))
  if (!m) return null
  return m[1].replace(/^['"]|['"]$/g, '')
}

/**
 * Iz latest.yml (electron-builder) sestavi neposreden URL .exe.
 * Vrne null, ce datoteka ni tisto, kar pricakujemo (npr. HTML strani z napako).
 */
export function razcleniLatestYml(yml: string): WindowsIzdaja | null {
  if (!yml || typeof yml !== 'string') return null
  const verzija = yamlVrednost(yml, 'version')
  const datoteka = yamlVrednost(yml, 'path') ?? yamlVrednost(yml, 'url')
  if (!verzija || !/^\d+\.\d+\.\d+/.test(verzija)) return null
  if (!datoteka || !/\.exe$/i.test(datoteka) || /[/\\]/.test(datoteka)) return null
  const velikostTxt = yamlVrednost(yml, 'size')
  const velikost = velikostTxt && /^\d+$/.test(velikostTxt) ? Number(velikostTxt) : null
  return {
    verzija,
    datoteka,
    url: `${REPO_URL}/releases/download/v${verzija}/${encodeURIComponent(datoteka)}`,
    velikost,
    datum: yamlVrednost(yml, 'releaseDate'),
  }
}

/** Podatki o APK iz racunko-pos-android.json (zapise ga objavi-android.sh). */
export function razcleniAndroidInfo(info: unknown): AndroidIzdaja | null {
  if (!info || typeof info !== 'object') return null
  const o = info as Record<string, unknown>
  const verzija = typeof o.verzija === 'string' && o.verzija ? o.verzija : null
  const velikost = typeof o.velikost === 'number' && o.velikost > 0 ? o.velikost : null
  const datum = typeof o.datum === 'string' && !isNaN(Date.parse(o.datum)) ? o.datum : null
  return { verzija, url: URL_ANDROID_APK, velikost, datum }
}

/** "83,2 MB" */
export function velikostMB(bajti: number | null | undefined): string | null {
  if (!bajti || bajti <= 0) return null
  return (bajti / 1024 / 1024).toLocaleString('sl-SI', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' MB'
}

// ─────────────────────────────────────────────────────────────────
// STREZNIK
// ─────────────────────────────────────────────────────────────────

export async function zadnjaWindows(): Promise<WindowsIzdaja | null> {
  try {
    const res = await fetch(URL_WINDOWS_YML, { next: { revalidate: OSVEZI_S } })
    if (!res.ok) return null
    return razcleniLatestYml(await res.text())
  } catch {
    return null
  }
}

export async function zadnjaAndroid(): Promise<AndroidIzdaja | null> {
  try {
    const res = await fetch(URL_ANDROID_INFO, { next: { revalidate: OSVEZI_S } })
    if (res.ok) {
      const info = razcleniAndroidInfo(await res.json().catch(() => null))
      if (info) return info
    }
  } catch {}
  // APK naložen brez .json (rocno prek GitHuba): preveri, ali datoteka obstaja.
  try {
    const res = await fetch(URL_ANDROID_APK, { method: 'HEAD', cache: 'no-store' })
    if (res.ok) {
      const dolzina = Number(res.headers.get('content-length')) || null
      return { verzija: null, url: URL_ANDROID_APK, velikost: dolzina, datum: null }
    }
  } catch {}
  return null
}
