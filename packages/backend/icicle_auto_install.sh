#!/bin/bash

set -e
# chmod +x icicle_auto_install.sh

# 1. Detect OS and choose download URL
OS_TYPE="$(uname -s)"
ARCH_TYPE="$(uname -m)"
LINUX_DIST=""
TARBALL_URL=""
TARBALL_NAME=""
INSTALL_DIR="/opt/icicle"

if [[ "$OS_TYPE" == "Darwin" ]]; then
    # macOS (Metal)
    TARBALL_URL="https://github.com/ingonyama-zk/icicle/releases/download/v3.7.0/icicle_3_7_0-macOS-Metal.tar.gz"
    TARBALL_NAME="icicle_3_7_0-macOS-Metal.tar.gz"
    BACKEND_TYPE="metal"
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
            TARBALL_URL="https://github.com/ingonyama-zk/icicle/releases/download/v3.7.0/icicle_3_7_0-ubuntu20-cuda122.tar.gz"
            TARBALL_NAME="icicle_3_7_0-ubuntu20-cuda122.tar.gz"
            BACKEND_TYPE="cuda"
        elif [[ "$LINUX_VER" == 22.* ]]; then
            TARBALL_URL="https://github.com/ingonyama-zk/icicle/releases/download/v3.7.0/icicle_3_7_0-ubuntu22-cuda122.tar.gz"
            TARBALL_NAME="icicle_3_7_0-ubuntu22-cuda122.tar.gz"
            BACKEND_TYPE="cuda"
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

echo "[*] Detected OS: $OS_TYPE $LINUX_DIST $LINUX_VER"
echo "[*] Downloading $TARBALL_URL ..."

# 2. Download and extract
wget -O $TARBALL_NAME "$TARBALL_URL"
echo "[*] Extracting..."
tar -xzf $TARBALL_NAME

# 3. Install to target directory
echo "[*] Installing to $INSTALL_DIR ..."
sudo mkdir -p $INSTALL_DIR
sudo cp -r icicle/* $INSTALL_DIR/

# 4. Copy field libraries to backend folders
echo "[*] Copying field libraries to backend $BACKEND_TYPE folders..."
for curve in bn254 m31 bw6_761 bls12_377 grumpkin koalabear babybear stark252 bls12_381
do
  if [[ "$BACKEND_TYPE" == "metal" ]]; then
    SRC="$INSTALL_DIR/lib/libicicle_field_${curve}.dylib"
    DEST="$INSTALL_DIR/lib/backend/${curve}/metal/"
  else
    SRC="$INSTALL_DIR/lib/libicicle_field_${curve}.so"
    DEST="$INSTALL_DIR/lib/backend/${curve}/cuda/"
  fi

  if [ -f "$SRC" ] && [ -d "$DEST" ]; then
    echo "  - Copying $SRC → $DEST"
    sudo cp "$SRC" "$DEST"
  else
    echo "  - Skipping $curve (missing file or folder)"
  fi
done

# 5. Cleanup: remove downloaded files and extracted temp folder
echo "[*] Cleaning up temporary files..."
rm -rf $TARBALL_NAME icicle

# 6. Output environment variable setup instructions
if [[ "$BACKEND_TYPE" == "metal" ]]; then
    ENV_LINE="export DYLD_LIBRARY_PATH=$INSTALL_DIR/lib:$INSTALL_DIR/lib/backend/bn254/metal:\$DYLD_LIBRARY_PATH"
    echo ""
    echo "=================================================================="
    echo "[*] Please set the DYLD_LIBRARY_PATH environment variable:"
    echo ""
    echo "   $ENV_LINE"
    echo ""
    echo "You may want to add this to your ~/.zshrc or ~/.bash_profile."
    echo "=================================================================="
    # Optionally set it for current session
    eval "$ENV_LINE"
    echo "[*] DYLD_LIBRARY_PATH environment variable is set for this session."
else
    echo ""
    echo "[*] If you are using CUDA, you may need to set the LD_LIBRARY_PATH environment variable as well."
fi

echo "[*] Done! Icicle backend ($BACKEND_TYPE) installation and setup complete."
