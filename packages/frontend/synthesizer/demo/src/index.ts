/**
 * Browser entry point for Tokamak Synthesizer
 *
 * Usage:
 * ```typescript
 * import { BrowserSynthesizerAdapter } from '@tokamak-zk-evm/synthesizer/browser';
 *
 * const synthesizer = new BrowserSynthesizerAdapter({
 *   rpcUrl: 'https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY'
 * });
 *
 * await synthesizer.initialize(); // Optional, no-op but kept for API compatibility
 * const result = await synthesizer.synthesize('0x123...');
 * console.log(result.instance.a_pub); // The instance.json data
 * ```
 */

export { BrowserSynthesizerAdapter } from './BrowserSynthesizerAdapter.ts';
export { BrowserResourceLoader } from './BrowserResourceLoader.ts';
export type { SynthesizerConfig, SynthesizerResult } from './BrowserSynthesizerAdapter.ts';
export type { CircuitResources } from './BrowserResourceLoader.ts';

