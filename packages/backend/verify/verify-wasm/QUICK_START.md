# ⚡ Quick Start Guide

**브라우저에서 5분 만에 zkSNARK 검증 실행하기**

## 📋 요구사항

- ✅ 브라우저: Chrome 57+, Firefox 52+, Safari 11+, Edge 16+ (2017년 이후 모든 브라우저)
- ✅ Rust: 1.70+ (빌드 시에만 필요)
- ✅ wasm-pack (빌드 시에만 필요)

## 🚀 3단계로 시작하기

### Step 1: wasm-pack 설치 (최초 1회)

```bash
curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
```

### Step 2: 빌드

```bash
cd packages/backend/verify/verify-wasm
./build.sh
```

**빌드 시간:** 약 2-3분 (최초 빌드는 더 오래 걸릴 수 있음)

### Step 3: 브라우저에서 테스트

```bash
# 로컬 서버 실행
python3 -m http.server 8000

# 브라우저에서 열기
# http://localhost:8000/example-simple.html
```

**브라우저에서 "Run Verification Test" 버튼 클릭!**

## 🎉 성공!

화면에 다음과 같이 표시되면 성공입니다:

```
✅ WASM loaded in 50ms
✅ Verifier created successfully!
⚠️ No Keccak data (expected for test)
⏱️ Verification time: 5ms
🧹 Memory cleaned up
```

## 📝 이제 코드에 통합하기

### 가장 간단한 사용법

```html
<!DOCTYPE html>
<html>
  <body>
    <script type="module">
      import init, { Verifier } from './pkg-web/verify_wasm.js';

      // Initialize and verify
      await init();
      const verifier = new Verifier(setupParamsJson, instanceJson);
      const result = verifier.verify_keccak256();
      console.log('Result:', result);
      verifier.free();
    </script>
  </body>
</html>
```

### React에서 사용

```typescript
import { useEffect } from 'react';
import init, { Verifier } from 'verify-wasm';

function App() {
  useEffect(() => {
    init(); // Initialize WASM once
  }, []);

  const verify = async () => {
    const verifier = new Verifier(setupParamsJson, instanceJson);
    const result = verifier.verify_keccak256();
    verifier.free();
    return result;
  };

  return <button onClick={verify}>Verify</button>;
}
```

## 🔍 동작 확인

빌드 후 다음 파일들이 생성됩니다:

```
verify-wasm/
├── pkg/              # 번들러용 (Webpack, Vite, Rollup)
│   ├── verify_wasm_bg.wasm
│   └── verify_wasm.js
├── pkg-web/          # 브라우저용 (직접 import)
│   ├── verify_wasm_bg.wasm
│   └── verify_wasm.js
└── pkg-node/         # Node.js용
    ├── verify_wasm_bg.wasm
    └── verify_wasm.js
```

## 📊 예상 성능

| 작업           | 시간     |
| -------------- | -------- |
| WASM 로드      | ~50ms    |
| Verifier 생성  | ~100ms   |
| Keccak256 검증 | 2-5초    |
| **총합**       | **~5초** |

## ❓ 문제 해결

### wasm-pack이 없다고 나옴

```bash
curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
```

### CORS 에러 발생

로컬 서버를 실행하세요:

```bash
python3 -m http.server 8000
# 또는
npx serve .
```

### 빌드가 느림

정상입니다. 최초 빌드는 5-10분 걸릴 수 있습니다.

## 📚 더 알아보기

- **README.md**: 전체 문서
- **example-browser.html**: 완전한 UI 데모
- **example-simple.html**: 간단한 테스트
- **example-node.js**: Node.js 예제

## 🎯 핵심 정리

1. ✅ **브라우저에서 완벽 동작**: 모든 주요 브라우저 지원
2. ✅ **모바일도 지원**: iOS Safari, Chrome Android
3. ✅ **빠른 속도**: 5초 내 검증 완료
4. ✅ **쉬운 통합**: React, Vue 등 모든 프레임워크에서 사용 가능

**질문이나 문제가 있으면 README.md의 Troubleshooting 섹션을 확인하세요!**
