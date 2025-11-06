FROM ubuntu:latest
# ---------- OS packages ----------
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive \
    apt-get install -y \
        git curl make build-essential unzip pkg-config libssl-dev jq \
        git-lfs \
        cmake \
        dos2unix

# ---------- Rust ----------
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# ---------- Circom ----------
RUN git clone https://github.com/iden3/circom.git /tmp/circom \
 && cd /tmp/circom && cargo build --release \
 && cp /tmp/circom/target/release/circom /usr/local/bin/ \
 && rm -rf /tmp/circom

# ---------- Node ----------
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
RUN apt-get install -y nodejs
ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"
RUN npm install -g pnpm
RUN pnpm add -g snarkjs

# ---------- Foundry (forge / anvil) ----------
RUN curl -L https://foundry.paradigm.xyz | bash \
 && ~/.foundry/bin/foundryup