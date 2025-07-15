# # Use the specified base image
# FROM nvidia/cuda:12.2.0-devel-ubuntu22.04

# Use Ubuntu as base image (No CUDA)
FROM nvidia/cuda:12.2.0-devel-ubuntu22.04

# Switch to a Korean mirror to avoid apt-get hash mismatch errors
RUN sed -i -e 's|http://archive.ubuntu.com|http://kr.archive.ubuntu.com|g' -e 's|http://security.ubuntu.com|http://kr.archive.ubuntu.com|g' /etc/apt/sources.list

# Update and install dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    cmake \
    protobuf-compiler \
    curl \
    build-essential \
    git \
    clang \
    libclang-dev \
    lldb \
    jq \
    ca-certificates \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js
RUN mkdir -p /etc/apt/keyrings
RUN curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
RUN echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list
RUN apt-get update && apt-get install nodejs -y

# Change default prompt
RUN echo 'export PS1="\w\$ "' >> /root/.bashrc

# Install Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# Install Golang
ENV GOLANG_VERSION 1.21.1
RUN curl -L https://go.dev/dl/go${GOLANG_VERSION}.linux-amd64.tar.gz | tar -xz -C /usr/local
ENV PATH="/usr/local/go/bin:${PATH}"

# Set the working directory in the container
WORKDIR /app

# Copy the content of the local directory to the working directory
COPY . .

# Install frontend dependencies
RUN cd frontend/synthesizer && npm install

# Fix CRLF line endings in shell scripts to prevent "^M" error
RUN find . -type f -name "*.sh" -exec sed -i 's/\r$//' {} +

# Specify the default command for the container
CMD ["bash"]