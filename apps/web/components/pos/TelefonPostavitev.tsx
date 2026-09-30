'use client'

/**
 * BLAGAJNA NA TELEFONU (prelet 355)
 * ═════════════════════════════════
 *
 * Blagajna je narejena za tablico in racunalnik: leva navigacija, stolpec
 * kategorij, mreza artiklov in kosarica stojijo v eni vrsti. Na telefonu
 * (pokoncno, 360-430 pik) to ni uporabno - kosarica sama je siroka 340 pik.
 *
 * PRAVILO: nad 767 pik se NIC ne spremeni. Tablice, racunalniki in namizna
 * aplikacija (Electron, najmanj 900 pik) morajo delati tocno tako kot prej.
 *
 * ZATO VECINO NAREDI CSS (media query), ne JavaScript:
 *  - postavitev je pravilna ze ob prvem izrisu, brez utripanja,
 *  - na sirokem zaslonu se pravila sploh ne uporabijo.
 *
 * Stran je napisana z vrisanimi slogi (style={{...}}). Vrisani slog premaga
 * vsak razred - razen tistega z `!important`. Zato imajo pravila spodaj
 * `!important`, a VEDNO znotraj `@media (max-width: 767px)`.
 *
 * Hook `useJeTelefon` je samo za stvari, ki jih CSS ne zmore: vsebina menija
 * "⋯" in "Vec". Oboje se odpre sele na dotik, zato utripanja ni.
 */

import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react'

/** Barve blagajne (objekt `T` iz app/pos/page.tsx) - uporabljamo le te kljuce. */
export type Tema = {
  surface: string; surface2: string; ink: string; inkSoft: string; muted: string; line: string
  accent: string; accentSoft: string; danger: string; [kljuc: string]: unknown
}
type Ikona = React.ComponentType<{ name: string; size?: number }>
type Zaslon = { label: string; icon: string }

export const TELEFON_MQ = '(max-width: 767px)'

function narociNaSirino(cb: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  const mq = window.matchMedia(TELEFON_MQ)
  mq.addEventListener?.('change', cb)
  return () => mq.removeEventListener?.('change', cb)
}

/** Ali je zaslon ozek kot telefon (≤ 767 pik). Na strezniku vedno `false`. */
export function useJeTelefon(): boolean {
  return useSyncExternalStore(
    narociNaSirino,
    () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(TELEFON_MQ).matches,
    () => false,
  )
}

/**
 * Pravila za telefon. Razredi `pos-*` so dodani elementom v app/pos/page.tsx.
 * Zunaj media query je samo skrivanje elementov, ki obstajajo SAMO za telefon.
 */
