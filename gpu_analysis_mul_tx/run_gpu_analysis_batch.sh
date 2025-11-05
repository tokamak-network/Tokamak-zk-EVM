#!/bin/bash
# Run GPU analysis on multiple transactions
# Usage: ./run_gpu_analysis_batch.sh <transactions.json> [OUTPUT_DIR]

set -e

# =========================
# Configuration
# =========================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TX_FILE="${1:-}"
OUTPUT_DIR="${2:-$SCRIPT_DIR/batch_results}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BATCH_LOG="$OUTPUT_DIR/batch_run_${TIMESTAMP}.log"
SUMMARY_FILE="$OUTPUT_DIR/summary_${TIMESTAMP}.csv"
CONSOLIDATED_GPU_LOG="$OUTPUT_DIR/consolidated_gpu_data_${TIMESTAMP}.csv"

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

log() { echo -e "\033[1;34m[batch-gpu]\033[0m $*" | tee -a "$BATCH_LOG"; }
ok()  { echo -e "\033[1;32m[ ok ]\033[0m $*" | tee -a "$BATCH_LOG"; }
err() { echo -e "\033[1;31m[error]\033[0m $*" | tee -a "$BATCH_LOG" >&2; }
warn() { echo -e "\033[1;33m[warn]\033[0m $*" | tee -a "$BATCH_LOG"; }

print_usage() {
    cat <<'USAGE'
Run GPU Analysis on Multiple Transactions

Usage:
  ./run_gpu_analysis_batch.sh <transactions.json> [OUTPUT_DIR]

Arguments:
  transactions.json  JSON file containing transaction hashes
  OUTPUT_DIR        Directory to save outputs (default: ./batch_results)

Input JSON format:
  {
    "transactions": ["0xhash1", "0xhash2", ...]
  }

Or plain text file (one transaction per line):
  0xhash1
  0xhash2
  ...

Example:
  ./run_gpu_analysis_batch.sh transactions.json
  ./run_gpu_analysis_batch.sh transactions.txt ./my_results

USAGE
}

cleanup() {
    if [ ! -z "$GPU_MONITOR_PID" ]; then
        kill $GPU_MONITOR_PID 2>/dev/null || true
        wait $GPU_MONITOR_PID 2>/dev/null || true
    fi
}

trap cleanup EXIT INT TERM

# =========================
# Validation
# =========================

if [[ -z "$TX_FILE" || "$TX_FILE" == "--help" || "$TX_FILE" == "-h" ]]; then
    print_usage
    exit 0
fi

if [[ ! -f "$TX_FILE" ]]; then
    err "Transaction file not found: $TX_FILE"
    exit 1
fi

# Check nvidia-smi
if ! command -v nvidia-smi &> /dev/null; then
    err "nvidia-smi not found. GPU monitoring not available."
    exit 1
fi

# Check jq for JSON parsing
if ! command -v jq &> /dev/null; then
    warn "jq not found. Will attempt to parse JSON manually."
    HAS_JQ=false
else
    HAS_JQ=true
fi

# =========================
# Load Transactions
# =========================

log "========================================="
log "GPU Analysis Batch Runner"
log "========================================="
log "Input file: $TX_FILE"
log "Output directory: $OUTPUT_DIR"
log "Platform: $PLATFORM"
echo "" | tee -a "$BATCH_LOG"

# Parse transaction file
TRANSACTIONS=()

if [[ "$TX_FILE" == *.json ]]; then
    log "Parsing JSON transaction file..."

    if $HAS_JQ; then
        # Use jq for robust JSON parsing
        mapfile -t TRANSACTIONS < <(jq -r '.transactions[]' "$TX_FILE")
    else
        # Fallback: basic grep parsing
        mapfile -t TRANSACTIONS < <(grep -oE '0x[0-9a-fA-F]{64}' "$TX_FILE")
    fi
else
    # Plain text file (one transaction per line)
    log "Parsing text transaction file..."
    mapfile -t TRANSACTIONS < <(grep -oE '0x[0-9a-fA-F]{64}' "$TX_FILE")
