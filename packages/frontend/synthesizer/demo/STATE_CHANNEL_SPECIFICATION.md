# Tokamak L2 State Channel - Complete Specification

> **Status**: ✅ Approved by Leader
> **Version**: 1.0
> **Last Updated**: 2025-11-17

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture Diagrams](#architecture-diagrams)
   - [Leader Flow](#leader-flow)
   - [Participant Verification Flow](#participant-verification-flow)
   - [State Chain](#state-chain)
3. [Key Concepts](#key-concepts)
4. [Implementation Plan](#implementation-plan)
   - [Phase 1: State Management](#phase-1-state-management)
   - [Phase 2: Synthesizer Integration](#phase-2-synthesizer-integration)
   - [Phase 3: Channel Manager](#phase-3-channel-manager)
   - [Phase 4: State Database](#phase-4-state-database)
5. [Usage Examples](#usage-examples)
6. [Implementation Checklist](#implementation-checklist)
7. [Open Questions](#open-questions)

---

## Overview

Tokamak L2 State Channel은 **Full Verification** 방식을 사용합니다:

- **리더**: 트랜잭션 실행 → Proof 생성 → State Export → 브로드캐스트
- **참여자**: State Import → 신디사이저 재실행 → 검증 → 서명
- **트랜잭션 생성**: 모든 서명 수집 후 최종 트랜잭션 생성

### Core Philosophy

- L1 상태는 변경하지 않음 (읽기만)
- 모든 상태 변화는 In-memory (Synthesizer EVM)
- State는 DB에 저장/복원
- 각 참여자가 독립적으로 회로 배치 검증

---

## Architecture Diagrams

### Leader Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Initial State (L1)                              │
│  RPC → Storage: {Alice: 100 TON, Bob: 50 TON}                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
        ┌──────────────────────────────────────────────────┐
        │         Channel Leader (Proof 1)                 │
        └──────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  Step 1: Synthesizer Execution                                          │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │ TX1: Alice → Bob (10 TON)                                      │    │
│  │                                                                 │    │
│  │ Input:  previousState = Initial (Alice: 100, Bob: 50)         │    │
│  │ Execute: EVM Simulation (in-memory)                           │    │
│  │ Output:                                                         │    │
│  │   - instance (a_pub)                                           │    │
│  │   - placementVariables                                         │    │
│  │   - permutation                                                │    │
│  │   - newState (Alice: 90, Bob: 60)  ← In-memory 변경!          │    │
│  └────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  Step 2: Proof Generation                                               │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │ Prover.prove(instance) → proof1                                │    │
│  └────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  Step 3: State Export                                                   │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │ stateManager.exportState()                                     │    │
│  │                                                                 │    │
│  │ StateSnapshot {                                                │    │
│  │   stateRoot: "0xbbbb...",                                      │    │
│  │   storageEntries: [                                            │    │
│  │     {                                                           │    │
│  │       index: 0,                                                 │    │
│  │       key: "0x290decd9...ef3e563",  // L2 storage key         │    │
│  │       value: "0x04e1003b28d9280000"  // 90 TON (hex)          │    │
│  │     },                                                          │    │
│  │     {                                                           │    │
│  │       index: 1,                                                 │    │
│  │       key: "0x7d8c4a3b...0d8e7f",                              │    │
│  │       value: "0x034630bcbf7e400000"  // 60 TON (hex)          │    │
│  │     }                                                           │    │
│  │   ],                                                            │    │
│  │   registeredKeys: [...],                                       │    │
│  │   merkleLeaves: [...]                                          │    │
│  │ }                                                               │    │
│  └────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  Step 4: Save to DB                                                     │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │ db.save("channel-123", "proof-001", {                          │    │
│  │   proof: proof1,                                               │    │
│  │   instance: instance1,                                         │    │
│  │   placement: placementVariables1,                              │    │
│  │   permutation: permutation1,                                   │    │
│  │   state: StateSnapshot                                         │    │
│  │ })                                                              │    │
│  └────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  Step 5: Broadcast                                                      │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │ websocket.broadcast(proof-001)                                 │    │
│  │   → All participants                                           │    │
│  └────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
        ┌──────────────────────────────────────────────────┐
        │        Proof 2 (다음 TX)                          │
        └──────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  Step 6: Load Previous State                                            │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │ prevState = db.load("channel-123", "proof-001")                │    │
│  │                                                                 │    │
│  │ StateSnapshot {                                                │    │
│  │   stateRoot: "0xbbbb...",                                      │    │
│  │   storageEntries: [...]  ← Proof1 결과                         │    │
│  │ }                                                               │    │
│  └────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  Step 7: State Import                                                   │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │ stateManager = new TokamakL2StateManager()                     │    │
│  │ stateManager.importState(prevState)                            │    │
│  │                                                                 │    │
│  │ In-memory 복원:                                                 │    │
│  │   - putStorage() for each entry                                │    │
│  │   - Merkle tree 재구성                                          │    │
│  └────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  Step 8: Synthesizer Execution (Proof 2)                                │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │ TX2: Bob → Charlie (5 TON)                                     │    │
│  │                                                                 │    │
│  │ Input:  previousState (Alice: 90, Bob: 60)  ← Proof1 결과!     │    │
│  │ Execute: EVM Simulation                                        │    │
│  │ Output:  newState (Alice: 90, Bob: 55, Charlie: 5)            │    │
│  └────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
                            ... 반복 ...
```

---

### Participant Verification Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Participant (검증 참여)                               │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  Step 1: Receive Proof Proposal                                         │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │ websocket.on('proof', (data) => {                              │    │
│  │   proof: {                                                      │    │
│  │     txHash,                                                     │    │
│  │     proof,                                                      │    │
│  │     instance,                                                   │    │
│  │     placement,                                                  │    │
│  │     permutation,                                                │    │
│  │     newState                                                    │    │
│  │   }                                                             │    │
│  │ })                                                              │    │
│  └────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  Step 2: Load Previous State (내 DB에서)                                │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │ prevState = myDB.load("channel-123", "proof-000")              │    │
│  └────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  Step 3: Synthesizer Re-execution                                       │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │ myResult = synthesizer.synthesize(txHash, {                    │    │
│  │   previousState: prevState                                     │    │
│  │ })                                                              │    │
│  │                                                                 │    │
│  │ 내가 직접 계산:                                                  │    │
│  │   - myInstance                                                  │    │
│  │   - myPlacement                                                 │    │
│  │   - myPermutation                                               │    │
│  │   - myState                                                     │    │
│  └────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  Step 4: Compare (Full Verification)                                    │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │ if (myInstance === receivedInstance &&                         │    │
│  │     myPlacement === receivedPlacement &&                       │    │
│  │     myPermutation === receivedPermutation &&                   │    │
│  │     myState.stateRoot === receivedState.stateRoot) {           │    │
│  │   ✅ "검증 성공!"                                                │    │
│  │   canSign = true                                               │    │
│  │ } else {                                                        │    │
│  │   ❌ "검증 실패! 리더가 조작!"                                   │    │
│  │   canSign = false                                              │    │
│  │ }                                                               │    │
│  └────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  Step 5: Save to My DB (if valid)                                      │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │ if (canSign) {                                                  │    │
│  │   myDB.save("channel-123", "proof-001", myState)               │    │
│  │ }                                                               │    │
│  └────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### State Chain

```
Initial State (L1)
     ↓
┌─────────────┐
│   Proof 0   │  stateRoot: 0xaaaa
│  (Initial)  │  Alice: 100, Bob: 50
└─────────────┘
     ↓ TX1: Alice → Bob (10)
     ↓ exportState() → save DB
     ↓
┌─────────────┐
│   Proof 1   │  stateRoot: 0xbbbb
│             │  Alice: 90, Bob: 60
└─────────────┘
     ↓ load from DB
     ↓ importState()
     ↓ TX2: Bob → Charlie (5)
     ↓
┌─────────────┐
│   Proof 2   │  stateRoot: 0xcccc
│             │  Alice: 90, Bob: 55, Charlie: 5
└─────────────┘
     ↓ load from DB
     ↓ importState()
     ↓ TX3: ...
     ↓
┌─────────────┐
│   Proof 3   │  stateRoot: 0xdddd
│             │  ...
└─────────────┘
     ↓
    ...
     ↓
┌─────────────────┐
│  트랜잭션 생성   │
│ (서명 수집 완료) │
└─────────────────┘
```

---

## Key Concepts

### 1. State는 항상 In-memory

- L1 Ethereum 상태는 변하지 않음
- Synthesizer의 EVM 시뮬레이션 결과만 저장
- 각 참여자가 독립적으로 In-memory 상태 관리

### 2. exportState() = 스냅샷

- 현재 in-memory state를 JSON으로 변환
- Storage entries (실제 키-값 쌍) 포함
- Merkle root + Merkle leaves 포함 (빠른 복원)

### 3. importState() = 복원

- JSON에서 in-memory state로 복원
- `putStorage()`로 하나씩 복원
- Merkle tree 재구성

### 4. State Chain

- Proof1의 output = Proof2의 input
- DB가 중간 state들을 저장
- 각 참여자가 독립적으로 검증

### 5. 트랜잭션 생성

- 모든 서명 수집 후 트랜잭션 생성
- 최종 state만 L1에 제출
- 중간 proof들은 L1에 안 올라감 (off-chain)

---

## Implementation Plan

### Phase 1: State Management

#### 파일: `src/TokamakL2JS/stateManager/TokamakL2StateManager.ts`

##### 1.1 State Export 메서드 추가

```typescript
import { bytesToHex, bigIntToHex } from '@ethereumjs/util';

// TokamakL2StateManager 클래스에 추가
public async exportState(): Promise<StateSnapshot> {
  const contractAddress = new Address(toBytes(this.cachedOpts!.contractAddress));

  // 1. Merkle leaves 수집 (optional, for faster reconstruction)
  const leaves = await this.convertLeavesIntoMerkleTreeLeaves();

  // 2. Current merkle root
  const merkleRoot = await this.getUpdatedMerkleTreeRoot();

  // 3. Registered keys
  const registeredKeys = this._registeredKeys!.map(k => bytesToHex(k));

  // 4. Account states (storage values)
  const storageEntries: StorageEntry[] = [];
  for (let i = 0; i < this._registeredKeys!.length; i++) {
    const key = this._registeredKeys![i];
    if (key) {
      const value = await this.getStorage(contractAddress, key);
      storageEntries.push({
        index: i,
        key: bytesToHex(key),
        value: bytesToHex(value),
      });
    }
  }

  return {
    stateRoot: bigIntToHex(merkleRoot),
    merkleLeaves: leaves.map(l => l.toString()), // Convert BigInt to string
    registeredKeys: registeredKeys,
    storageEntries: storageEntries,
    // Metadata for reconstruction
    contractAddress: this.cachedOpts!.contractAddress,
    userL2Addresses: this.cachedOpts!.userL2Addresses.map(addr => addr.toString()),
    userStorageSlots: this.cachedOpts!.userStorageSlots,
    timestamp: Date.now(),
  };
}
```

##### 1.2 State Import 메서드 추가

```typescript
import { hexToBytes, Address, toBytes } from '@ethereumjs/util';
import { createAccount } from '@ethereumjs/util';
import { RLP } from '@ethereumjs/rlp';

// TokamakL2StateManager 클래스에 추가
public async importState(snapshot: StateSnapshot): Promise<void> {
  const contractAddress = new Address(toBytes(snapshot.contractAddress));

  // 1. Contract account 설정
  const POSEIDON_RLP = this._cachedOpts!.common.customCrypto.keccak256!(
    RLP.encode(new Uint8Array([]))
  );
  const POSEIDON_NULL = this._cachedOpts!.common.customCrypto.keccak256!(
    new Uint8Array(0)
  );

  const contractAccount = createAccount({
    nonce: 0n,
    balance: 0n,
    storageRoot: POSEIDON_RLP,
    codeHash: POSEIDON_NULL
  });

  await this.putAccount(contractAddress, contractAccount);

  // 2. Storage entries 복원
  for (const entry of snapshot.storageEntries) {
    const key = hexToBytes(entry.key);
    const value = hexToBytes(entry.value);
    await this.putStorage(contractAddress, key, value);
  }

  // 3. Registered keys 복원
  this._registeredKeys = snapshot.registeredKeys.map(k => hexToBytes(k));

  // 4. cachedOpts 복원 (필수 메타데이터)
  this._cachedOpts = {
    ...this._cachedOpts, // Preserve existing if any
    contractAddress: snapshot.contractAddress,
    userL1Addresses: [], // Not stored in snapshot, might need separate handling
    userL2Addresses: snapshot.userL2Addresses.map(addr => new Address(toBytes(addr))),
    userStorageSlots: snapshot.userStorageSlots,
    common: this._cachedOpts?.common, // Preserve common
    blockNumber: 0, // Not stored in snapshot
    customCrypto: this._cachedOpts?.common.customCrypto,
  };

  // 5. Merkle tree 재구성
  if (snapshot.merkleLeaves && snapshot.merkleLeaves.length > 0) {
    // Leaves가 있으면 바로 사용 (빠름)
    const treeDepth = Math.ceil(Math.log10(MAX_MT_LEAVES) / Math.log10(POSEIDON_INPUTS));
    const leaves = snapshot.merkleLeaves.map(l => BigInt(l));
    this._initialMerkleTree = new TokamakL2MerkleTree(
      poseidon_raw as IMTHashFunction,
      treeDepth,
      0n,
      POSEIDON_INPUTS,
      leaves as IMTNode[]
    );
  } else {
    // Leaves가 없으면 storage에서 계산 (느림)
    this._initialMerkleTree = await TokamakL2MerkleTree.buildFromTokamakL2StateManager(this);
  }

  console.log(`✅ State imported: ${snapshot.stateRoot}`);
}
```

##### 1.3 타입 정의 추가

**새 파일**: `src/TokamakL2JS/stateManager/types.ts`

```typescript
export interface StorageEntry {
  index: number;
  key: string; // Hex string of the L2 storage key (e.g., "0x290decd9...")
  value: string; // Hex string of the L2 storage value (e.g., "0x04e1003b...")
}

export interface StateSnapshot {
  stateRoot: string; // Hex string of the Merkle tree root
  merkleLeaves?: string[]; // Optional: Hex strings for faster reconstruction
  registeredKeys: string[]; // Hex strings of registered L2 storage keys
  storageEntries: StorageEntry[]; // Actual storage key-value pairs

  // Metadata for reconstruction and context
  contractAddress: string; // L1 contract address
  userL2Addresses: string[]; // L2 addresses of participants
  userStorageSlots: bigint[]; // Storage slots used by participants
  timestamp: number; // Timestamp of when the state was exported
}
```

---

### Phase 2: Synthesizer Integration

#### 파일: `src/synthesizer/synthesizer.ts`

##### 2.1 StateManager Getter 추가

```typescript
import { TokamakL2StateManager } from '../TokamakL2JS/stateManager/TokamakL2StateManager.ts';

// Synthesizer 클래스에 추가
public getTokamakStateManager(): TokamakL2StateManager {
  if (!this.stateManager || !(this.stateManager instanceof TokamakL2StateManager)) {
    throw new Error('TokamakL2StateManager not available');
  }
  return this.stateManager as TokamakL2StateManager;
}
```

---

#### 파일: `src/interface/adapters/synthesizerAdapter.ts`

##### 2.2 Interface 확장

```typescript
import { StateSnapshot } from '../../TokamakL2JS/stateManager/types.ts';

export interface SynthesizerAdapterConfig {
  rpcUrl: string;
}

export interface SynthesizeOptions {
  previousState?: StateSnapshot; // ✅ 추가
  outputPath?: string;
}

export interface SynthesizerResult {
  instance: {
    a_pub: string[];
  };
  placementVariables: any[];
  permutation: Array<{
    row: number;
    col: number;
    X: number;
    Y: number;
  }>;
  state: StateSnapshot; // ✅ 추가
  metadata: {
    txHash: string;
    blockNumber: number;
    from: string;
    to: string;
    contractAddress: string;
    eoaAddresses: string[];
  };
}
```

##### 2.3 synthesize() 메서드 수정

```typescript
async synthesize(txHash: string, options?: SynthesizeOptions): Promise<SynthesizerResult> {
  const { outputPath, previousState } = options || {};

  // ... 기존 RPC 로직 (트랜잭션 가져오기, L2 주소 생성 등) ...

  // Build simulation options
  const simulationOpts: SynthesizerSimulationOpts = {
    // ... 기존 옵션들 ...
    callData: callDataL2,
  };

  // Create Synthesizer instance
  const synthesizer = createSynthesizer(simulationOpts);

  // ✅ Initialize state manager
  if (previousState) {
    // 이전 state로 초기화
    await synthesizer.getTokamakStateManager().importState(previousState);
  } else {
    // 첫 번째 TX의 경우 RPC에서 초기화
    await synthesizer.getTokamakStateManager().initTokamakExtendsFromRPC(
      this.rpcUrl,
      simulationOpts.tokamakL2Opts!
    );
  }

  // Execute synthesis
  const executedInfo = await synthesizeTX(synthesizer);
  const circuitGenerator = createCircuitGenerator(synthesizer, executedInfo);

  // ✅ Extract final state
  const finalState = await synthesizer.getTokamakStateManager().exportState();

  return {
    instance: { a_pub: circuitGenerator.a_pub },
    placementVariables: circuitGenerator.placementVariables,
    permutation: circuitGenerator.permutation,
    state: finalState, // ✅ Include final state
    metadata: {
      txHash,
      blockNumber: executedInfo.blockNumber,
      from: executedInfo.from.toString(),
      to: executedInfo.to.toString(),
      contractAddress: simulationOpts.tokamakL2Opts!.contractAddress,
      eoaAddresses: simulationOpts.eoaAddresses.map(addr => addr.toString()),
    },
  };
}
```

---

### Phase 3: Channel Manager

#### 새 파일: `src/channel/ChannelManager.ts`

```typescript
import { SynthesizerAdapter, SynthesizerResult } from '../interface/adapters/synthesizerAdapter.ts';
import { StateSnapshot } from '../TokamakL2JS/stateManager/types.ts';

export interface Proposal {
  id: string;
  txHash: string;
  instance: SynthesizerResult['instance'];
  proof: string; // Hex string of the ZK proof
  placementVariables: SynthesizerResult['placementVariables'];
  permutation: SynthesizerResult['permutation'];
  newState: StateSnapshot;
  previousStateRoot: string;
  timestamp: number;
  leaderSignature?: string;
}

export interface VerificationResult {
  isValid: boolean;
  details: {
    instanceMatch: boolean;
    placementMatch: boolean;
    permutationMatch: boolean;
    stateMatch: boolean;
  };
}

export class ChannelManager {
  private synthesizer: SynthesizerAdapter;
  private currentState: StateSnapshot | null = null;
  private proposals: Map<string, Proposal> = new Map();

  constructor(rpcUrl: string) {
    this.synthesizer = new SynthesizerAdapter({ rpcUrl });
  }

  // --- Leader's Role ---
  public async createProposal(txHash: string): Promise<Proposal> {
    console.log(`[Leader] 📝 Creating proposal for TX: ${txHash}`);

    // 1. Run Synthesizer to get new state and circuit info
    const result = await this.synthesizer.synthesize(txHash, {
      previousState: this.currentState || undefined,
    });

    // 2. Generate Proof (TODO: integrate actual prover)
    const proof = '0xMOCK_PROOF';

    // 3. Update local state
    this.currentState = result.state;

    // 4. Create proposal object
    const proposal: Proposal = {
      id: this.generateProposalId(),
      txHash: txHash,
      instance: result.instance,
      proof: proof,
      placementVariables: result.placementVariables,
      permutation: result.permutation,
      newState: result.state,
      previousStateRoot: this.currentState?.stateRoot || '0x0',
      timestamp: Date.now(),
    };

    this.proposals.set(proposal.id, proposal);
    console.log(`[Leader] Proposal ${proposal.id} created`);
    console.log(`[Leader] Previous state: ${this.currentState?.stateRoot || 'initial'}`);
    console.log(`[Leader] New state: ${result.state.stateRoot}`);

    // 5. Broadcast proposal (TODO: implement actual broadcast)
    // await this.broadcast(proposal);

    return proposal;
  }

  // --- Participant's Role ---
  public async verifyProposal(proposal: Proposal, previousState: StateSnapshot | null): Promise<VerificationResult> {
    console.log(`[Participant] 🔍 Verifying proposal ${proposal.id}...`);

    // 1. Perform Full Verification - re-run Synthesizer locally
    const myResult = await this.synthesizer.synthesize(proposal.txHash, {
      previousState: previousState || undefined,
    });

    // 2. Compare generated circuit info with received
    const instanceMatch = JSON.stringify(myResult.instance) === JSON.stringify(proposal.instance);

    const placementMatch = JSON.stringify(myResult.placementVariables) === JSON.stringify(proposal.placementVariables);

    const permutationMatch = JSON.stringify(myResult.permutation) === JSON.stringify(proposal.permutation);

    const stateMatch = myResult.state.stateRoot === proposal.newState.stateRoot;

    const isValid = instanceMatch && placementMatch && permutationMatch && stateMatch;

    if (isValid) {
      console.log(`[Participant] ✅ Proposal ${proposal.id} fully verified`);
    } else {
      console.error(`[Participant] ❌ Verification failed for ${proposal.id}`);
      console.error(`   Instance match: ${instanceMatch}`);
      console.error(`   Placement match: ${placementMatch}`);
      console.error(`   Permutation match: ${permutationMatch}`);
      console.error(`   State match: ${stateMatch}`);
    }

    return {
      isValid,
      details: {
        instanceMatch,
        placementMatch,
        permutationMatch,
        stateMatch,
      },
    };
  }

  // --- Helper Methods ---
  private generateProposalId(): string {
    return `proof-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

---

### Phase 4: State Database

#### 새 파일: `src/channel/StateDatabase.ts`

```typescript
import { StateSnapshot } from '../TokamakL2JS/stateManager/types.ts';
import { Proposal } from './ChannelManager.ts';

export interface StateDatabase {
  saveState(channelId: string, proofId: string, state: StateSnapshot): Promise<void>;
  loadState(channelId: string, proofId: string): Promise<StateSnapshot | null>;
  getLatestState(channelId: string): Promise<StateSnapshot | null>;

  saveProposal(channelId: string, proposal: Proposal): Promise<void>;
  loadProposal(channelId: string, proposalId: string): Promise<Proposal | null>;
}

// In-memory implementation (for development/testing)
export class InMemoryStateDatabase implements StateDatabase {
  private states = new Map<string, Map<string, StateSnapshot>>();
  private proposals = new Map<string, Map<string, Proposal>>();

  async saveState(channelId: string, proofId: string, state: StateSnapshot): Promise<void> {
    if (!this.states.has(channelId)) {
      this.states.set(channelId, new Map());
    }
    this.states.get(channelId)!.set(proofId, state);
    console.log(`[DB] Saved state for ${channelId}/${proofId}: ${state.stateRoot}`);
  }

  async loadState(channelId: string, proofId: string): Promise<StateSnapshot | null> {
    const channelStates = this.states.get(channelId);
    if (!channelStates) return null;
    return channelStates.get(proofId) || null;
  }

  async getLatestState(channelId: string): Promise<StateSnapshot | null> {
    const channelStates = this.states.get(channelId);
    if (!channelStates || channelStates.size === 0) return null;

    // Return the last inserted state
    const entries = Array.from(channelStates.values());
    return entries[entries.length - 1] || null;
  }

  async saveProposal(channelId: string, proposal: Proposal): Promise<void> {
    if (!this.proposals.has(channelId)) {
      this.proposals.set(channelId, new Map());
    }
    this.proposals.get(channelId)!.set(proposal.id, proposal);
    console.log(`[DB] Saved proposal ${proposal.id} for ${channelId}`);
  }

  async loadProposal(channelId: string, proposalId: string): Promise<Proposal | null> {
    const channelProposals = this.proposals.get(channelId);
    if (!channelProposals) return null;
    return channelProposals.get(proposalId) || null;
  }
}
```

---

## Usage Examples

### Example 1: Leader Creating Sequential Proofs

```typescript
import { ChannelManager } from './src/channel/ChannelManager.ts';
import { InMemoryStateDatabase } from './src/channel/StateDatabase.ts';

async function leaderWorkflow() {
  const channelId = 'channel-123';
  const rpcUrl = process.env.RPC_URL!;

  const channelManager = new ChannelManager(rpcUrl);
  const db = new InMemoryStateDatabase();

  // Transaction hashes (example)
  const tx1 = '0xa0090893a2d5f79b67cebcb65eac3efc92820ec09dc4ad9fe2bc29bbdcad2e41';
  const tx2 = '0x...';
  const tx3 = '0x...';

  // --- Proof 1 ---
  console.log('\n=== Creating Proof 1 ===');
  const proof1 = await channelManager.createProposal(tx1);
  await db.saveState(channelId, proof1.id, proof1.newState);
  await db.saveProposal(channelId, proof1);
  // await broadcast(proof1);

  // --- Proof 2 ---
  console.log('\n=== Creating Proof 2 ===');
  const proof2 = await channelManager.createProposal(tx2);
  await db.saveState(channelId, proof2.id, proof2.newState);
  await db.saveProposal(channelId, proof2);
  // await broadcast(proof2);

  // --- Proof 3 ---
  console.log('\n=== Creating Proof 3 ===');
  const proof3 = await channelManager.createProposal(tx3);
  await db.saveState(channelId, proof3.id, proof3.newState);
  await db.saveProposal(channelId, proof3);
  // await broadcast(proof3);

  console.log('\n✅ All proofs created');
}
```

---

### Example 2: Participant Verifying Proposals

```typescript
import { ChannelManager } from './src/channel/ChannelManager.ts';
import { InMemoryStateDatabase } from './src/channel/StateDatabase.ts';
import { Proposal } from './src/channel/ChannelManager.ts';

async function participantWorkflow(receivedProposal: Proposal) {
  const channelId = 'channel-123';
  const rpcUrl = process.env.RPC_URL!;

  const channelManager = new ChannelManager(rpcUrl);
  const myDB = new InMemoryStateDatabase();

  console.log(`\n[Participant] 📥 Received proposal ${receivedProposal.id}`);

  // 1. Load previous state from my DB
  const previousState = await myDB.getLatestState(channelId);

  if (!previousState && receivedProposal.previousStateRoot !== '0x0') {
    throw new Error('Missing previous state to perform verification');
  }

  // 2. Verify by re-executing Synthesizer
  const verificationResult = await channelManager.verifyProposal(receivedProposal, previousState);

  // 3. Decision
  if (verificationResult.isValid) {
    console.log(`[Participant] ✅ Verification successful. Can sign.`);

    // Save state to my DB
    await myDB.saveState(channelId, receivedProposal.id, receivedProposal.newState);
    await myDB.saveProposal(channelId, receivedProposal);

    // Sign the proposal
    // await signProposal(receivedProposal.id);
  } else {
    console.error(`[Participant] ❌ Verification failed. Cannot sign.`);
    console.error(verificationResult.details);

    // Trigger dispute mechanism
    // await raiseDispute(receivedProposal.id);
  }
}
```

---

### Example 3: Full Multi-Participant Flow

```typescript
async function fullChannelFlow() {
  const channelId = 'channel-123';
  const rpcUrl = process.env.RPC_URL!;

  // --- Setup ---
  const leaderManager = new ChannelManager(rpcUrl);
  const participant1Manager = new ChannelManager(rpcUrl);
  const participant2Manager = new ChannelManager(rpcUrl);

  const leaderDB = new InMemoryStateDatabase();
  const p1DB = new InMemoryStateDatabase();
  const p2DB = new InMemoryStateDatabase();

  // --- Proof 1: Leader creates ---
  console.log('\n=== Leader: Creating Proof 1 ===');
  const tx1 = '0xa0090893a2d5f79b67cebcb65eac3efc92820ec09dc4ad9fe2bc29bbdcad2e41';
  const proof1 = await leaderManager.createProposal(tx1);
  await leaderDB.saveState(channelId, proof1.id, proof1.newState);
  await leaderDB.saveProposal(channelId, proof1);

  // --- Proof 1: Participants verify ---
  console.log('\n=== Participant 1: Verifying Proof 1 ===');
  const p1Prev = await p1DB.getLatestState(channelId);
  const p1Result1 = await participant1Manager.verifyProposal(proof1, p1Prev);
  if (p1Result1.isValid) {
    await p1DB.saveState(channelId, proof1.id, proof1.newState);
    console.log('[P1] ✅ Signed');
  }

  console.log('\n=== Participant 2: Verifying Proof 1 ===');
  const p2Prev = await p2DB.getLatestState(channelId);
  const p2Result1 = await participant2Manager.verifyProposal(proof1, p2Prev);
  if (p2Result1.isValid) {
    await p2DB.saveState(channelId, proof1.id, proof1.newState);
    console.log('[P2] ✅ Signed');
  }

  // --- Proof 2: Leader creates (using Proof 1's state) ---
  console.log('\n=== Leader: Creating Proof 2 ===');
  const tx2 = '0x...';
  const proof2 = await leaderManager.createProposal(tx2);
  await leaderDB.saveState(channelId, proof2.id, proof2.newState);

  // ... participants verify proof2 ...

  console.log('\n✅ Multi-participant flow complete');
}
```

---

## Implementation Checklist

### Phase 1: State Management ✅ 우선순위 높음

- [ ] `StateSnapshot` 타입 정의 (`types.ts`)
- [ ] `TokamakL2StateManager.exportState()` 구현
- [ ] `TokamakL2StateManager.importState()` 구현
- [ ] 단위 테스트: export → import → 동일한 state 확인
- [ ] 단위 테스트: Merkle root 계산 일치 확인

### Phase 2: Synthesizer Integration ✅ 우선순위 높음

- [ ] `Synthesizer.getTokamakStateManager()` getter 추가
- [ ] `SynthesizeOptions` 인터페이스에 `previousState` 추가
- [ ] `SynthesizerResult` 인터페이스에 `state` 추가
- [ ] `SynthesizerAdapter.synthesize()` 메서드 수정
- [ ] 단위 테스트: 연속 synthesis with state chain
- [ ] 통합 테스트: TX1 → TX2 → TX3 연속 실행

### Phase 3: Channel Manager

- [ ] `ChannelManager` 클래스 구현
- [ ] `createProposal()` 메서드
- [ ] `verifyProposal()` 메서드
- [ ] 단위 테스트: proposal 생성
- [ ] 단위 테스트: proposal 검증 (성공 케이스)
- [ ] 단위 테스트: proposal 검증 (실패 케이스)

### Phase 4: State Database

- [ ] `StateDatabase` 인터페이스 정의
- [ ] `InMemoryStateDatabase` 구현 (개발용)
- [ ] `saveState()`, `loadState()`, `getLatestState()` 구현
- [ ] `saveProposal()`, `loadProposal()` 구현
- [ ] 단위 테스트: DB operations
- [ ] Production DB 선택 및 구현 (IndexedDB / PostgreSQL)

### Phase 5: Integration & Testing

- [ ] 전체 플로우 통합 테스트 (Leader + 2 Participants)
- [ ] WebSocket broadcast 시스템 구현
- [ ] Signature collection 로직
- [ ] Dispute mechanism 초안
- [ ] Browser demo UI
- [ ] Performance 측정 및 최적화

### Phase 6: Production Readiness

- [ ] Error handling 강화
- [ ] Logging 시스템
- [ ] Monitoring & metrics
- [ ] Security audit
- [ ] Documentation 완성

---

## Open Questions

### 1. Production Database 선택

**Options:**

- **IndexedDB**: 브라우저 내장, 각 참여자가 로컬에 저장
- **PostgreSQL**: 서버 기반, 중앙화된 데이터 관리
- **Redis**: 빠른 in-memory, 휘발성
- **IPFS**: 분산 저장, 불변성

**Recommendation**: 초기에는 IndexedDB (브라우저) + PostgreSQL (서버 백업)

### 2. 새 참여자 Join 처리

**Scenario**: 채널이 이미 Proof 10까지 진행된 상태에서 새 참여자가 참여

**Options:**

- A) 모든 이전 state들을 전송 (무거움)
- B) 최근 N개의 state만 전송
- C) 최신 state + Merkle proof 전송 (가벼움, 검증 가능)

**Recommendation**: Option C

### 3. Checkpoint & Garbage Collection

**Issue**: 수천 개의 proof 생성 시 DB 용량 증가

**Solution:**

- 매 100개 proof마다 checkpoint 생성
- 오래된 state는 압축/아카이빙
- 최근 N개 state만 메모리에 유지

### 4. Network Failure & Proposal 유실

**Scenario**: Leader가 proposal 브로드캐스트 중 네트워크 장애

**Solution:**

- Proposal에 sequence number 추가
- 참여자가 missing proposal 요청
- Leader의 proposal 재전송 메커니즘

### 5. State Divergence 처리

**Scenario**: 참여자 A와 B의 state가 불일치

**Solution:**

- State root hash로 빠른 불일치 감지
- Storage entries 비교로 정확한 차이 파악
- 다수결 또는 리더 state를 기준으로 동기화

### 6. Proof Generation Performance

**Issue**: 각 TX마다 proof 생성은 느릴 수 있음

**Solution (Phase 2):**

- Proof batching: 여러 TX를 하나의 proof로
- 현재는 1 TX = 1 Proof (단순)

---

## Next Steps

### Week 1: Core State Management

1. `StateSnapshot` 타입 정의
2. `exportState()` & `importState()` 구현
3. 단위 테스트 작성
4. 간단한 CLI 테스트 스크립트

### Week 2: Synthesizer Integration

1. `SynthesizerAdapter` 수정 (previousState 지원)
2. `SynthesizerResult`에 state 포함
3. 연속 TX 실행 테스트 (TX1 → TX2 → TX3)
4. State chain 검증

### Week 3: Channel Manager

1. `ChannelManager` 구현
2. Leader workflow 구현
3. Participant verification 구현
4. Multi-participant 테스트 (1 Leader + 2 Participants)

### Week 4: Database & UI

1. `InMemoryStateDatabase` 구현
2. IndexedDB adapter 구현 (브라우저)
3. 간단한 Web UI (Proof 생성/검증 버튼)
4. Demo 시연 준비

---

## References

- [Synthesizer Documentation](https://tokamak.notion.site/Synthesizer-documentation-164d96a400a3808db0f0f636e20fca24)
- [verify-wasm README](../../../backend/verify/verify-wasm/README.md)
- [Browser Build Guide](./BROWSER_BUILD.md)
- [State Flow Diagram](./STATE_FLOW_DIAGRAM.md)

---

## Appendix: Storage Key Details

### L1 Ethereum Storage Key Calculation

```solidity
// Solidity
mapping(address => uint256) public balances; // slot 0

// Storage key for balances[0x123...]
keccak256(abi.encodePacked(address, slot))
→ 0x290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e563
```

### L2 Tokamak Storage Key Calculation

```typescript
// TypeScript
import { poseidon } from 'circomlibjs';

const l2StorageKey = poseidon([addressToBigInt(userL2Address), storageSlot]);
// → 0x1a2b3c4d5e6f7890abcdef...
```

### StateSnapshot Example

```json
{
  "stateRoot": "0xbbbb...",
  "storageEntries": [
    {
      "index": 0,
      "key": "0x290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e563",
      "value": "0x000000000000000000000000000000000000000000000004e1003b28d9280000"
    },
    {
      "index": 1,
      "key": "0x7d8c4a3b2e1f0968574a2c3d1e0f8967452a1c3b2d0e8f796857423a1c0d8e7f",
      "value": "0x0000000000000000000000000000000000000000000000034630bcbf7e400000"
    }
  ],
  "registeredKeys": ["0x290decd9...", "0x7d8c4a3b..."],
  "merkleLeaves": ["123456789...", "987654321..."],
  "contractAddress": "0x...",
  "userL2Addresses": ["0x...", "0x..."],
  "userStorageSlots": [0, 1],
  "timestamp": 1700000000000
}
```

---

**Document Version**: 1.0
**Last Reviewed**: 2025-11-17
**Approved By**: Leader
**Implementation Start**: 2025-11-17
