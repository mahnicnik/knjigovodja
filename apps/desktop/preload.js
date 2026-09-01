const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  version: process.versions.electron,
  printReceipt: (html) => ipcRenderer.invoke('print-receipt', html),
  printRaw: (data) => ipcRenderer.invoke('print-raw', data),
  // PRELET 174: otvoritev/X/Z po isti poti kot racuni.
  printText: (podatki) => ipcRenderer.invoke('print-text', podatki),
  printTest: () => ipcRenderer.invoke('print-test'),
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  getSelectedPrinter: () => ipcRenderer.invoke('get-selected-printer'),
  selectPrinter: () => ipcRenderer.invoke('select-printer'),

  // ── PRELET 158: delovanje brez povezave ──────────────────────────
  // Spletna blagajna po tej zastavici ve, da namizna aplikacija zna
  // izracunati ZOI lokalno (starejse verzije je nimajo).
  offlinePodpora: true,
  ponovnoPovezi: () => ipcRenderer.invoke('ponovno-povezi'),
  fursPotrdiloStanje: () => ipcRenderer.invoke('furs-potrdilo-stanje'),
  fursShraniPotrdilo: (paket) => ipcRenderer.invoke('furs-shrani-potrdilo', paket),
  fursZoi: (podatki) => ipcRenderer.invoke('furs-zoi', podatki),
})
