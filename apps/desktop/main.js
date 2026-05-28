const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('path')
const fs = require('fs')
const os = require('os')
const express = require('express')
const cors = require('cors')
const http = require('http')

const POS_URL = 'https://računko.si/pos'

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

  // Pretvori slovenscino v ASCII (code page 850)
  const sl = (s) => (s||'')
    .replace(/\u0161/g,'s').replace(/\u0160/g,'S')
    .replace(/\u010d/g,'c').replace(/\u010c/g,'C')
    .replace(/\u017e/g,'z').replace(/\u017d/g,'Z')
    .replace(/\u00e9/g,'e').replace(/\u00e8/g,'e')
    .replace(/[^\x20-\x7E]/g,'?')

  const txt = (s) => {
    for (const c of sl(s)) {
      const code = c.charCodeAt(0)
      b(code > 0xFF ? 0x3F : code)  // >255 -> '?'
    }
  }
  // Posebej za euro byte ki pride iz eur()
  const txtRaw = (s) => {
    for (let i = 0; i < s.length; i++) {
      const code = s.charCodeAt(i)
      if (code === 0x80) { b(0x80) }  // euro direktno
      else b(code > 0xFF ? 0x3F : code)
    }
  }
  const pad = (s, n, right) => {
    const t = sl(s).slice(0, n)
    const p = ' '.repeat(Math.max(0, n - t.length))
    return right ? p + t : t + p
  }
  const line = (l, r, width=42) => {
    const lp = sl(l).slice(0, width - sl(r).length - 1)
    txtRaw(lp + ' '.repeat(width - lp.length - sl(r).length) + sl(r)); lf()
  }
  const sep = (ch='-', w=42) => { txt(ch.repeat(w)); lf() }
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
  if (data.tax_number) { txt('Davcna: ' + data.tax_number); lf() }
  if (data.vat_id) { txt('ID DDV: ' + data.vat_id); lf() }
  lf()
  // Left align
  b(ESC,0x61,0x00)
  sep()
  line('Racun st.:', data.receipt_number || '')
  line('Datum:', data.date || '')
  line('Blagajnik:', data.cashier || '')
  line('Placilo:', data.payment_method === 'card' ? 'Kartica' : data.payment_method === 'bon' ? 'Bon' : 'Gotovina')
  sep()
  // Artikli
  for (const item of (data.items||[])) {
    const name = sl(item.name||'').slice(0,42)
    txt(name); lf()
    const qty = Number(item.qty||1)
    const up  = Number(item.unit_price||0)
    const tot = qty * up
    txt(name.slice(0,42)); lf()
    txtRaw('  ' + qty + ' x ' + eur(up) + '   ' + eur(tot)); lf()
  }
  sep()
  // Popust
  if (Number(data.discount_amount||0) > 0) {
    line('Popust:', '-' + eur(data.discount_amount))
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
  txt('OBRACUN DDV'); lf()
  txt(pad('##',3) + pad('DDV%',7) + pad('NETO',8,true) + pad('DDV',8,true) + pad('BRUTO',8,true)); lf()
  const total = Number(data.total||0)
  const vatR  = 22
  const neto  = total / (1 + vatR/100)
  const ddv   = total - neto
  txt(pad('C',3) + pad(vatR+'%',7) + pad(neto.toFixed(2),8,true) + pad(ddv.toFixed(2),8,true) + pad(total.toFixed(2),8,true)); lf()
  txt('C: DDV ' + vatR + '% stopnja'); lf()
  sep()
  // FURS
  if (data.furs_zoi) { txt('ZOI: ' + data.furs_zoi); lf() }
  if (data.furs_eor) { txt('EOR: ' + data.furs_eor); lf() }
  if (data.furs_zoi || data.furs_eor) sep()
  // Footer
  b(ESC,0x61,0x01)
  txt('Hvala za obisk!'); lf()
  txt('Izdano s sistemom RACUNKO'); lf()
  txt('www.racunko.si'); lf()
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