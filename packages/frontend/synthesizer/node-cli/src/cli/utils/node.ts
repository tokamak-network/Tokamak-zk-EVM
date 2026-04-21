import { existsSync, readFileSync } from "node:fs";

export function readJson<T>(path: string): T {
    console.log(`[SynthesizerAdapter] Loading file from ${path}...`);
    if (!existsSync(path)) {
    throw new Error(`JSON file not found: ${path}`);
    }
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
}
