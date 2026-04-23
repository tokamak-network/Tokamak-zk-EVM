# tokamak-cli passes BASE_IMAGE at runtime:
# - ubuntu:22.04 for CPU-only installs
# - nvidia/cuda:12.2.0-devel-ubuntu22.04 when Docker CUDA probing succeeds
ARG BASE_IMAGE
FROM ${BASE_IMAGE}

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    bash \
    build-essential \
    ca-certificates \
    clang \
    cmake \
    curl \
    git \
    libclang-dev \
    pkg-config \
    tar \
    unzip \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

ENV CARGO_HOME=/usr/local/cargo
ENV RUSTUP_HOME=/usr/local/rustup
ENV PATH="/usr/local/cargo/bin:${PATH}"

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --no-modify-path \
    && chmod -R a+rwx /usr/local/cargo /usr/local/rustup

WORKDIR /opt/tokamak-cli

COPY package.json ./
RUN npm install --omit=dev --ignore-scripts

COPY dist ./dist
COPY scripts ./scripts
COPY vendor ./vendor

RUN test -f dist/cli.js \
    && test -f vendor/backend/Cargo.toml \
    && chmod -R a+rwx /opt/tokamak-cli

ENTRYPOINT ["node", "/opt/tokamak-cli/dist/cli.js"]
