const { app, BrowserWindow, Menu, shell, dialog, ipcMain, net, safeStorage } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('path')
const fs = require('fs')
const os = require('os')
const express = require('express')
const cors = require('cors')
const http = require('http')
const crypto = require('crypto')

// PRELET 158: node-forge za lokalni izracun ZOI (podpis z namenskim
// potrdilom). `require` je ovit, da aplikacija DELUJE tudi, ce paket se ni
// namescen (stara namestitev brez `npm install`) - takrat ZOI brez povezave
// preprosto ni na voljo in blagajna to jasno pove.
let forge = null
try { forge = require('node-forge') } catch { console.warn('node-forge ni namescen - izracun ZOI brez povezave ne bo na voljo') }

const POS_URL = 'https://računko.si/pos'

// ── DELOVANJE BREZ POVEZAVE (prelet 158) ──────────────────────────
//
// SAMODEJNO PONOVNO POVEZOVANJE: ko se glavno okno ne nalozi (izpad
// interneta ob zagonu), pokazemo assets/offline.html in vsakih 5 sekund
// preverimo dosegljivost streznika. KAKRSENKOLI odgovor streznika (tudi
// preusmeritev ali 4xx) pomeni, da povezava JE - takrat okno samo nalozi
// blagajno nazaj. Osebju ni treba narediti nicesar.
let casovnikPonovnegaPovezovanja = null

function zazeniPonovnoPovezovanje() {
  if (casovnikPonovnegaPovezovanja) return
  console.log('Streznik ni dosegljiv - samodejno preverjanje vsakih 5 s')
  casovnikPonovnegaPovezovanja = setInterval(poskusiPovezavo, 5000)
}

function ustaviPonovnoPovezovanje() {
  if (casovnikPonovnegaPovezovanja) {
    clearInterval(casovnikPonovnegaPovezovanja)
    casovnikPonovnegaPovezovanja = null
  }
}

function poskusiPovezavo() {
  return new Promise((resolve) => {
    try {
      const zahteva = net.request({ method: 'HEAD', url: POS_URL })
      zahteva.on('response', () => {
        ustaviPonovnoPovezovanje()
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.loadURL(POS_URL)
        resolve(true)
      })
      zahteva.on('error', () => resolve(false))
      zahteva.end()
    } catch { resolve(false) }
  })
}

// ── FURS POTRDILO NA NAPRAVI (prelet 158) ─────────────────────────
//
// ZAKAJ: FURS v pogostih vprasanjih izrecno pravi, da se ob potrdilu
// "v oblaku" izpad interneta steje za NEDELOVANJE naprave - racun se sme
// takrat izdati le iz vezane knjige racunov. Da blagajna brez povezave
// izda VELJAVEN racun z ZOI (9. clen ZDavPR), mora biti namensko potrdilo
// fizicno na napravi. Spletna blagajna ga ob zagonu (s povezavo, prijavljen
// lastnik) prenese sem; shranimo ga sifrirano prek OS shrambe kljucev
// (safeStorage), s cistim zapisom samo tam, kjer OS sifriranja ne ponuja.
function potFursPotrdila() {
  return path.join(app.getPath('userData'), 'furs-potrdilo.bin')
}

function shraniFursPotrdilo(paket) {
  const besedilo = JSON.stringify(paket)
  let vsebina
  let sifrirano = false
  try {
    if (safeStorage.isEncryptionAvailable()) {
      vsebina = Buffer.concat([Buffer.from('ENC1'), safeStorage.encryptString(besedilo)])
      sifrirano = true
    }
  } catch {}
  if (!vsebina) vsebina = Buffer.concat([Buffer.from('PLN1'), Buffer.from(besedilo, 'utf8')])
  fs.writeFileSync(potFursPotrdila(), vsebina)
  return sifrirano
}

function preberiFursPotrdilo() {
  try {
    const surovo = fs.readFileSync(potFursPotrdila())
    const glava = surovo.subarray(0, 4).toString()
    const telo = surovo.subarray(4)
    const besedilo = glava === 'ENC1'
      ? safeStorage.decryptString(telo)
      : telo.toString('utf8')
    return JSON.parse(besedilo)
  } catch { return null }
}

// 60-mestna koda za QR po Pravilniku o izvajanju ZDavPR:
// ZOI v desetiskem zapisu (39 mest) + davcna (8) + LLMMDDUUMMSS (12) +
// kontrolni znak (vsota vseh stevilk po modulu 10).
function zoi60(zoiHex, davcna, issueDatetimeIso) {
  try {
    const cist = String(zoiHex || '').toLowerCase().replace(/[^0-9a-f]/g, '')
    const stevilka = String(davcna || '').replace(/\D/g, '')
    if (cist.length !== 32 || stevilka.length !== 8) return null
    const d = issueDatetimeIso ? new Date(issueDatetimeIso) : new Date()
    if (isNaN(d.getTime())) return null
    const p = (n) => String(n).padStart(2, '0')
    const datum = p(d.getFullYear() % 100) + p(d.getMonth() + 1) + p(d.getDate())
      + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds())
    const osnova = BigInt('0x' + cist).toString(10).padStart(39, '0') + stevilka + datum
    let vsota = 0
    for (const znak of osnova) vsota += znak.charCodeAt(0) - 48
    return osnova + String(vsota % 10)
  } catch { return null }
}

