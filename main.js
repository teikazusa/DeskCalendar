const { app, BrowserWindow, ipcMain, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');

// ─── Paths ─────────────────────────────────────────────────────────────
const DATA_DIR = path.join(app.getPath('userData'), 'data');
const DATA_FILE = path.join(DATA_DIR, 'data.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// ─── Data defaults ────────────────────────────────────────────────────
const DEFAULT_DATA = {
  events: {},
  settings: {
    theme: 'dark',
    opacity: 0.78,
    autostart: false,
    displayMode: 'compact',
    fontSize: 'default',
    weekStart: 'monday',
    language: 'zh',
    showGrid: false,
    x: undefined,
    y: undefined,
    width: 380,
    height: 560,
  },
};

function loadData() {
  ensureDataDir();
  // Try main file first
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const data = JSON.parse(raw);
      if (data.events && Object.keys(data.events).length > 0) {
        return {
          events: data.events,
          settings: { ...DEFAULT_DATA.settings, ...data.settings },
        };
      }
    }
  } catch (_) { /* corrupt — fall through to backup */ }
  // Try backup
  const bak = loadBackup();
  if (bak) return bak;
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}

function saveData(data) {
  ensureDataDir();
  // Backup previous file before overwriting
  if (fs.existsSync(DATA_FILE)) {
    fs.copyFileSync(DATA_FILE, DATA_FILE + '.bak');
  }
  fs.writeFileSync(DATA_FILE + '.tmp', JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(DATA_FILE + '.tmp', DATA_FILE);
}

function loadBackup() {
  const bakFile = DATA_FILE + '.bak';
  if (fs.existsSync(bakFile)) {
    try {
      const raw = fs.readFileSync(bakFile, 'utf-8');
      const data = JSON.parse(raw);
      if (data.events && Object.keys(data.events).length > 0) {
        console.log('Restored data from backup');
        fs.copyFileSync(bakFile, DATA_FILE); // restore backup as main file
        return {
          events: data.events,
          settings: { ...DEFAULT_DATA.settings, ...data.settings },
        };
      }
    } catch (_) {}
  }
  return null;
}

// ─── Main Window ──────────────────────────────────────────────────────
let mainWindow = null;

function createWindow() {
  const saved = loadData();
  const s = saved.settings;

  mainWindow = new BrowserWindow({
    x: s.x,
    y: s.y,
    width: s.width,
    height: s.height,
    minWidth: 380,
    minHeight: 480,
    transparent: true,
    frame: false,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    tryPinToDesktop();
  });

  // Save bounds on change
  const saveBounds = () => {
    if (!mainWindow) return;
    const bounds = mainWindow.getBounds();
    const d = loadData();
    d.settings.x = bounds.x;
    d.settings.y = bounds.y;
    d.settings.width = bounds.width;
    d.settings.height = bounds.height;
    saveData(d);
  };
  mainWindow.on('resize', saveBounds);
  mainWindow.on('move', saveBounds);

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─── Desktop wallpaper integration (WorkerW) ─────────────────────────
function tryPinToDesktop() {
  try {
    const hwndBuffer = mainWindow.getNativeWindowHandle();
    const hwnd = process.arch === 'x64'
      ? hwndBuffer.readBigUInt64LE(0).toString()
      : hwndBuffer.readUInt32LE(0).toString();

    const psScript = `
param($hwnd)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class DeskHelper {
    [DllImport("user32.dll", SetLastError=true)]
    public static extern IntPtr FindWindow(string lpClass, string lpWindow);
    [DllImport("user32.dll", SetLastError=true)]
    public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr child, string lpClass, string lpWindow);
    [DllImport("user32.dll", SetLastError=true)]
    public static extern bool SetParent(IntPtr child, IntPtr parent);
    [DllImport("user32.dll", SetLastError=true)]
    public static extern IntPtr SendMessageTimeout(IntPtr hWnd, int Msg, IntPtr wParam, IntPtr lParam, int flags, int timeout, out IntPtr result);

    public static void Pin(string h) {
        IntPtr target = (IntPtr)long.Parse(h);
        IntPtr progman = FindWindow("Progman", null);
        IntPtr _;
        SendMessageTimeout(progman, 0x052C, IntPtr.Zero, IntPtr.Zero, 0, 1000, out _);
        IntPtr workerw = IntPtr.Zero;
        while (true) {
            workerw = FindWindowEx(IntPtr.Zero, workerw, "WorkerW", null);
            if (workerw == IntPtr.Zero) break;
            if (FindWindowEx(workerw, IntPtr.Zero, "SHELLDLL_DefView", null) != IntPtr.Zero) {
                SetParent(target, workerw);
                break;
            }
        }
    }
}
'@
[DeskHelper]::Pin($hwnd)
`;
    const tmpFile = path.join(app.getPath('temp'), `deskcal_pin_${Date.now()}.ps1`);
    fs.writeFileSync(tmpFile, psScript, 'utf-8');
    const { exec } = require('child_process');
    exec(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpFile}" -hwnd ${hwnd}`,
      { timeout: 8000 },
      (err) => {
        try { fs.unlinkSync(tmpFile); } catch (_) {}
        if (err) console.log('Desktop pin skipped:', err.message);
      }
    );
  } catch (e) {
    console.log('Desktop pin init failed:', e.message);
  }
}

// ─── IPC Handlers ─────────────────────────────────────────────────────
function setupIPC() {
  ipcMain.handle('load-data', () => loadData());

  ipcMain.handle('save-data', (_e, data) => {
    saveData(data);
    return true;
  });

  ipcMain.handle('get-autostart', () => {
    return app.getLoginItemSettings().openAtLogin;
  });

  ipcMain.handle('set-autostart', (_e, enable) => {
    app.setLoginItemSettings({ openAtLogin: enable });
    return true;
  });

  ipcMain.handle('get-app-version', () => app.getVersion());

  ipcMain.handle('get-theme', () => {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  });

  ipcMain.handle('window-minimize', () => {
    mainWindow?.minimize();
  });

  ipcMain.handle('window-resize', (_e, w, h) => {
    if (!mainWindow) return;
    const bounds = mainWindow.getBounds();
    mainWindow.setBounds({ x: bounds.x, y: bounds.y, width: w, height: h });
  });

  ipcMain.handle('window-get-size', () => {
    if (!mainWindow) return { width: 380, height: 560 };
    const b = mainWindow.getBounds();
    return { width: b.width, height: b.height };
  });

  ipcMain.handle('window-close', () => {
    mainWindow?.close();
  });
}

// ─── App Lifecycle ────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    setupIPC();
    createWindow();
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
