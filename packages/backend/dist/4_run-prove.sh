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
    else
        echo "Unsupported Linux distribution: $LINUX_DIST. Only Ubuntu 20/22 is supported."
        exit 1
    fi
else
    echo "Unsupported OS: $OS_TYPE. Only macOS and Ubuntu 20/22 are supported."
    exit 1
fi


# Verify INSTALL_DIR exists and has expected structure
if [ ! -d "$INSTALL_DIR" ]; then
    echo "[ERROR] Installation does not exist: $INSTALL_DIR"
    exit 1
fi

# Run ./bin/prove from the current package directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_PROVE="$SCRIPT_DIR/bin/prove"

if [ ! -x "$LOCAL_PROVE" ]; then
    echo "[ERROR] Executable not found or not executable: $LOCAL_PROVE"
    exit 1
fi

if [[ "$OS_TYPE" == "Darwin" ]]; then
    # Prepend local lib to DYLD_LIBRARY_PATH so bundled libs are preferred
    export DYLD_LIBRARY_PATH="$INSTALL_DIR/lib"
else
    export LD_LIBRARY_PATH="$INSTALL_DIR/lib"
fi

# Optional debug output
echo "[INFO] Launching: $LOCAL_PROVE"
echo "[INFO] Using library path: ${DYLD_LIBRARY_PATH:-$LD_LIBRARY_PATH}"

exec "$LOCAL_PROVE" "$SCRIPT_DIR/resource/qap_compiler/library" "$SCRIPT_DIR/resource/synthesizer/outputs" "$SCRIPT_DIR/resource/setup/output" "$SCRIPT_DIR/resource/prove/output"