// ── Printer config ────────────────────────────────────────────────
function getPrinterConfigPath() {
  return path.join(app.getPath('userData'), 'printer-config.json')
}
function loadPrinterConfig() {
  try { return JSON.parse(fs.readFileSync(getPrinterConfigPath(), 'utf8')) } catch { return {} }
}
function savePrinterConfig(config) {
  try { fs.writeFileSync(getPrinterConfigPath(), JSON.stringify(config, null, 2), 'utf8'); return true } catch { return false }
}
// ── ESC/POS generator ────────────────────────────────────────────
function buildEscPos(data) {
  const ESC = 0x1B, GS = 0x1D, LF = 0x0A
  const buf = []
  const b = (...v) => buf.push(...v)
  const lf = () => b(LF)

  /**
   * ŠUMNIKI NA RAČUNU (prelet 189)
   * ══════════════════════════════
   *
   * PREJ: vsi sumniki so bili zamenjani z ASCII (c, s, z), ker je tiskalnik
   * delal na kodni strani Windows-1252, ki jih nima. Zato je v nogi pisalo
   * "www.racunko.si" - naslov, ki pripada DRUGEMU podjetju (racunovodski
   * servis RACUNKO d.o.o. iz Kamnika). Enako so bila popacena imena
   * artiklov, blagajnikov in klavzule DDV.
   *
   * PREIZKUS NA TISKALNIKU je pokazal, da razume KODNO STRAN 18 (CP852,
   * Latin-2). Vrednosti niso ugibane - vzete so iz kodne tabele:
   *   c 0x9F   C 0xAC   s 0xE7   S 0xE6   z 0xA7   Z 0xA6
   *   c 0x86   C 0x8F   d 0xD0   D 0xD1        (c/C s streho, d/D s crtico)
   *
   * ZAPLET: CP852 NIMA evro znaka, CP1252 pa nima crke c s streho. Ker je
   * ASCII v obeh straneh IDENTICEN, med njima preklapljamo sproti: pred
   * sumnikom na 18, pred evrom na 16. Preklop se izvede samo ob dejanski
   * spremembi, zato je dodatnih bajtov malo.
   */
  const CP852 = { '\u010d':0x9F, '\u010c':0xAC, '\u0161':0xE7, '\u0160':0xE6,
                  '\u017e':0xA7, '\u017d':0xA6, '\u0107':0x86, '\u0106':0x8F,
                  '\u0111':0xD0, '\u0110':0xD1 }
  let stranZdaj = 0x10                       // init nastavi Windows-1252
  const nastaviStran = (n) => { if (stranZdaj !== n) { b(ESC, 0x74, n); stranZdaj = n } }

  // Ohrani znake, ki jih ZNAMO natisniti; ostalo v vprasaj. Dolzina niza
  // ostane enaka stevilu natisnjenih mest, zato poravnave ostanejo pravilne.
  const sl = (s) => (String(s||''))
    .replace(/\u00e9/g,'e').replace(/\u00e8/g,'e')
    .replace(/[^\x20-\x7E\u010d\u010c\u0161\u0160\u017e\u017d\u0107\u0106\u0111\u0110\u20AC\u0080]/g,'?')

  const zapisi = (s) => {
    for (const c of String(s == null ? '' : s)) {
      const k = c.charCodeAt(0)
      if (k >= 0x20 && k <= 0x7E) { b(k); continue }        // ASCII: obe strani enaki
      if (c === '\u20AC' || k === 0x80) { nastaviStran(0x10); b(0x80); continue }
      const cp = CP852[c]
      if (cp !== undefined) { nastaviStran(0x12); b(cp); continue }
      b(0x3F)
    }
  }

  const txt = (s) => zapisi(sl(s))
  const txtRaw = (s) => zapisi(s)
  const pad = (s, n, right) => {
    const t = sl(s).slice(0, n)
    const p = ' '.repeat(Math.max(0, n - t.length))
    return right ? p + t : t + p
  }
  /**
   * SIRINA RACUNA (prelet 170)
   * ═════════════════════════
   *
   * NAPAKA, KI JO TO ODPRAVLJA: generator je racunal s 42 znaki na vrstico,
   * 80 mm trak pa jih pri osnovni pisavi (Font A, 12 pik na znak, 576 pik
   * tiskalne sirine) sprejme 48. Vse levo poravnano je bilo zato stisnjeno
   * v levih 87 % traku, crtkane locilne vrstice so se koncale sest znakov
   * pred robom, desno poravnani zneski pa niso sedeli ob desnem robu.
   * Glava in "SKUPAJ" sta bila videti sredinsko poravnana, ker ju tiskalnik
   * centrira sam (ESC a 1) cez CELO sirino - od tod vtis, da je racun
   * zamaknjen v levo.
   *
   * Podpiramo tudi 58 mm trakove (32 znakov), ce jih kdaj prikljucite -
   * takrat naj klic tiskanja poslje `paper_width: 58`.
   */
  const SIRINA = Number(data.paper_width) === 58 ? 32 : 48
  /**
   * POPRAVLJENO (prelet 177): na racunu je pri popustu pisalo "-?0,80"
   * namesto "-\u20AC0,80".
   *
   * VZROK: `sl()` na koncu izvede `.replace(/[^\x20-\x7E]/g,'?')`, kar vse
   * izven osnovnega ASCII zamenja z vprasajem. Evro je v kodni strani
   * Windows-1252 bajt 0x80 in pade v to past.
   *
   * Vrstice artiklov in SKUPAJ so bile pravilne, ker gredo naravnost skozi
   * `txtRaw()`, ki bajt 0x80 prepozna in ga zapise nespremenjenega. Skozi
   * `line()` pa je sel vsak del NAJPREJ skozi `sl()` - in tam je evro izginil.
   * Prizadeti sta bili vrstici Popust in Napitnina, torej edini dve, ki
   * uporabljata `line()` skupaj z `eur()`.
   *
   * Resitev: besedilo razdelimo NA evro znaku, vsak del posebej ocistimo
   * in zlepimo nazaj z evrom vmes - ta tako sploh ne gre skozi ciscenje.
   * (Prvi poskus z nadomestnim znakom \u0001 ni deloval: tudi ta je izven
   * ASCII in ga je `sl()` zamenjal z vprasajem.)
   */
  // PRELET 189: zascita evra iz preleta 177 ni vec potrebna - `sl()` evra
  // in sumnikov ne odstranjuje vec, `zapisi()` pa oboje zna natisniti.
  const line = (l, r, width=SIRINA) => {
    const li = sl(l), ri = sl(r)
    const lp = li.slice(0, width - ri.length - 1)
    txtRaw(lp + ' '.repeat(Math.max(1, width - lp.length - ri.length)) + ri); lf()
  }
  const sep = (ch='-', w=SIRINA) => { txt(ch.repeat(w)); lf() }
  const eur = (n) => {
    // V CP1252 je euro znak byte 0x80 — dodamo ga direktno v buffer
    const s = Number(n||0).toFixed(2).replace('.', ',')
    return '\x80' + s  // 0x80 = € v Windows-1252
  }

  // Init + code page 16 (Windows-1252) — podpira euro znak 0x80
  b(ESC,0x40, ESC,0x74,0x10)
  // Center
  b(ESC,0x61,0x01)
  // Header bold
  b(ESC,0x45,0x01)
  txt(data.business_name || 'SIRM fitness&bar'); lf()
  b(ESC,0x45,0x00)
  if (data.business_address) { txt(data.business_address); lf() }
  if (data.tax_number) { txt('Dav\u010dna: ' + data.tax_number); lf() }
  if (data.vat_id) { txt('ID DDV: ' + data.vat_id); lf() }
  // PE - poslovna enota (center)
  if (data.premise_id || data.premise_address) {
    lf()
    b(ESC,0x61,0x01) // center
    txt('PE: ' + (data.premise_id||'') + (data.premise_address ? ', ' + data.premise_address : '')); lf()
    b(ESC,0x61,0x00) // left
  }
  // Kopija
  if (data.is_copy) {
    b(ESC,0x61,0x01)
    b(ESC,0x45,0x01)
    txt('*** KOPIJA ***'); lf()
    b(ESC,0x45,0x00)
    b(ESC,0x61,0x00)
  }
  lf()
  // Left align
  b(ESC,0x61,0x00)
  sep()
  line('Ra\u010dun \u0161t.:', data.receipt_number || '')
  line('Datum:', data.date || '')
  line('Blagajnik:', data.cashier || '')
  line('Pla\u010dilo:', data.payment_method === 'card' ? 'Kartica' : data.payment_method === 'bon' ? 'Bon' : 'Gotovina')
  sep()
  // Artikli
  for (const item of (data.items||[])) {
    const name = sl(item.name||'').slice(0,SIRINA)
    txt(name); lf()
    const qty = Number(item.qty||1)
    const up  = Number(item.unit_price||0)
    const tot = qty * up
    txtRaw('  ' + qty + ' x ' + eur(up) + '   ' + eur(tot)); lf()
  }
  sep()
  // Popust
  //
  // POPRAVLJENO (prelet 179): na racunu je pisalo samo "Popust: -0,80",
  // iz cesar kupec ni videl, ali gre za odstotek ali za fiksni znesek.
  // Zdaj se odstotek izpise v oznaki: "Popust 5%:". Ce sta uporabljena
  // oba, se izpiseta v dveh vrsticah, da je razvidno, od kod znesek.
  if (Number(data.discount_amount||0) > 0) {
    const odstotek = Number(data.discount_pct||0)
    const fiksni   = Number(data.discount_fixed||0)
    if (odstotek > 0 && fiksni > 0) {
      const izOdstotka = Math.round((Number(data.subtotal||0) * odstotek / 100) * 100) / 100
      line('Popust ' + odstotek + '%:', '-' + eur(izOdstotka))
      line('Popust:', '-' + eur(fiksni))
    } else if (odstotek > 0) {
      line('Popust ' + odstotek + '%:', '-' + eur(data.discount_amount))
    } else {
      line('Popust:', '-' + eur(data.discount_amount))
    }
  }
  // Napitnina
  if (Number(data.tip||0) > 0) {
    line('Napitnina:', '+' + eur(data.tip))
  }
  // Skupaj — vecja pisava
  sep('=')
  b(ESC,0x61,0x01, GS,0x21,0x11) // center + 2x
  txtRaw('SKUPAJ  ' + eur(data.total)); lf()
  b(GS,0x21,0x00, ESC,0x61,0x00) // reset
  sep('=')
  // DDV tabela
  txt('OBRA\u010cUN DDV'); lf()
  // PRELET 170: zadnji stolpec poravnamo na desni rob traku, sicer tabela
  // na 48-znakovnem traku "visi" v levi polovici.
  const stolpec = Math.max(8, Math.floor((SIRINA - 10) / 3))
  txt(pad('##',3) + pad('DDV%',7) + pad('NETO',stolpec,true) + pad('DDV',stolpec,true) + pad('BRUTO',stolpec,true)); lf()
  const total = Number(data.total||0)
  const vatR  = 22
  const neto  = total / (1 + vatR/100)
  const ddv   = total - neto
  txt(pad('C',3) + pad(vatR+'%',7) + pad(neto.toFixed(2),stolpec,true) + pad(ddv.toFixed(2),stolpec,true) + pad(total.toFixed(2),stolpec,true)); lf()
  txt('C: DDV ' + vatR + '% stopnja'); lf()
  sep()
  /**
   * DNEVNA ŠTEVILKA ZA POSTREŽBO (prelet 192)
   *
   * Izpisana je veliko in loceno, da jo gost in natakar takoj vidita.
   * Pojavi se SAMO pri narocilih s kuhinjskim artiklom.
   */
  if (data.kitchen_number) {
    sep('=')
    b(ESC,0x61,0x01)            // sredinsko
    b(GS,0x21,0x11)             // dvojna visina in sirina
    txt('NARO\u010cILO ' + data.kitchen_number); lf()
    b(GS,0x21,0x00)
    txt('Po\u010dakajte na klic'); lf()
    b(ESC,0x61,0x00)
    sep('=')
  }

  // PRELET 175: kupec na racunu, kadar je izdan na podjetje.
  if (data.buyer_name) {
    sep()
    txt('KUPEC:'); lf()
    txt(sl(data.buyer_name)); lf()
    if (data.buyer_address) { txt(sl(data.buyer_address)); lf() }
    if (data.buyer_tax_number) { txt('Dav\u010dna: SI' + sl(data.buyer_tax_number)); lf() }
  }

  // FURS
  if (data.furs_zoi) { txt('ZOI: ' + data.furs_zoi); lf() }
  if (data.furs_eor) { txt('EOR: ' + data.furs_eor); lf() }
  if (data.offline && data.furs_zoi && !data.furs_eor) {
    // Racun, izdan BREZ POVEZAVE (9. clen ZDavPR): EOR se ni dodeljen,
    // kupcu pa je posteno povedati, zakaj ga na racunu ni.
    txt('Ra\u010dun izdan brez povezave.'); lf()
    txt('EOR bo pridobljen naknadno.'); lf()
  }
  // POPRAVLJENO (prelet 158): QR koda je prej vsebovala EOR. Pravilnik o
  // izvajanju ZDavPR pa predpisuje 60-mestno kodo IZ ZOI (ZOI v desetiskem
  // zapisu + davcna + datum/cas + kontrolni znak) - FURS-ova aplikacija
  // "Preveri racun" zna prebrati SAMO to. EOR ostane v tekstovni obliki.
  // Ista koda se izrise tudi na racunu BREZ povezave - ZOI takrat ze obstaja.
  const zoiKoda = zoi60(data.furs_zoi, data.tax_number, data.issue_datetime)
  if (zoiKoda) {
    b(ESC,0x61,0x01) // center
    const qrData = Buffer.from(zoiKoda, 'utf8')
    const qrLen = qrData.length + 3
    b(GS,0x28,0x6B, 4,0, 0x31,0x41,0x32,0x00)            // model 2
    b(GS,0x28,0x6B, 3,0, 0x31,0x43,0x06)                  // size 6 (vecja)
    b(GS,0x28,0x6B, 3,0, 0x31,0x45,0x30)                  // error L (Pravilnik)
    b(GS,0x28,0x6B, qrLen&0xFF,(qrLen>>8)&0xFF, 0x31,0x50,0x30)
    for (let i = 0; i < qrData.length; i++) b(qrData[i])
    b(GS,0x28,0x6B, 3,0, 0x31,0x51,0x30)                  // print
    lf()
    b(ESC,0x61,0x00) // left
  }
  if (data.furs_zoi || data.furs_eor) sep()
  // Footer
  b(ESC,0x61,0x01)
  txt('Hvala za obisk!'); lf()
  txt('Izdano s sistemom RA\u010cUNKO'); lf()
  // PRELET 189: prava domena s sumnikom. Prej je pisalo "www.racunko.si",
  // kar je naslov drugega podjetja - gost, ki bi ga prepisal v brskalnik,
  // bi pristal pri racunovodskem servisu iz Kamnika.
  txt('ra\u010dunko.si'); lf()
  lf(); lf(); lf()
  // Cut
  b(GS,0x56,0x42,0x00)
  return Buffer.from(buf)
}

