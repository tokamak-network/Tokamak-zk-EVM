#!/bin/bash
# Run prove with GPU monitoring
# Usage: ./run-prove-with-gpu-monitoring.sh <TX_HASH> [OUTPUT_DIR]

set -e

# =========================
# Configuration
# =========================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TX_HASH="${1:-}"
OUTPUT_DIR="${2:-$SCRIPT_DIR/results}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
GPU_LOG="$OUTPUT_DIR/gpu_usage_${TIMESTAMP}.csv"
PROVE_LOG="$OUTPUT_DIR/prove_${TIMESTAMP}.log"

# Paths
FE_SYN="$REPO_ROOT/packages/frontend/synthesizer"
BACKEND_BIN="$REPO_ROOT/packages/backend/target/release"

# Detect platform
detect_platform() {
    case "$(uname -s)" in
        Darwin*) echo "macOS" ;;
        Linux*)  echo "linux22" ;;
        *)       echo "linux22" ;;
    esac
}

PLATFORM=$(detect_platform)
DIST_DIR="$REPO_ROOT/dist/$PLATFORM"

# Resource paths
QAP_LIBRARY="$DIST_DIR/resource/qap-compiler/library"
SYNTH_OUTPUTS="$FE_SYN/examples/outputs"
SETUP_OUTPUT="$DIST_DIR/resource/setup/output"
PREPROCESS_OUTPUT="$OUTPUT_DIR/preprocess"
PROVE_OUTPUT="$OUTPUT_DIR/prove"

# Icicle environment
if [[ "$PLATFORM" == "macOS" ]]; then
    export DYLD_LIBRARY_PATH="$DIST_DIR/backend-lib/icicle/lib"
else
    export LD_LIBRARY_PATH="$DIST_DIR/backend-lib/icicle/lib"
fi
export ICICLE_BACKEND_INSTALL_DIR="$DIST_DIR/backend-lib/icicle/lib/backend"

# =========================
# Helper Functions
# =========================

log() { echo -e "\033[1;34m[prove-gpu]\033[0m $*"; }
ok()  { echo -e "\033[1;32m[ ok ]\033[0m $*"; }
err() { echo -e "\033[1;31m[error]\033[0m $*" >&2; }

print_usage() {
    cat <<'USAGE'
Run Prove with GPU Monitoring

Usage:
  ./run-prove-with-gpu-monitoring.sh <TX_HASH> [OUTPUT_DIR]

Arguments:
  TX_HASH      Transaction hash (with or without 0x prefix)
  OUTPUT_DIR   Directory to save outputs (default: ./proof_results)

Example:
  ./run-prove-with-gpu-monitoring.sh 0xad6795bca9cf6b70f6ed2d728eae677d66510b3b25f2542f7f57920f858d9fd0
  ./run-prove-with-gpu-monitoring.sh 0xad6795bca9cf6b70f6ed2d728eae677d66510b3b25f2542f7f57920f858d9fd0 ./my_proof

Steps:
  1. Run synthesizer to generate circuit
  2. Run preprocess with GPU monitoring
  3. Run prove with GPU monitoring
  4. Run verify
  5. Save GPU usage data and proof artifacts

USAGE
}

cleanup() {
    if [ ! -z "$GPU_MONITOR_PID" ]; then
        log "Stopping GPU monitor (PID: $GPU_MONITOR_PID)..."
        kill $GPU_MONITOR_PID 2>/dev/null || true
        wait $GPU_MONITOR_PID 2>/dev/null || true
    fi

    if [ -f "$GPU_LOG" ] && [ $(wc -l < "$GPU_LOG") -gt 1 ]; then
        echo ""
        log "GPU Usage Summary:"
        awk -F',' 'NR>1 {
            sum_util+=$2; count_util++;
            sum_mem+=$3; count_mem++;
            if($2>max_util) max_util=$2;
            if($3>max_mem) max_mem=$3;
        }
        END {
            printf "  Average GPU Utilization: %.1f%%\n", sum_util/count_util;
            printf "  Max GPU Utilization: %.1f%%\n", max_util;
            printf "  Average Memory Utilization: %.1f%%\n", sum_mem/count_mem;
            printf "  Max Memory Utilization: %.1f%%\n", max_mem;
        }' "$GPU_LOG"
    fi
}

