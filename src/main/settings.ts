import { app } from 'electron';
import JSONdb from 'simple-json-db';
import * as path from 'path';

class settingsManager {
    private db: JSONdb;

    constructor() {
        const userDataPath = (app).getPath('userData');
        this.db = new JSONdb(path.join(userDataPath, 'settings.json'), {
            asyncWrite: true
        });
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
}

export default settingsManager;