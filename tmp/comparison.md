# 20슬라이드 비교표 초안

| 비교축 | RAM-style 실행 검증 | Tokamak-style 실행 검증 | Aztec private function 실행 검증 |
|---|---|---|---|
| 검증 대상 | VM/RAM step 실행 기록 | EVM 함수의 성공 실행 기록 | Aztec private function 실행 |
| 회로 종류 | 범용 RAM 검증 회로 | 함수 전용 검증 회로 | private function 회로 + kernel 회로 |
| 재사용 조건 | 동일 VM/RAM semantics | 동일 함수, 동일 placement topology | 동일 private function 회로 + kernel protocol |
| 회로 audit 범위 | 범용 실행 회로 | subcircuit library + 함수별 생성 회로 | private function 회로 + kernel 회로 |
| 회로 audit 주기 | VM/protocol 변경 시점 | DApp 함수 추가/수정 시점 | contract 함수 또는 kernel 변경 시점 |
| 실행 경로 처리 | trace witness + step transition | placement topology + wire connection | function proof → kernel proof chain |
| 강점 | 범용성 | EVM 호환성 + 회로 효율 | privacy-native composability |
| 비용 / 제약 | step 수 + memory 검증 비용 | topology 고정 함수 중심 | client-side proving + kernel overhead |
| 핵심 통찰 | 범용 기계 회로 중심 | 함수 전용 회로 중심 | private proof 연결 중심 |
