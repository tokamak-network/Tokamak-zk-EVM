# 20슬라이드 비교표 초안

| 비교축 | RAM-style 실행 검증 | Tokamak-style 실행 검증 | Aztec private function 실행 검증 |
|---|---|---|---|
| 검증 대상 | 특정 VM의 step 실행 | EVM에서 특정 함수의 실행 | 임의 함수의 실행 |
| 회로 종류 | VM 전용 단일 회로 | EVM 전용 subcircuits + 함수 전용 topology | 함수 전용 회로 |
| 재사용 / 실행 경로 취급 | 동일 VM, witness | 동일 함수 실행 경로, public instance | 동일 함수 실행 경로, public instance |
| 새로운 회로 audit / 비용 | 새로운 audit 없음, 지나친 회로 크기 | 함수 전용 topology audit, 새 함수마다 audit | 함수 전용 회로의 모든 변수 audit, 새 함수마다 audit |
| 강점 | 범용성 | EVM 호환성, 회로 효율, 낮은 audit 비용 | 회로 효율 |
