// valueHexMerger.test.ts
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  mergeValueHexPairs,
  processJsonData,
} from '../../src/adapters/utils/valueHexMerger';

describe('ValueHexMerger', () => {
  const testData = {
    privateInputBuffer: {
      name: 'bufferPrvIn',
      subcircuitId: 2,
      inPts: [
        {
          extSource: 'code: 0x2be5e8c109e2197d077d13a82daead6a9b3433c5',
          type: 'CALLDATASIZE',
          offset: 0,
          sourceSize: 32,
          source: 2,
          wireIndex: 10,
          valueHex: '0x00000000000000000000000000000044',
        },
        {
          extSource: 'code: 0x2be5e8c109e2197d077d13a82daead6a9b3433c5',
          type: 'CALLDATASIZE',
          offset: 0,
          sourceSize: 32,
          source: 2,
          wireIndex: 11,
          valueHex: '0x00000000000000000000000000000000',
        },
        {
          extSource: 'code: 0x2be5e8c109e2197d077d13a82daead6a9b3433c5',
          type: 'Calldata(User)',
          offset: 0,
          sourceSize: 32,
          source: 2,
          wireIndex: 16,
          valueHex: '0x0ce8f6c9d4ad12e56e54018313761487',
        },
        {
          extSource: 'code: 0x2be5e8c109e2197d077d13a82daead6a9b3433c5',
          type: 'Calldata(User)',
          offset: 0,
          sourceSize: 32,
          source: 2,
          wireIndex: 17,
          valueHex: '0xa9059cbb000000000000000000000000',
        },
        {
          extSource: 'code: 0x2be5e8c109e2197d077d13a82daead6a9b3433c5',
          type: 'Reading ROM value',
          offset: 30,
          source: 2,
          wireIndex: 18,
          sourceSize: 1,
          valueHex: '0x000000000000000000000000000000e0',
        },
        {
          extSource: 'code: 0x2be5e8c109e2197d077d13a82daead6a9b3433c5',
          type: 'Reading ROM value',
          offset: 30,
          source: 2,
          wireIndex: 19,
          sourceSize: 1,
          valueHex: '0x00000000000000000000000000000000',
        },
        // 다른 타입의 데이터
        {
          source: 2,
          wireIndex: 156,
          sourceSize: 32,
          valueHex: '0x000000000000000000000000ffffffff',
        },
        {
          source: 2,
          wireIndex: 157,
          sourceSize: 32,
          valueHex: '0x00000000000000000000000000000000',
        },
      ],
    },
    privateOutputBuffer: {
      name: 'bufferPrvOut',
      subcircuitId: 3,
      inPts: [
        {
          source: 34,
          wireIndex: 0,
          sourceSize: 32,
          valueHex: '0x000000000000000000000000000003e8',
        },
        {
          source: 34,
          wireIndex: 1,
          sourceSize: 32,
          valueHex: '0x00000000000000000000000000000000',
        },
      ],
      outPts: [
        {
          extDest: 'LOG',
          key: '0x0',
          type: 'topic1',
          source: 3,
          wireIndex: 6,
          sourceSize: 32,
          valueHex: '0x952ba7f163c4a11628f55a4df523b3ef',
        },
        {
          extDest: 'LOG',
          key: '0x0',
          type: 'topic1',
          source: 3,
          wireIndex: 7,
          sourceSize: 32,
          valueHex: '0xddf252ad1be2c89b69c2b068fc378daa',
        },
      ],
    },
  };

  it('should merge consecutive valueHex pairs with same extSource and type', () => {
    const mergedData = mergeValueHexPairs(testData);

    // CALLDATASIZE 쌍 확인
    const calldatasizePair = mergedData.find(
      (item) => item.type === 'CALLDATASIZE',
    );
    expect(calldatasizePair).toBeDefined();
    expect(calldatasizePair.valueHex).toBe(
      '0x0000000000000000000000000000004400000000000000000000000000000000',
    );
    expect(calldatasizePair.merged).toBe(true);

    // Calldata(User) 쌍 확인
    const calldataUserPair = mergedData.find(
      (item) => item.type === 'Calldata(User)',
    );
    expect(calldataUserPair).toBeDefined();
    expect(calldataUserPair.valueHex).toBe(
      '0x0ce8f6c9d4ad12e56e54018313761487a9059cbb000000000000000000000000',
    );
    expect(calldataUserPair.merged).toBe(true);

    // Reading ROM value 쌍 확인
    const romValuePair = mergedData.find(
      (item) => item.type === 'Reading ROM value',
    );
    expect(romValuePair).toBeDefined();
    expect(romValuePair.valueHex).toBe(
      '0x000000000000000000000000000000e000000000000000000000000000000000',
    );
    expect(romValuePair.merged).toBe(true);
  });

  it('should process entire JSON data correctly', () => {
    const processedData = processJsonData(testData);

    // privateInputBuffer의 inPts 확인
    expect(processedData.privateInputBuffer.inPts).toBeDefined();
    expect(processedData.privateInputBuffer.inPts.length).toBeLessThan(
      testData.privateInputBuffer.inPts.length,
    );

    // privateOutputBuffer의 outPts 확인
    const logTopicPair = processedData.privateOutputBuffer.outPts.find(
      (item) => item.type === 'topic1',
    );
    expect(logTopicPair).toBeDefined();
    expect(logTopicPair.valueHex).toBe(
      '0x952ba7f163c4a11628f55a4df523b3efddf252ad1be2c89b69c2b068fc378daa',
    );
    expect(logTopicPair.merged).toBe(true);
  });

  it('should handle items without extSource or type', () => {
    const mergedData = mergeValueHexPairs(testData);

    // extSource나 type이 없는 항목 확인
    const itemWithoutExtSource = mergedData.find(
      (item) => !item.extSource && item.source === 2,
    );
    expect(itemWithoutExtSource).toBeDefined();
  });

  // 실제 파일로 테스트 (선택적)
  it('should process real JSON file if available', () => {
    try {
      // JSON 파일 경로 설정
      const filePath = path.join(
        __dirname,
        '../../examples/outputs/privateExternalInterface.json',
      );

      // 파일이 존재하는지 확인
      if (fs.existsSync(filePath)) {
        // 파일 읽기
        const fileData = fs.readFileSync(filePath, 'utf8');
        const jsonData = JSON.parse(fileData);

        // 데이터 처리
        const processedFileData = processJsonData(jsonData);

        // 결과 확인
        expect(processedFileData).toBeDefined();
        expect(processedFileData.privateInputBuffer).toBeDefined();

        // 결과 저장 (선택적)
        const outputPath = path.join(
          __dirname,
          '../../examples/outputs/privateExternalInterface_merged.json',
        );
        fs.writeFileSync(
          outputPath,
          JSON.stringify(processedFileData, null, 2),
          'utf8',
        );

        console.log(
          `실제 파일 처리 완료. 결과가 ${outputPath}에 저장되었습니다.`,
        );
      } else {
        console.log('실제 JSON 파일이 존재하지 않아 테스트를 건너뜁니다.');
      }
    } catch (error) {
      console.error('실제 파일 처리 중 오류 발생:', error);
    }
  });
});
