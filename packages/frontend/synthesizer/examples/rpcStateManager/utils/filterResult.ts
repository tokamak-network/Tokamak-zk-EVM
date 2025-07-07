import fs from 'fs';
import path from 'path';

interface Transaction {
  txHash: string;
  methodId: string;
  prvIn?: number;
  prvOut?: number;
  pubIn?: number;
  pubOut?: number;
  sMax: number;
  error?: string;
}

function mergeJsonFiles(filePattern: string): Transaction[] {
  const mergedData: Transaction[] = [];
  const directoryPath = './data/'; // 현재 디렉토리의 data 폴더
  const files = fs
    .readdirSync(directoryPath)
    .filter((file) => file.endsWith('.json'));

  for (const file of files) {
    const data = JSON.parse(
      fs.readFileSync(path.join(directoryPath, file), 'utf-8'),
    );
    mergedData.push(...data);
  }

  return mergedData;
}

function countTransactions(data: Transaction[]): {
  total: number;
  filteredCount: number;
  percentage: number;
  filteredTransactions: Transaction[];
} {
  const totalTransactions = data.length;
  const filteredTransactions = data.filter((tx) => tx.sMax <= 256);
  const filteredCount = filteredTransactions.length;
  const percentage =
    totalTransactions > 0 ? (filteredCount / totalTransactions) * 100 : 0;

  return {
    total: totalTransactions,
    filteredCount,
    percentage,
    filteredTransactions,
  };
}

function writeFilteredTransactionsToFile(filteredTransactions: Transaction[]) {
  const outputPath = './data/filteredTransactions.json'; // 저장할 파일 경로
  fs.writeFileSync(
    outputPath,
    JSON.stringify(filteredTransactions, null, 2),
    'utf-8',
  );
}

// 사용 예시
const mergedData = mergeJsonFiles('*.json');
const { total, filteredCount, percentage, filteredTransactions } =
  countTransactions(mergedData);

console.log(`Total transactions: ${total}`);
console.log(
  `Transactions with sMax <= 256: ${filteredCount} (${percentage.toFixed(2)}%)`,
);

// 필터링된 트랜잭션을 JSON 파일로 저장
writeFilteredTransactionsToFile(filteredTransactions);