async function rawPrintWindows(printerName, buffer) {
  return new Promise((resolve) => {
    const { exec } = require('child_process')
    const stamp  = Date.now()
    const tmpDir = require('os').tmpdir()
    const tmpBin = require('path').join(tmpDir, `racunko-raw-${stamp}.bin`)
    const tmpPs  = require('path').join(tmpDir, `racunko-raw-${stamp}.ps1`)

    require('fs').writeFileSync(tmpBin, buffer)

    // Zapisi .ps1 skript v temp fajl (izognemo se heredoc problemu v exec)
    const escapedBin = tmpBin.replace(/\\/g, '\\\\')
    const escapedPrinter = printerName.replace(/"/g, '`"')
    const psScript = `
$ErrorActionPreference = 'Stop'
$bytes = [System.IO.File]::ReadAllBytes("${escapedBin}")
$code = @"
using System;
using System.Runtime.InteropServices;
public class RawPrint {
  [DllImport("winspool.drv", EntryPoint="OpenPrinterA")]
  public static extern bool OpenPrinter(string n, out IntPtr h, IntPtr d);
  [DllImport("winspool.drv")]
  public static extern bool StartDocPrinter(IntPtr h, int l, ref DOC_INFO_1 di);
  [DllImport("winspool.drv")]
  public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv")]
  public static extern bool WritePrinter(IntPtr h, byte[] b, int cb, out int w);
  [DllImport("winspool.drv")]
  public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv")]
  public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv")]
  public static extern bool ClosePrinter(IntPtr h);
  [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)]
  public struct DOC_INFO_1 {
    [System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.LPStr)]
    public string pDocName;
    [System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.LPStr)]
    public string pOutputFile;
    [System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.LPStr)]
    public string pDatatype;
  }
}
"@
Add-Type -TypeDefinition $code -Language CSharp
$h = [IntPtr]::Zero
[RawPrint]::OpenPrinter("${escapedPrinter}", [ref]$h, [IntPtr]::Zero) | Out-Null
$di = New-Object RawPrint+DOC_INFO_1
$di.pDocName = "Racun"
$di.pDatatype = "RAW"
[RawPrint]::StartDocPrinter($h, 1, [ref]$di) | Out-Null
[RawPrint]::StartPagePrinter($h) | Out-Null
$w = 0
[RawPrint]::WritePrinter($h, $bytes, $bytes.Length, [ref]$w) | Out-Null
[RawPrint]::EndPagePrinter($h) | Out-Null
[RawPrint]::EndDocPrinter($h) | Out-Null
[RawPrint]::ClosePrinter($h) | Out-Null
Write-Output "OK:$w"
`
    require('fs').writeFileSync(tmpPs, psScript, 'utf8')

    exec(`powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${tmpPs}"`,
      { timeout: 15000 },
      (err, stdout, stderr) => {
        try { require('fs').unlinkSync(tmpBin) } catch {}
        try { require('fs').unlinkSync(tmpPs)  } catch {}
        if (err) {
          console.error('PS raw print error:', stderr || err.message)
          resolve({ ok: false, error: stderr || err.message })
        } else {
          console.log('PS raw print OK:', stdout.trim())
          resolve({ ok: true })
        }
      }
    )
  })
}

async function getSelectedPrinterName(webContents) {
  const config = loadPrinterConfig()
  if (config.printerName) return config.printerName
  try {
    const printers = await webContents.getPrintersAsync()
    const thermalNames = ['rongta', 'epson', 'star', 'bixolon', 'xprinter', 'rp80', 'tm-t', 'tsp']
    const thermal = printers.find(p => thermalNames.some(n => p.name.toLowerCase().includes(n)))
    const defaultP = printers.find(p => p.isDefault)
    return (thermal || defaultP || printers[0])?.name || ''
  } catch { return '' }
}
const PRINT_PORT = 6789

let mainWindow = null
let printServer = null
// PRELET 183: nastavi jo `setupIpcHandlers()`; uporablja jo meni Orodja.
let preizkusSumnikov = async () => ({ ok: false, error: 'Tiskanje se ni pripravljeno.' })

// ── Auto-updater ──────────────────────────────────────────────────
function setupAutoUpdater() {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    console.log('Nova verzija na voljo:', info.version)
  })

  autoUpdater.on('update-downloaded', (info) => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Posodobitev pripravljena',
      message: `Nova verzija ${info.version} je bila prenesena. Aplikacija se bo posodobila ob naslednjem zagonu.`,
      buttons: ['Posodobi zdaj', 'Kasneje']
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall()
      }
    })
  })

  autoUpdater.on('error', (err) => {
    console.log('Auto-updater napaka:', err.message)
  })

  // Preveri za posodobitve ob zagonu (po 3 sekundah)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(err => {
      console.log('Preverjanje posodobitev napaka:', err.message)
    })
  }, 3000)
}


