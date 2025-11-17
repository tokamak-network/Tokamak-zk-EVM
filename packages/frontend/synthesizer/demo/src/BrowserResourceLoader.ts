/**
 * Browser-compatible resource loader for Synthesizer
 * Replaces Node.js fs/path APIs with fetch API
 */

export interface CircuitResources {
  globalWireList: any;
  setupParams: any;
  subcircuitInfo: any;
  subcircuitJsons: Map<number, any>;
  subcircuitWasms: Map<number, ArrayBuffer>;
}

export class BrowserResourceLoader {
  private baseUrl: string;
  private cache: Partial<CircuitResources> = {};

  constructor(baseUrl: string = '/circuits') {
    // Remove trailing slash
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /**
   * Load all circuit resources required for Synthesizer
   */
  async loadAll(): Promise<CircuitResources> {
    console.log('[BrowserResourceLoader] Loading circuit resources...');

    const [globalWireList, setupParams, subcircuitInfo] = await Promise.all([
      this.loadJson('globalWireList.json'),
      this.loadJson('setupParams.json'),
      this.loadJson('subcircuitInfo.json'),
    ]);

    console.log('[BrowserResourceLoader] Loaded base configuration files');

    // Load all 20 subcircuit JSONs in parallel
    const subcircuitJsonPromises = Array.from({ length: 20 }, (_, i) =>
      this.loadJson(`json/subcircuit${i}.json`).then(data => ({ id: i, data })),
    );

    const subcircuitJsonResults = await Promise.all(subcircuitJsonPromises);
    const subcircuitJsons = new Map(subcircuitJsonResults.map(r => [r.id, r.data]));

    console.log('[BrowserResourceLoader] Loaded subcircuit JSON metadata');

    // Load all 20 subcircuit WASMs in parallel
    const subcircuitWasmPromises = Array.from({ length: 20 }, (_, i) =>
      this.loadWasm(`wasm/subcircuit${i}.wasm`).then(data => ({ id: i, data })),
    );

    const subcircuitWasmResults = await Promise.all(subcircuitWasmPromises);
    const subcircuitWasms = new Map(subcircuitWasmResults.map(r => [r.id, r.data]));

    console.log('[BrowserResourceLoader] Loaded subcircuit WASM files');

    const resources: CircuitResources = {
      globalWireList,
      setupParams,
      subcircuitInfo,
      subcircuitJsons,
      subcircuitWasms,
    };

    this.cache = resources;
    console.log('[BrowserResourceLoader] All resources loaded successfully');

    return resources;
  }

  /**
   * Load a JSON file from the server
   */
  private async loadJson(path: string): Promise<any> {
    const url = `${this.baseUrl}/${path}`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      throw new Error(`Failed to load JSON from ${url}: ${error}`);
    }
  }

  /**
   * Load a WASM file from the server
   */
  private async loadWasm(path: string): Promise<ArrayBuffer> {
    const url = `${this.baseUrl}/${path}`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.arrayBuffer();
    } catch (error) {
      throw new Error(`Failed to load WASM from ${url}: ${error}`);
    }
  }

  /**
   * Get cached resources (if available)
   */
  getCached(): Partial<CircuitResources> | null {
    return Object.keys(this.cache).length > 0 ? this.cache : null;
  }
}