trap cleanup EXIT INT TERM

# =========================
# Validation
# =========================

if [[ -z "$TX_HASH" || "$TX_HASH" == "--help" || "$TX_HASH" == "-h" ]]; then
    print_usage
    exit 0
fi

if [[ ! "$TX_HASH" =~ ^(0x)?[0-9a-fA-F]{64}$ ]]; then
    err "Invalid transaction hash format: $TX_HASH"
    exit 1
fi

# Check nvidia-smi
if ! command -v nvidia-smi &> /dev/null; then
    err "nvidia-smi not found. GPU monitoring not available."
    exit 1
fi

# =========================
# Setup
# =========================

log "========================================="
log "Prove with GPU Monitoring"
log "========================================="
log "Transaction: $TX_HASH"
log "Platform: $PLATFORM"
log "Output: $OUTPUT_DIR"
log "GPU Log: $GPU_LOG"
log "Prove Log: $PROVE_LOG"
echo ""

# Create output directories
mkdir -p "$OUTPUT_DIR"
mkdir -p "$PREPROCESS_OUTPUT"
mkdir -p "$PROVE_OUTPUT"

# Save transaction hash
echo "$TX_HASH" > "$OUTPUT_DIR/transaction_hash.txt"

# Create CSV header
echo "timestamp,gpu_util_%,memory_util_%,memory_used_MiB,memory_total_MiB,temperature_C,power_W,sm_clock_MHz,mem_clock_MHz" > "$GPU_LOG"

# =========================
# Step 1: Synthesizer
# =========================

log "Step 1/4: Running synthesizer..."
echo "  Transaction: $TX_HASH"
echo "  Output: $SYNTH_OUTPUTS"
echo ""

cd "$FE_SYN"
if npm run synthesizer "$TX_HASH" 2>&1 | tee -a "$PROVE_LOG"; then
    ok "Synthesizer completed"
else
    err "Synthesizer failed"
    exit 1
fi
cd "$REPO_ROOT"
echo ""

# Verify synthesizer output
if [[ ! -d "$SYNTH_OUTPUTS" ]]; then
    err "Synthesizer output not found: $SYNTH_OUTPUTS"
    exit 1
fi

# =========================
# Start GPU Monitoring
# =========================

log "Starting GPU monitor..."
(
    while true; do
        timestamp=$(date +%Y-%m-%d_%H:%M:%S.%3N)
        nvidia-smi --query-gpu=utilization.gpu,utilization.memory,memory.used,memory.total,temperature.gpu,power.draw,clocks.sm,clocks.mem \
            --format=csv,noheader,nounits 2>/dev/null | \
        while IFS=, read -r gpu_util mem_util mem_used mem_total temp power sm_clock mem_clock; do
            gpu_util=$(echo "$gpu_util" | xargs)
            mem_util=$(echo "$mem_util" | xargs)
            mem_used=$(echo "$mem_used" | xargs)
            mem_total=$(echo "$mem_total" | xargs)
            temp=$(echo "$temp" | xargs)
            power=$(echo "$power" | xargs)
            sm_clock=$(echo "$sm_clock" | xargs)
            mem_clock=$(echo "$mem_clock" | xargs)

            echo "$timestamp,$gpu_util,$mem_util,$mem_used,$mem_total,$temp,$power,$sm_clock,$mem_clock" >> "$GPU_LOG"
        done
        sleep 0.1  # Sample every 100ms
    done
) &
GPU_MONITOR_PID=$!

ok "GPU monitor started (PID: $GPU_MONITOR_PID)"
sleep 1
echo ""

# =========================
# Step 2: Preprocess
# =========================

log "Step 2/4: Running preprocess..."
echo "  QAP Library: $QAP_LIBRARY"
echo "  Synth Output: $SYNTH_OUTPUTS"
echo "  Setup Output: $SETUP_OUTPUT"
echo "  Preprocess Output: $PREPROCESS_OUTPUT"
echo ""

