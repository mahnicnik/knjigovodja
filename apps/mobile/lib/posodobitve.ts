/**
 * SAMOPOSODABLJANJE (EAS Update, 16.10.2026)
 *
 * Aplikacija ob zagonu sama preveri, ali je na kanalu `production` nova
 * razlicica JS kode (app.json: updates.checkAutomatically = ON_LOAD), jo
 * prenese in uporabi ob NASLEDNJEM zagonu - nikoli med prodajo.
 * Ker blagajna na telefonu lahko ostane odprta vec dni, preverimo tudi ob
 * vrnitvi v ospredje (najvec na 30 min).
 *
 * Objava posodobitve (apps/mobile):  npm run objavi:posodobitev -- "opis"
 * Nov APK je potreben samo pri spremembi domorodnega dela (nov modul,
 * dovoljenje, nadgradnja Expo SDK) - runtimeVersion "fingerprint" to zazna
 * sam in taksni posodobitvi ne posreduje starim APK-jem.
 */
import * as Updates from 'expo-updates';
import Constants from 'expo-constants';

const MED_PREVERJANJI_MS = 30 * 60 * 1000;
let zadnjePreverjanje = 0;

export function jeOmogoceno(): boolean {
  return !__DEV__ && Updates.isEnabled;
}

/** Tiho preveri in prenese posodobitev - uporabi se ob naslednjem zagonu. */
export async function preveriVOzadju(): Promise<void> {
  if (!jeOmogoceno()) return;
  const zdaj = Date.now();
  if (zdaj - zadnjePreverjanje < MED_PREVERJANJI_MS) return;
  zadnjePreverjanje = zdaj;
  try {
    const r = await Updates.checkForUpdateAsync();
    if (r.isAvailable) await Updates.fetchUpdateAsync();
  } catch {
    // brez povezave ipd. - poskusi ob naslednji priliki
  }
}

export type Rezultat = 'najnovejsa' | 'pripravljena' | 'ni-na-voljo' | 'napaka';

/** Rocno preverjanje (Nastavitve). 'pripravljena' = prenesena, potreben ponovni zagon. */
export async function preveriZdaj(): Promise<Rezultat> {
  if (!jeOmogoceno()) return 'ni-na-voljo';
  try {
    zadnjePreverjanje = Date.now();
    const r = await Updates.checkForUpdateAsync();
    if (!r.isAvailable) return 'najnovejsa';
    await Updates.fetchUpdateAsync();
    return 'pripravljena';
  } catch {
    return 'napaka';
  }
}

export async function znovaZazeni(): Promise<void> {
  await Updates.reloadAsync();
}

/** "1.0.0 · posodobitev 16. 10. 2026" */
export function opisRazlicice(): string {
  const verzija = Constants.expoConfig?.version ?? '';
  if (!jeOmogoceno() || Updates.isEmbeddedLaunch || !Updates.createdAt) return `v${verzija}`;
  return `v${verzija} · posodobitev ${Updates.createdAt.toLocaleDateString('sl-SI')}`;
}
