# State Channel Transaction Flow

## 현재 문제점

현재 `SynthesizerAdapter`는 **transaction hash**를 받아서 RPC로부터 트랜잭션을 가져옵니다:

```typescript
synthesize(txHash: string) {
  const tx = await this.provider.getTransaction(txHash); // ❌ State channel에는 hash가 없음!
  // ...
}
```

### State Channel에서는:
- ✅ Transaction이 블록체인에 **제출되지 않음**
- ✅ Transaction hash가 **존재하지 않음**
- ✅ 대신 **transaction data를 직접 전달**해야 함
- ✅ Merkle root만 계속 변화함

---

## 해결 방법

### Option A: Transaction Data 직접 전달

```typescript
interface TransactionData {
  from: string;        // Sender L2 address (Edwards point)
  to: string;          // Contract address
  data: string;        // Calldata (0x...)
  value?: bigint;      // ETH amount (optional)
  nonce?: bigint;      // L2 nonce
}

// State channel용 메소드
synthesizeTransaction(
  txData: TransactionData,
  options?: SynthesizeOptions
): Promise<SynthesizerResult>
```

**사용 예시**:
```typescript
const proof1 = await adapter.synthesizeTransaction({
  from: '0x...', // L2 address
  to: '0x2be5e8c109e2197D077D13A82dAead6a9b3433C5', // TON contract
  data: '0xa9059cbb...', // transfer(address,uint256)
  value: 0n,
  nonce: 0n,
});

const proof2 = await adapter.synthesizeTransaction({
  from: '0x...', // Different sender
  to: '0x2be5e8c109e2197D077D13A82dAead6a9b3433C5',
  data: '0xa9059cbb...', // Different amount
  value: 0n,
  nonce: 1n,
}, {
  previousState: proof1.state, // ← State chain!
});
```

---

### Option B: Transaction Builder 패턴

```typescript
class TransactionBuilder {
  from(address: string): this;
  to(address: string): this;
  callFunction(selector: string, ...params: any[]): this;
  value(amount: bigint): this;
  build(): TransactionData;
}

// 사용 예시
const txData = new TransactionBuilder()
  .from('0x...')
  .to('0x2be5e8c109e2197D077D13A82dAead6a9b3433C5')
  .callFunction('transfer', recipientAddress, amount)
  .build();

const proof = await adapter.synthesizeTransaction(txData);
```

---

## 추천 구현

### 1. Interface 정의

```typescript
// src/interface/adapters/types.ts

export interface L2TransactionData {
  from: string;        // L2 sender address (hex or Edwards point)
  to: string;          // Contract address
  data: string;        // Calldata (0x...)
  value?: bigint;      // ETH amount (default: 0n)
  nonce?: bigint;      // L2 nonce (default: 0n)
}

export interface SynthesizeOptions {
  previousState?: StateSnapshot;
  outputPath?: string;
}
```

### 2. Adapter 메소드 추가

```typescript
// src/interface/adapters/synthesizerAdapter.ts

class SynthesizerAdapter {

  /**
   * Synthesize from RPC transaction hash (for testing/replay)
   */
  async synthesizeFromRPC(
    txHash: string,
    options?: SynthesizeOptions
  ): Promise<SynthesizerResult> {
    // Existing implementation
    const tx = await this.provider.getTransaction(txHash);
    // ...
  }

  /**
   * Synthesize from L2 transaction data (for state channel)
   */
  async synthesizeTransaction(
    txData: L2TransactionData,
    options?: SynthesizeOptions
  ): Promise<SynthesizerResult> {
    const { previousState, outputPath } = options || {};

    console.log(`[SynthesizerAdapter] Processing L2 transaction`);
    console.log(`  From: ${txData.from}`);
    console.log(`  To: ${txData.to}`);
    console.log(`  Data: ${txData.data}`);
    console.log(`  Value: ${txData.value || 0n}`);
    console.log(`  Nonce: ${txData.nonce || 0n}`);

    // L2 addresses 직접 사용
    const eoaAddresses = this.extractEOAFromTransactionData(txData);

    // Generate L2 key pairs
    const l2KeyPairs = eoaAddresses.map((_, idx) => this.generateL2KeyPair(idx));
    const publicKeyListL2 = l2KeyPairs.map(kp => kp.publicKey);
    const senderL2PrvKey = l2KeyPairs[0].privateKey;

    // Build simulation options
    const simulationOpts: SynthesizerSimulationOpts = {
      txNonce: txData.nonce || 0n,
      callData: hexToBytes(addHexPrefix(txData.data)),
      contractAddress: txData.to,
      publicKeyListL2,
      senderL2PrvKey,
      rpcUrl: this.rpcUrl,
    };

    // Create synthesizer
    const synthesizerOpts = await createSynthesizerOptsForSimulationFromRPC(simulationOpts);
    const synthesizer = (await createSynthesizer(synthesizerOpts)) as Synthesizer;

    // Restore previous state if provided
    if (previousState) {
      console.log('[SynthesizerAdapter] Restoring previous state...');
      const stateManager = synthesizer.getTokamakStateManager();
      await stateManager.createStateFromSnapshot(previousState);
      console.log(`[SynthesizerAdapter] ✅ Previous state restored: ${previousState.stateRoot}`);
    }

    // Execute transaction
    const runTxResult = await synthesizer.synthesizeTX();

    // Generate circuit outputs
    const circuitGenerator = await synthesizer.createCircuitGenerator();
    const { instance, placementVariables, permutation } = circuitGenerator;

    // Export final state
    const stateManager = synthesizer.getTokamakStateManager();
    const finalState = await stateManager.exportState();

    // Write outputs if path provided
    if (outputPath) {
      // ... write files ...
    }

    return {
      instance: { a_pub: instance.a_pub as string[] },
      placementVariables,
      permutation,
      state: finalState,
      metadata: {
        from: txData.from,
        to: txData.to,
        data: txData.data,
        value: (txData.value || 0n).toString(),
        nonce: (txData.nonce || 0n).toString(),
        stateRoot: finalState.stateRoot,
      },
    };
  }

  private extractEOAFromTransactionData(txData: L2TransactionData): string[] {
    // Extract sender and recipient from transaction data
    const sender = txData.from;

    // Extract recipient from calldata if it's a transfer
    const data = hexToBytes(addHexPrefix(txData.data));
    const functionSelector = bytesToHex(data.slice(0, 4));

    if (functionSelector === '0xa9059cbb') { // transfer(address,uint256)
      const recipient = bytesToHex(data.slice(4, 36)); // address parameter
      return [sender, addHexPrefix(recipient)];
    }

    return [sender];
  }
}
```

