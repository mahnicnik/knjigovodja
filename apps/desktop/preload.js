const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  version: process.versions.electron,
  printReceipt: (html) => ipcRenderer.invoke('print-receipt', html),
  printRaw: (data) => ipcRenderer.invoke('print-raw', data),
  printTest: () => ipcRenderer.invoke('print-test'),
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  getSelectedPrinter: () => ipcRenderer.invoke('get-selected-printer'),
  selectPrinter: () => ipcRenderer.invoke('select-printer'),
})
