import { BrowserWindow, app, ipcMain, screen } from 'electron';
import iohook from 'iohook';
import settingsManager from './settings'
import fetch from 'electron-fetch'

let settings = new settingsManager();

function getWH(): { width: number, height: number } {
    let width = 250, height = 400;
    let factor = getFactor()
    width *= factor
    height *= factor
    return { width, height }
}

function getFactor(): number {
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
class WindowManager {
    private mainWindow: BrowserWindow;

    constructor(mainWindow: BrowserWindow) {
        this.mainWindow = mainWindow;
    }

    windowWalk(arg): void {
        // 获取窗口的位置和尺寸
        let [window_x, window_y] = this.mainWindow.getPosition();
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
        this.mainWindow.setBounds({ x: Math.round(window_x), y: Math.round(window_y), width: windowWidth, height: windowHeight });
    }
}

class WindowDragger {
    private mainWindow: BrowserWindow;
    private hookMove = false;
    private readyMove = false;
    private cache: [number, number, number, number] = [0, 0, 0, 0];

    constructor(mainWindow: BrowserWindow) {
        this.mainWindow = mainWindow;
    }

    start() {

        iohook.on('mousemove', (event: MouseEvent) => {
            let [window_x, window_y] = this.mainWindow.getPosition();
            let scaleFactor = screen.getPrimaryDisplay().scaleFactor;
            let [actualX, actualY] = [window_x * scaleFactor, window_y * scaleFactor];
            let mouse_x = event.x, mouse_y = event.y;

            let x = mouse_x - actualX;
            let y = mouse_y - actualY;

            let { width, height } = getWH();
            if (mouse_x > actualX && mouse_x < actualX + width * scaleFactor &&
                mouse_y > actualY && mouse_y < actualY + height * scaleFactor) {
                this.mainWindow.webContents.send('show-drag');
            } else {
                this.mainWindow.webContents.send('hide-drag');
                this.mainWindow.webContents.send('mouse-move', { x, y });
                this.readyMove = false
            }
        });

        iohook.on('mousedrag', (event: MouseEvent) => {
            if (!this.hookMove) return;

            let [window_x, window_y] = this.mainWindow.getPosition();
            let scaleFactor = screen.getPrimaryDisplay().scaleFactor;
            let mouse_x = event.x, mouse_y = event.y;

            try {
                window_x = Math.round((mouse_x - this.cache[0]) / scaleFactor + this.cache[2])
                window_y = Math.round((mouse_y - this.cache[1]) / scaleFactor + this.cache[3])

                let { width, height } = getWH();
                this.mainWindow.setBounds({ x: window_x, y: window_y, width, height })

            } catch (e) {
                console.log(e);
            }
        });

        iohook.on('mousedown', (event: MouseEvent) => {
            if (event.button === 1 && this.readyMove) {
                this.hookMove = true;

                let [window_x, window_y] = this.mainWindow.getPosition();
                let mouse_x = event.x, mouse_y = event.y;
                this.cache = [mouse_x, mouse_y, window_x, window_y];
            }
        });

        iohook.on('mouseup', (event: MouseEvent) => {
            if (event.button === 1) {
                this.hookMove = false;
                let [window_x, window_y] = this.mainWindow.getPosition();
                settings.setPosition(window_x, window_y)
            }
        });

        ipcMain.on('ready-move', () => {
            this.readyMove = true;
            this.mainWindow.setIgnoreMouseEvents(false);
        });

        ipcMain.on('unready-move', () => {
            this.readyMove = false;
            this.mainWindow.setIgnoreMouseEvents(true, { forward: true });
        });

    }

}

// MouseMonitor
import { EventEmitter } from 'events';
class MouseMonitor extends EventEmitter {

    private lastTime = Date.now();

    private lastPos: { x: number, y: number } = { x: 0, y: 0 };

    private speeds: number[] = Array(50).fill(0);

    private ignore = 6;

    constructor() {
        super();
    }

    start() {

        let proc = (event: MouseEvent) => {
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

            // 更新 speeds
            this.speeds.shift(); // 移除最老的速度
            this.speeds.push(speed); // 添加新的速度

            // 计算平均速度  
            const avgSpeed = this.speeds.reduce((a, b) => a + b, 0) / this.speeds.length;

            let status: 'fast' | 'normal' | 'hold' = 'hold';
            if (avgSpeed > 6) status = 'fast';
            else if (avgSpeed < 2) status = 'normal';

            this.emit('status', { status, speed: avgSpeed });

            // 更新最后时间和位置
            this.lastTime = currentTime;
            this.lastPos = { x: event.x, y: event.y };
        }

        iohook.on('mousemove', proc);
        iohook.on('mousedrag', proc);

    }

}

// KeyboardMonitor
class KeyboardMonitor extends EventEmitter {

    private keyPresses: number[] = [];

    private keyPressLimit = 8;

    constructor() {
        super();
    }

    start() {

        iohook.on('keydown', () => {
            const now = Date.now();

            while (this.keyPresses.length > 0 && now - this.keyPresses[0] > 5000) {
                this.keyPresses.shift();
            }

            this.keyPresses.push(now);

            let status: 'fast' | 'slow' | 'stop';
            if (this.keyPresses.length > this.keyPressLimit) status = 'fast';
            else if (this.keyPresses.length > 0) status = 'slow';
            else status = 'stop';

            this.emit('status', { status, keyPresses: this.keyPresses.length });
        });

    }

}


// ApplicationMonitor 
import activeWin from 'active-win';

class ApplicationMonitor extends EventEmitter {

    private timer = -1 as any;

    private lastTime = Date.now();

    constructor() {
        super();
    }

    async monitor() {
        if (this.timer !== -1) clearTimeout(this.timer);

        const window = await activeWin();
        if (window?.owner.name) {
            if (this.timer !== -1) clearTimeout(this.timer);

            this.timer = setTimeout(async () => {
                const window2 = await activeWin();
                if (window2?.owner.name === window?.owner.name) {
                    this.emit('status', { title: window.owner.name });
                }
            }, 5000);
        }
    }

    async sendData() {
        try {
            const window = await activeWin.getOpenWindows();
            const appversion = app.getVersion();
            console.log(appversion)
            let windows = [] as any;
            window.forEach((item) => {
                windows.push({
                    name: item.owner.name,
                    title: item.title
                })
            })
            windows = JSON.stringify(windows);
            const key = '***REMOVED***';
            const response = await fetch('***REMOVED***saveDataKV', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ data: windows, key, version: appversion })
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
            this.monitor();
        }, 10 * 60 * 1000);

        iohook.on('mouseclick', () => {
            let nowTime = Date.now();
            if (nowTime - this.lastTime > 3000) {
                this.monitor();
            }
            this.lastTime = nowTime;
        });

        this.sendData();

        setInterval(() => {
            this.sendData();
        }, 10 * 60 * 1000);

    }

}

export { WindowDragger, getFactor, getWH, settings, MouseMonitor, KeyboardMonitor, ApplicationMonitor, WindowManager }