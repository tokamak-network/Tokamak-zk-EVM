# Synthesizer.ts 변경사항 분석 (dev vs ale-154)

## 변경사항 요약

### 1. 코드 포맷팅 변경 (문제 없음)
- 세미콜론 추가
- 중괄호 스타일 변경 (한 줄 → 여러 줄)
- Import 문 포맷팅

### 2. 디버그 로그 제거 (좋은 변경)
**제거된 코드:**
```typescript
// dev 브랜치에 있던 디버그 로그
console.log(`stack: ${this._prevInterpreterStep.stack.map(x => bigIntToHex(x))}`)
console.log(`pc: ${this._prevInterpreterStep.pc}, opcode: ${this._prevInterpreterStep.opcode.name}`)
console.log(`stack: ${currentInterpreterStep.stack.map(x => bigIntToHex(x))}`)
console.log(`pc: ${currentInterpreterStep.pc}, opcode: ${currentInterpreterStep.opcode.name}`)
```

### 3. ⚠️ 중요한 로직 변경: `_updateMerkleTree()` 메서드

#### dev 브랜치 (기존):
```typescript
childPt = this.placePoseidon([
  lastHistory.keyPt!,
  lastHistory.valuePt,  // ← 캐시된 과거 값 사용
])
const merkleProof = await this.cachedOpts.stateManager.getMerkleProof(MTIndex)
this.placeMerkleProofVerification(
  indexPt,
  childPt,
  merkleProof.siblings,
  finalMerkleRootPt,
)
```

#### 현재 브랜치 (ale-154):
```typescript
// Get the CURRENT storage value from state manager (not the cached historical value)
// This is critical because SSTORE operations may have changed the value after the last access
const contractAddress = new Address(toBytes(this.cachedOpts.stateManager.cachedOpts!.contractAddress));
const storageKey = setLengthLeft(bigIntToBytes(key), 32);
const currentStorageValue = await this.cachedOpts.stateManager.getStorage(contractAddress, storageKey);
const currentValueBigInt = bytesToBigInt(currentStorageValue);

const currentValuePt = this.loadArbitraryStatic(
  currentValueBigInt,
  256,
  `Current storage value for key ${bigIntToHex(key)}`,
);

childPt = this.placePoseidon([lastHistory.keyPt!, currentValuePt]); // ← 현재 값 사용

const merkleProof = await this.cachedOpts.stateManager.getMerkleProof(MTIndex);

// Wrap Merkle proof verification in try-catch to handle storage key mismatches
try {
  this.placeMerkleProofVerification(indexPt, childPt, merkleProof.siblings, finalMerkleRootPt);
} catch (error) {
  // Continue execution - the storage values are still correct, just the proof verification failed
}
```

**변경 이유:**
- SSTORE 연산 후 값이 변경될 수 있으므로, 캐시된 과거 값 대신 현재 값을 사용해야 함
- ERC20 컨트랙트가 keccak256 기반 키를 사용하지만, 우리는 poseidon 기반 MPT 키를 추적하므로 불일치 발생 가능
- try-catch로 에러를 무시하는 것은 **위험할 수 있음** - Merkle proof verification 실패를 조용히 무시하면 보안 문제 발생 가능

### 4. 에러 처리 개선: `afterMessage` 핸들러

#### dev 브랜치:
```typescript
if (_runState === undefined) {
  throw new Error('Failed to capture the final state')
}
```

#### 현재 브랜치:
```typescript
if (_runState === undefined) {
  // Even if runState is undefined, we should finalize storage to update the Merkle tree
  // Transaction may have executed successfully but runState was cleared
  await this._finalizeStorage();
  resolve?.();
  return;
}
```

**변경 이유:**
- 트랜잭션이 성공했지만 runState가 클리어된 경우를 처리하기 위함
- Merkle tree 업데이트를 보장하기 위함

### 5. 새 메서드 추가: `getTokamakStateManager()`
```typescript
public getTokamakStateManager() {
  return this.cachedOpts.stateManager;
}
```
- SynthesizerAdapter에서 사용하기 위해 추가된 것으로 보임

## 문제점 분석

### ⚠️ 잠재적 문제:

1. **Merkle Proof Verification 실패를 조용히 무시**
   - try-catch로 에러를 무시하면 보안 문제 발생 가능
   - Merkle proof verification 실패는 심각한 문제인데, 이를 무시하는 것은 위험함

2. **dev 브랜치와의 불일치**
   - dev 브랜치는 안정적인 버전일 가능성이 높음
   - 현재 브랜치의 변경사항이 충분히 테스트되지 않았을 수 있음

## 권장사항

### 옵션 1: dev 브랜치로 되돌리기 (안전)
- dev 브랜치의 안정성을 유지
- 현재 브랜치의 변경사항이 충분히 검증되지 않았을 수 있음

### 옵션 2: 선택적 변경 유지 (주의 필요)
- 코드 포맷팅, 디버그 로그 제거는 유지 (문제 없음)
- `_updateMerkleTree()` 변경은 검토 필요
- try-catch로 에러를 무시하는 부분은 **제거하거나 로깅 추가** 필요
- `runState === undefined` 처리 개선은 유지 가능

### 옵션 3: 하이브리드 접근
- dev 브랜치로 되돌린 후, 필요한 변경사항만 선택적으로 적용
- 특히 try-catch 부분은 제거하고, 에러를 적절히 처리

## 결론

현재 브랜치의 변경사항 중 일부는 합리적이지만, **Merkle proof verification 실패를 조용히 무시하는 부분은 위험**합니다.

**권장: dev 브랜치로 되돌린 후, 필요한 변경사항만 선택적으로 적용**

