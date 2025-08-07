#!/bin/bash
# set -e

# ---------------------------------------------------------------------------
# Sourcing detection
# ---------------------------------------------------------------------------
# If the script is executed (SOURCED=0) we abort with an error message
# because this installer must be *sourced* so that the exported variables
# persist in the parent shell.
if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
    SOURCED=1
else
    SOURCED=0
fi

if [ "$SOURCED" -eq 0 ]; then
    echo "[✗] Error: Please run this script with 'source ./icicle_auto_install.sh'."
    exit 1
fi

# Helper that behaves like exit/return depending on context
safe_exit() {
    local code="${1:-0}"
    if [ "$SOURCED" -eq 1 ]; then
        return "$code"
    else
        exit "$code"
    fi
}

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
    if [[ "$1" == "cuda" ]]; then
        if ! command -v nvidia-smi &> /dev/null; then
            echo "CUDA not detected (nvidia-smi not found). Please install CUDA drivers or use a CPU/Metal backend."
            
            if [ -d "$INSTALL_DIR" ]; then
                echo "[*] Checking for existing files in $INSTALL_DIR..."
                if [ "$(ls -A $INSTALL_DIR 2>/dev/null)" ]; then
                    echo "[*] Found existing files in $INSTALL_DIR. Removing them..."
                    $SUDO rm -rf "$INSTALL_DIR"/*
                    echo "[*] Files in $INSTALL_DIR have been removed."
                else
                    echo "[*] $INSTALL_DIR is empty."
                fi
            else
                echo "[*] $INSTALL_DIR directory does not exist."
            fi
            
            safe_exit 0
        fi
    elif [[ "$1" == "metal" ]]; then
        if ! system_profiler SPDisplaysDataType | grep -q 'Metal Support:'; then
            echo "Metal not supported on this Mac. Exiting."
            safe_exit 0
        fi
    fi
}

if [[ "$OS_TYPE" == "Darwin" ]]; then
    COMMON_TARBALL="icicle_3_8_0-macOS.tar.gz"
    BACKEND_TARBALL="icicle_3_8_0-macOS-Metal.tar.gz"
    COMMON_URL="https://github.com/ingonyama-zk/icicle/releases/download/v3.8.0/$COMMON_TARBALL"
    BACKEND_URL="https://github.com/ingonyama-zk/icicle/releases/download/v3.8.0/$BACKEND_TARBALL"
    # BACKEND_TYPE="metal"
    # check_backend_support metal
elif [[ "$OS_TYPE" == "Linux" ]]; then
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        LINUX_DIST=$ID
        LINUX_VER=$VERSION_ID
    else
        echo "Cannot determine Linux distribution."
        safe_exit 1
    fi

    if [[ "$LINUX_DIST" == "ubuntu" ]]; then
        if [[ "$LINUX_VER" == 20.* ]]; then
            COMMON_TARBALL="icicle_3_8_0-ubuntu20.tar.gz"
            BACKEND_TARBALL="icicle_3_8_0-ubuntu20-cuda122.tar.gz"
            COMMON_URL="https://github.com/ingonyama-zk/icicle/releases/download/v3.8.0/$COMMON_TARBALL"
            BACKEND_URL="https://github.com/ingonyama-zk/icicle/releases/download/v3.8.0/$BACKEND_TARBALL"
            BACKEND_TYPE="cuda"
            check_backend_support cuda
        elif [[ "$LINUX_VER" == 22.* ]]; then
            COMMON_TARBALL="icicle_3_8_0-ubuntu22.tar.gz"
            BACKEND_TARBALL="icicle_3_8_0-ubuntu22-cuda122.tar.gz"
            COMMON_URL="https://github.com/ingonyama-zk/icicle/releases/download/v3.8.0/$COMMON_TARBALL"
            BACKEND_URL="https://github.com/ingonyama-zk/icicle/releases/download/v3.8.0/$BACKEND_TARBALL"
            # BACKEND_TYPE="cuda"
            # check_backend_support cuda
        else
            echo "Unsupported Ubuntu version: $LINUX_VER. Only Ubuntu 20 and 22 are supported."
            safe_exit 1
        fi
    else
        echo "Unsupported Linux distribution: $LINUX_DIST. Only Ubuntu 20/22 is supported."
        safe_exit 1
    fi
else
    echo "Unsupported OS: $OS_TYPE. Only macOS and Ubuntu 20/22 are supported."
    safe_exit 1
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

# echo "[*] Copying all shared libraries to backend $BACKEND_TYPE folders..."
# for libfile in ./icicle/lib/*.{so,dylib}; do
#     [ -e "$libfile" ] || continue
#     libname=$(basename "$libfile")
#     curve=$(echo "$libname" | sed -E 's/libicicle_(field|curve)_([a-z0-9_]+)\.(so|dylib)/\2/')
#     dest="$INSTALL_DIR/lib/backend/$curve/$BACKEND_TYPE/"
#     if [ -d "$dest" ]; then
#         echo "  - Copying $libname to $dest"
#         $SUDO cp "$libfile" "$dest"
#     fi
# done

echo "[*] Cleaning up temporary files..."
rm -rf $BACKEND_TARBALL $COMMON_TARBALL icicle

curve="bls12_381"
# if [[ "$BACKEND_TYPE" == "metal" ]]; then
if [[ "$OS_TYPE" == "Darwin" ]]; then
    # ENV_LINE="export DYLD_LIBRARY_PATH=$INSTALL_DIR/lib:$INSTALL_DIR/lib:\$DYLD_LIBRARY_PATH"
    ENV_LINE="export DYLD_LIBRARY_PATH=$INSTALL_DIR/lib"
    eval "$ENV_LINE"
    echo "[*] DYLD_LIBRARY_PATH environment variable is set for this session."
else
    # ENV_LINE="export LD_LIBRARY_PATH=$INSTALL_DIR/lib:$INSTALL_DIR/lib/backend/$curve/cuda:\$LD_LIBRARY_PATH"
    ENV_LINE="export LD_LIBRARY_PATH=$INSTALL_DIR/lib"
    eval "$ENV_LINE"
    echo "[*] LD_LIBRARY_PATH environment variable is set for this session."
fi

echo "[*] Done! Icicle backend ($OS_TYPE, bls12_381) installation and setup complete."

# # Installation verification
# echo ""
# echo "=================================================================="
# echo "[*] Verifying installation..."
# echo "=================================================================="

# # Check if installation directory exists and has files
# if [ -d "$INSTALL_DIR" ]; then
#     echo "[✓] Installation directory exists: $INSTALL_DIR"
    
#     # Check for main library files
#     if [ -f "$INSTALL_DIR/lib/libicicle_hash.dylib" ] || [ -f "$INSTALL_DIR/lib/libicicle_hash.so" ]; then
#         echo "[✓] Main icicle libraries found"
#     else
#         echo "[✗] Main icicle libraries not found"
#         safe_exit 1
#     fi
    
#     # Check for backend-specific files
#     if [ -d "$INSTALL_DIR/lib/backend/$curve/$BACKEND_TYPE" ]; then
#         echo "[✓] Backend directory exists: $INSTALL_DIR/lib/backend/$curve/$BACKEND_TYPE"
        
#         # Count backend files
#         backend_file_count=$(find "$INSTALL_DIR/lib/backend/$curve/$BACKEND_TYPE" -name "*.dylib" -o -name "*.so" 2>/dev/null | wc -l)
#         if [ "$backend_file_count" -gt 0 ]; then
#             echo "[✓] Found $backend_file_count backend library files"
#         else
#             echo "[✗] No backend library files found"
#             safe_exit 1
#         fi
#     else
#         echo "[✗] Backend directory not found: $INSTALL_DIR/lib/backend/$curve/$BACKEND_TYPE"
#         safe_exit 1
#     fi
# else
#     echo "[✗] Installation directory not found: $INSTALL_DIR"
#     safe_exit 1
# fi

# # Check and set environment variables if not already set
# echo ""
# echo "[*] Checking environment variables..."

# if [[ "$BACKEND_TYPE" == "metal" ]]; then
#     if [ -z "$DYLD_LIBRARY_PATH" ]; then
#         echo "[*] DYLD_LIBRARY_PATH is not set. Setting it now..."
#         export DYLD_LIBRARY_PATH="$INSTALL_DIR/lib:$INSTALL_DIR/lib/backend/$curve/metal"
#         echo "[✓] DYLD_LIBRARY_PATH set to: $DYLD_LIBRARY_PATH"
#     else
#         echo "[✓] DYLD_LIBRARY_PATH is already set: $DYLD_LIBRARY_PATH"
#     fi
# else
#     if [ -z "$LD_LIBRARY_PATH" ]; then
#         echo "[*] LD_LIBRARY_PATH is not set. Setting it now..."
#         export LD_LIBRARY_PATH="$INSTALL_DIR/lib:$INSTALL_DIR/lib/backend/$curve/cuda"
#         echo "[✓] LD_LIBRARY_PATH set to: $LD_LIBRARY_PATH"
#     else
#         echo "[✓] LD_LIBRARY_PATH is already set: $LD_LIBRARY_PATH"
#     fi
# fi

# echo ""
# echo "=================================================================="
# echo "[✓] Installation verification complete!"
# echo "[✓] Icicle backend ($BACKEND_TYPE, $curve) is ready to use."
# echo "=================================================================="