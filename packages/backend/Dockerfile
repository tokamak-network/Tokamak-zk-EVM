# # Use the specified base image
# FROM nvidia/cuda:12.2.0-devel-ubuntu22.04

# Use Ubuntu as base image (No CUDA)
FROM ubuntu:22.04

# Update and install dependencies
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

# 기본 프롬프트 변경
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

# Specify the default command for the container
CMD ["bash"]