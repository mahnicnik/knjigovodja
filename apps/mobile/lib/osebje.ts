/**
 * Oseba, ki je blagajno odklenila s PIN-om (17.10.2026). Uporabi se kot
 * blagajnik racuna (pay_order p_cashier_id) in pri izmeni (kdo jo je odprl
 * oziroma zakljucil). Velja, dokler je aplikacija odprta - po zagonu se
 * blagajna vedno odklene znova s PIN-om.
 */
export interface Oseba { id: string; name: string }

let trenutna: Oseba | null = null

export function nastaviOsebo(o: Oseba | null) { trenutna = o; }
export function trenutnaOseba(): Oseba | null { return trenutna; }
