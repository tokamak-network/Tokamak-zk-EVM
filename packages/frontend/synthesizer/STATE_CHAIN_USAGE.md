# State Chain Usage Guide

## Overview

이 문서는 Tokamak L2 State Channel에서 **연속적인 proof 생성과 state 추적** 기능을 사용하는 방법을 설명합니다.

---

## 🎯 핵심 기능

### 1. State Export
Synthesis 완료 후 현재 상태를 저장할 수 있습니다.

```typescript
const result = await adapter.synthesize(txHash);
const currentState = result.state; // StateSnapshot
```

### 2. State Import
이전 상태를 복원하여 다음 proof를 생성할 수 있습니다.

```typescript
const result2 = await adapter.synthesize(txHash2, {
  previousState: result1.state // 이전 state 사용
});
```

### 3. State Chain
연속된 proof들이 state를 공유하면서 체인을 형성합니다.

```
Initial → Proof 1 → Proof 2 → Proof 3 → ... → Final
  ↓         ↓         ↓         ↓              ↓
State 0  State 1   State 2   State 3       State N
```

---

## 📦 데이터 구조

### StateSnapshot

```typescript
interface StateSnapshot {
  stateRoot: string;            // Merkle root (상태 식별자)
  merkleLeaves?: string[];      // Merkle leaves (빠른 복원용)
  registeredKeys: string[];     // 등록된 storage keys
  storageEntries: StorageEntry[]; // 실제 storage 값들

  // Metadata
  contractAddress: string;      // L1 컨트랙트 주소
  userL2Addresses: string[];    // L2 참여자 주소들
  userStorageSlots: bigint[];   // 사용된 storage slots
  timestamp: number;            // 스냅샷 시각
}

interface StorageEntry {
  index: number;                // Storage 인덱스
  key: string;                  // L2 storage key (hex)
  value: string;                // Storage value (hex)
}
```

---

## 🚀 사용 예시

### Example 1: 단일 Proof 생성

```typescript
import { SynthesizerAdapter } from '@tokamak-zk-evm/synthesizer';

const adapter = new SynthesizerAdapter({ rpcUrl });

// Proof 생성
const result = await adapter.synthesize(txHash);

console.log('State Root:', result.state.stateRoot);
console.log('Storage Entries:', result.state.storageEntries.length);
console.log('a_pub:', result.instance.a_pub);
```

---

### Example 2: 연속 Proof 생성 (State Chain)

```typescript
import { SynthesizerAdapter } from '@tokamak-zk-evm/synthesizer';

const adapter = new SynthesizerAdapter({ rpcUrl });

// === Proof 1 ===
const proof1 = await adapter.synthesize(txHash1);
console.log('Proof 1 State:', proof1.state.stateRoot);

// === Proof 2 (이전 state 사용) ===
const proof2 = await adapter.synthesize(txHash2, {
  previousState: proof1.state // ← 체인 연결!
});
console.log('Proof 2 State:', proof2.state.stateRoot);

// === Proof 3 (계속 체인) ===
const proof3 = await adapter.synthesize(txHash3, {
  previousState: proof2.state
});
console.log('Proof 3 State:', proof3.state.stateRoot);
```

---

### Example 3: State 저장 및 복원 (DB 사용)

```typescript
import { SynthesizerAdapter } from '@tokamak-zk-evm/synthesizer';
import { StateSnapshot } from '@tokamak-zk-evm/synthesizer/types';

// 가상의 DB 인터페이스
interface StateDB {
  save(proofId: string, state: StateSnapshot): Promise<void>;
  load(proofId: string): Promise<StateSnapshot | null>;
}

const adapter = new SynthesizerAdapter({ rpcUrl });
const db: StateDB = /* your DB implementation */;

// === Proof 1 생성 및 저장 ===
const proof1 = await adapter.synthesize(txHash1);
await db.save('proof-001', proof1.state);
console.log('Proof 1 saved');

// === 나중에 이어서 Proof 2 생성 ===
const previousState = await db.load('proof-001');
if (!previousState) {
  throw new Error('Previous state not found');
}

const proof2 = await adapter.synthesize(txHash2, {
  previousState // DB에서 복원한 state 사용
});
await db.save('proof-002', proof2.state);
console.log('Proof 2 saved');
```

---

### Example 4: State 변화 추적

```typescript
function compareStates(state1: StateSnapshot, state2: StateSnapshot) {
  console.log('State Comparison:');
  console.log('─'.repeat(50));

  // Root 비교
  console.log(`Root Changed: ${state1.stateRoot !== state2.stateRoot}`);
  console.log(`  Before: ${state1.stateRoot}`);
  console.log(`  After:  ${state2.stateRoot}`);

  // Storage 변화 추적
  console.log('\nStorage Changes:');
  state2.storageEntries.forEach((entry2, idx) => {
    const entry1 = state1.storageEntries[idx];
    if (entry1 && entry1.value !== entry2.value) {
      console.log(`  [${idx}] ${entry1.value} → ${entry2.value}`);
    }
  });

  // 시간 차이
  const timeDiff = state2.timestamp - state1.timestamp;
  console.log(`\nTime Elapsed: ${timeDiff}ms`);
}

// 사용
const proof1 = await adapter.synthesize(txHash1);
const proof2 = await adapter.synthesize(txHash2, {
  previousState: proof1.state
});

compareStates(proof1.state, proof2.state);
```

