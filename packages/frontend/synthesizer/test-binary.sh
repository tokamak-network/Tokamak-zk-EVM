#!/bin/bash
# =============================================================================
# Tokamak Synthesizer Binary Test Script
# Tests the synthesizer binary with L2 State Channel commands
# =============================================================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BINARY="./bin/synthesizer"
OUTPUT_DIR="./test-outputs/binary-test"
CHANNEL_ID="${CHANNEL_ID:-3}"
INIT_TX_HASH="${INIT_TX_HASH:-0xcf31e988b30825eb4e8a5f3ceb0a2b5cd2462dc4881dc6e2f58cfdb184acaeea}"
BRIDGE_ADDRESS="${BRIDGE_ADDRESS:-0x68862886384846d53bbba89aa4f64f4789dda089}"
RPC_FLAG="--sepolia"

# Test participant keys (for testing only - replace with your own)
ALICE_L2_KEY="${ALICE_L2_KEY}"
BOB_L2_KEY="${BOB_L2_KEY}"
CHARLIE_L2_KEY="${CHARLIE_L2_KEY}"

# Test participant L2 addresses (derived from keys)
ALICE_L2_ADDR="${ALICE_L2_ADDR}"
BOB_L2_ADDR="${BOB_L2_ADDR}"
CHARLIE_L2_ADDR="${CHARLIE_L2_ADDR}"

# =============================================================================
# Helper Functions
# =============================================================================