PREPROCESS_START=$(date +%s)

if "$BACKEND_BIN/preprocess" \
    "$QAP_LIBRARY" \
    "$SYNTH_OUTPUTS" \
    "$SETUP_OUTPUT" \
    "$PREPROCESS_OUTPUT" 2>&1 | tee -a "$PROVE_LOG"; then

    PREPROCESS_TIME=$(($(date +%s) - PREPROCESS_START))
    ok "Preprocess completed in ${PREPROCESS_TIME}s"
else
    err "Preprocess failed"
    exit 1
fi
echo ""

# =========================
# Step 3: Prove
# =========================

log "Step 3/4: Running prove..."
echo "  QAP Library: $QAP_LIBRARY"
echo "  Synth Output: $SYNTH_OUTPUTS"
echo "  Setup Output: $SETUP_OUTPUT"
echo "  Prove Output: $PROVE_OUTPUT"
echo ""

PROVE_START=$(date +%s)

if "$BACKEND_BIN/prove" \
    "$QAP_LIBRARY" \
    "$SYNTH_OUTPUTS" \
    "$SETUP_OUTPUT" \
    "$PROVE_OUTPUT" 2>&1 | tee -a "$PROVE_LOG"; then

    PROVE_TIME=$(($(date +%s) - PROVE_START))
    ok "Prove completed in ${PROVE_TIME}s"
else
    err "Prove failed"
    exit 1
fi
echo ""

# =========================
# Step 4: Verify
# =========================

log "Step 4/4: Running verify..."
echo "  QAP Library: $QAP_LIBRARY"
echo "  Synth Output: $SYNTH_OUTPUTS"
echo "  Setup Output: $SETUP_OUTPUT"
echo "  Preprocess Output: $PREPROCESS_OUTPUT"
echo "  Prove Output: $PROVE_OUTPUT"
echo ""

VERIFY_START=$(date +%s)

if VERIFY_RESULT=$("$BACKEND_BIN/verify" \
    "$QAP_LIBRARY" \
    "$SYNTH_OUTPUTS" \
    "$SETUP_OUTPUT" \
    "$PREPROCESS_OUTPUT" \
    "$PROVE_OUTPUT" 2>&1 | tee -a "$PROVE_LOG" | tail -n1); then

    VERIFY_TIME=$(($(date +%s) - VERIFY_START))

    if [[ "$VERIFY_RESULT" == "true" || "$VERIFY_RESULT" == "true"$'\r' ]]; then
        ok "Verify completed in ${VERIFY_TIME}s - Result: PASS ✓"
    else
        err "Verify completed but proof validation failed - Result: $VERIFY_RESULT"
        exit 1
    fi
else
    err "Verify failed"
    exit 1
fi
echo ""

# =========================
# Summary
# =========================

TOTAL_TIME=$((PREPROCESS_TIME + PROVE_TIME + VERIFY_TIME))

log "========================================="
log "Proving Complete!"
log "========================================="
echo "Transaction: $TX_HASH"
echo "Output Directory: $OUTPUT_DIR"
echo ""
echo "Output Files:"
echo "  - Proof: $PROVE_OUTPUT"
echo "  - Preprocess: $PREPROCESS_OUTPUT"
echo "  - GPU Usage: $GPU_LOG"
echo "  - Prove Log: $PROVE_LOG"
echo ""
echo "Timings:"
echo "  Preprocess: ${PREPROCESS_TIME}s"
echo "  Prove: ${PROVE_TIME}s"
echo "  Verify: ${VERIFY_TIME}s"
echo "  Total: ${TOTAL_TIME}s"
echo ""

ok "Success! Results saved to: $OUTPUT_DIR"
echo ""
log "To visualize GPU usage:"
echo "  cd $SCRIPT_DIR"
echo "  source ../venv/bin/activate"
echo "  python3 plot_gpu_usage.py $GPU_LOG"
echo "  python3 plot_gpu_usage.py $GPU_LOG ${OUTPUT_DIR}/gpu_usage_plot_${TIMESTAMP}.png"
echo ""
