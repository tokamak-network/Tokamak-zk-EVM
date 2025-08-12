#!/usr/bin/env node

// 완전히 독립실행형 바이너리를 위한 방법
// synthesizer.cjs의 로직을 pkg에서 실행 가능하게 수정

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// pkg 환경에서는 __dirname이 snapshot 경로를 가리킴
// 하지만 파일들은 실제로는 snapshot 안에 번들됨

function findCliPath() {
  // pkg 환경인지 확인
  if (process.pkg) {
    // pkg 환경에서는 번들된 파일들이 snapshot 안에 있음
    return path.join(process.cwd(), 'dist', 'esm', 'cli', 'index.js');
  } else {
    // 일반 환경
    return path.join(__dirname, 'dist', 'esm', 'cli', 'index.js');
  }
}

const cliPath = findCliPath();

console.log('🔧 Tokamak Synthesizer Binary');
console.log('📁 Working directory:', process.cwd());
console.log('📂 CLI path:', cliPath);

// 파일 존재 확인
if (fs.existsSync(cliPath)) {
  console.log('✅ CLI file found');
} else {
  console.log('❌ CLI file not found, falling back to basic functionality');

  // 기본 기능만 제공
  const { program } = require('commander');

  program
    .name('tokamak-synthesizer')
    .description('Tokamak zk-EVM Synthesizer (Binary Version)')
    .version('0.0.10');

  program
    .command('info')
    .description('Show synthesizer information')
    .action(() => {
      console.log('🔧 Tokamak zk-EVM Synthesizer (Binary)');
      console.log('Version: 0.0.10');
      console.log(
        'Description: Interprets Ethereum transactions as combinations of library subcircuits',
      );
      console.log('\n⚠️  This is a standalone binary version.');
      console.log(
        '📄 For full functionality, use the complete package with Node.js.',
      );
    });

  program
    .command('test')
    .description('Test binary functionality')
    .action(() => {
      console.log('✅ Binary is working!');
      console.log('🔧 Node.js version:', process.version);
      console.log('💻 Platform:', process.platform);
      console.log('🏗️ Architecture:', process.arch);
      console.log('📦 PKG mode:', !!process.pkg);
    });

  program.parse();
  return;
}

// CLI 파일이 있으면 실제 기능 실행
const child = spawn('node', [cliPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: process.cwd(),
});

child.on('exit', (code) => {
  process.exit(code || 0);
});

child.on('error', (error) => {
  console.error('❌ Error executing synthesizer:', error.message);
  console.log('\n💡 Fallback: This binary includes basic functionality only.');
  console.log('For full synthesis capabilities, use the complete package.');
  process.exit(1);
});
