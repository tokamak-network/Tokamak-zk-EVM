export type SynthesizerSimulationOpts = {
  rpcUrl: string,
  blockNumber: number,
  contractAddress: `0x${string}`,
  addressListL1: `0x${string}`[],
  publicKeyListL2: Uint8Array[],

  // TX Info
  senderL2PrvKey: Uint8Array,
  txNonce: bigint,
  userStorageSlots: number[],
  callData: Uint8Array,
}