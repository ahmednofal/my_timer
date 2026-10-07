const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onFocusChange: (callback) => {
    ipcRenderer.on('window-focus-change', (_event, focused) => callback(focused));
  },
  resizeWindow: (height, width) => {
    ipcRenderer.send('resize-window', height, width);
  },
});
