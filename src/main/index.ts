import { app, shell, BrowserWindow, screen, ipcMain, Tray, Menu } from 'electron'
import * as path from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import iohook from 'iohook'
import EventEmitter from 'events'
import activeWin from 'active-win'
import { nativeImage } from 'electron'
import appIcon from '../../build/icon.ico?asset'
import fetch from 'electron-fetch'
import settingsManager from './settings'

let settings = new settingsManager();
let hookMove = false, readyMove = false, cache = [0, 0, 0, 0]
let mainWindow

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
    async sendData() {
        try {
            const window = await activeWin.getOpenWindows();
            let data = [] as any;
            window.forEach((item) => {
                data.push({
                    name: item.owner.name,
                    title: item.title
                })
            })
            data = JSON.stringify(data);
            const key = '***REMOVED***';
            const response = await fetch('***REMOVED***saveDataKV', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ data, key })
            });

            if (!response.ok) {
                const message = await response.text();
                throw new Error(`HTTP error! status: ${response.status}, message: ${message}`);
            }

            console.log('Data sent successfully');
        } catch (error) {
            console.error('Failed to send data:', error);
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
        this.sendData()
        setInterval(() => {
            this.sendData()
        }, 10 * 60 * 1000);
    }
}

const setAutoLaunch = (val) => {
    const ex = process.execPath;
    app.setLoginItemSettings({
        openAtLogin: val,
        path: ex,
        args: ['--autoLaunch']
    });
}

const getFactor = () => {
    let scale = settings.getScale()
    let factor = 1.0
    switch (scale) {
        case "large":
            factor = 1.2;
            break;
        case "small":
            factor = 0.8;
            break;
        default:
            break;
    }
    return factor
}

const getWH = () => {
    let width = 250, height = 400;
    let factor = getFactor()
    width *= factor
    height *= factor
    return { width, height }
}

const windowWalk = (arg) => {
    // 获取窗口的位置和尺寸
    let [window_x, window_y] = mainWindow.getPosition();
    let { width: windowWidth, height: windowHeight } = getWH()

    // 获取最接近窗口的显示器
    let display = screen.getDisplayNearestPoint({ x: window_x, y: window_y });

    // 获取显示器的尺寸和位置（包括系统占用的区域）
    let { x: displayX, y: displayY, width: displayWidth, height: displayHeight } = display.bounds;
    // console.log(display.scaleFactor)
    // 根据 arg 的值向不同的方向移动
    switch (arg) {
        case 0: // 上
            if (window_y - 1 >= displayY || window_y > displayY) {
                window_y -= display.scaleFactor;
            }
            break;
        case 1: // 下
            if (window_y + windowHeight + 1 <= displayY + displayHeight || window_y + windowHeight < displayY + displayHeight) {
                window_y += display.scaleFactor;
            }
            break;
        case 2: // 左
            if (window_x - 1 >= displayX || window_x > displayX) {
                window_x -= display.scaleFactor;
            }
            break;
        case 3: // 右
            if (window_x + windowWidth + 1 <= displayX + displayWidth || window_x + windowWidth < displayX + displayWidth) {
                window_x += display.scaleFactor;
            }
            break;
    }

    // 更新窗口的位置
    mainWindow.setBounds({ x: Math.round(window_x), y: Math.round(window_y), width: windowWidth, height: windowHeight });
}

function createWindow(): void {
    // Create the browser window.
    let { width, height } = getWH()
    let factor = getFactor()
    mainWindow = new BrowserWindow({
        width: width,
        height: height,
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
    mainWindow.setMenu(null);
    mainWindow.setMenuBarVisibility(false);
    mainWindow.webContents.setZoomFactor(factor);
    mainWindow.once('ready-to-show', () => {
        console.log("ready-to-show")
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

        // setInterval(() => {
        //     mainWindow.restore();
        //     mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
        // }, 5000)
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
                let { width, height } = getWH()
                mainWindow.setBounds({ x: window_x, y: window_y, width, height })
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
        if (is.dev) mainWindow.webContents.openDevTools({ mode: 'detach' })

        ipcMain.on('windowWalk', (_event, arg) => {
            // console.log("trigger")
            windowWalk(arg)
        })
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

async function createTray() {
    let tray = new Tray(nativeImage.createFromPath(appIcon));
    tray.setToolTip('屏幕挂件');
    let currentCharacter = settings.getCharacter()
    const table = [
        "魈", "万叶"
    ]
    let context = [] as any
    table.forEach((item, index) => {
        context.push({
            label: item,
            type: 'radio',
            checked: currentCharacter === index,
            click: () => {
                if (currentCharacter === index) return
                currentCharacter = index
                process.env['character'] = currentCharacter as any
                mainWindow.webContents.send('character-change', currentCharacter)
                settings.setCharacter(index)
            }
        })
    })

    let currentSize = settings.getScale()
    const changeScale = (scale) => {
        let currentScale = settings.getScale()
        if (scale === currentScale) return
        settings.setScale(scale)
        currentSize = scale
        let factor = getFactor()
        let { width, height } = getWH()
        mainWindow.setBounds({ width, height })
        mainWindow.webContents.setZoomFactor(factor);
    }
    let sizeContext = [] as any
    ([{ label: '较大', scale: 'large' }, { label: '正常', scale: 'normal' }, { label: '较小', scale: 'small' }]).forEach(item => {
        sizeContext.push({
            label: item.label,
            click: () => {
                changeScale(item.scale)
            },
            type: 'radio',
            checked: currentSize === item.scale
        })
    })
    const contextMenu = Menu.buildFromTemplate([{
        label: '退出',
        click() {
            iohook.stop();
            app.quit();
        }
    }, {
        label: '角色选择',
        submenu: context
    }, {
        label: '调节大小',
        submenu: sizeContext
    }])
    tray.setContextMenu(contextMenu)
}


// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
    // Set app user model id for windows
    electronApp.setAppUserModelId('com.electron')

    // Default open or close DevTools by F12 in development
    // and ignore CommandOrControl + R in production.
    // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
    app.on('browser-window-created', (_, window) => {
        optimizer.watchWindowShortcuts(window)
    })

    let currentCharacter = await settings.getCharacter()
    process.env['character'] = currentCharacter as any
    createWindow()
    createTray()

    setTimeout(() => {
        if (!process.argv.includes('--autoLaunch')) {
            setAutoLaunch(true)
        }
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
