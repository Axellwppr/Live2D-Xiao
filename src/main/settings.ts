import { app } from 'electron';
import JSONdb from 'simple-json-db';
import * as path from 'path';

class settingsManager {
    private db: JSONdb;

    constructor() {
        const userDataPath = (app).getPath('userData');
        console.log(userDataPath)
        this.db = new JSONdb(path.join(userDataPath, 'settings.json'), {
            asyncWrite: true
        });

        const defaultSettings = {
            version: 2,
            character: 0,
            scale: 'normal',
            position: { x: -1, y: -1 },
            transparent: 0
        };
        if (this.db.get('version') != defaultSettings.version) {
            this.db.JSON(defaultSettings)
        }
    }

    getVerion(): number {
        return this.db.get('version') || 0;
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

    setScale(scale: "large" | "small" | "normal" | "xlarge" | "xsmall"): void {
        this.db.set('scale', scale);
    }

    getPosition(): { x: number, y: number } {
        return this.db.get('position') || { x: -1, y: -1 };
    }

    setPosition(x: number, y: number): void {
        this.db.set('position', { x, y });
    }

    getTransparent(): 0 | 1 | 2 {
        return this.db.get('transparent') || 0;
    }

    setTransparent(transparent: 0 | 1 | 2): void {
        this.db.set('transparent', transparent);
    }
}

export default settingsManager;