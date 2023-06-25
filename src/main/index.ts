import { app, shell, BrowserWindow, screen, ipcMain, Tray, Menu } from 'electron'
import * as path from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import iohook from 'iohook'
import EventEmitter from 'events'
import activeWin from 'active-win'
import { nativeImage } from 'electron'
import appIcon from '../../build/icon.ico?asset'

let hookMove = false, readyMove = false, cache = [0, 0, 0, 0]

class MouseMonitor extends EventEmitter {
    lastTime: number
    lastPos: { x: any; y: any }
    speeds: any
    ignore: number
    constructor() {
        super();
        this.lastTime = Date.now();
        this.lastPos = { x: 0, y: 0 };
        this.speeds = Array(50).fill(0); // Store last 10 speeds
        this.ignore = 6;
    }

    start() {
        let proc = (event) => {
            if (this.ignore > 0) {
                this.ignore--;
                return;
            }
            this.ignore = 6;
            const currentTime = Date.now();
            const distance = Math.hypot(event.x - this.lastPos.x, event.y - this.lastPos.y);
            const timeElapsed = currentTime - this.lastTime; // in ms
            if (timeElapsed >= 2000) {
                this.speeds = Array(50).fill(0);
            }

            const speed = distance / timeElapsed; // px/ms

            // Update speeds
            this.speeds.shift(); // Remove the oldest speed
            this.speeds.push(speed); // Add the new speed

            // Calculate average speed
            const avgSpeed = this.speeds.reduce((a, b) => a + b, 0) / this.speeds.length;

            let status = 'hold';
            if (avgSpeed > 6) status = 'fast';
            else if (avgSpeed < 2) status = 'normal';

            this.emit('status', { status, speed: avgSpeed });

            // console.log(status, avgSpeed)
            // Update last time and position
            this.lastTime = currentTime;
            this.lastPos = { x: event.x, y: event.y };
        }
        iohook.on('mousemove', proc);
        iohook.on('mousedrag', proc);
    }
}

class KeyboardMonitor extends EventEmitter {
    keyPresses: any
    keyPressLimit: any
    constructor() {
        super();
        this.keyPresses = [];
        this.keyPressLimit = 8; // Adjust the limit as per your requirement
    }

    start() {
        iohook.on('keydown', () => {
            // Get current timestamp
            const now = Date.now();

            // Remove all key presses older than 10 seconds
            while (this.keyPresses.length > 0 && now - this.keyPresses[0] > 5000) {
                this.keyPresses.shift();
            }

            // Add current key press
            this.keyPresses.push(now);

            // Emit event
            let status;
            if (this.keyPresses.length > this.keyPressLimit) status = 'fast';
            else if (this.keyPresses.length > 0) status = 'slow';
            else status = 'stop';

            this.emit('status', { status, keyPresses: this.keyPresses.length });
        });
    }
}

class ApplicationMonitor extends EventEmitter {
    timer: any
    lasttime: number
    constructor() {
        super();
        this.timer = -1,
            this.lasttime = Date.now();
    }
    async monitor() {
        if (this.timer != -1) clearTimeout(this.timer)
        const window = await activeWin();
        if (window?.owner.name) {
            if (this.timer != -1) clearTimeout(this.timer)
            this.timer = setTimeout(async () => {
                const window2 = await activeWin();
                if (window2?.owner.name == window?.owner.name) {
                    this.emit('status', { title: window.owner.name });
                    console.log(window.owner.name)
                }
            }, 5000);
        }
    }
    start() {
        setInterval(() => {
            this.monitor()
        }, 10 * 60 * 1000);
        iohook.on('mouseclick', () => {
            let nowtime = Date.now()
            if (nowtime - this.lasttime > 3000) {
                this.monitor()
            }
            this.lasttime = nowtime
        });
    }
}

var setAutoLaunch = (val) => {
    const ex = process.execPath;
    app.setLoginItemSettings({
        openAtLogin: val,
        path: ex,
        args: ['--autoLaunch']
    });
}

