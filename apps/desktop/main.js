const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('path')
const fs = require('fs')
const os = require('os')
const express = require('express')
const cors = require('cors')
const http = require('http')

const POS_URL = 'https://računko.si/pos'
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
              // Poisci termalni tiskalnik (RONGTA, Epson, Star, Bixolon)
              const printers = await printWin.webContents.getPrintersAsync()
              const thermalNames = ['rongta', 'epson', 'star', 'bixolon', 'xprinter', 'rp80', 'tm-t', 'tsp']
              const thermal = printers.find(p =>
                thermalNames.some(n => p.name.toLowerCase().includes(n))
              )
              const deviceName = thermal ? thermal.name : (printers[0]?.name || '')
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