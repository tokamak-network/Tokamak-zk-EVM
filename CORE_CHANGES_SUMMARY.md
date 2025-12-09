# 코어 단 변경사항 요약 (dev vs ale-154)

SynthesizerAdapter를 제외한 코어 단의 주요 변경사항을 정리합니다.

## 📊 변경 통계

```
14 files changed, 1557 insertions(+), 492 deletions(-)
```

## 🔧 주요 변경 파일

### 1. **TokamakL2StateManager.ts** (570줄 변경) ⭐ 가장 큰 변경

#### 주요 변경사항:

**A. State Snapshot 기능 추가**

- `exportState()`: 현재 상태를 스냅샷으로 내보내기
- `createStateFromSnapshot()`: 스냅샷에서 상태 복원
- State channel에서 이전 상태를 기반으로 연속적인 트랜잭션 실행 가능

```typescript
// 새로 추가된 메서드
public async exportState(): Promise<StateSnapshot>
public async createStateFromSnapshot(snapshot: StateSnapshot, options?: {...}): Promise<void>
```

**B. Merkle Tree 계산 로직 개선**

- `convertLeavesIntoMerkleTreeLeaves()` 메서드 대폭 개선
- Circuit 구현과 정확히 일치하도록 수정
- 빈 슬롯에 대해 `Poseidon2(0, 0)` 사용 (Circuit과 동일)
- **현재 스토리지 값 사용**: SSTORE 연산 후 변경된 값을 반영

```typescript
// 변경 전: 캐시된 값 사용
const val = await this.getStorage(contractAddress, key);
leaves[index] = poseidon_raw([bytesToBigInt(key), bytesToBigInt(val)]);

// 변경 후: 현재 값 사용 + Circuit 정렬
// IMPORTANT: Always get CURRENT storage value from state manager
// This ensures that SSTORE operations are reflected in the Merkle tree
const val = await this.getStorage(contractAddress, key);
const storageValueBigInt = bytesToBigInt(val);
const leaf = poseidon_raw([keyBigInt, storageValueBigInt]);
```

**C. 코드 포맷팅 및 구조 개선**

- 세미콜론 추가
- Import 문 정리
- 주석 추가 (Circuit 참조 포함)

**D. 새 필드 추가**

```typescript
private _storageEntries: Array<{ key: string; value: string }> | null = null;
```

---

### 2. **types.ts** (51줄 변경)

#### 주요 변경사항:

**A. StateSnapshot 인터페이스 추가**

```typescript
export interface StateSnapshot {
  stateRoot: string;
  merkleLeaves?: string[];
  registeredKeys: string[];
  storageEntries: StorageEntry[];
  contractAddress: string;
  userL2Addresses: string[];
  userStorageSlots: bigint[];
  timestamp: number;
  userNonces: bigint[];
  contractCode?: string; // 새로 추가: RPC 없이 복원 가능
}
```

**B. StorageEntry 인터페이스 추가**

```typescript
export interface StorageEntry {
  index: number;
  key: string;
  value: string;
  contractAddress?: string;
}
```

**C. TokamakL2StateManagerOpts 확장**

```typescript
export type TokamakL2StateManagerOpts = {
  // ... 기존 필드들
  bridgeContractAddress?: AddressLike; // 새로 추가
  channelId?: bigint; // 새로 추가
  rpcUrl?: string; // 새로 추가: 스냅샷 복원 시 필요
};
```

---

### 3. **constructors.ts** (25줄 변경)

#### 주요 변경사항:

**A. skipInit 파라미터 추가**

```typescript
export async function createTokamakL2StateManagerFromL1RPC(
  rpcUrl: string,
  opts: TokamakL2StateManagerOpts,
  skipInit: boolean = false, // 새로 추가
): Promise<TokamakL2StateManager>;
```

**변경 이유:**

- State snapshot에서 복원할 때는 RPC 초기화를 건너뛰어야 함
- `createStateFromSnapshot()`을 사용하기 전에 state manager를 생성해야 함

**B. setCachedOpts() 호출 추가**

```typescript
if (!skipInit) {
  await stateManager.initTokamakExtendsFromRPC(rpcUrl, opts);
} else {
  // Even when skipping init, we need to set cachedOpts for createStateFromSnapshot
  stateManager.setCachedOpts(opts);
}
```

---

### 4. **synthesizer.ts** (381줄 변경) ⭐ 핵심 로직 변경

#### 주요 변경사항:

**A. \_updateMerkleTree() 메서드 대폭 개선**

**변경 전 (dev):**

```typescript
childPt = this.placePoseidon([
  lastHistory.keyPt!,
  lastHistory.valuePt,  // ← 캐시된 과거 값
])
this.placeMerkleProofVerification(...)
```

**변경 후 (ale-154):**

```typescript
// Get the CURRENT storage value from state manager
const currentStorageValue = await this.cachedOpts.stateManager.getStorage(contractAddress, storageKey);
const currentValueBigInt = bytesToBigInt(currentStorageValue);
const currentValuePt = this.loadArbitraryStatic(currentValueBigInt, 256, ...);

childPt = this.placePoseidon([lastHistory.keyPt!, currentValuePt]);  // ← 현재 값

// try-catch로 감싸서 에러 처리
try {
  this.placeMerkleProofVerification(indexPt, childPt, merkleProof.siblings, finalMerkleRootPt);
} catch (error) {
  // Continue execution - the storage values are still correct, just the proof verification failed
}
```

