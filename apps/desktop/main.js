const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron')
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

function startPrintServer() {
  const expressApp = express()
  expressApp.use(cors({ origin: '*' }))
  expressApp.use(express.json({ limit: '10mb' }))

  expressApp.get('/health', (req, res) => {
    res.json({ ok: true, version: '2.0', source: 'electron', printer_type: 'usb' })
  })

  expressApp.post('/print/receipt', async (req, res) => {
    try {
      const { html } = req.body
      if (!html) return res.json({ ok: false, error: 'Manjka html' })

      // Shrani HTML v temp file
      const tmpFile = path.join(os.tmpdir(), `racunko-receipt-${Date.now()}.html`)
      fs.writeFileSync(tmpFile, html, 'utf8')

      const printWin = new BrowserWindow({
        show: false,
        webPreferences: { nodeIntegration: false, contextIsolation: true }
      })

      printWin.loadFile(tmpFile)

      printWin.webContents.on('did-finish-load', () => {
        printWin.webContents.print(
          { silent: true, printBackground: true, deviceName: '' },
          (success, errorType) => {
            printWin.close()
            // Pocisti temp file
            try { fs.unlinkSync(tmpFile) } catch {}
            if (success) {
              res.json({ ok: true })
            } else {
              res.json({ ok: false, error: errorType })
            }
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
      <div>Datum: ${new Date().toLocaleString('sl-SI')}</div>
      <div>Tiskalnik: OK</div>
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
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#0d2818',
  })

  mainWindow.loadURL(POS_URL)

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith('https://računko.si')) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools()
  }

  mainWindow.on('closed', () => { mainWindow = null })
}

function createMenu() {
  const template = [
    ...(process.platform === 'darwin' ? [{
      label: 'Računko POS',
      submenu: [
        { role: 'about', label: 'O aplikaciji' },
        { type: 'separator' },
        { role: 'hide', label: 'Skrij' },
        { role: 'quit', label: 'Zapri' },
      ]
    }] : []),
    {
      label: 'Urejanje',
      submenu: [
        { role: 'cut', label: 'Izreži' },
        { role: 'copy', label: 'Kopiraj' },
        { role: 'paste', label: 'Prilepi' },
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
            } catch (e) {
              console.error('Test print napaka:', e)
            }
          }
        },
        {
          label: 'Odpri Računko.si',
          click: () => shell.openExternal('https://računko.si')
        },
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(() => {
  startPrintServer()
  createMenu()
  createWindow()

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