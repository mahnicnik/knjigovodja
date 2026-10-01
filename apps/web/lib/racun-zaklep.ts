/**
 * PRELET 376: racun z davcno rezervacijo (furs_rezervacija - stevilka in ZOI
 * sta dodeljena in morda ze poslana FURS) se NE ureja: sprememba zneska,
 * datuma ali stevilke bi pomenila, da se racun ne ujema s prijavljenim.
 * Popravek gre prek storna in novega racuna. Enako pravilo varuje baza
 * (trigger zasciti_davcno_rezervacijo, migracija 176).
 */
export function zaklenjenZaUrejanje(inv: { furs_rezervacija?: unknown } | null | undefined): boolean {
  return !!(inv && inv.furs_rezervacija)
}

export const ZAKLENJEN_SPOROCILO = 'Račun ima dodeljeno davčno številko in ga ni mogoče urejati. Za popravek ga stornirajte in izdajte novega.'
