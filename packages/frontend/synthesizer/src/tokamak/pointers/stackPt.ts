import { ERROR, EvmError } from '../../exceptions.js'

import type { DataPt } from '../types/index.js'

/**
 * Stack vs StackPt 클래스의 주요 차이점
 *
 * 1. 데이터 타입
 *    - Stack: bigint[] (실제 값 저장)
 *    - StackPt: DataPt[] (데이터 포인터 저장)
 *
 * 2. 용도
 *    - Stack: 실제 EVM 실행 시 사용되는 스택
 *    - StackPt: 심볼릭 실행을 위한 스택
 *
 * 3. 연산 처리
 *    - Stack: 실제 값에 대한 연산 수행 (예: 실제 덧셈)
 *    - StackPt: 데이터 흐름 추적을 위한 포인터 관리
 *
 * 4. 활용
 *    - Stack: 실제 트랜잭션 처리, 컨트랙트 실행
 *    - StackPt: 프로그램 분석, 최적화, 버그 검출
 *
 * 두 클래스는 동일한 인터페이스(push, pop, swap 등)를 제공하지만,
 * 내부적으로 다른 목적으로 동작합니다.
 */

export type TStackPt = DataPt[]

/**
 * EVM의 심볼릭 실행을 위한 스택 구현체
 *
 * 주요 특징:
 * 1. 용도
 *    - EVM의 심볼릭 실행에서 사용되는 스택
 *    - DataPt 타입의 데이터 포인터들을 관리
 *
 * 2. 메모리 관리 방식
 *    - 한번 할당된 배열 크기는 감소하지 않음
 *    - pop 연산 시 실제로 항목을 삭제하지 않고 _len을 감소시켜 관리
 *    - 이는 메모리 재할당 비용을 줄이기 위한 최적화 전략
 *
 * 3. 주요 제약사항
 *    - 최대 스택 높이(_maxHeight) 제한
 *    - 스택 오버플로우/언더플로우 체크
 *
 * 4. 주요 연산
 *    - push: 새로운 데이터 포인터 추가
 *    - pop: 최상위 데이터 포인터 제거
 *    - peek: 스택 내용 확인
 *    - swap: 스택 내 항목 위치 교환
 *    - dup: 스택 내 항목 복제
 *
 * 이 클래스는 실제 EVM 스택과 동일한 인터페이스를 제공하지만,
 * 실제 값(bigint) 대신 데이터 포인터(DataPt)를 다룬다는 점이 특징입니다.
 */
export class StackPt {
  // This array is initialized as an empty array. Once values are pushed, the array size will never decrease.
  // 실제 데이터를 저장하는 내부 배열. 한번 push된 후에는 크기가 줄어들지 않음
  private _storePt: TStackPt
  // 스택의 최대 허용 높이 (기본값: 1024)
  private _maxHeight: number
  // 현재 스택에서 사용 중인 실제 항목 수
  private _len: number = 0

  constructor(maxHeight?: number) {
    // It is possible to initialize the array with `maxHeight` items. However,
    // this makes the constructor 10x slower and there do not seem to be any observable performance gains
    this._storePt = []
    this._maxHeight = maxHeight ?? 1024
  }

  get length() {
    return this._len
  }

  push(pt: DataPt) {
    if (this._len >= this._maxHeight) {
      throw new EvmError(ERROR.STACK_OVERFLOW)
    }
    if (typeof pt.source !== 'number') {
      throw new Error(
        `Synthesizer: Push to StackPt: Every item on the StackPt must indicate an output wire of a subcirciut placement.`,
      )
    }

    // Read current length, set `_storePt` to value, and then increase the length
    this._storePt[this._len++] = pt
  }

  pop(): DataPt {
    if (this._len < 1) {
      throw new EvmError(ERROR.STACK_UNDERFLOW)
    }

    // Length is checked above, so pop shouldn't return undefined
    // First decrease current length, then read the item and return it
    // Note: this does thus not delete the item from the internal array
    // However, the length is decreased, so it is not accessible to external observers
    return this._storePt[--this._len]
  }

  /**
   * Pop multiple items from stack. Top of stack is first item
   * in returned array.
   * @param num - Number of items to pop
   */
  popN(num: number = 1): DataPt[] {
    if (this._len < num) {
      throw new EvmError(ERROR.STACK_UNDERFLOW)
    }

    if (num === 0) {
      return []
    }

    const arr = Array(num)
    const cache = this._storePt

    for (let pop = 0; pop < num; pop++) {
      // Note: this thus also (correctly) reduces the length of the internal array (without deleting items)
      arr[pop] = cache[--this._len]
    }

    return arr
  }

  /**
   * Return items from the stack
   * @param num Number of items to return
   * @throws {@link ERROR.STACK_UNDERFLOW}
   */
  peek(num: number = 1): DataPt[] {
    const peekArray: DataPt[] = Array(num)
    let start = this._len

    for (let peek = 0; peek < num; peek++) {
      const index = --start
      if (index < 0) {
        throw new EvmError(ERROR.STACK_UNDERFLOW)
      }
      peekArray[peek] = this._storePt[index]
    }
    return peekArray
  }

  /**
   * Swap top of stack with an item in the stack.
   * @param position - Index of item from top of the stack (0-indexed)
   */
  swap(position: number) {
    if (this._len <= position) {
      throw new EvmError(ERROR.STACK_UNDERFLOW)
    }

    const head = this._len - 1
    const i = head - position
    const storageCached = this._storePt

    const tmp = storageCached[head]
    storageCached[head] = storageCached[i]
    storageCached[i] = tmp
  }

  /**
   * Pushes a copy of an item in the stack.
   * @param position - Index of item to be copied (1-indexed)
   */
  // I would say that we do not need this method any more
  // since you can't copy a primitive data type
  // Nevertheless not sure if we "loose" something here?
  // Will keep commented out for now
  dup(position: number) {
    const len = this._len
    if (len < position) {
      throw new EvmError(ERROR.STACK_UNDERFLOW)
    }

    // Note: this code is borrowed from `push()` (avoids a call)
    if (len >= this._maxHeight) {
      throw new EvmError(ERROR.STACK_OVERFLOW)
    }

    const i = len - position
    this._storePt[this._len++] = this._storePt[i]
  }

  /**
   * Swap number 1 with number 2 on the stack
   * @param swap1
   * @param swap2
   */
  exchange(swap1: number, swap2: number) {
    const headIndex = this._len - 1
    const exchangeIndex1 = headIndex - swap1
    const exchangeIndex2 = headIndex - swap2

    // Stack underflow is not possible in EOF
    if (exchangeIndex1 < 0 || exchangeIndex2 < 0) {
      throw new EvmError(ERROR.STACK_UNDERFLOW)
    }

    const cache = this._storePt[exchangeIndex2]
    this._storePt[exchangeIndex2] = this._storePt[exchangeIndex1]
    this._storePt[exchangeIndex1] = cache
  }

  /**
   * Returns a copy of the current stack. This represents the actual state of the stack
   * (not the internal state of the stack, which might have unreachable elements in it)
   */
  getStack() {
    return this._storePt.slice(0, this._len)
  }
}