**변경 이유:**

- SSTORE 연산 후 값이 변경될 수 있으므로, 캐시된 과거 값 대신 현재 값을 사용해야 함
- ERC20 컨트랙트가 keccak256 기반 키를 사용하지만, 우리는 poseidon 기반 MPT 키를 추적하므로 불일치 발생 가능
- ⚠️ **주의**: try-catch로 에러를 무시하는 것은 보안상 위험할 수 있음

**B. afterMessage 핸들러 개선**

**변경 전 (dev):**

```typescript
if (_runState === undefined) {
  throw new Error('Failed to capture the final state'); // ❌
}
```

**변경 후 (ale-154):**

```typescript
if (_runState === undefined) {
  // Even if runState is undefined, we should finalize storage to update the Merkle tree
  // Transaction may have executed successfully but runState was cleared
  await this._finalizeStorage(); // ✅
  resolve?.();
  return;
}
```

**변경 이유:**

- 트랜잭션이 성공했지만 EVM이 메모리 최적화를 위해 runState를 클리어한 경우 처리
- Merkle tree 업데이트 보장

**C. 코드 포맷팅**

- 세미콜론 추가
- Import 문 정리
- 디버그 로그 제거

**D. 새 메서드 추가**

```typescript
public getTokamakStateManager() {
  return this.cachedOpts.stateManager;
}
```

---

### 5. **rpc.ts** (10줄 변경)

#### 주요 변경사항:

**A. skipRPCInit 옵션 추가**

```typescript
export type SynthesizerSimulationOpts = {
  // ... 기존 필드들
  skipRPCInit?: boolean; // 새로 추가
};
```

**B. createTokamakL2StateManagerFromL1RPC 호출 시 skipInit 전달**

```typescript
const L2StateManager = await createTokamakL2StateManagerFromL1RPC(
  opts.rpcUrl,
  stateManagerOpts,
  opts.skipRPCInit || false, // 새로 추가
);
```

**C. rpcUrl을 stateManagerOpts에 전달**

```typescript
stateManagerOpts = {
  // ...
  rpcUrl: opts.rpcUrl, // 새로 추가: contract code fetching용
};
```

---

### 6. **기타 파일들**

#### **crypto/index.ts** (35줄 변경)

- 코드 포맷팅
- Import 정리

#### **tx/TokamakL2Tx.ts** (8줄 변경)

- 코드 포맷팅

#### **interface/cli/index.ts** (94줄 추가)

- 새 CLI 명령어 추가 (추정)

#### **interface/qapCompiler/utils.ts** (22줄 변경)

- 유틸리티 함수 개선

#### **synthesizer/dataStructure/arithmeticOperations.ts** (4줄 변경)

- 사소한 수정

#### **synthesizer/index.ts** (3줄 변경)

- Export 정리

#### **synthesizer/types/placements.ts** (2줄 변경)

- 타입 정의 수정

---

## 🎯 주요 변경 목적

### 1. **State Channel 지원**

- State snapshot 기능으로 이전 상태를 기반으로 연속적인 트랜잭션 실행 가능
- `exportState()` / `createStateFromSnapshot()` 메서드 추가

### 2. **Merkle Tree 정확도 개선**

- Circuit 구현과 정확히 일치하도록 수정
- 현재 스토리지 값 사용 (SSTORE 반영)
- 빈 슬롯 처리 개선

### 3. **에러 처리 개선**

- `runState === undefined` 상황 처리
- Merkle proof verification 실패 처리 (try-catch)

### 4. **코드 품질 개선**

- 포맷팅 통일
- 주석 추가
- 타입 안정성 향상

---

## ⚠️ 주의사항

### 1. **Merkle Proof Verification 에러 무시**

```typescript
try {
  this.placeMerkleProofVerification(...);
} catch (error) {
  // Continue execution - 에러를 조용히 무시
}
```

- **위험**: 보안 관련 검증 실패를 무시하면 보안 문제 발생 가능
- **권장**: 에러를 로깅하고, 최소한 경고는 표시해야 함

### 2. **dev 브랜치와의 불일치**

- 일부 변경사항이 충분히 테스트되지 않았을 수 있음
- 특히 try-catch로 에러를 무시하는 부분은 검토 필요

---

## 📝 커밋 히스토리

주요 커밋들:

- `ffb68566`: fix: use current storage values for Merkle proof verification
- `e0b96a36`: fix: align Merkle tree calculation with Circuit implementation
- `a5ff230d`: feat: add initial state snapshot verification for state channels
- `39f8334a`: feat: add state restoration support for L2 state channel
- `38237763`: feat: implement XOR-based MPT key generation and simplify state restoration

---

## 🔄 권장사항

1. **State Snapshot 기능**: 유지 (State Channel에 필수)
2. **Merkle Tree 계산 개선**: 유지 (Circuit 정렬)
3. **runState === undefined 처리**: 유지 (버그 수정)
4. **try-catch 에러 무시**: **수정 필요** - 최소한 로깅 추가
