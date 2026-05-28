const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  version: process.versions.electron,
  printReceipt: (html) => ipcRenderer.invoke('print-receipt', html),
  printTest: () => ipcRenderer.invoke('print-test'),
})
