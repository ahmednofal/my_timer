const { app, BrowserWindow, Tray, Menu, globalShortcut, nativeImage, ipcMain, screen } = require('electron');
const path = require('path');

// Disable GPU sandbox for AppImage compatibility
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('disable-dev-shm-usage');

const WIDGET_WIDTH = 410; // slightly wider than CSS 380px to account for shadows
const MARGIN = 16;

let mainWindow = null;
let tray = null;
let isQuitting = false;

const isLinux = process.platform === 'linux';
const useSafeLinuxWindow = isLinux && app.isPackaged;

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();

  mainWindow = new BrowserWindow({
    width: WIDGET_WIDTH,
    height: 200,          // will be updated by renderer via IPC
    x: useSafeLinuxWindow ? undefined : workArea.x + workArea.width - WIDGET_WIDTH - MARGIN,
    y: useSafeLinuxWindow ? undefined : workArea.y + MARGIN,
    frame: useSafeLinuxWindow,
    transparent: !useSafeLinuxWindow,
    alwaysOnTop: true,
    skipTaskbar: !useSafeLinuxWindow,
    resizable: false,
    focusable: true,
    show: false,  // Don't show until ready
    title: 'Interval Timer',
    backgroundColor: '#111111',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  
  // Show window when it's ready to avoid blank window
  mainWindow.once('ready-to-show', () => {
    if (useSafeLinuxWindow) {
      mainWindow.center();
    }
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Renderer reports content height whenever layout changes
  ipcMain.on('resize-window', (_e, height) => {
    if (mainWindow && height > 0) {
      mainWindow.setSize(WIDGET_WIDTH, height + 20);
    }
  });

  const isDev = process.env.ELECTRON_DEV === 'true';
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  // On Linux, WMs raise the clicked window BEFORE Electron gets the blur event,
  // so re-asserting alwaysOnTop on blur fires too early. Use a short delay so
  // we re-stack AFTER the WM has finished its raise operation.
  // moveTop() re-stacks without stealing keyboard focus.
  mainWindow.on('blur', () => {
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setAlwaysOnTop(true, 'screen-saver');
        mainWindow.moveTop();
      }
    }, 50);
  });

  // Belt-and-suspenders: re-assert every 2s in case a WM ignores the hint
  setInterval(() => {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
      mainWindow.setAlwaysOnTop(true, 'screen-saver');
    }
  }, 2000);
}

function createTray() {
  // Create a simple tray icon (16x16 colored square)
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMklEQVQ4T2NkYPj/n4EBCxg1gEEYm0sMDAwMjMjqGBkZcbrh/38GBmxeGDVg0AUDAACvSA0RWxOuRgAAAABJRU5ErkJggg=='
  );

  tray = new Tray(icon);
  tray.setToolTip('Interval Timer');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show/Hide',
      click: () => {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
    }
  });
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) {
        mainWindow.show();
      }
      mainWindow.focus();
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  createTray();

  // Global shortcut to toggle visibility
  globalShortcut.register('CommandOrControl+Shift+T', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show();
  }
});