---

## 🧪 테스트 실행

### 기본 테스트 (단일 TX)

```bash
cd packages/frontend/synthesizer
tsx test-adapter.ts
```

### State Chain 테스트 (연속 Proof)

```bash
cd packages/frontend/synthesizer
tsx test-state-chain.ts
```

출력 예시:
```
🧪 Testing State Chain Functionality
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Proof 1: Initial State
────────────────────────────────────────────────────────────
Transaction: 0xa009...

✅ Proof 1 Generated:
   State Root: 0xbbbb...
   Storage Entries: 8
   a_pub length: 64

📊 Proof 2: Chained State (Using Previous State)
────────────────────────────────────────────────────────────
Previous State Root: 0xbbbb...

✅ Proof 2 Generated:
   State Root: 0xcccc...
   Storage Entries: 8

✅ State Chain Test Complete!
```

---

## 💾 State 저장 방법

### Option A: In-Memory (간단한 테스트)

```typescript
const stateHistory: StateSnapshot[] = [];

// Proof 1
const proof1 = await adapter.synthesize(txHash1);
stateHistory.push(proof1.state);

// Proof 2
const proof2 = await adapter.synthesize(txHash2, {
  previousState: stateHistory[stateHistory.length - 1]
});
stateHistory.push(proof2.state);
```

### Option B: File System (로컬 개발)

```typescript
import { writeFileSync, readFileSync } from 'fs';

// Save
const proof1 = await adapter.synthesize(txHash1);
writeFileSync(
  './states/proof-001.json',
  JSON.stringify(proof1.state, null, 2)
);

// Load
const previousState = JSON.parse(
  readFileSync('./states/proof-001.json', 'utf8')
);
const proof2 = await adapter.synthesize(txHash2, { previousState });
```

### Option C: Database (프로덕션)

```typescript
// IndexedDB (브라우저)
import { openDB } from 'idb';

const db = await openDB('state-channel', 1, {
  upgrade(db) {
    db.createObjectStore('states', { keyPath: 'proofId' });
  },
});

// Save
await db.put('states', {
  proofId: 'proof-001',
  state: proof1.state
});

// Load
const record = await db.get('states', 'proof-001');
const previousState = record.state;
```

---

## ⚠️ 주의사항

### 1. State 순서 중요
Proof는 반드시 순서대로 생성되어야 합니다:
```typescript
// ✅ 올바른 순서
Proof 1 → Proof 2 → Proof 3

// ❌ 잘못된 순서 (Proof 1 건너뜀)
Proof 2 (previousState: null) // Error!
```

### 2. State Root 검증
이전 proof의 state root와 현재 proof의 previous state root가 일치해야 합니다:
```typescript
if (proof1.state.stateRoot !== expectedRoot) {
  throw new Error('State root mismatch!');
}
```

### 3. Storage 크기
`StateSnapshot`은 모든 storage entries와 merkle leaves를 포함하므로 크기가 클 수 있습니다.
- 전체 저장: 빠른 복원, 큰 용량
- Merkle root만 저장: 느린 복원, 작은 용량

---

## 🔧 고급 기능

### State Manager 직접 접근

```typescript
import { createSynthesizer } from '@tokamak-zk-evm/synthesizer';

const synthesizer = await createSynthesizer(opts);
const stateManager = synthesizer.getTokamakStateManager();

// Export
const state = await stateManager.exportState();

// Import
await stateManager.createStateFromSnapshot(state);

// Merkle root 조회
const root = await stateManager.getUpdatedMerkleTreeRoot();
```

---

## 📚 참고 문서

- [STATE_CHANNEL_SPECIFICATION.md](./STATE_CHANNEL_SPECIFICATION.md) - 전체 스펙
- [State Manager Types](./src/TokamakL2JS/stateManager/types.ts) - 타입 정의
- [Synthesizer Adapter](./src/interface/adapters/synthesizerAdapter.ts) - 구현 코드

---

## 🐛 트러블슈팅

### "State manager not initialized" 에러
```typescript
// ❌ 잘못된 사용
const state = await stateManager.exportState(); // Error!

// ✅ 올바른 사용
await stateManager.initTokamakExtendsFromRPC(rpcUrl, opts);
const state = await stateManager.exportState(); // OK
```

### "TokamakL2StateManager not available" 에러
```typescript
// Synthesizer가 TokamakL2StateManager를 사용하지 않는 경우
// createSynthesizerOptsForSimulationFromRPC로 생성된 opts 사용 필요
```

### State 복원 후 값이 다름
```typescript
// Merkle leaves 포함 여부 확인
if (!snapshot.merkleLeaves || snapshot.merkleLeaves.length === 0) {
  console.warn('Slow path: recalculating merkle tree from storage');
}
```

---

## ✨ 다음 단계

1. **컨트랙트 통합**: State root를 on-chain에 제출
2. **서명 수집**: 참여자들의 서명 수집 로직
3. **UI 구현**: 브라우저에서 state chain 시각화
4. **성능 최적화**: Merkle tree 재계산 최적화

---

**Last Updated**: 2025-11-18
**Version**: 1.0

