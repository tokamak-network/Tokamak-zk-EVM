#!/bin/bash
# Setup Python virtual environment for GPU monitoring tools
# Usage: ./setup-python-env.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VENV_DIR="$REPO_ROOT/venv"

log() { echo -e "\033[1;34m[setup-python]\033[0m $*"; }
ok()  { echo -e "\033[1;32m[ ok ]\033[0m $*"; }
err() { echo -e "\033[1;31m[error]\033[0m $*" >&2; }

log "========================================="
log "Python Virtual Environment Setup"
log "========================================="
echo ""

# Check Python
log "Checking Python installation..."
if ! command -v python3 &> /dev/null; then
    err "python3 not found"
    echo "Please install Python 3.8 or newer:"
    echo "  Ubuntu/Debian: sudo apt-get install python3 python3-venv python3-pip"
    echo "  macOS: brew install python3"
    exit 1
fi

PYTHON_VERSION=$(python3 --version)
ok "Found: $PYTHON_VERSION"
echo ""

# Check if venv module is available
log "Checking python3-venv package..."
if ! python3 -m venv --help &> /dev/null; then
    err "python3-venv module not available"
    echo ""
    echo "Please install the python3-venv package:"
    echo ""
    if [ -f /etc/debian_version ]; then
        PYTHON_VER=$(python3 --version | cut -d' ' -f2 | cut -d'.' -f1,2)
        echo "  sudo apt-get update"
        echo "  sudo apt-get install python3-venv python3-pip"
        echo ""
        echo "Or for your specific Python version:"
        echo "  sudo apt-get install python${PYTHON_VER}-venv"
    else
        echo "  sudo apt-get install python3-venv python3-pip"
    fi
    echo ""
    exit 1
fi
ok "python3-venv is available"
echo ""

# Create virtual environment
if [ -d "$VENV_DIR" ]; then
    log "Virtual environment already exists at: $VENV_DIR"
    read -p "Remove and recreate? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log "Removing existing virtual environment..."
        rm -rf "$VENV_DIR"
    else
        log "Using existing virtual environment"
        log "To activate: source venv/bin/activate"
        exit 0
    fi
fi

log "Creating virtual environment..."
python3 -m venv "$VENV_DIR"
ok "Virtual environment created at: $VENV_DIR"
echo ""

# Activate virtual environment
log "Activating virtual environment..."
source "$VENV_DIR/bin/activate"
ok "Virtual environment activated"
echo ""

# Upgrade pip
log "Upgrading pip..."
pip install --upgrade pip --quiet
ok "pip upgraded to: $(pip --version)"
echo ""

# Install required packages
log "Installing required packages..."
log "  - matplotlib (for plotting GPU usage)"
log "  - numpy (for numerical operations)"
echo ""

pip install matplotlib numpy --quiet

ok "Packages installed successfully"
echo ""

# Verify installation
log "Verifying installation..."
python3 << 'PYEOF'
import sys
print(f"  Python: {sys.version.split()[0]}")

try:
    import matplotlib
    print(f"  matplotlib: {matplotlib.__version__}")
except ImportError:
    print("  matplotlib: NOT INSTALLED")
    sys.exit(1)

try:
    import numpy
    print(f"  numpy: {numpy.__version__}")
except ImportError:
    print("  numpy: NOT INSTALLED")
    sys.exit(1)

print("\n✓ All packages installed correctly!")
PYEOF

echo ""
log "========================================="
log "Setup Complete!"
log "========================================="
echo ""
echo "Virtual environment location: $VENV_DIR"
echo ""
echo "To use the GPU plotting tools:"
echo ""
echo "  1. Activate the virtual environment:"
echo "     source venv/bin/activate"
echo ""
echo "  2. Run your prove with GPU monitoring:"
echo "     ./run-prove-with-gpu-monitoring.sh <TX_HASH>"
echo ""
echo "  3. Plot the GPU usage:"
echo "     python3 plot_gpu_usage.py proof_results/gpu_usage_*.csv"
echo ""
echo "  4. When done, deactivate:"
echo "     deactivate"
echo ""
ok "Setup successful! 🎉"
