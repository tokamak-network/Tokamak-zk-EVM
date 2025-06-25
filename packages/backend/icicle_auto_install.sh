#!/bin/bash
set -e

# Root detection for Docker/Local
if [ "$(id -u)" == "0" ]; then
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

function check_backend_support() {
    if [[ "$1" == "cuda" ]]; then
        if ! command -v nvidia-smi &> /dev/null; then
            echo "CUDA not detected (nvidia-smi not found). Please install CUDA drivers or use a CPU/Metal backend."
            exit 0
        fi
    elif [[ "$1" == "metal" ]]; then
        if ! system_profiler SPDisplaysDataType | grep -q 'Metal Support:'; then
            echo "Metal not supported on this Mac. Exiting."
            exit 0
        fi
    fi
}

if [[ "$OS_TYPE" == "Darwin" ]]; then
    COMMON_TARBALL="icicle_3_7_0-macOS.tar.gz"
    BACKEND_TARBALL="icicle_3_7_0-macOS-Metal.tar.gz"
    COMMON_URL="https://github.com/ingonyama-zk/icicle/releases/download/v3.7.0/$COMMON_TARBALL"
    BACKEND_URL="https://github.com/ingonyama-zk/icicle/releases/download/v3.7.0/$BACKEND_TARBALL"
    BACKEND_TYPE="metal"
    check_backend_support metal
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
        if [[ "$LINUX_VER" == 20.* ]]; then
            COMMON_TARBALL="icicle_3_7_0-ubuntu20.tar.gz"
            BACKEND_TARBALL="icicle_3_7_0-ubuntu20-cuda122.tar.gz"
            COMMON_URL="https://github.com/ingonyama-zk/icicle/releases/download/v3.7.0/$COMMON_TARBALL"
            BACKEND_URL="https://github.com/ingonyama-zk/icicle/releases/download/v3.7.0/$BACKEND_TARBALL"
            BACKEND_TYPE="cuda"
            check_backend_support cuda
        elif [[ "$LINUX_VER" == 22.* ]]; then
            COMMON_TARBALL="icicle_3_7_0-ubuntu22.tar.gz"
            BACKEND_TARBALL="icicle_3_7_0-ubuntu22-cuda122.tar.gz"
            COMMON_URL="https://github.com/ingonyama-zk/icicle/releases/download/v3.7.0/$COMMON_TARBALL"
            BACKEND_URL="https://github.com/ingonyama-zk/icicle/releases/download/v3.7.0/$BACKEND_TARBALL"
            BACKEND_TYPE="cuda"
            check_backend_support cuda
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

echo "[*] Downloading backend package..."
curl -L -o $BACKEND_TARBALL "$BACKEND_URL"
echo "[*] Downloading common runtime package..."
curl -L -o $COMMON_TARBALL "$COMMON_URL"

echo "[*] Extracting packages..."
tar -xzf $BACKEND_TARBALL
tar -xzf $COMMON_TARBALL

echo "[*] Installing to $INSTALL_DIR ..."
$SUDO mkdir -p $INSTALL_DIR
$SUDO cp -r icicle/* $INSTALL_DIR/

echo "[*] Copying all shared libraries to backend $BACKEND_TYPE folders..."
for libfile in $INSTALL_DIR/lib/*.{so,dylib}; do
    [ -e "$libfile" ] || continue
    libname=$(basename "$libfile")
    curve=$(echo "$libname" | sed -E 's/libicicle_(field|curve)_([a-z0-9_]+)\.(so|dylib)/\2/')
    dest="$INSTALL_DIR/lib/backend/$curve/$BACKEND_TYPE/"
    if [ -d "$dest" ]; then
        echo "  - Copying $libname to $dest"
        $SUDO cp "$libfile" "$dest"
    fi
done

echo "[*] Cleaning up temporary files..."
rm -rf $BACKEND_TARBALL $COMMON_TARBALL icicle

curve="bls12_381"
if [[ "$BACKEND_TYPE" == "metal" ]]; then
    ENV_LINE="export DYLD_LIBRARY_PATH=$INSTALL_DIR/lib:$INSTALL_DIR/lib/backend/$curve/metal:\$DYLD_LIBRARY_PATH"
    echo ""
    echo "=================================================================="
    echo "[*] Please set the DYLD_LIBRARY_PATH environment variable:"
    echo "   $ENV_LINE"
    echo "You may want to add this to your ~/.zshrc or ~/.bash_profile."
    echo "=================================================================="
    eval "$ENV_LINE"
    echo "[*] DYLD_LIBRARY_PATH environment variable is set for this session."
else
    ENV_LINE="export LD_LIBRARY_PATH=$INSTALL_DIR/lib:$INSTALL_DIR/lib/backend/$curve/cuda:\$LD_LIBRARY_PATH"
    echo ""
    echo "=================================================================="
    echo "[*] Please set the LD_LIBRARY_PATH environment variable:"
    echo "   $ENV_LINE"
    echo "You may want to add this to your ~/.bashrc or ~/.zshrc."
    echo "=================================================================="
    eval "$ENV_LINE"
    echo "[*] LD_LIBRARY_PATH environment variable is set for this session."
fi

echo "[*] Done! Icicle backend ($BACKEND_TYPE, bls12_381) installation and setup complete."
