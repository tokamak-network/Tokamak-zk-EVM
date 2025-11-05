#!/bin/bash
# Setup script for GPU Analysis - Multiple Transactions
# This script sets up the Python environment and dependencies

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "========================================="
echo "GPU Analysis Multi-TX Setup"
echo "========================================="
echo ""

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "Error: python3 not found. Please install Python 3.8 or later."
    exit 1
fi

PYTHON_VERSION=$(python3 --version | cut -d' ' -f2 | cut -d'.' -f1,2)
echo "Found Python: $PYTHON_VERSION"

# Create virtual environment
if [ ! -d "$SCRIPT_DIR/venv" ]; then
    echo ""
    echo "Creating virtual environment..."
    python3 -m venv "$SCRIPT_DIR/venv"
    echo "Virtual environment created."
else
    echo ""
    echo "Virtual environment already exists."
fi

# Activate and install dependencies
echo ""
echo "Installing dependencies..."
source "$SCRIPT_DIR/venv/bin/activate"

pip install --upgrade pip > /dev/null 2>&1
pip install -r "$SCRIPT_DIR/requirements.txt"

echo ""
echo "========================================="
echo "Setup Complete!"
echo "========================================="
echo ""
echo "To activate the virtual environment:"
echo "  cd $SCRIPT_DIR"
echo "  source venv/bin/activate"
echo ""
echo "Quick start:"
echo "  1. Fetch transactions:"
echo "     python3 fetch_random_txs.py --count 10 --output test_txs.json"
echo ""
echo "  2. Run GPU analysis:"
echo "     ./run_gpu_analysis_batch.sh test_txs.json"
echo ""
echo "  3. Analyze results:"
echo "     python3 analyze_batch_results.py batch_results/summary_*.csv batch_results/consolidated_gpu_data_*.csv"
echo ""