print_header() {
    echo ""
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║${NC} $1"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

check_binary() {
    if [ ! -f "$BINARY" ]; then
        print_error "Binary not found at $BINARY"
        echo "Please build the binary first:"
        echo "  ./build-binary.sh"
        exit 1
    fi

    if [ ! -x "$BINARY" ]; then
        print_error "Binary is not executable"
        echo "Making binary executable..."
        chmod +x "$BINARY"
    fi
}

check_env_vars() {
    local missing=0

    if [ -z "$ALICE_L2_KEY" ]; then
        print_error "ALICE_L2_KEY not set"
        missing=1
    fi

    if [ -z "$BOB_L2_KEY" ]; then
        print_error "BOB_L2_KEY not set"
        missing=1
    fi

    if [ -z "$CHARLIE_L2_KEY" ]; then
        print_error "CHARLIE_L2_KEY not set"
        missing=1
    fi

    if [ -z "$ALICE_L2_ADDR" ]; then
        print_error "ALICE_L2_ADDR not set"
        missing=1
    fi

    if [ -z "$BOB_L2_ADDR" ]; then
        print_error "BOB_L2_ADDR not set"
        missing=1
    fi

    if [ -z "$CHARLIE_L2_ADDR" ]; then
        print_error "CHARLIE_L2_ADDR not set"
        missing=1
    fi

    if [ $missing -eq 1 ]; then
        echo ""
        print_info "Please set the following environment variables:"
        echo "  export ALICE_L2_KEY=0x..."
        echo "  export BOB_L2_KEY=0x..."
        echo "  export CHARLIE_L2_KEY=0x..."
        echo "  export ALICE_L2_ADDR=0x..."
        echo "  export BOB_L2_ADDR=0x..."
        echo "  export CHARLIE_L2_ADDR=0x..."
        exit 1
    fi
}

cleanup_output_dir() {
    if [ -d "$OUTPUT_DIR" ]; then
        print_info "Cleaning up previous test outputs..."
        rm -rf "$OUTPUT_DIR"
    fi
    mkdir -p "$OUTPUT_DIR"
}

# =============================================================================
# Test Functions
# =============================================================================

test_info_command() {
    print_header "Test 1: Info Command"

    if $BINARY info; then
        print_success "Info command successful"
        return 0
    else
        print_error "Info command failed"
        return 1
    fi
}

test_l2_transfer_1() {
    print_header "Test 2: L2 Transfer #1 (Alice → Bob, 1 TON)"

    local output_path="$OUTPUT_DIR/transfer-1"

    print_info "Executing transfer..."
    if $BINARY l2-transfer \
        --channel-id "$CHANNEL_ID" \
        --init-tx "$INIT_TX_HASH" \
        --sender-key "$ALICE_L2_KEY" \
        --recipient "$BOB_L2_ADDR" \
        --amount "1" \
        --output "$output_path" \
        --bridge "$BRIDGE_ADDRESS" \
        $RPC_FLAG; then

        print_success "Transfer #1 completed"

        # Check if state_snapshot.json was created
        if [ -f "$output_path/state_snapshot.json" ]; then
            print_success "state_snapshot.json created"
            return 0
        else
            print_error "state_snapshot.json not found"
            return 1
        fi
    else
        print_error "Transfer #1 failed"
        return 1
    fi
}

test_get_balances_1() {
    print_header "Test 3: Get Balances after Transfer #1"

    local snapshot_path="$OUTPUT_DIR/transfer-1/state_snapshot.json"

    if [ ! -f "$snapshot_path" ]; then
        print_error "State snapshot not found: $snapshot_path"
        return 1
    fi

    print_info "Fetching balances..."
    if $BINARY get-balances \
        --snapshot "$snapshot_path" \
        --channel-id "$CHANNEL_ID" \
        --bridge "$BRIDGE_ADDRESS" \
        $RPC_FLAG; then

        print_success "Balances retrieved successfully"
        return 0
    else
        print_error "Failed to get balances"
        return 1
    fi
}

test_l2_transfer_2() {
    print_header "Test 4: L2 Transfer #2 (Bob → Charlie, 0.5 TON)"

    local previous_state="$OUTPUT_DIR/transfer-1/state_snapshot.json"
    local output_path="$OUTPUT_DIR/transfer-2"

    if [ ! -f "$previous_state" ]; then
        print_error "Previous state not found: $previous_state"
        return 1
    fi

    print_info "Executing transfer with previous state..."
    if $BINARY l2-transfer \
        --channel-id "$CHANNEL_ID" \
        --init-tx "$INIT_TX_HASH" \
        --sender-key "$BOB_L2_KEY" \
        --recipient "$CHARLIE_L2_ADDR" \
        --amount "0.5" \
        --previous-state "$previous_state" \
        --output "$output_path" \
        --bridge "$BRIDGE_ADDRESS" \
        $RPC_FLAG; then

        print_success "Transfer #2 completed"

        # Check if state_snapshot.json was created
        if [ -f "$output_path/state_snapshot.json" ]; then
            print_success "state_snapshot.json created"
            return 0
        else
            print_error "state_snapshot.json not found"
            return 1
        fi
    else
        print_error "Transfer #2 failed"
        return 1
    fi
}

test_get_balances_2() {
    print_header "Test 5: Get Balances after Transfer #2"

    local snapshot_path="$OUTPUT_DIR/transfer-2/state_snapshot.json"

    if [ ! -f "$snapshot_path" ]; then
        print_error "State snapshot not found: $snapshot_path"
        return 1
    fi

    print_info "Fetching balances..."
    if $BINARY get-balances \
        --snapshot "$snapshot_path" \
        --channel-id "$CHANNEL_ID" \
        --bridge "$BRIDGE_ADDRESS" \
        $RPC_FLAG; then

        print_success "Balances retrieved successfully"
        return 0
    else
        print_error "Failed to get balances"
        return 1
    fi
}

test_l2_transfer_3() {
    print_header "Test 6: L2 Transfer #3 (Charlie → Alice, 1 TON)"

    local previous_state="$OUTPUT_DIR/transfer-2/state_snapshot.json"
    local output_path="$OUTPUT_DIR/transfer-3"

    if [ ! -f "$previous_state" ]; then
        print_error "Previous state not found: $previous_state"
        return 1
    fi

    print_info "Executing transfer with previous state..."
    if $BINARY l2-transfer \
        --channel-id "$CHANNEL_ID" \
        --init-tx "$INIT_TX_HASH" \
        --sender-key "$CHARLIE_L2_KEY" \
        --recipient "$ALICE_L2_ADDR" \
        --amount "1" \
        --previous-state "$previous_state" \
        --output "$output_path" \
        --bridge "$BRIDGE_ADDRESS" \
        $RPC_FLAG; then

        print_success "Transfer #3 completed"

        # Check if state_snapshot.json was created
        if [ -f "$output_path/state_snapshot.json" ]; then
            print_success "state_snapshot.json created"
            return 0
        else
            print_error "state_snapshot.json not found"
            return 1
        fi
    else
        print_error "Transfer #3 failed"
        return 1
    fi
}

test_get_balances_3() {
    print_header "Test 7: Get Balances after Transfer #3"

    local snapshot_path="$OUTPUT_DIR/transfer-3/state_snapshot.json"

    if [ ! -f "$snapshot_path" ]; then
        print_error "State snapshot not found: $snapshot_path"
        return 1
    fi

    print_info "Fetching final balances..."
    if $BINARY get-balances \
        --snapshot "$snapshot_path" \
        --channel-id "$CHANNEL_ID" \
        --bridge "$BRIDGE_ADDRESS" \
        $RPC_FLAG; then

        print_success "Final balances retrieved successfully"
        return 0
    else
        print_error "Failed to get final balances"
        return 1
    fi
}

# =============================================================================
# Main Test Runner
# =============================================================================

main() {
    print_header "Tokamak Synthesizer Binary Test Suite"

    # Pre-flight checks
    check_binary
    check_env_vars
    cleanup_output_dir

    # Run tests
    local passed=0
    local failed=0

    test_info_command && ((passed++)) || ((failed++))
    test_l2_transfer_1 && ((passed++)) || ((failed++))
    test_get_balances_1 && ((passed++)) || ((failed++))
    test_l2_transfer_2 && ((passed++)) || ((failed++))
    test_get_balances_2 && ((passed++)) || ((failed++))
    test_l2_transfer_3 && ((passed++)) || ((failed++))
    test_get_balances_3 && ((passed++)) || ((failed++))

    # Summary
    print_header "Test Summary"
    echo "Total tests: $((passed + failed))"
    echo -e "${GREEN}Passed: $passed${NC}"
    echo -e "${RED}Failed: $failed${NC}"
    echo ""

    if [ $failed -eq 0 ]; then
        print_success "All tests passed! 🎉"
        echo ""
        echo "Output files are located in: $OUTPUT_DIR"
        exit 0
    else
        print_error "Some tests failed"
        exit 1
    fi
}

# Run main function
main
