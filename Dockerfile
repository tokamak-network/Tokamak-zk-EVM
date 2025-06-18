# 3GB 이하 목표 최종 Dockerfile (tokamak-zk-evm-tontransfer 재구성 버전)
# [중요] 프로젝트 최상위 루트에서 .dockerignore 파일을 생성 후 빌드해야 합니다.

# 1. 초경량 OS 'Debian Slim'으로 시작
FROM debian:12-slim

# Docker 빌드 시 호스트의 CPU 아키텍처를 전달받음
ARG TARGETARCH

# ENV를 사용하여 버전 정보 및 PATH를 한 번에 관리
ENV GOLANG_VERSION=1.21.1 \
    NODE_VERSION=20.11.1 \
    CIRCOM_VERSION=2.1.8 \
    PATH="/root/.cargo/bin:/usr/local/go/bin:/usr/local/bin:${PATH}"

# 2. 필수 개발 도구만 설치하고 즉시 정리
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    cmake \
    protobuf-compiler \
    curl \
    build-essential \
    git \
    clang \
    libclang-dev \
    xz-utils \
    ca-certificates \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# 3. Rust 'minimal' 프로파일로 최소 설치
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain stable

# 4. Golang 설치
RUN curl -L "https://go.dev/dl/go${GOLANG_VERSION}.linux-${TARGETARCH}.tar.gz" | tar -xz -C /usr/local

# 5. Node.js 및 pnpm, tsx 설치 후 즉시 캐시 정리
RUN case ${TARGETARCH} in "amd64") NODE_ARCH="x64" ;; "arm64") NODE_ARCH="arm64" ;; esac && \
    curl -L "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" | tar -xJ -C /usr/local --strip-components=1 && \
    npm install -g pnpm tsx && \
    npm cache clean --force

# 6. Circom 설치
RUN curl -L "https://github.com/iden3/circom/releases/download/v${CIRCOM_VERSION}/circom-linux-${TARGETARCH}" -o /usr/local/bin/circom && \
    chmod +x /usr/local/bin/circom

# 작업 디렉토리 설정
WORKDIR /app

# [중요] 프로젝트 전체 소스 코드를 복사 (.dockerignore 필수)
COPY . .

# [최적화] frontend 패키지들의 의존성만 설치하고, pnpm 캐시와 저장소 자체를 완전 삭제
RUN pnpm install --filter "./packages/frontend/**" \
    && rm -rf $(pnpm store path)

# cargo 관련 캐시 최종 정리
RUN rm -rf /root/.cargo/registry /root/.cargo/git /root/.cache

# 컨테이너 실행 시 기본적으로 bash 셸을 시작
CMD ["bash"]