// ── IPC print handlers ────────────────────────────────────────────
function setupIpcHandlers() {
  ipcMain.handle('print-receipt', async (event, html) => {
    return new Promise((resolve) => {
      try {
        const tmpFile = require('path').join(require('os').tmpdir(), `racunko-receipt-${Date.now()}.html`)
        require('fs').writeFileSync(tmpFile, html, 'utf8')
        const printWin = new BrowserWindow({
          show: false,
          webPreferences: { nodeIntegration: false, contextIsolation: true }
        })
        printWin.loadFile(tmpFile)
        printWin.webContents.on('did-finish-load', () => {
          // Delay 400ms da se stran popolnoma naloži pred tiskanjem
          setTimeout(async () => {
            try {
              const deviceName = await getSelectedPrinterName(printWin.webContents)
              console.log('Tiskam na:', deviceName || '(default)')
              printWin.webContents.print(
                { silent: true, printBackground: true, deviceName },
                (success, errorType) => {
                  printWin.close()
                  try { require('fs').unlinkSync(tmpFile) } catch {}
                  resolve({ ok: success, error: success ? null : errorType })
                }
              )
            } catch (e) {
              printWin.close()
              resolve({ ok: false, error: e.message })
            }
          }, 400)
        })
        printWin.webContents.on('did-fail-load', (event, code, desc) => {
          printWin.close()
          try { require('fs').unlinkSync(tmpFile) } catch {}
          resolve({ ok: false, error: desc })
        })
      } catch (e) {
        resolve({ ok: false, error: e.message })
      }
    })
  })

  /**
   * TISKANJE BESEDILA PREK ESC/POS (prelet 174)
   * ═══════════════════════════════════════════
   *
   * NAPAKA, KI JO TO ODPRAVLJA: otvoritev blagajne, X- in Z-obracun so se
   * tiskali prek `print-receipt` - skrito okno nalozi HTML in ga natisne
   * prek WINDOWS tiskalnega sistema. Termalni tiskalnik je namescen z
   * gonilnikom za surovo besedilo in HTML strani ne zna upodobiti: Windows
   * posel sprejme, javi uspeh in ga tiho zavrze. Blagajna se je odprla,
   * listka pa ni bilo - in ker ta pot nima nadomestne, tudi opozorila ne.
   *
   * Racuni te tezave nimajo, ker gredo prek `print-raw` kot surovi ESC/POS
   * ukazi. Zdaj po isti poti tecejo tudi ti trije izpisi.
   */
  ipcMain.handle('print-text', async (event, podatki) => {
    try {
      const config = loadPrinterConfig()
      const printerName = config.printerName || ''
      if (!printerName) return { ok: false, error: 'Tiskalnik ni nastavljen. Pojdi na Orodja > Nastavitve tiskalnika.' }

      const vrstice = Array.isArray(podatki?.vrstice) ? podatki.vrstice : []
      const SIRINA = Number(podatki?.paper_width) === 58 ? 32 : 48
      const ESC = 0x1B, GS = 0x1D
      const out = []
      const b = (...x) => out.push(...x)
      // Isti nabor znakov kot pri racunih (Windows-1252), da sumniki ne razpadejo.
      const sl = (s) => String(s == null ? '' : s)
        .replace(/[čć]/g,'c').replace(/[ČĆ]/g,'C')
        .replace(/š/g,'s').replace(/Š/g,'S')
        .replace(/ž/g,'z').replace(/Ž/g,'Z')
        .replace(/đ/g,'d').replace(/Đ/g,'D')
      // Evro je v Windows-1252 bajt 0x80 - brez tega bi se izpisal kot vprasaj.
      const txt = (s) => {
        const t = sl(s)
        for (let i = 0; i < t.length; i++) {
          const c = t.charCodeAt(i)
          b(c === 0x20AC ? 0x80 : (c > 0xFF ? 0x3F : c))
        }
      }
      const lf = () => b(0x0A)

      b(ESC, 0x40)          // init
      b(ESC, 0x74, 0x10)    // kodna stran Windows-1252

      for (const v of vrstice) {
        const besedilo = typeof v === 'string' ? v : (v?.t ?? '')
        const slog = typeof v === 'string' ? {} : (v || {})
        // Poravnava: 0 levo, 1 sredina, 2 desno
        b(ESC, 0x61, slog.sredina ? 0x01 : 0x00)
        // Dvojna visina/sirina za naslove in skupne zneske
        if (slog.veliko) b(GS, 0x21, 0x11)
        if (slog.krepko) b(ESC, 0x45, 0x01)
        if (slog.crta) { txt('-'.repeat(SIRINA)) }
        else if (slog.desno != null) {
          // Par levo/desno v eni vrstici, z zapolnitvijo vmes.
          const l = sl(besedilo), r = sl(slog.desno)
          const lp = l.slice(0, Math.max(0, SIRINA - r.length - 1))
          txt(lp + ' '.repeat(Math.max(1, SIRINA - lp.length - r.length)) + r)
        } else txt(besedilo)
        lf()
        if (slog.krepko) b(ESC, 0x45, 0x00)
        if (slog.veliko) b(GS, 0x21, 0x00)
      }

      b(ESC, 0x61, 0x00)
      lf(); lf(); lf(); lf()
      b(GS, 0x56, 0x42, 0x00)   // rez

      const buf = Buffer.from(out)
      if (process.platform === 'win32') return await rawPrintWindows(printerName, buf)
      const { exec } = require('child_process')
      const tmpBin = require('path').join(require('os').tmpdir(), `racunko-txt-${Date.now()}.bin`)
      require('fs').writeFileSync(tmpBin, buf)
      return await new Promise((resolve) => {
        exec(`lp -d "${printerName}" -o raw "${tmpBin}"`, (err) => {
          try { require('fs').unlinkSync(tmpBin) } catch {}
          resolve(err ? { ok: false, error: err.message } : { ok: true })
        })
      })
    } catch (e) { return { ok: false, error: e.message } }
  })

  /**
   * PREIZKUS KODNIH STRANI ZA SUMNIKE (prelet 182)
   * ══════════════════════════════════════════════
   *
   * ZAKAJ: racun ima v nogi "www.racunko.si" - naslov, ki pripada DRUGEMU
   * podjetju (racunovodski servis RACUNKO d.o.o. iz Kamnika). Prava domena
   * je racunko.si s sumnikom, torej "racunko.si" s streho na c.
   *
   * Tiskalnik dela na kodni strani Windows-1252 (`ESC t 16`), ki sumnikov
   * NIMA - zato jih koda cisti v c/s/z. Za sumnike je potrebna druga kodna
   * stran, njena STEVILKA pa se med tiskalniki razlikuje:
   *
   *   45 = Windows-1250 (srednjeevropska) - ima sumnike IN evro znak
   *   18 = CP852 (Latin-2, DOS)           - ima sumnike, evra NE
   *   16 = Windows-1252                   - trenutna, brez sumnikov
   *
   * Ta preizkus natisne isto vrstico pod vsemi tremi. Tista, ki se izpise
   * pravilno, pove, katero stran naj uporabimo. Ugibati ne gre: napacna
   * stran bi na racunih dala nakljucne znake namesto besedila.
   */
  // POPRAVLJENO (prelet 183): funkcija je bila definirana ZNOTRAJ
  // `setupIpcHandlers()`, meni pa je zunaj nje - klik je zato javil
  // "preizkusSumnikov is not defined". Zdaj se ob zagonu pripne na
  // spremenljivko na ravni modula, do katere meni ima dostop.
  preizkusSumnikov = async function () {
    try {
      const config = loadPrinterConfig()
      const printerName = config.printerName || ''
      if (!printerName) return { ok: false, error: 'Tiskalnik ni nastavljen.' }

      const ESC = 0x1B, GS = 0x1D
      const out = []
      const b = (...x) => out.push(...x)
      const asc = (s) => { for (let i=0;i<s.length;i++) b(s.charCodeAt(i)) }
      const lf = () => b(0x0A)

      // Bajti za "racunko.si" in "cszCSZ EUR" po posamezni kodni strani.
      const razlicice = [
        { stran: 45, ime: 'WPC1250',
          url: [0x72,0x61,0xE8,0x75,0x6E,0x6B,0x6F,0x2E,0x73,0x69],           // ra c^ unko.si
          crke:[0xE8,0x9A,0x9E,0x20,0xC8,0x8A,0x8E,0x20,0x80] },              // c s z C S Z EUR
        { stran: 18, ime: 'PC852',
          url: [0x72,0x61,0x9F,0x75,0x6E,0x6B,0x6F,0x2E,0x73,0x69],
          crke:[0x9F,0xE7,0xA7,0x20,0xAC,0xE6,0xA6,0x20,0x3F] },
        { stran: 16, ime: 'WPC1252 (zdaj)',
          url: [0x72,0x61,0x63,0x75,0x6E,0x6B,0x6F,0x2E,0x73,0x69],
          crke:[0x3F,0x3F,0x3F,0x20,0x3F,0x3F,0x3F,0x20,0x80] },
      ]

      b(ESC, 0x40)
      b(ESC, 0x61, 0x01); asc('PREIZKUS SUMNIKOV'); lf()
      b(ESC, 0x61, 0x00); lf()
      asc('Katera vrstica se izpise PRAVILNO?'); lf()
      asc('Pravilno = racunko.si s streho na c'); lf()
      asc('-'.repeat(48)); lf()

      for (const r of razlicice) {
        b(ESC, 0x74, r.stran)
        asc('[' + r.stran + '] ' + r.ime); lf()
        asc('   '); for (const x of r.url) b(x); lf()
        asc('   '); for (const x of r.crke) b(x); lf()
        lf()
      }

      b(ESC, 0x74, 0x10)   // nazaj na trenutno stran
      asc('-'.repeat(48)); lf()
      asc('Javite stevilko vrstice, ki je pravilna.'); lf()
      lf(); lf(); lf()
      b(GS, 0x56, 0x42, 0x00)

      const buf = Buffer.from(out)
      if (process.platform === 'win32') return await rawPrintWindows(printerName, buf)
      const { exec } = require('child_process')
      const tmpBin = require('path').join(require('os').tmpdir(), `racunko-cp-${Date.now()}.bin`)
      require('fs').writeFileSync(tmpBin, buf)
      return await new Promise((resolve) => {
        exec(`lp -d "${printerName}" -o raw "${tmpBin}"`, (err) => {
          try { require('fs').unlinkSync(tmpBin) } catch {}
          resolve(err ? { ok: false, error: err.message } : { ok: true })
        })
      })
    } catch (e) { return { ok: false, error: e.message } }
  }
  ipcMain.handle('print-sumniki', () => preizkusSumnikov())

  ipcMain.handle('print-test', async () => {
    const { app } = require('electron')
    const testHtml = `<!DOCTYPE html><html><body style="font-family:monospace;font-size:12px;max-width:80mm;margin:0;padding:8mm 4mm">
      <div style="text-align:center;font-weight:700;font-size:14px">RACUNKO POS</div>
      <div style="text-align:center">Test tiskanja</div>
      <hr/>
      <div>Verzija: ${app.getVersion()}</div>
      <div>Datum: ${new Date().toLocaleString('sl-SI')}</div>
      <hr/>
      <div style="text-align:center">Tiskalnik deluje!</div>
    </body></html>`
    return ipcMain.emit('print-receipt', null, testHtml)
  })

  ipcMain.handle('print-raw', async (event, data) => {
    try {
      const config = loadPrinterConfig()
      const printerName = config.printerName || ''
      if (!printerName) return { ok: false, error: 'Tiskalnik ni nastavljen. Pojdi na Orodja > Nastavitve tiskalnika.' }
      const buf = buildEscPos(data)
      if (process.platform === 'win32') {
        return await rawPrintWindows(printerName, buf)
      } else {
        // macOS/Linux: lp
        const { exec } = require('child_process')
        const tmpBin = require('path').join(require('os').tmpdir(), `racunko-raw-${Date.now()}.bin`)
        require('fs').writeFileSync(tmpBin, buf)
        return new Promise((resolve) => {
          exec(`lp -d "${printerName}" -o raw "${tmpBin}"`, (err) => {
            try { require('fs').unlinkSync(tmpBin) } catch {}
            resolve(err ? { ok: false, error: err.message } : { ok: true })
          })
        })
      }
    } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('get-printers', async () => {
    try {
      const win = BrowserWindow.getAllWindows()[0]
      if (!win) return []
      return (await win.webContents.getPrintersAsync()).map(p => ({ name: p.name, isDefault: p.isDefault }))
    } catch { return [] }
  })

  ipcMain.handle('get-selected-printer', async () => {
    return loadPrinterConfig().printerName || null
  })

  ipcMain.handle('select-printer', async () => {
    try {
      const win = BrowserWindow.getAllWindows()[0]
      if (!win) return { ok: false }
      const printers = await win.webContents.getPrintersAsync()
      if (!printers.length) {
        await dialog.showMessageBox(win, { type: 'warning', title: 'Ni tiskalnikov', message: 'Na tem računalniku ni nameščenih tiskalnikov.', buttons: ['OK'] })
        return { ok: false }
      }
      const config = loadPrinterConfig()
      const currentIdx = printers.findIndex(p => p.name === config.printerName)
      const result = await dialog.showMessageBox(win, {
        type: 'question',
        title: 'Izberi tiskalnik za račune',
        message: 'Kateri tiskalnik naj Računko uporablja za tiskanje računov?',
        detail: 'Trenutno: ' + (config.printerName || 'ni nastavljeno'),
        buttons: [...printers.map(p => p.name + (p.isDefault ? ' (privzeti)' : '')), 'Prekliči'],
        defaultId: currentIdx >= 0 ? currentIdx : 0,
        cancelId: printers.length,
      })
      if (result.response < printers.length) {
        const selected = printers[result.response]
        savePrinterConfig({ printerName: selected.name })
        await dialog.showMessageBox(win, { type: 'info', title: 'Shranjeno', message: `Tiskalnik "${selected.name}" je nastavljen.`, buttons: ['OK'] })
        return { ok: true, name: selected.name }
      }
      return { ok: false }
    } catch (e) { return { ok: false, error: e.message } }
  })

  // ── PRELET 158: delovanje brez povezave ─────────────────────────

  ipcMain.handle('ponovno-povezi', async () => {
    const uspeh = await poskusiPovezavo()
    return { ok: !!uspeh }
  })

  ipcMain.handle('furs-potrdilo-stanje', async () => {
    const p = preberiFursPotrdilo()
    if (!p) return { nalozeno: false }
    return { nalozeno: true, taxNumber: p.taxNumber || null, shranjeno: p.shranjeno || null }
  })

  ipcMain.handle('furs-shrani-potrdilo', async (event, paket) => {
    try {
      if (!paket?.p12Base64) return { ok: false, error: 'Manjka vsebina potrdila.' }
      const sifrirano = shraniFursPotrdilo({
        p12Base64: paket.p12Base64,
        geslo: paket.geslo ?? '',
        taxNumber: paket.taxNumber ?? null,
        shranjeno: new Date().toISOString(),
      })
      return { ok: true, sifrirano }
    } catch (e) { return { ok: false, error: e.message } }
  })

  // Izracun ZOI za racun brez povezave.
  //
  // POZOR - KONSISTENCA: postopek je NAMENOMA znak-za-znakom enak
  // calculateZoi v apps/web/lib/furs.ts (vkljucno z MD5 nad SESTNAJSTISKIM
  // NIZOM podpisa, ne nad surovimi bajti). Z natanko tem postopkom je FURS
  // sprejel vse dosedanje racune - vsak odmik bi pomenil, da isti racun
  // dobi drugacen ZOI na napravi in na strezniku.
  ipcMain.handle('furs-zoi', async (event, podatki) => {
    try {
      if (!forge) return { ok: false, error: 'Knjiznica node-forge ni namescena - posodobite namizno aplikacijo.' }
      const potrdilo = preberiFursPotrdilo()
      if (!potrdilo) return { ok: false, error: 'FURS potrdilo se ni preneseno na to napravo (na njej se mora enkrat prijaviti lastnik).' }

      const { taxNumber, issueDateTime, invoiceNumber, premiseId, deviceId, amount } = podatki || {}
      if (!taxNumber || !issueDateTime || !invoiceNumber || !premiseId || !deviceId || !(Number(amount) >= 0)) {
        return { ok: false, error: 'Manjkajo podatki za izracun ZOI.' }
      }

      const p12Der = forge.util.decode64(potrdilo.p12Base64)
      const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(p12Der), false, potrdilo.geslo || '')
      const zasciteni = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || []
      const navadni = p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || []
      const vreca = zasciteni[0] || navadni[0]
      if (!vreca || !vreca.key) return { ok: false, error: 'V potrdilu ni zasebnega kljuca.' }

      const dt = new Date(issueDateTime)
      const p2 = (n) => String(n).padStart(2, '0')
      const dateStr = [p2(dt.getDate()), p2(dt.getMonth() + 1), dt.getFullYear()].join('.')
        + ' ' + [p2(dt.getHours()), p2(dt.getMinutes()), p2(dt.getSeconds())].join(':')
      const content = String(taxNumber) + dateStr + String(invoiceNumber)
        + String(premiseId) + String(deviceId) + Number(amount).toFixed(2)

      const md = forge.md.sha256.create()
      md.update(content, 'utf8')
      const signature = forge.util.bytesToHex(vreca.key.sign(md))
      const zoi = crypto.createHash('md5').update(signature).digest('hex')
      return { ok: true, zoi }
    } catch (e) { return { ok: false, error: e.message } }
  })
}

// ── Print server ──────────────────────────────────────────────────
function startPrintServer() {
  const expressApp = express()
  expressApp.use(cors({ origin: '*' }))
  expressApp.use(express.json({ limit: '10mb' }))

  expressApp.get('/health', (req, res) => {
    res.json({ ok: true, version: app.getVersion(), source: 'electron' })
  })

  expressApp.post('/print/receipt', async (req, res) => {
    try {
      const { html } = req.body
      if (!html) return res.json({ ok: false, error: 'Manjka html' })

      const tmpFile = path.join(os.tmpdir(), `racunko-receipt-${Date.now()}.html`)
      fs.writeFileSync(tmpFile, html, 'utf8')

      const printWin = new BrowserWindow({
        show: false,
        webPreferences: { nodeIntegration: false, contextIsolation: true }
      })

      printWin.loadFile(tmpFile)

      printWin.webContents.on('did-finish-load', () => {
        printWin.webContents.print(
          { silent: true, printBackground: true },
          (success, errorType) => {
            printWin.close()
            try { fs.unlinkSync(tmpFile) } catch {}
            res.json({ ok: success, error: success ? null : errorType })
          }
        )
      })

      printWin.webContents.on('did-fail-load', (event, code, desc) => {
        printWin.close()
        try { fs.unlinkSync(tmpFile) } catch {}
        res.json({ ok: false, error: desc })
      })

    } catch (e) {
      res.json({ ok: false, error: e.message })
    }
  })

  expressApp.post('/print/test', (req, res) => {
    const testHtml = `<!DOCTYPE html><html><body style="font-family:monospace;font-size:12px;max-width:80mm;margin:0;padding:8mm 4mm">
      <div style="text-align:center;font-weight:700;font-size:14px">RAČUNKO POS</div>
      <div style="text-align:center">Test tiskanja</div>
      <hr/>
      <div>Verzija: ${app.getVersion()}</div>
      <div>Datum: ${new Date().toLocaleString('sl-SI')}</div>
      <hr/>
      <div style="text-align:center">Tiskalnik deluje!</div>
    </body></html>`

    const tmpFile = path.join(os.tmpdir(), `racunko-test-${Date.now()}.html`)
    fs.writeFileSync(tmpFile, testHtml, 'utf8')

    const printWin = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false } })
    printWin.loadFile(tmpFile)
    printWin.webContents.on('did-finish-load', () => {
      printWin.webContents.print({ silent: true, printBackground: true }, () => {
        printWin.close()
        try { fs.unlinkSync(tmpFile) } catch {}
      })
      res.json({ ok: true })
    })
  })

  printServer = http.createServer(expressApp)
  printServer.listen(PRINT_PORT, '127.0.0.1', () => {
    console.log(`Print server: http://localhost:${PRINT_PORT}`)
  })
  printServer.on('error', (e) => {
    console.warn('Print server napaka:', e.message)
  })
}

