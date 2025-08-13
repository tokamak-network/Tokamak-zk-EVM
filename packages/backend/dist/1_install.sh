#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

# Root detection for Docker/Local
if [ "$(id -u)" -eq "0" ]; then
    SUDO=""
else
    SUDO="sudo"
fi

INSTALL_DIR="/opt/icicle"


# OS detection
OS_TYPE="$(uname -s)"
LINUX_DIST=""
LINUX_VER=""
CUDA_BACKEND=""
COMMON_TARBALL=""
BACKEND_TARBALL=""
COMMON_URL=""
BACKEND_URL=""
BACKEND_TYPE=""

check_backend_support() {
    echo "Checking GPU backend..."
    if [[ "$1" == "cuda" ]]; then
        flag=$(command -v nvidia-smi)
        echo "nvidia-smi path: ${flag:-<not found>}"
        if [[ -z "$flag" ]]; then
            echo "CUDA not detected (nvidia-smi not found). Please install CUDA drivers or use a CPU/Metal backend."
            
            if [ -d "$INSTALL_DIR" ]; then
                echo "[*] Checking for existing files in $INSTALL_DIR..."
                if [ "$(ls -A \"$INSTALL_DIR\" 2>/dev/null)" ]; then
                    echo "[*] Found existing files in $INSTALL_DIR. Removing them..."
                    $SUDO rm -rf "$INSTALL_DIR"/*
                    echo "[*] Files in $INSTALL_DIR have been removed."
                else
                    echo "[*] $INSTALL_DIR is empty."
                fi
            else
                echo "[*] $INSTALL_DIR directory does not exist."
            fi

            echo "Exiting. Do not need to run this script."
            exit 1
        fi
        return 0
    elif [[ "$1" == "metal" ]]; then
        if ! system_profiler SPDisplaysDataType | grep -q 'Metal Support:'; then
            echo "Metal not supported on this Mac. Exiting. Do not need to run this script."
            exit 1
        fi
        return 0
    fi

    echo "Unknown backend type: $1"
    exit 1
}

if [[ "$OS_TYPE" == "Darwin" ]]; then
    if ! check_backend_support "metal"; then
        exit 1
    fi
    COMMON_TARBALL="icicle_3_8_0-macOS.tar.gz"
    BACKEND_TARBALL="icicle_3_8_0-macOS-Metal.tar.gz"
    COMMON_URL="https://github.com/ingonyama-zk/icicle/releases/download/v3.8.0/$COMMON_TARBALL"
    BACKEND_URL="https://github.com/ingonyama-zk/icicle/releases/download/v3.8.0/$BACKEND_TARBALL"
    # BACKEND_TYPE="metal"
elif [[ "$OS_TYPE" == "Linux" ]]; then
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        LINUX_DIST=$ID
        LINUX_VER=$VERSION_ID
    else
        echo "Cannot determine Linux distribution."
        exit 1
    fi

    if [[ "$LINUX_DIST" == "ubuntu" ]]; then
        if ! check_backend_support "cuda"; then
            exit 1
        fi
        if [[ "$LINUX_VER" == 20.* ]]; then
            COMMON_TARBALL="icicle_3_8_0-ubuntu20.tar.gz"
            BACKEND_TARBALL="icicle_3_8_0-ubuntu20-cuda122.tar.gz"
            COMMON_URL="https://github.com/ingonyama-zk/icicle/releases/download/v3.8.0/$COMMON_TARBALL"
            BACKEND_URL="https://github.com/ingonyama-zk/icicle/releases/download/v3.8.0/$BACKEND_TARBALL"
            # BACKEND_TYPE="cuda"
        elif [[ "$LINUX_VER" == 22.* ]]; then
            COMMON_TARBALL="icicle_3_8_0-ubuntu22.tar.gz"
            BACKEND_TARBALL="icicle_3_8_0-ubuntu22-cuda122.tar.gz"
            COMMON_URL="https://github.com/ingonyama-zk/icicle/releases/download/v3.8.0/$COMMON_TARBALL"
            BACKEND_URL="https://github.com/ingonyama-zk/icicle/releases/download/v3.8.0/$BACKEND_TARBALL"
            # BACKEND_TYPE="cuda"
        else
            echo "Unsupported Ubuntu version: $LINUX_VER. Only Ubuntu 20 and 22 are supported."
            exit 1
        fi
    else
        echo "Unsupported Linux distribution: $LINUX_DIST. Only Ubuntu 20/22 is supported."
        exit 1
    fi
else
    echo "Unsupported OS: $OS_TYPE. Only macOS and Ubuntu 20/22 are supported."
    exit 1
fi

command -v curl >/dev/null 2>&1 || { echo "curl is required but not found"; exit 1; }
command -v tar  >/dev/null 2>&1 || { echo "tar is required but not found"; exit 1; }

echo "[*] Downloading backend package..."
curl -fL --retry 3 -o "$BACKEND_TARBALL" "$BACKEND_URL"
echo "[*] Downloading common runtime package..."
curl -fL --retry 3 -o "$COMMON_TARBALL" "$COMMON_URL"

echo "[*] Extracting packages..."
tar -xzf "$BACKEND_TARBALL"
tar -xzf "$COMMON_TARBALL"

echo "[*] Installing to $INSTALL_DIR ..."
$SUDO mkdir -p "$INSTALL_DIR"
$SUDO cp -r icicle/* "$INSTALL_DIR"/

echo "[*] Cleaning up temporary files..."
rm -rf "$BACKEND_TARBALL" "$COMMON_TARBALL" icicle

echo "[*] Done! Icicle backend for ($OS_TYPE) has been installed in $INSTALL_DIR."
