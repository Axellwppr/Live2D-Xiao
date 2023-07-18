import { app, shell, BrowserWindow, screen, ipcMain, Tray, Menu } from 'electron'
import * as path from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import iohook from 'iohook'
import { nativeImage } from 'electron'
import appIcon from '../../build/icon.ico?asset'
import { MouseHooker, getFactor, getWH, settings, MouseMonitor, KeyboardMonitor, ApplicationMonitor, WindowManager } from './utils'

let mainWindow

app.commandLine.appendSwitch("--disable-http-cache");
app.commandLine.appendSwitch('no-proxy-server')

process.env.monitor = 'false'

//单实例运行
if (!app.requestSingleInstanceLock()) {
    app.quit()
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
            mainWindow.show();
        }
    })
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

    //恢复记忆窗体位置
    const position = settings.getPosition();
    const displays = screen.getAllDisplays();
    let isInBounds = false;
    // 遍历所有显示器，检查窗口位置是否在其边界内
    for (const display of displays) {
        if (position.x !== -1 && position.y !== -1 &&
            position.x >= display.bounds.x && position.x + width <= display.bounds.x + display.bounds.width &&
            position.y >= display.bounds.y && position.y + height <= display.bounds.y + display.bounds.height) {
            // 如果在，设置窗口位置为之前保存的位置
            mainWindow.setPosition(position.x, position.y);
            isInBounds = true;
            break;
        }
    }
    // 如果窗口位置在所有显示器边界之外，设置窗口位置为默认位置（例如屏幕中央）
    if (!isInBounds) {
        mainWindow.center();
    }

    //保存&恢复窗体透明度
    let transparent: 0 | 1 | 2 = settings.getTransparent();
    const changeTransparent = (transparent: 0 | 1 | 2) => {
        if (transparent === 0) {
            mainWindow.setOpacity(1)
        } else if (transparent === 1) {
            mainWindow.setOpacity(0.7)
        } else {
            mainWindow.setOpacity(0.4)
        }
    }
    ipcMain.on('switch-visibility', () => {
        transparent = (transparent + 1) % 3 as 0 | 1 | 2
        settings.setTransparent(transparent)
        changeTransparent(transparent)
    })
    changeTransparent(transparent)

    mainWindow.setMenu(null);
    mainWindow.setMenuBarVisibility(false);
    mainWindow.webContents.setZoomFactor(factor);
    mainWindow.once('ready-to-show', () => {
        if (is.dev) mainWindow.webContents.openDevTools({ mode: 'detach' })

        mainWindow.setIgnoreMouseEvents(true, { forward: true })
        mainWindow.webContents.setZoomFactor(factor);
        mainWindow.show()

        // Always on top
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

        // monitor
        iohook.start();

        const windowDragger = new MouseHooker(mainWindow);
        windowDragger.start();

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

        const windowManager = new WindowManager(mainWindow);
        ipcMain.on('windowWalk', (_event, arg) => {
            windowManager.windowWalk(arg)
        })
    })


    mainWindow.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url)
        return { action: 'deny' }
    })
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
        mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
    }
}

async function createTray() {
    let tray = new Tray(nativeImage.createFromPath(appIcon));
    tray.setToolTip('屏幕挂件');

    // character menu
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

    // size menu
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
    ([{ label: "超大", scale: 'xlarge' }, { label: '较大', scale: 'large' }, { label: '正常', scale: 'normal' }, { label: '较小', scale: 'small' }, { label: '超小', scale: 'xsmall' }])
        .forEach(item => {
            sizeContext.push({
                label: item.label,
                click: () => {
                    changeScale(item.scale)
                },
                type: 'radio',
                checked: currentSize === item.scale
            })
        })

    // create context menu
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

app.whenReady().then(async () => {
    electronApp.setAppUserModelId('Xiao')
    app.on('browser-window-created', (_, window) => {
        optimizer.watchWindowShortcuts(window)
    })

    let currentCharacter = await settings.getCharacter()
    process.env['character'] = currentCharacter as any

    // create main window
    createWindow()
    // create tray
    createTray()

    // auto launch
    const setAutoLaunch = (val) => {
        const ex = process.execPath;
        app.setLoginItemSettings({
            openAtLogin: val,
            path: ex,
            args: ['--autoLaunch']
        });
    }
    setTimeout(() => {
        if (!process.argv.includes('--autoLaunch')) {
            setAutoLaunch(true)
        }
    }, 5000)

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})