fi

TOTAL_TXS=${#TRANSACTIONS[@]}

if [[ $TOTAL_TXS -eq 0 ]]; then
    err "No valid transactions found in $TX_FILE"
    exit 1
fi

log "Loaded $TOTAL_TXS transactions"
echo "" | tee -a "$BATCH_LOG"

# =========================
# Setup
# =========================

mkdir -p "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR/individual_results"

# Create summary CSV header
echo "tx_number,tx_hash,status,synth_time_s,preprocess_time_s,prove_time_s,verify_time_s,total_time_s,avg_gpu_util_%,max_gpu_util_%,avg_mem_util_%,max_mem_util_%,error_message" > "$SUMMARY_FILE"

# Create consolidated GPU data header
echo "tx_number,tx_hash,timestamp,gpu_util_%,memory_util_%,memory_used_MiB,memory_total_MiB,temperature_C,power_W,sm_clock_MHz,mem_clock_MHz" > "$CONSOLIDATED_GPU_LOG"

# =========================
# Process Transactions
# =========================

SUCCESS_COUNT=0
FAILED_COUNT=0
SKIPPED_COUNT=0

START_TIME=$(date +%s)

for i in "${!TRANSACTIONS[@]}"; do
    TX_NUM=$((i + 1))
    TX_HASH="${TRANSACTIONS[$i]}"

    log "========================================="
    log "Processing transaction $TX_NUM/$TOTAL_TXS"
    log "TX Hash: $TX_HASH"
    log "========================================="

    TX_OUTPUT_DIR="$OUTPUT_DIR/individual_results/tx_${TX_NUM}"
    TX_GPU_LOG="$TX_OUTPUT_DIR/gpu_usage.csv"
    TX_LOG="$TX_OUTPUT_DIR/prove.log"

    mkdir -p "$TX_OUTPUT_DIR"
    mkdir -p "$TX_OUTPUT_DIR/preprocess"
    mkdir -p "$TX_OUTPUT_DIR/prove"

    # Save transaction hash
    echo "$TX_HASH" > "$TX_OUTPUT_DIR/transaction_hash.txt"

    # Create GPU log header
    echo "timestamp,gpu_util_%,memory_util_%,memory_used_MiB,memory_total_MiB,temperature_C,power_W,sm_clock_MHz,mem_clock_MHz" > "$TX_GPU_LOG"

    # Initialize timing variables
    SYNTH_TIME=0
    PREPROCESS_TIME=0
    PROVE_TIME=0
    VERIFY_TIME=0
    STATUS="failed"
    ERROR_MSG=""

    # Start GPU monitoring
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

                echo "$timestamp,$gpu_util,$mem_util,$mem_used,$mem_total,$temp,$power,$sm_clock,$mem_clock" >> "$TX_GPU_LOG"
            done
            sleep 0.1
        done
    ) &
    GPU_MONITOR_PID=$!

    sleep 0.5

    # Step 1: Synthesizer
    log "Step 1/4: Running synthesizer..."
    SYNTH_START=$(date +%s)

    cd "$FE_SYN"
    if npm run synthesizer "$TX_HASH" >> "$TX_LOG" 2>&1; then
        SYNTH_TIME=$(($(date +%s) - SYNTH_START))
        ok "Synthesizer completed in ${SYNTH_TIME}s"
    else
        SYNTH_TIME=$(($(date +%s) - SYNTH_START))
        ERROR_MSG="Synthesizer failed"
        err "$ERROR_MSG"
        kill $GPU_MONITOR_PID 2>/dev/null || true
        wait $GPU_MONITOR_PID 2>/dev/null || true
        GPU_MONITOR_PID=""
        FAILED_COUNT=$((FAILED_COUNT + 1))
        echo "$TX_NUM,$TX_HASH,failed,$SYNTH_TIME,0,0,0,$SYNTH_TIME,0,0,0,0,\"$ERROR_MSG\"" >> "$SUMMARY_FILE"
        cd "$REPO_ROOT"
        continue
    fi
    cd "$REPO_ROOT"

    # Step 2: Preprocess
    log "Step 2/4: Running preprocess..."
    PREPROCESS_START=$(date +%s)

    if "$BACKEND_BIN/preprocess" \
        "$QAP_LIBRARY" \
        "$SYNTH_OUTPUTS" \
        "$SETUP_OUTPUT" \
        "$TX_OUTPUT_DIR/preprocess" >> "$TX_LOG" 2>&1; then

        PREPROCESS_TIME=$(($(date +%s) - PREPROCESS_START))
        ok "Preprocess completed in ${PREPROCESS_TIME}s"
    else
        PREPROCESS_TIME=$(($(date +%s) - PREPROCESS_START))
        ERROR_MSG="Preprocess failed"
        err "$ERROR_MSG"
        kill $GPU_MONITOR_PID 2>/dev/null || true
        wait $GPU_MONITOR_PID 2>/dev/null || true
        GPU_MONITOR_PID=""
        FAILED_COUNT=$((FAILED_COUNT + 1))
        TOTAL_TIME=$((SYNTH_TIME + PREPROCESS_TIME))
        echo "$TX_NUM,$TX_HASH,failed,$SYNTH_TIME,$PREPROCESS_TIME,0,0,$TOTAL_TIME,0,0,0,0,\"$ERROR_MSG\"" >> "$SUMMARY_FILE"
        continue
    fi

    # Step 3: Prove
    log "Step 3/4: Running prove..."
    PROVE_START=$(date +%s)

    if "$BACKEND_BIN/prove" \
        "$QAP_LIBRARY" \
        "$SYNTH_OUTPUTS" \
        "$SETUP_OUTPUT" \
        "$TX_OUTPUT_DIR/prove" >> "$TX_LOG" 2>&1; then

        PROVE_TIME=$(($(date +%s) - PROVE_START))
        ok "Prove completed in ${PROVE_TIME}s"
    else
        PROVE_TIME=$(($(date +%s) - PROVE_START))
        ERROR_MSG="Prove failed"
        err "$ERROR_MSG"
        kill $GPU_MONITOR_PID 2>/dev/null || true
        wait $GPU_MONITOR_PID 2>/dev/null || true
        GPU_MONITOR_PID=""
        FAILED_COUNT=$((FAILED_COUNT + 1))
        TOTAL_TIME=$((SYNTH_TIME + PREPROCESS_TIME + PROVE_TIME))
        echo "$TX_NUM,$TX_HASH,failed,$SYNTH_TIME,$PREPROCESS_TIME,$PROVE_TIME,0,$TOTAL_TIME,0,0,0,0,\"$ERROR_MSG\"" >> "$SUMMARY_FILE"
        continue
    fi

    # Step 4: Verify
    log "Step 4/4: Running verify..."
    VERIFY_START=$(date +%s)

    if VERIFY_RESULT=$("$BACKEND_BIN/verify" \
        "$QAP_LIBRARY" \
        "$SYNTH_OUTPUTS" \
        "$SETUP_OUTPUT" \
        "$TX_OUTPUT_DIR/preprocess" \
        "$TX_OUTPUT_DIR/prove" 2>&1 | tee -a "$TX_LOG" | tail -n1); then

        VERIFY_TIME=$(($(date +%s) - VERIFY_START))

        if [[ "$VERIFY_RESULT" == "true" || "$VERIFY_RESULT" == "true"$'\r' ]]; then
            ok "Verify completed in ${VERIFY_TIME}s - PASS ✓"
            STATUS="success"
            SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
        else
            ERROR_MSG="Verification failed"
            warn "$ERROR_MSG"
            FAILED_COUNT=$((FAILED_COUNT + 1))
        fi
    else
        VERIFY_TIME=$(($(date +%s) - VERIFY_START))
        ERROR_MSG="Verify command failed"
        err "$ERROR_MSG"
        FAILED_COUNT=$((FAILED_COUNT + 1))
    fi

    # Stop GPU monitoring
    kill $GPU_MONITOR_PID 2>/dev/null || true
    wait $GPU_MONITOR_PID 2>/dev/null || true
    GPU_MONITOR_PID=""

    # Calculate GPU statistics
    if [[ -f "$TX_GPU_LOG" ]] && [[ $(wc -l < "$TX_GPU_LOG") -gt 1 ]]; then
        GPU_STATS=$(awk -F',' 'NR>1 {
            sum_gpu+=$2; count_gpu++;
            sum_mem+=$3; count_mem++;
            if($2>max_gpu) max_gpu=$2;
            if($3>max_mem) max_mem=$3;
        }
        END {
            printf "%.1f,%.1f,%.1f,%.1f",
                sum_gpu/count_gpu, max_gpu,
                sum_mem/count_mem, max_mem;
        }' "$TX_GPU_LOG")

        # Append GPU data to consolidated log
        awk -F',' -v tx_num="$TX_NUM" -v tx_hash="$TX_HASH" 'NR>1 {
            print tx_num","tx_hash","$0
        }' "$TX_GPU_LOG" >> "$CONSOLIDATED_GPU_LOG"
    else
        GPU_STATS="0,0,0,0"
    fi

    # Calculate total time
    TOTAL_TIME=$((SYNTH_TIME + PREPROCESS_TIME + PROVE_TIME + VERIFY_TIME))

    # Write summary
    echo "$TX_NUM,$TX_HASH,$STATUS,$SYNTH_TIME,$PREPROCESS_TIME,$PROVE_TIME,$VERIFY_TIME,$TOTAL_TIME,$GPU_STATS,\"$ERROR_MSG\"" >> "$SUMMARY_FILE"

    log "Transaction $TX_NUM completed: $STATUS (${TOTAL_TIME}s)"
    echo "" | tee -a "$BATCH_LOG"
