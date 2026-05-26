const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadData: () => ipcRenderer.invoke('load-data'),
  saveData: (data) => ipcRenderer.invoke('save-data', data),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getAutostart: () => ipcRenderer.invoke('get-autostart'),
  setAutostart: (enable) => ipcRenderer.invoke('set-autostart', enable),
  resizeWindow: (w, h) => ipcRenderer.invoke('window-resize', w, h),
  getWindowSize: () => ipcRenderer.invoke('window-get-size'),
  getSupabaseConfig: () => ipcRenderer.invoke('get-supabase-config'),
  minimize: () => ipcRenderer.invoke('window-minimize'),
  close: () => ipcRenderer.invoke('window-close'),
  toggleDevTools: () => ipcRenderer.invoke('toggle-devtools'),
});