export const POS_TELEFON_CSS = `
.pos-samo-telefon { display: none !important; }

@media (max-width: 767px) {
  .pos-samo-telefon { display: flex !important; }
  .pos-ni-telefon { display: none !important; }

  /* Celotna stran: dinamicna visina (Safari: 100vh sega pod orodno vrstico)
     in prostor za pasico predstavitve, ce je prikazana. */
  .pos-stran {
    height: 100dvh !important;
    padding-bottom: var(--demo-pasica-visina, 0px);
    box-sizing: border-box;
  }
  .pos-koren { padding-left: env(safe-area-inset-left); padding-right: env(safe-area-inset-right); box-sizing: border-box; }

  /* ── GLAVA: ena vrstica ── */
  .pos-glava {
    padding: calc(6px + env(safe-area-inset-top)) 10px 6px !important;
    gap: 8px !important;
    min-height: 56px !important;
  }
  .pos-glava-desno { gap: 6px !important; }
  .pos-ime-podjetja {
    max-width: 44vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .pos-profil-podnapis { display: none !important; }
  .pos-avatar-gumb { padding: 4px !important; min-width: 44px; min-height: 44px; justify-content: center; }
  .pos-avatar-ime { display: none !important; }
  .pos-avatar-krog { width: 36px !important; height: 36px !important; font-size: 13px !important; }
  .pos-kontekst { padding: 6px 12px !important; flex-wrap: wrap; row-gap: 4px !important; }
  .pos-kontekst button { min-width: 36px; min-height: 32px; justify-content: center; align-items: center; }

  /* Zvonec: gumb gre v meni "⋯", seznam opozoril pa cez cel zaslon. */
  .pos-zvonec-plosca {
    position: fixed !important; inset: 0 !important; width: auto !important;
    max-height: none !important; border-radius: 0 !important; z-index: 70 !important;
    padding-top: env(safe-area-inset-top); padding-bottom: env(safe-area-inset-bottom);
  }

  /* ── TELO ── */
  .pos-stranska { display: none !important; }

  /* ── PRODAJA: kategorije kot trak, artikli v mrezi, kosarica spodaj ── */
  .pos-prodaja { flex-direction: column !important; min-width: 0; }
  .pos-kat {
    width: auto !important; border-right: none !important;
    border-bottom: 1px solid rgba(26,31,26,0.10); flex-shrink: 0 !important;
  }
  .pos-kat-naslov { display: none !important; }
  .pos-kat-seznam {
    display: flex !important; flex-direction: row; flex-wrap: nowrap !important; gap: 6px;
    overflow-x: auto !important; overflow-y: hidden !important; flex: none !important;
    padding: 8px 10px !important; scrollbar-width: none; -webkit-overflow-scrolling: touch;
    overscroll-behavior-x: contain;
  }
  .pos-kat-seznam::-webkit-scrollbar { display: none; }
  .pos-kat-gumb {
    width: auto !important; flex: 0 0 auto; margin-bottom: 0 !important;
    min-height: 44px; padding: 5px 14px 5px 6px !important; border-radius: 999px !important;
    white-space: nowrap; border: 1px solid rgba(26,31,26,0.10) !important;
  }
  .pos-kat-chev { display: none !important; }

  .pos-artikli-orodja { padding: 8px 10px !important; gap: 6px !important; flex-wrap: nowrap !important; }
  .pos-artikli-iskalnik { max-width: none !important; min-width: 0; }
  .pos-artikli-iskalnik input { min-height: 44px; font-size: 16px !important; }
  .pos-artikli-orodja > button { min-height: 44px; min-width: 44px; justify-content: center; flex-shrink: 0; }
  .pos-artikli-stevec, .pos-hh-napis { display: none !important; }
  .pos-artikli-mreza {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    padding: 10px !important;
  }

  /* Pritrjena vrstica kosarice nad spodnjo navigacijo. */
  .pos-kosarica-vrstica {
    flex-shrink: 0; align-items: center; gap: 10px;
    padding: 8px 10px; background: #fff; border-top: 1px solid rgba(26,31,26,0.10);
  }

  /* Kosarica: skrita, dokler je ne odpres - takrat spodnji list cez cel zaslon. */
  .pos-kosarica { display: none !important; }
  .pos-kosarica.pos-kosarica-odprta {
    display: flex !important; position: fixed !important; inset: 0; z-index: 45;
    width: auto !important; border-left: none !important;
    padding-top: env(safe-area-inset-top);
    padding-bottom: calc(env(safe-area-inset-bottom) + var(--demo-pasica-visina, 0px));
    animation: pos-list-gor .18s ease-out;
  }
  .pos-kosarica .pos-kos-gumb { width: 44px !important; height: 44px !important; border-radius: 10px !important; }
  .pos-kosarica .pos-kos-kolicina { width: 30px !important; font-size: 15px !important; }
  .pos-kosarica .pos-kos-akcije button { min-height: 48px; }
  .pos-kosarica .pos-kos-placaj { min-height: 54px; font-size: 17px !important; }
  .pos-kosarica .pos-kos-glava { min-height: 56px; }
  .pos-kosarica .pos-kos-glava button { min-width: 44px; min-height: 44px; display: flex; align-items: center; justify-content: center; }

  .pos-meni-delo button { min-height: 44px; }

  /* ── MODALNA OKNA: cez cel zaslon ── */
  .pos-modal-ozadje { padding: 0 !important; align-items: stretch !important; }
  .pos-modal {
    width: 100% !important; max-width: 100% !important; height: 100%;
    max-height: 100% !important; border-radius: 0 !important; border: none !important;
    display: flex; flex-direction: column;
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
    box-sizing: border-box;
  }
  .pos-modal > * { flex-shrink: 0; }
  .pos-modal-glava { position: sticky; top: 0; background: #fff; z-index: 2; padding: 12px 14px !important; }
  .pos-modal-glava button { width: 44px !important; height: 44px !important; }

  /* Placilo: en stolpec, gumbi prilepljeni na dno. */
  .pos-placilo-mreza { grid-template-columns: minmax(0, 1fr) !important; flex: 1 0 auto !important; }
  .pos-placilo-mreza > div { padding: 14px !important; }
  .pos-placilo-povzetek { border-left: none !important; border-top: 1px solid rgba(0,0,0,0.06); }
  .pos-placilo-nacini button { min-height: 52px; }
  .pos-placilo-mreza button { min-height: 44px; }
  .pos-placilo-mreza input { min-height: 44px; font-size: 16px !important; }
  .pos-placilo-noga {
    position: sticky; bottom: 0; background: #fff; z-index: 2;
    flex-wrap: wrap; padding: 10px 14px 12px !important; row-gap: 8px !important;
    box-shadow: 0 -6px 16px rgba(0,0,0,0.06);
  }
  .pos-placilo-noga label { min-height: 44px; }
  .pos-placilo-noga input[type=checkbox] { width: 22px !important; height: 22px !important; }
  .pos-placilo-dodatki { flex-direction: column; gap: 12px !important; }
  .pos-placilo-mreza button { min-width: 48px; }
  .pos-placilo-gumbi { margin-left: 0 !important; width: 100%; }
  .pos-placilo-gumbi button { flex: 1; min-height: 52px; justify-content: center; }
  .pos-placilo-gumbi button:last-child { flex: 2; }

  /* ── PROSTORI: zavihki v eni vrstici, tloris se drsi ── */
  .pos-tloris-orodja { padding: 8px 10px !important; gap: 8px !important; }
  .pos-tloris-prostori { flex-wrap: nowrap !important; overflow-x: auto; min-width: 0; flex: 1; scrollbar-width: none; }
  .pos-tloris-prostori button { white-space: nowrap; min-height: 44px; flex-shrink: 0; }
  .pos-tloris-legenda { display: none !important; }
  .pos-tloris-orodja > div:last-child { margin-left: 0 !important; flex-shrink: 0; }
  .pos-tloris-orodja > div:last-child button { min-height: 44px; white-space: nowrap; }
  .pos-tloris-okvir { overflow: auto; -webkit-overflow-scrolling: touch; }
  .pos-tloris { flex: none !important; width: 720px; height: 640px; min-height: 100%; }

  /* ── SEZNAM + PODROBNOSTI (Nastavitve, Stranke): eno ali drugo, nikoli oboje ── */
  .pos-dvodelno { flex-direction: column !important; }
  .pos-dvodelno-seznam { width: auto !important; flex: 1 1 auto !important; border-right: none !important; min-height: 0; }
  .pos-dvodelno-seznam > button { min-height: 48px; font-size: 15px !important; }
  .pos-dvodelno-vsebina { display: none !important; }
  .pos-dvodelno-podrobno > .pos-dvodelno-seznam { display: none !important; }
  .pos-dvodelno-podrobno > .pos-dvodelno-vsebina { display: flex !important; flex-direction: column; flex: 1 1 auto !important; min-height: 0; }
  .pos-dvodelno-podrobno > div.pos-dvodelno-vsebina[style*="overflow"] { display: block !important; overflow: auto !important; padding: 12px !important; }
  .pos-nazaj {
    align-items: center; gap: 6px; min-height: 44px; padding: 0 12px 0 6px; margin: 0 0 10px;
    border: none; border-radius: 10px; background: #efeadf; color: #1a1f1a;
    font: inherit; font-weight: 700; font-size: 14px; cursor: pointer; align-self: flex-start;
  }
  .pos-nazaj svg { transform: rotate(180deg); }
  .pos-stranka-glava { padding: 10px 12px !important; }
  .pos-zaloga-glava { flex-wrap: wrap; gap: 10px !important; }
  .pos-zaloga-glava > div { flex-shrink: 0; }
  .pos-zaloga-glava > div[style*="margin-left: auto"] { margin-left: 0 !important; flex-wrap: wrap; flex-shrink: 1; }
  .pos-racun-glava { flex-wrap: wrap; padding: 10px 12px !important; row-gap: 8px !important; }
  .pos-racun-glava button { min-height: 44px; min-width: 44px; }
  .pos-racuni-iskanje { flex-wrap: wrap; row-gap: 6px !important; padding: 8px 10px !important; }
  .pos-racuni-iskanje input { flex: 1 1 100% !important; min-height: 44px; font-size: 16px !important; }
  .pos-racuni-iskanje > div { white-space: normal !important; }
  .pos-stranka-vrstica { flex-wrap: wrap; row-gap: 10px !important; }
  .pos-stranka-vrstica > div:nth-child(2) { flex: 1 1 0 !important; min-width: 0; }
  .pos-stranka-vrstica > div:last-child { width: 100%; }
  .pos-stranka-vrstica > div:last-child button { flex: 1; justify-content: center; min-height: 44px; }

  /* Mreze v zaslonih in oknih: stolpci s fiksno sirino (npr. "1fr 280px") ali
     4 enaki stolpci na telefonu ne gredo - zlozimo jih. Izbiramo po vrisanem
     slogu, ker ga zapisuje React ("grid-template-columns: 1fr 280px"). */
  .pos-vsebina [style*="grid-template-columns: 1fr 2"], .pos-vsebina [style*="grid-template-columns: 1fr 3"],
  .pos-vsebina [style*="grid-template-columns: 2fr 1fr"], .pos-vsebina [style*="grid-template-columns: 3fr"],
  .pos-modal [style*="grid-template-columns: 1fr 2"], .pos-modal [style*="grid-template-columns: 1fr 3"] {
    grid-template-columns: minmax(0, 1fr) !important;
  }
  .pos-vsebina [style*="grid-template-columns: repeat(4"], .pos-vsebina [style*="grid-template-columns: repeat(5"],
  .pos-vsebina [style*="grid-template-columns: repeat(6"] {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  }
  .pos-zavihki { flex-wrap: nowrap !important; overflow-x: auto; scrollbar-width: none; }
  .pos-zavihki button { white-space: nowrap; min-height: 44px; flex-shrink: 0; }

  /* ── DRUGI ZASLONI: brez vodoravnega drsenja strani ── */
  .pos-vsebina { min-width: 0; }
  .pos-zaslon > * { min-width: 0; }
  /* Tabele se drsijo ZNOTRAJ svojega okvirja, stran pa ne. */
  :where(.pos-vsebina, .pos-modal) table {
    display: block; max-width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch;
  }
  :where(.pos-vsebina, .pos-modal) th, :where(.pos-vsebina, .pos-modal) td { white-space: nowrap; }
  .pos-drsna-tabela { overflow-x: auto !important; -webkit-overflow-scrolling: touch; max-width: 100%; }

  /* Vrstice z gumbi (orodne vrstice zaslonov): ce ne gre v eno vrstico, se
     prelomijo v dve - namesto da se gumbi stisnejo na eno crko sirine.
     :where() ima nicelno specificnost, zato zgornja pravila z razredi
     (npr. .pos-artikli-orodja) se vedno veljajo. Ce vrstica gre v eno
     vrstico, prelom nima ucinka. */
  :where(.pos-vsebina) div:has(> button) { flex-wrap: wrap; row-gap: 8px; }
  :where(.pos-vsebina) div:has(> button) > button { max-width: 100%; }
}

@media (min-width: 400px) and (max-width: 767px) {
  .pos-artikli-mreza { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
}

@keyframes pos-list-gor { from { transform: translateY(24px); opacity: .6; } to { transform: none; opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .pos-kosarica.pos-kosarica-odprta { animation: none; } }
`