done

END_TIME=$(date +%s)
ELAPSED_TIME=$((END_TIME - START_TIME))

# =========================
# Final Summary
# =========================

log "========================================="
log "Batch Analysis Complete!"
log "========================================="
echo "" | tee -a "$BATCH_LOG"
echo "Results Summary:" | tee -a "$BATCH_LOG"
echo "  Total Transactions: $TOTAL_TXS" | tee -a "$BATCH_LOG"
echo "  Successful: $SUCCESS_COUNT" | tee -a "$BATCH_LOG"
echo "  Failed: $FAILED_COUNT" | tee -a "$BATCH_LOG"
echo "  Success Rate: $(awk "BEGIN {printf \"%.1f%%\", ($SUCCESS_COUNT/$TOTAL_TXS)*100}")" | tee -a "$BATCH_LOG"
echo "" | tee -a "$BATCH_LOG"
echo "Total Time: ${ELAPSED_TIME}s ($(awk "BEGIN {printf \"%.1f\", $ELAPSED_TIME/60}") minutes)" | tee -a "$BATCH_LOG"
echo "Average Time per Transaction: $(awk "BEGIN {printf \"%.1f\", $ELAPSED_TIME/$TOTAL_TXS}")s" | tee -a "$BATCH_LOG"
echo "" | tee -a "$BATCH_LOG"
echo "Output Files:" | tee -a "$BATCH_LOG"
echo "  Summary: $SUMMARY_FILE" | tee -a "$BATCH_LOG"
echo "  Consolidated GPU Data: $CONSOLIDATED_GPU_LOG" | tee -a "$BATCH_LOG"
echo "  Batch Log: $BATCH_LOG" | tee -a "$BATCH_LOG"
echo "  Individual Results: $OUTPUT_DIR/individual_results/" | tee -a "$BATCH_LOG"
echo "" | tee -a "$BATCH_LOG"

ok "All done! Results saved to: $OUTPUT_DIR"
echo "" | tee -a "$BATCH_LOG"
log "To analyze results:"
echo "  cd $SCRIPT_DIR" | tee -a "$BATCH_LOG"
echo "  python3 analyze_batch_results.py $SUMMARY_FILE $CONSOLIDATED_GPU_LOG" | tee -a "$BATCH_LOG"
echo "" | tee -a "$BATCH_LOG"
