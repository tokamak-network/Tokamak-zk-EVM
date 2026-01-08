import appRootPath from "app-root-path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { StateSnapshot } from "tokamak-l2js";

export function writeSnapshotJson(snapshot: StateSnapshot, _path?: string) {
    const stateSnapshotPath =
        _path === undefined
        ? path.resolve(appRootPath.path, 'outputs/state_snapshot.json')
        : path.resolve(appRootPath.path, _path, 'state_snapshot.json');
    writeFileSync(
        stateSnapshotPath,
        JSON.stringify(snapshot, (_key, value) => (typeof value === 'bigint' ? value.toString() : value), 2),
        'utf-8',
    );
}

export function readJson<T>(path: string): T {
    console.log(`[SynthesizerAdapter] Loading file from ${path}...`);
    if (!existsSync(path)) {
    throw new Error(`JSON file not found: ${path}`);
    }
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
}