function createWindow(): void {
    // Create the browser window.
    const mainWindow = new BrowserWindow({
        width: 250,
        height: 400,
        show: false,
        autoHideMenuBar: true,
        transparent: true,
        frame: false,
        resizable: false,
        maximizable: false,
        ...(process.platform === 'linux'
            ? {
                icon: path.join(__dirname, '../../build/icon.png')
            }
            : {}),
        webPreferences: {
            preload: path.join(__dirname, '../preload/index.js'),
            sandbox: false
        }
    })

    mainWindow.on('ready-to-show', () => {
        mainWindow.setIgnoreMouseEvents(true, { forward: true })
        mainWindow.show()
        mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
        mainWindow.setSkipTaskbar(true);
        mainWindow.on('hide', () => {
            mainWindow.restore();
            mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
        })
        mainWindow.on('minimize', () => {
            mainWindow.restore();
            mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
        })
        mainWindow.on('always-on-top-changed', () => {
            mainWindow.restore();
            mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
        })

        setInterval(() => {
            mainWindow.restore();
            mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
            // let [window_x, window_y] = mainWindow.getPosition();
            // mainWindow.setBounds({x: window_x, y: window_y, width: 250, height: 400})
        }, 5000)
        iohook.start();

        iohook.on('mousemove', event => {
            let [window_x, window_y] = mainWindow.getPosition();
            let scaleFactor = screen.getPrimaryDisplay().scaleFactor;
            let [actualX, actualY] = [window_x * scaleFactor, window_y * scaleFactor];
            let mouse_x = event.x, mouse_y = event.y;

            let x = mouse_x - actualX;
            let y = mouse_y - actualY;
            // console.log(mouse_x, mouse_y, actualX, actualY)
            let [width, height] = mainWindow.getSize()
            let [actualXr, actualYb] = [actualX + width * scaleFactor, actualY + height * scaleFactor];
            if (mouse_x > actualX && mouse_x < actualXr && mouse_y > actualY && mouse_y < actualYb) {
                mainWindow.webContents.send('show-drag');
            } else {
                mainWindow.webContents.send('hide-drag');
                mainWindow.webContents.send('mouse-move', { x, y });
                readyMove = false
            }
        });
        iohook.on('mousedrag', event => {
            if (!hookMove) return;
            let [window_x, window_y] = mainWindow.getPosition();
            let scaleFactor = screen.getPrimaryDisplay().scaleFactor;
            let mouse_x = event.x, mouse_y = event.y;
            try {
                window_x = Math.round((mouse_x - cache[0]) / scaleFactor + cache[2])
                window_y = Math.round((mouse_y - cache[1]) / scaleFactor + cache[3])
                // console.log((mouse_x - cache[0]) / scaleFactor + cache[2], (mouse_y - cache[1]) / scaleFactor + cache[3])
                mainWindow.setBounds({ x: window_x, y: window_y, width: 250, height: 400 })
            } catch (e) {
                console.log(e)
            }
        })
        iohook.on('mousedown', event => {
            if (event.button == 1 && readyMove) {
                hookMove = true
                let [window_x, window_y] = mainWindow.getPosition();
                let mouse_x = event.x, mouse_y = event.y;
                cache = [mouse_x, mouse_y, window_x, window_y]
            }
        })
        iohook.on('mouseup', event => {
            if (event.button == 1) {
                hookMove = false
            }
        })
        ipcMain.on('ready-move', () => {
            readyMove = true
            mainWindow.setIgnoreMouseEvents(false);
        })
        ipcMain.on('unready-move', () => {
            readyMove = false
            mainWindow.setIgnoreMouseEvents(true, { forward: true });
        })

        const mouseMonitor = new MouseMonitor();
        mouseMonitor.on('status', data => {
            mainWindow.webContents.send('mouse-status', data.status);
        });
        mouseMonitor.start();

        const keyboardMonitor = new KeyboardMonitor();
        keyboardMonitor.on('status', data => {
            mainWindow.webContents.send('keyboard-status', data.status);
        });
        keyboardMonitor.start();

        const applicationMonitor = new ApplicationMonitor();
        applicationMonitor.on('status', data => {
            mainWindow.webContents.send('application-status', data.title);
        });
        applicationMonitor.start();
    })

    mainWindow.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url)
        return { action: 'deny' }
    })

    // HMR for renderer base on electron-vite cli.
    // Load the remote URL for development or the local html file for production.
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
        mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
    }
}

function createTray() {
    let tray = new Tray(nativeImage.createFromPath(appIcon));
    tray.setToolTip('魈宝宝');
    const contextMenu = Menu.buildFromTemplate([{
        label: '退出',
        click() {
            app.quit();
        }
    }])
    tray.setContextMenu(contextMenu)
}


// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
    // Set app user model id for windows
    electronApp.setAppUserModelId('com.electron')

    // Default open or close DevTools by F12 in development
    // and ignore CommandOrControl + R in production.
    // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
    app.on('browser-window-created', (_, window) => {
        optimizer.watchWindowShortcuts(window)
    })

    createWindow()
    createTray()

    setTimeout(() => {
        setAutoLaunch(true)
    }, 5000)
    app.on('activate', function () {
        // On macOS it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.
