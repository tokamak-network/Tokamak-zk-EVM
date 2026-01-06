import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { StateSnapshot } from "src/TokamakL2JS/index.ts";

export function writeSnapshotJson(snapshot: StateSnapshot, path: string) {
    const stateSnapshotPath = resolve(path, 'state_snapshot.json');
    writeFileSync(
        stateSnapshotPath,
        JSON.stringify(snapshot, (_key, value) => (typeof value === 'bigint' ? value.toString() : value), 2),
        'utf-8',
    );
}

export function readJson<T>(path: string): T {
    console.log(`[SynthesizerAdapter] Loading file from ${path}...`);
    if (!existsSync(path)) {
    throw new Error(`State snapshot file not found: ${path}`);
    }
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
}