# Base image
FROM ubuntu:22.04

# Install dependencies
RUN apt-get update && apt-get install -y \
    bash \
    cmake \
    protobuf-compiler \
    curl \
    build-essential \
    git \
    clang \
    libclang-dev \
    lldb \
    && rm -rf /var/lib/apt/lists/*

# Customize bash prompt
RUN echo 'export PS1="\w\$ "' >> /root/.bashrc

# Install Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# Install Golang
ENV GOLANG_VERSION 1.21.1
RUN curl -L https://go.dev/dl/go${GOLANG_VERSION}.linux-amd64.tar.gz | tar -xz -C /usr/local
ENV PATH="/usr/local/go/bin:${PATH}"

# Clone specific repository and branch
RUN git clone --branch muhammed-mpc_setup https://github.com/tokamak-network/Tokamak-zk-EVM.git /app

# Set working directory
WORKDIR /app/packages/backend

# Build the Rust project
RUN cargo build --release

# Ensure output directory exists
RUN mkdir -p /app/packages/backend/setup/mpc-setup/output && chmod -R 755 /app/packages/backend/setup/mpc-setup/output

# Add convenience scripts
RUN echo '#!/bin/bash\ncargo run --release --bin phase1_initialize -- --s-max 64 --mode random --setup-params-file setupParams.json --outfolder setup/mpc-setup/output --compress true' \
    > /usr/local/bin/phase1_initialize && chmod +x /usr/local/bin/phase1_initialize
RUN echo '#!/bin/bash\ncargo run --release --bin phase1_next_contributor -- --outfolder setup/mpc-setup/output --mode random' \
    > /usr/local/bin/phase1_next_contributor && chmod +x /usr/local/bin/phase1_next_contributor
RUN echo '#!/bin/bash\ncargo run --release --bin drive -- --outfolder ./setup/mpc-setup/output --mode upload' \
    > /usr/local/bin/drive_upload && chmod +x /usr/local/bin/drive_upload

RUN echo '#!/bin/bash\ncargo run --release --bin drive -- --outfolder ./setup/mpc-setup/output --mode download' \
    > /usr/local/bin/drive_download && chmod +x /usr/local/bin/drive_download \

# Default command to run
CMD ["bash"]