/** Spodnji list (bottom sheet) - za meni "⋯" in "Vec". */
export function SpodnjiList({ odprt, onZapri, naslov, children, T }: {
  odprt: boolean; onZapri: () => void; naslov: string; children: React.ReactNode; T: Tema
}) {
  useEffect(() => {
    if (!odprt) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onZapri() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [odprt, onZapri])
  if (!odprt) return null
  return (
    <div onClick={onZapri} role="presentation"
      style={{ position:'fixed', inset:0, zIndex:65, background:'rgba(15,20,18,0.5)', display:'flex', alignItems:'flex-end' }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-label={naslov}
        style={{ width:'100%', maxHeight:'88dvh', overflowY:'auto', background:T.surface, color:T.ink,
          borderRadius:'16px 16px 0 0', boxShadow:'0 -12px 40px rgba(0,0,0,0.25)',
          paddingBottom:'calc(12px + env(safe-area-inset-bottom) + var(--demo-pasica-visina, 0px))',
          animation:'pos-list-gor .18s ease-out' }}>
        <div style={{ display:'flex', alignItems:'center', padding:'8px 8px 4px 18px', position:'sticky', top:0, background:T.surface }}>
          <div style={{ flex:1, fontWeight:800, fontSize:16 }}>{naslov}</div>
          <button onClick={onZapri} aria-label="Zapri"
            style={{ width:44, height:44, border:'none', background:'transparent', fontSize:24, lineHeight:1, color:T.muted, cursor:'pointer' }}>×</button>
        </div>
        <div style={{ padding:'0 12px' }}>{children}</div>
      </div>
    </div>
  )
}

/** Vrstica v spodnjem listu - dovolj visoka za palec (52 pik). */
export function VrsticaLista({ ikona, napis, desno, onClick, T, poudarjeno = false, nevarno = false }: {
  ikona?: React.ReactNode; napis: React.ReactNode; desno?: React.ReactNode; onClick?: () => void; T: Tema; poudarjeno?: boolean; nevarno?: boolean
}) {
  const vsebina = (
    <>
      {ikona && <span style={{ width:28, display:'flex', justifyContent:'center', color: nevarno ? T.danger : poudarjeno ? T.accent : T.inkSoft }}>{ikona}</span>}
      <span style={{ flex:1, textAlign:'left', fontWeight:600, fontSize:15, color: nevarno ? T.danger : T.ink }}>{napis}</span>
      {desno != null && <span style={{ fontWeight:700, fontSize:15, color:T.inkSoft, fontVariantNumeric:'tabular-nums' }}>{desno}</span>}
    </>
  )
  const slog: React.CSSProperties = { width:'100%', minHeight:52, display:'flex', alignItems:'center', gap:12, padding:'8px 10px',
    borderRadius:12, border:'none', background: poudarjeno ? T.accentSoft : 'transparent', fontFamily:'inherit', boxSizing:'border-box' }
  if (!onClick) return <div style={slog}>{vsebina}</div>
  return <button onClick={onClick} style={{ ...slog, cursor:'pointer' }}>{vsebina}</button>
}

// Vrstni red, ce uporabnik menija ni uredil sam: prodaja je vedno prva.
const PREDNOST = ['sale', 'floor', 'calendar', 'orders', 'customers', 'kitchen', 'packages', 'inventory', 'inventura', 'opravila', 'reports', 'admin']

/**
 * Spodnja navigacija: 4 najpogostejsi zasloni + "Vec".
 *
 * `nav` je ZE filtriran po pravicah (screenPerm) in profilu, zato skritih
 * zaslonov tu ni. Ce je uporabnik levi meni uredil po svoje (shranjeno na
 * napravi), velja njegov vrstni red - tako kot v levem meniju.
 */
export function SpodnjaNavigacija({ nav, screen, setScreen, staffId, SCREENS, Ikona, T }: {
  nav: string[]; screen: string; setScreen: (id: string) => void; staffId?: string; SCREENS: Record<string, Zaslon>; Ikona: Ikona; T: Tema
}) {
  const [vecOdprt, setVecOdprt] = useState(false)
  // Blagajna se izrise sele v brskalniku (po preverjanju prijave), zato je
  // branje lokalne shrambe med izrisom varno.
  const vrstniRed = useMemo<string[] | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      const shranjen: unknown = JSON.parse(localStorage.getItem('pos_nav_vrstni_red_' + (staffId || 'skupno')) || 'null')
      return Array.isArray(shranjen) && shranjen.length ? shranjen.map(String) : null
    } catch { return null }
  }, [staffId])

  const dostopni = nav.filter(id => SCREENS[id])
  const urejeni = vrstniRed
    ? [...vrstniRed.filter(id => dostopni.includes(id)), ...dostopni.filter(id => !vrstniRed.includes(id))]
    : [...PREDNOST.filter(id => dostopni.includes(id)), ...dostopni.filter(id => !PREDNOST.includes(id))]
  const glavni = urejeni.slice(0, 4)
  const ostali = urejeni.slice(4)
  const vecAktiven = ostali.includes(screen)

  const gumb = (id: string | null, napis: string, ikona: React.ReactNode, aktiven: boolean, onClick: () => void) => (
    <button key={id || 'vec'} onClick={onClick} aria-current={aktiven ? 'page' : undefined}
      style={{ flex:1, minWidth:0, minHeight:56, padding:'6px 2px 4px', border:'none', background:'transparent', cursor:'pointer',
        fontFamily:'inherit', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:3,
        color: aktiven ? T.accent : T.muted, position:'relative' }}>
      {aktiven && <span style={{ position:'absolute', top:0, left:'22%', right:'22%', height:3, borderRadius:'0 0 3px 3px', background:T.accent }}/>}
      {ikona}
      <span style={{ fontSize:11, fontWeight:700, lineHeight:1.1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:'100%' }}>{napis}</span>
    </button>
  )

  return (
    <>
      <nav className="pos-samo-telefon" aria-label="Glavni meni blagajne"
        style={{ flexShrink:0, background:T.surface, borderTop:'1px solid '+T.line, padding:'0 4px env(safe-area-inset-bottom)', boxShadow:'0 -4px 14px rgba(0,0,0,0.05)' }}>
        {glavni.map(id => gumb(id, SCREENS[id].label.split(' ')[0], <Ikona name={SCREENS[id].icon} size={22}/>, screen === id, () => setScreen(id)))}
        {gumb(null, 'Več', <span style={{ fontSize:22, lineHeight:'22px', fontWeight:800, letterSpacing:1 }}>⋯</span>, vecAktiven || vecOdprt, () => setVecOdprt(true))}
      </nav>
      <SpodnjiList odprt={vecOdprt} onZapri={() => setVecOdprt(false)} naslov="Več zaslonov" T={T}>
        {ostali.map(id => (
          <VrsticaLista key={id} T={T} ikona={<Ikona name={SCREENS[id].icon} size={20}/>} napis={SCREENS[id].label}
            poudarjeno={screen === id} onClick={() => { setVecOdprt(false); setScreen(id) }}/>
        ))}
        <VrsticaLista T={T} ikona={<span style={{ fontSize:18, fontWeight:800 }}>?</span>} napis="Pomoč"
          onClick={() => { setVecOdprt(false); window.dispatchEvent(new CustomEvent('racunko-pomoc')) }}/>
      </SpodnjiList>
    </>
  )
}
