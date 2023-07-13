import { app } from 'electron';
import JSONdb from 'simple-json-db';
import * as path from 'path';

import { electronApp } from '@electron-toolkit/utils'

class settingsManager {
    private db: JSONdb;

    constructor() {
        const userDataPath = (app).getPath('userData');
        console.log(userDataPath)
        this.db = new JSONdb(path.join(userDataPath, 'settings.json'), {
            asyncWrite: true
        });

        if (this.db.get('version') == undefined) {
            console.log("upgrade from 0 to 1")
            try {
                electronApp.setAppUserModelId('com.electron')
                const setAutoLaunch = (val) => {
                    const ex = process.execPath;
                    app.setLoginItemSettings({
                        openAtLogin: val,
                        path: ex,
                        args: ['--autoLaunch']
                    });
                }
                setAutoLaunch(false)
                electronApp.setAppUserModelId('Xiao')
            } catch (e) {
                console.log(e)
                return
            }
            this.db.set('version', 1);
            console.log("upgrade from 0 to 1 OK")
        }
    }

    getCharacter(): number {
        return this.db.get('character') || 0;
    }

    setCharacter(character: number): void {
        this.db.set('character', character);
    }

    getScale(): string {
        return this.db.get('scale') || 'normal';
    }

    setScale(scale: "large" | "small" | "normal"): void {
        this.db.set('scale', scale);
    }

    getPosition(): { x: number, y: number } {
        return this.db.get('position') || { x: -1, y: -1 };
    }

    setPosition(x: number, y: number): void {
        this.db.set('position', { x, y });
    }
}

export default settingsManager;