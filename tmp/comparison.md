# 20슬라이드 비교표 초안

<table>
  <thead>
    <tr>
      <th>비교축</th>
      <th>RAM-style 실행 검증</th>
      <th>Tokamak-style 실행 검증</th>
      <th>Aztec private function 실행 검증</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>검증 대상</td>
      <td>특정 VM의 step 실행</td>
      <td>EVM에서 특정 함수의 실행</td>
      <td>임의 함수의 실행</td>
    </tr>
    <tr>
      <td>회로 종류</td>
      <td>VM 전용 단일 회로</td>
      <td>EVM 전용 subcircuits + 함수 전용 topology</td>
      <td>함수 전용 회로</td>
    </tr>
    <tr>
      <td>재사용 조건</td>
      <td>동일 VM</td>
      <td colspan="2">동일 함수 실행 경로</td>
    </tr>
    <tr>
      <td>새로운 회로 audit 범위</td>
      <td>없음</td>
      <td>함수 전용 topology</td>
      <td>함수 전용 회로의 모든 변수</td>
    </tr>
    <tr>
      <td>실행 경로 취급</td>
      <td>witness</td>
      <td colspan="2">public instance</td>
    </tr>
    <tr>
      <td>강점</td>
      <td>범용성</td>
      <td>EVM 호환성, 회로 효율, 낮은 audit 비용</td>
      <td>회로 효율</td>
    </tr>
    <tr>
      <td>비용 / 제약</td>
      <td>지나친 회로 크기</td>
      <td colspan="2">새로운 함수에 새로운 audit 필요</td>
    </tr>
  </tbody>
</table>
