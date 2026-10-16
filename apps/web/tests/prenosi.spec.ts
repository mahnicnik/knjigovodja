import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  razcleniLatestYml, razcleniAndroidInfo, velikostMB,
  URL_ANDROID_APK, URL_WINDOWS_YML, ANDROID_OZNAKA,
} from '../lib/prenosi'

/**
 * PRENOSI (15.10.2026) – brez baze in brskalnika.
 *
 * Stranka v Nastavitve → Prenosi ni mogla prenesti aplikacij: APK je stran
 * iskala v Windows izdaji (kjer ga ni - gumb href="#"), .exe pa prek
 * api.github.com iz brskalnika stranke. Glej lib/prenosi.ts.
 *
 * Zagon:  cd apps/web && npx playwright test tests/prenosi.spec.ts
 */

const KOREN = join(__dirname, '..')

// Dejanska vsebina latest.yml izdaje v1.0.38 (3.9.2026)
const LATEST_YML = `version: 1.0.38
files:
  - url: racunko-pos-setup-1.0.38.exe
    sha512: qVLdWXtpoGZzXiFN17ACy4KVQTX8y+t4yW+cO3p6tfyiC7A8uoruhoEZcwms59eN0UDqk/Zz4Lq0G6PrlVUOxg==
    size: 87256149
path: racunko-pos-setup-1.0.38.exe
sha512: qVLdWXtpoGZzXiFN17ACy4KVQTX8y+t4yW+cO3p6tfyiC7A8uoruhoEZcwms59eN0UDqk/Zz4Lq0G6PrlVUOxg==
releaseDate: '2026-09-03T19:09:40.608Z'
`

test.describe('Windows: latest.yml → neposreden .exe', () => {
  test('dejanski latest.yml v1.0.38', () => {
    expect(razcleniLatestYml(LATEST_YML)).toEqual({
      verzija: '1.0.38',
      datoteka: 'racunko-pos-setup-1.0.38.exe',
      url: 'https://github.com/mahnicnik/knjigovodja/releases/download/v1.0.38/racunko-pos-setup-1.0.38.exe',
      velikost: 87256149,
      datum: '2026-09-03T19:09:40.608Z',
    })
  })

  test('brez `path:` vzame `url:` iz seznama datotek', () => {
    const yml = LATEST_YML.replace(/^path:.*$/m, '')
    expect(razcleniLatestYml(yml)?.datoteka).toBe('racunko-pos-setup-1.0.38.exe')
  })

  test('nepricakovana vsebina → null (rezerva: stran zadnje izdaje)', () => {
    expect(razcleniLatestYml('')).toBeNull()
    expect(razcleniLatestYml('<!DOCTYPE html><html>Not Found</html>')).toBeNull()
    expect(razcleniLatestYml('version: 1.0.38\npath: racunko-pos-1.0.38-mac.zip\n')).toBeNull()
    expect(razcleniLatestYml('version: 1.0.38\npath: ../evil.exe\n')).toBeNull()
    expect(razcleniLatestYml('version: latest\npath: a.exe\n')).toBeNull()
  })

  test('latest.yml se bere prek /releases/latest (ne GitHub API)', () => {
    expect(URL_WINDOWS_YML).toBe('https://github.com/mahnicnik/knjigovodja/releases/latest/download/latest.yml')
  })
})

test.describe('Android: stalno mesto v predizdaji', () => {
  test('stalen URL, oznaka se ne ujema z v* (ne sprozi Windows gradnje)', () => {
    expect(URL_ANDROID_APK).toBe('https://github.com/mahnicnik/knjigovodja/releases/download/android/racunko-pos.apk')
    expect(ANDROID_OZNAKA.startsWith('v')).toBe(false)
  })

  test('info .json', () => {
    expect(razcleniAndroidInfo({ verzija: '1.0.0 (7)', velikost: 61_000_000, datum: '2026-10-15T12:00:00Z' }))
      .toEqual({ verzija: '1.0.0 (7)', url: URL_ANDROID_APK, velikost: 61_000_000, datum: '2026-10-15T12:00:00Z' })
    expect(razcleniAndroidInfo({ verzija: null, velikost: 0, datum: 'x' }))
      .toEqual({ verzija: null, url: URL_ANDROID_APK, velikost: null, datum: null })
    expect(razcleniAndroidInfo(null)).toBeNull()
    expect(razcleniAndroidInfo('niz')).toBeNull()
  })

  test('skripta za objavo uporablja isto oznako in ime ter vedno predizdajo', () => {
    const sh = readFileSync(join(KOREN, '..', 'mobile', 'objavi-android.sh'), 'utf8')
    expect(sh).toContain(`OZNAKA="${ANDROID_OZNAKA}"`)
    expect(sh).toContain('APK_IME="racunko-pos.apk"')
    expect(sh).toContain('INFO_IME="racunko-pos-android.json"')
    expect(sh).toMatch(/gh release edit "\$OZNAKA".*--prerelease/)
  })
})

test.describe('stran /prenosi', () => {
  const stran = readFileSync(join(KOREN, 'app', 'prenosi', 'page.tsx'), 'utf8')

  test('ne klice GitHuba iz brskalnika in nima mrtvih povezav', () => {
    expect(stran).not.toContain('api.github.com')
    expect(stran).not.toContain("|| '#'")
    expect(stran).toContain('href="/api/prenosi/windows"')
    expect(stran).toContain('href="/api/prenosi/android"')
    expect(stran).toContain('Trenutno ni na voljo')
  })

  test('paket preverja enako kot preostanek aplikacije', () => {
    expect(stran).toContain('imaPos(org)')
  })

  test('rezerva za APK ne uporablja HEAD (GitHub podpisan URL vrne 401)', () => {
    const lib = readFileSync(join(KOREN, 'lib', 'prenosi.ts'), 'utf8')
    expect(lib).not.toContain("method: 'HEAD'")
  })
})

test('velikostMB', () => {
  expect(velikostMB(87256149)).toBe('83,2 MB')
  expect(velikostMB(null)).toBeNull()
  expect(velikostMB(0)).toBeNull()
})