// ── Glavno okno ───────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Računko POS',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      allowRunningInsecureContent: true,
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#0d2818',
  })

  mainWindow.loadURL(POS_URL)

  // PRELET 158: `did-fail-load` je bil doslej obravnavan SAMO pri skritem
  // tiskalnem oknu. Ce je bil internet nedosegljiv ob ZAGONU, je glavno okno
  // ostalo prazno belo - osebje je lahko samo ugibalo, kaj je narobe.
  // Zdaj pokazemo zaslon "ni povezave" in se vsakih 5 s sami poskusamo
  // povezati nazaj; ob uspehu se blagajna nalozi brez posredovanja.
  mainWindow.webContents.on('did-fail-load', (event, code, opis, url, jeGlavniOkvir) => {
    // -3 (ERR_ABORTED) sprozi vsaka prekinjena navigacija (preusmeritev,
    // hiter klik) in NI izpad povezave; podokvirji nas ne zanimajo.
    if (!jeGlavniOkvir || code === -3) return
    console.warn('Glavno okno se ni nalozilo (' + code + ' ' + opis + ') - zaslon brez povezave')
    mainWindow.loadFile(path.join(__dirname, 'assets', 'offline.html'))
    zazeniPonovnoPovezovanje()
  })

  /**
   * NAMIZNA APLIKACIJA JE SAMO BLAGAJNA (prelet 190)
   * ════════════════════════════════════════════════
   *
   * Doslej je aplikacija odprla `/pos`, ob poteku seje pa jo je streznik
   * preusmeril na prijavo - ta pa je po vpisu poslala uporabnika na portal.
   * Osebje se je tako znaslo v knjigovodstvu in moralo blagajno poiskati
   * rocno, namesto da bi vneslo samo PIN.
   *
   * Zdaj ob prijavi pripnemo `?next=/pos`, da se vrne na blagajno, in po
   * vsaki navigaciji preverimo, kje smo koncali. Ce nas je karkoli odneslo
   * na drugo stran nase domene, se vrnemo na blagajno.
   *
   * Prijavne in registracijske poti pustimo pri miru - te se morajo
   * dokoncati, sicer bi se vrteli v krogu.
   */
  const DOVOLJENE_POTI = ['/pos', '/login', '/auth', '/signup', '/register',
                          '/onboarding', '/invite', '/forgot-password', '/odjava']

  mainWindow.webContents.on('did-navigate', (event, url) => {
    try {
      const u = new URL(url)
      if (u.protocol === 'file:') return                       // zaslon brez povezave
      if (u.host !== new URL(POS_URL).host) return             // tuja stran
      if (DOVOLJENE_POTI.some(p => u.pathname === p || u.pathname.startsWith(p + '/'))) {
        // Na prijavi poskrbimo, da se po vpisu vrne na blagajno.
        if (u.pathname === '/login' && !u.searchParams.get('next')) {
          mainWindow.loadURL(POS_URL.replace(/\/pos$/, '/login?next=/pos'))
        }
        return
      }
      console.log('Namizna aplikacija: preusmeritev z', u.pathname, 'nazaj na blagajno')
      mainWindow.loadURL(POS_URL)
    } catch (e) { console.warn('did-navigate:', e.message) }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('about:') || url.startsWith('data:')) {
      return { action: 'deny' }
    }
    if (!url.startsWith('https://računko.si')) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

function createMenu() {
  const template = [
    ...(process.platform === 'darwin' ? [{
      label: 'Računko POS',
      submenu: [
        { role: 'about', label: 'O aplikaciji' },
        { type: 'separator' },
        { role: 'quit', label: 'Zapri' },
      ]
    }] : []),
    {
      label: 'Urejanje',
      submenu: [
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }
      ]
    },
    {
      label: 'Pogled',
      submenu: [
        { role: 'reload', label: 'Osveži' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Celozaslonski način' },
      ]
    },
    {
      label: 'Orodja',
      submenu: [
        {
          label: 'Nastavitve tiskalnika...',
          click: async () => {
            const win = BrowserWindow.getAllWindows()[0]
            if (win) win.webContents.executeJavaScript('window.electronAPI?.selectPrinter?.()')
          }
        },
        {
          label: 'Test tiskanja',
          click: async () => {
            try {
              await fetch(`http://localhost:${PRINT_PORT}/print/test`, { method: 'POST' })
            } catch (e) { console.error(e) }
          }
        },
        {
          // PRELET 182: natisne isto vrstico pod vsemi kodnimi stranmi,
          // da se vidi, katero tiskalnik razume za sumnike.
          label: 'Preizkus sumnikov',
          click: async () => {
            try {
              const r = await preizkusSumnikov()
              if (r && !r.ok) dialog.showErrorBox('Tiskalnik', r.error || 'Napaka pri tiskanju.')
            } catch (e) { dialog.showErrorBox('Tiskalnik', String(e?.message || e)) }
          }
        },
        { type: 'separator' },
        {
          /**
           * ODJAVA (prelet 193)
           * ═══════════════════
           *
           * Blagajna odjave ni imela nikoli - do nje se je prislo prek
           * portala. Prelet 190 je to pot zaprl (aplikacija se vraca na
           * blagajno), zato menjava racuna ni bila vec mogoca. Ta vnos je
           * torej posledica tistega popravka.
           *
           * ZAKAJ NE POCISTIMO CELOTNE SHRAMBE: v njej so tudi cakajoci
           * racuni brez povezave, seme stevca in izbrana naprava. Brisanje
           * vsega bi lahko unicilo se neprijavljene racune, zato odstranimo
           * IZKLJUCNO Supabasove kljuce seje (`sb-...-auth-token`).
           */
          label: 'Odjava (menjava računa)',
          click: async () => {
            try {
              if (!mainWindow || mainWindow.isDestroyed()) return

              // Ce cakajo neprijavljeni racuni, odjava pomeni, da jih trenutni
              // uporabnik ne bo mogel poslati - na to je treba opozoriti.
              const cakajocih = await mainWindow.webContents.executeJavaScript(`
                (async () => {
                  try {
                    const zahteva = indexedDB.open('racunko-blagajna', 1)
                    return await new Promise((res) => {
                      zahteva.onsuccess = () => {
                        try {
                          const db = zahteva.result
                          if (!db.objectStoreNames.contains('cakajoca-narocila')) return res(0)
                          const t = db.transaction('cakajoca-narocila', 'readonly').objectStore('cakajoca-narocila').count()
                          t.onsuccess = () => res(t.result || 0)
                          t.onerror = () => res(0)
                        } catch { res(0) }
                      }
                      zahteva.onerror = () => res(0)
                      setTimeout(() => res(0), 2000)
                    })
                  } catch { return 0 }
                })()
              `).catch(() => 0)

              const opozorilo = cakajocih > 0
                ? `\n\nPOZOR: ${cakajocih} računov še čaka na prijavo pri FURS. Pred odjavo vzpostavite povezavo, da se pošljejo.`
                : ''

              const odgovor = await dialog.showMessageBox(mainWindow, {
                type: cakajocih > 0 ? 'warning' : 'question',
                buttons: ['Odjavi se', 'Prekliči'],
                defaultId: 1,
                cancelId: 1,
                title: 'Odjava',
                message: 'Se želite odjaviti in se prijaviti z drugim računom?',
                detail: 'Blagajna se bo vrnila na prijavno stran.' + opozorilo,
              })
              if (odgovor.response !== 0) return

              /**
               * POPRAVLJENO (prelet 194): odjava ni delovala - blagajna se je
               * samo osvezila in ostala prijavljena.
               *
               * VZROK: aplikacija uporablja `createBrowserClient` iz
               * `@supabase/ssr`, ta pa sejo hrani v PISKOTKIH, ne v
               * `localStorage`. Ciscenje `localStorage` je torej brisalo
               * kljuce, ki jih tam sploh ni. Poleg tega sejo bere tudi
               * streznik (middleware) - in ta vidi izkljucno piskotke.
               *
               * Zdaj piskotke seje odstranimo prek Electrona in stran
               * nalozimo na PRIJAVO, ne na blagajno - sicer bi nas streznik
               * poslal nazaj in videti bi bilo, kot da se ni zgodilo nic.
               *
               * `localStorage` NE ciscimo v celoti: v njem so izbrana
               * naprava in seme stevca za delo brez povezave.
               */
              // Zanesljiva pot: piskotke odstranimo prek Electrona. Middleware
              // in odjemalec bereta izkljucno te, zato je seja s tem koncana.
              const ses = mainWindow.webContents.session
              const gostitelj = new URL(POS_URL).hostname
              const piskotki = await ses.cookies.get({})
              let odstranjenih = 0
              for (const p of piskotki) {
                const dom = (p.domain || '').replace(/^\./, '')
                if (!gostitelj.endsWith(dom) && !dom.endsWith(gostitelj)) continue
                if (!/^sb-|supabase|auth/i.test(p.name)) continue
                const url = (p.secure ? 'https://' : 'http://') + dom + (p.path || '/')
                try { await ses.cookies.remove(url, p.name); odstranjenih++ } catch {}
              }
              console.log('Odjava: odstranjenih piskotkov =', odstranjenih)

              // Se kljuci v localStorage, ce jih je kaj (starejse razlicice).
              await mainWindow.webContents.executeJavaScript(`
                (function () {
                  for (const k of Object.keys(localStorage)) {
                    if (k.startsWith('sb-') && k.includes('auth')) localStorage.removeItem(k)
                  }
                  return true
                })()
              `).catch(() => {})

              // Na prijavo, ne na blagajno - sicer bi nas streznik poslal nazaj
              // in videti bi bilo, kot da se ni zgodilo nic.
              mainWindow.loadURL(POS_URL.replace(/\/pos$/, '/login?next=/pos'))
            } catch (e) {
              dialog.showErrorBox('Odjava', String(e?.message || e))
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Preveri posodobitve',
          click: () => autoUpdater.checkForUpdates().catch(console.error)
        },
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ── App lifecycle ─────────────────────────────────────────────────
app.whenReady().then(() => {
  setupIpcHandlers()
  startPrintServer()
  createMenu()
  createWindow()
  setupAutoUpdater()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (printServer) printServer.close()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (printServer) printServer.close()
})