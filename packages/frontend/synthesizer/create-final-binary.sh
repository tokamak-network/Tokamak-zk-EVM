#!/bin/bash

echo "🚀 Creating Final Tokamak Synthesizer Binary Distribution"

# 1. 작동하는 wrapper 기반으로 pkg 설정 업데이트
echo "📦 Updating pkg configuration..."

# package.json에서 pkg 설정을 업데이트하여 모든 필요한 파일 포함
cat > pkg-config.json << 'EOF'
{
  "pkg": {
    "assets": [
      "dist/**/*",
      "node_modules/**/*",
      "qap-compiler/**/*",
      "src/**/*"
    ],
    "scripts": [
      "dist/**/*.js",
      "src/**/*.ts"
    ]
  }
}
EOF

# 2. 작동하는 CommonJS wrapper로 바이너리 생성
echo "🔨 Building binaries with working wrapper..."

# synthesizer.cjs가 이미 작동하는 것을 확인했으므로, 이것을 pkg로 빌드
npx pkg synthesizer.cjs \
  --config pkg-config.json \
  --targets node18-linux-x64,node18-macos-x64,node18-macos-arm64,node18-win-x64 \
  --output ./bin/tokamak-synthesizer

echo "✅ Binaries created:"
ls -lh bin/tokamak-synthesizer*

# 3. 테스트
echo "🧪 Testing macOS ARM64 binary..."
./bin/tokamak-synthesizer-macos-arm64 info

echo ""
echo "🎉 Final binaries ready for distribution!"
echo "📁 Binaries location: ./bin/"
echo ""
echo "🚀 Usage:"
echo "  ./bin/tokamak-synthesizer-macos-arm64 parse -t 0x123... -r https://..."
echo "  ./bin/tokamak-synthesizer-linux-x64 info"
echo "  ./bin/tokamak-synthesizer-win-x64.exe --help" 