/**
 * Browser-compatible Synthesizer Adapter
 * Wraps the existing SynthesizerAdapter to work in browsers
 * Generates instance.json from Ethereum transactions
 */

import { SynthesizerAdapter, type SynthesizerResult as CoreSynthesizerResult } from '../interface/adapters/synthesizerAdapter.ts';

export interface SynthesizerConfig {
  rpcUrl: string;
}

// Re-export types from core adapter
export type { CoreSynthesizerResult as SynthesizerResult };

export class BrowserSynthesizerAdapter {
  private adapter: SynthesizerAdapter;

  constructor(config: SynthesizerConfig) {
    this.adapter = new SynthesizerAdapter({ rpcUrl: config.rpcUrl });
  }

  /**
   * Initialize: No-op for browser (kept for API compatibility)
   * The underlying SynthesizerAdapter loads resources on-demand
   */
  async initialize(): Promise<void> {
    console.log('[BrowserSynthesizerAdapter] Ready (resources load on-demand)');
  }

  /**
   * Synthesize a transaction into circuit instance
   *
   * @param txHash - Ethereum transaction hash (with or without 0x prefix)
   * @param outputPath - Optional path for intermediate outputs (not used in browser)
   * @returns Instance JSON, placement variables, permutation, and transaction metadata
   */
  async synthesize(txHash: string, outputPath?: string): Promise<CoreSynthesizerResult> {
    console.log('[BrowserSynthesizerAdapter] Processing transaction...');

    // Delegate to the core adapter which now uses the new architecture
    const result = await this.adapter.synthesize(txHash, outputPath);

    console.log('[BrowserSynthesizerAdapter] ✅ Complete');
    return result;
  }

  /**
   * Check if ready (always true for browser adapter)
   */
  isReady(): boolean {
    return true;
  }
}