---

## State Channel 사용 예시

### 1. 연속적인 트랜잭션 처리

```typescript
import { SynthesizerAdapter } from '@tokamak-zk-evm/synthesizer';

const adapter = new SynthesizerAdapter({ rpcUrl });

// Proposal 1: Alice → Bob (100 TON)
const proof1 = await adapter.synthesizeTransaction({
  from: aliceL2Address,
  to: TON_CONTRACT,
  data: encodeTransfer(bobL2Address, 100n * 10n**18n),
  nonce: 0n,
});

console.log('Proof 1 State Root:', proof1.state.stateRoot);
await db.save('proof-001', proof1.state);

// Proposal 2: Bob → Charlie (50 TON)
const previousState = await db.load('proof-001');
const proof2 = await adapter.synthesizeTransaction({
  from: bobL2Address,
  to: TON_CONTRACT,
  data: encodeTransfer(charlieL2Address, 50n * 10n**18n),
  nonce: 1n,
}, {
  previousState, // ← Load previous state!
});

console.log('Proof 2 State Root:', proof2.state.stateRoot);
// State root가 변경됨! (다른 트랜잭션 실행)
```

### 2. Helper 함수

```typescript
// Helper: Encode transfer function call
function encodeTransfer(recipient: string, amount: bigint): string {
  const functionSelector = '0xa9059cbb'; // transfer(address,uint256)
  const recipientPadded = recipient.replace('0x', '').padStart(64, '0');
  const amountHex = amount.toString(16).padStart(64, '0');
  return `${functionSelector}${recipientPadded}${amountHex}`;
}

// Helper: Encode approve function call
function encodeApprove(spender: string, amount: bigint): string {
  const functionSelector = '0x095ea7b3'; // approve(address,uint256)
  const spenderPadded = spender.replace('0x', '').padStart(64, '0');
  const amountHex = amount.toString(16).padStart(64, '0');
  return `${functionSelector}${spenderPadded}${amountHex}`;
}
```

---

## 마이그레이션 가이드

### Before (현재 - RPC 의존)

```typescript
// ❌ Transaction hash 필요 (블록체인에 있어야 함)
const proof = await adapter.synthesize(
  '0xa0090893a2d5f79b67cebcb65eac3efc92820ec09dc4ad9fe2bc29bbdcad2e41'
);
```

### After (State Channel용)

```typescript
// ✅ Transaction data 직접 전달
const proof = await adapter.synthesizeTransaction({
  from: '0x...',
  to: '0x2be5e8c109e2197D077D13A82dAead6a9b3433C5',
  data: '0xa9059cbb...',
  nonce: 0n,
});
```

### 병행 사용

```typescript
// RPC에서 가져오기 (테스트/디버깅)
const proof1 = await adapter.synthesizeFromRPC(txHash);

// Direct data (State channel)
const proof2 = await adapter.synthesizeTransaction(txData, {
  previousState: proof1.state,
});
```

---

## 장점

### ✅ 1. Transaction Hash 불필요
- 블록체인에 제출하지 않아도 됨
- State channel의 본질에 부합

### ✅ 2. 유연성
- 임의의 트랜잭션 생성 가능
- 다양한 시나리오 테스트 가능

### ✅ 3. State Root 변화 추적
- 각 트랜잭션마다 다른 state root
- Merkle tree가 정확히 업데이트됨

### ✅ 4. 성능
- RPC 호출 불필요
- 로컬에서 완전히 처리

---

## 다음 단계

1. ✅ **Interface 정의** - `L2TransactionData` 타입
2. ✅ **Adapter 확장** - `synthesizeTransaction()` 메소드 추가
3. ✅ **Helper 함수** - `encodeTransfer()`, `encodeApprove()` 등
4. ✅ **테스트** - 연속 트랜잭션 state chain 검증
5. ✅ **문서화** - 사용 예시 및 마이그레이션 가이드

---

**Last Updated**: 2025-11-18
**Version**: 1.0

