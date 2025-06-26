#!/bin/bash

# NOTE: We are not using "set -e" because we want to handle errors manually
# and continue to the next transaction.

# Get the directory where the script is located, and define paths based on it
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
ROOT_DIR=$(dirname "$SCRIPT_DIR") # This should resolve to /app

# Define paths
FRONTEND_DIR="$ROOT_DIR/frontend"
SYNTHESIZER_DIR="$FRONTEND_DIR/synthesizer"
BACKEND_DIR="$ROOT_DIR/backend"
TEST_SCRIPT_DIR="$SCRIPT_DIR"
TX_LIST_FILE="$TEST_SCRIPT_DIR/test_transactions.txt"
RESULTS_FILE="$TEST_SCRIPT_DIR/test_results.json"

# Initialize results json file
echo "[]" > "$RESULTS_FILE"

# Read transactions from file
while IFS= read -r tx_hash || [[ -n "$tx_hash" ]]; do
    # Remove carriage return if it exists (for files created on Windows)
    tx_hash=$(echo "$tx_hash" | tr -d '\r')

    if [ -z "$tx_hash" ]; then
        continue
    fi

    echo "=================================================="
    echo "Processing transaction: $tx_hash"
    echo "=================================================="

    synthesizer_status="not_run"
    preprocess_status="not_run"
    prove_status="not_run"
    verify_status="not_run"
    error_message=""

    # Step 1: Run Synthesizer
    echo "Running synthesizer..."
    # Capture both stdout and stderr to check for errors, as the script might exit with 0 even on failure.
    synth_output=$( (cd "$SYNTHESIZER_DIR" && npx tsx ./examples/fullnode/index.ts "$tx_hash") 2>&1 )
    
    if [[ "$synth_output" == *"Error:"* ]]; then
        synthesizer_status="failure"
        error_message=$(echo "$synth_output" | grep -m 1 "Error:")
        echo "Synthesizer failed."
    else
        synthesizer_status="success"
        echo "Synthesizer completed successfully."
    fi

    # Step 2: Run Preprocess (only if synthesizer succeeded)
    if [ "$synthesizer_status" == "success" ]; then
        echo "Running preprocess..."
        preprocess_output=$( (cd "$BACKEND_DIR" && cargo run -p preprocess) 2>&1 )
        exit_code=$?
        if [ $exit_code -eq 0 ]; then
            preprocess_status="success"
            echo "Preprocess completed successfully."
        else
            preprocess_status="failure"
            error_message=$(echo "$preprocess_output" | grep -m 1 -i -E 'error:|error|failed')
            echo "Preprocess failed."
        fi
    fi

    # Step 3: Run Prove (only if preprocess succeeded)
    if [ "$preprocess_status" == "success" ]; then
        echo "Running prove..."
        prove_output=$( (cd "$BACKEND_DIR" && cargo run -p prove) 2>&1 )
        exit_code=$?
        if [ $exit_code -eq 0 ]; then
            prove_status="success"
            echo "Prove completed successfully."
        else
            prove_status="failure"
            error_message=$(echo "$prove_output" | grep -m 1 -i -E 'error:|error|failed')
            echo "Prove failed."
        fi
    fi

    # Step 4: Run Verify (only if prove succeeded)
    if [ "$prove_status" == "success" ]; then
        echo "Running verify..."
        verify_output=$( (cd "$BACKEND_DIR" && cargo run -p verify) 2>&1 )
        exit_code=$?
        if [ $exit_code -eq 0 ]; then
            verify_status="success"
            echo "Verify completed successfully."
        else
            verify_status="failure"
            error_message=$(echo "$verify_output" | grep -m 1 -i -E 'error:|error|failed')
            echo "Verify failed."
        fi
    fi

    # Append result to JSON file
    jq \
      --arg tx_hash "$tx_hash" \
      --arg synthesizer_status "$synthesizer_status" \
      --arg preprocess_status "$preprocess_status" \
      --arg prove_status "$prove_status" \
      --arg verify_status "$verify_status" \
      --arg error_message "$error_message" \
      '. += [{
          "tx_hash": $tx_hash,
          "synthesizer": $synthesizer_status,
          "preprocess": $preprocess_status,
          "prove": $prove_status,
          "verify": $verify_status,
          "error": $error_message
      }]' "$RESULTS_FILE" > tmp.$$.json && mv tmp.$$.json "$RESULTS_FILE"

done < "$TX_LIST_FILE"

echo "=================================================="
echo "All transactions processed. Results are in $RESULTS_FILE"
echo "=================================================="
cat "$RESULTS_FILE" | jq . 