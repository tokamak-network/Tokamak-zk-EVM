# 개발용: 코드(COPY) 없이 툴체인만 포함. 실행 시 -v로 소스 마운트
FROM nvidia/cuda:12.2.0-devel-ubuntu22.04

ARG DEBIAN_FRONTEND=noninteractive
ENV TZ=Asia/Seoul
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash ca-certificates curl wget gnupg jq \
    build-essential cmake pkg-config libssl-dev \
    git clang libclang-dev lldb \
    protobuf-compiler dos2unix \
 && rm -rf /var/lib/apt/lists/*

# Node.js 20
RUN mkdir -p /etc/apt/keyrings \
 && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
 | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
 && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" \
 | tee /etc/apt/sources.list.d/nodesource.list \
 && apt-get update && apt-get install -y nodejs \
 && rm -rf /var/lib/apt/lists/*

# Rust (rustup)
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
 | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# Go (amd64). arm64가 필요하면 linux-arm64로 변경
ENV GOLANG_VERSION=1.21.1
RUN curl -L https://go.dev/dl/go${GOLANG_VERSION}.linux-amd64.tar.gz \
 | tar -xz -C /usr/local
ENV PATH="/usr/local/go/bin:${PATH}"

# 프롬프트 가독성
RUN echo 'export PS1="\\w\\$ "' >> /root/.bashrc

# 작업 디렉터리(호스트를 -v로 /workspace에 마운트)
WORKDIR /workspace

# 엔트리
CMD ["bash"]
