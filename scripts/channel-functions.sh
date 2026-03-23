# TokamakL2JS Channel transaction (via synthesizer binary)
normalize_tokamak_ch_tx_args() {
  TOKAMAK_CH_TX_ARGS=()

  if (( $# == 1 )) && [[ "$1" != -* ]]; then
    local input_dir previous_state_path transaction_path block_info_path contract_code_path
    input_dir="$(abs_path_from_root "$1")"
    [[ -d "$input_dir" ]] || { err "TokamakL2JS Tx input directory not found: $1"; exit 1; }

    previous_state_path="$input_dir/previous_state_snapshot.json"
    transaction_path="$input_dir/transaction.json"
    block_info_path="$input_dir/block_info.json"
    contract_code_path="$input_dir/contract_codes.json"

    ensure_file "$previous_state_path" || exit 1
    ensure_file "$transaction_path" || exit 1
    ensure_file "$block_info_path" || exit 1
    ensure_file "$contract_code_path" || exit 1

    TOKAMAK_CH_TX_ARGS=(
      --previous-state "$previous_state_path"
      --transaction "$transaction_path"
      --block-info "$block_info_path"
      --contract-code "$contract_code_path"
    )
    return
  fi

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --previous-state|--transaction|--block-info|--contract-code)
        local option_name option_value
        option_name="$1"
        option_value="${2:-}"
        [[ -n "$option_value" ]] || { err "$option_name requires a path"; exit 1; }
        option_value="$(abs_path_from_root "$option_value")"
        ensure_file "$option_value" || exit 1
        TOKAMAK_CH_TX_ARGS+=("$option_name" "$option_value")
        shift 2
        ;;
      *)
        TOKAMAK_CH_TX_ARGS+=("$1")
        shift
        ;;
    esac
  done
}

step_tokamak_ch_tx() {
  local dist_dir synthesizer_binary
  normalize_tokamak_ch_tx_args "$@"
  dist_dir="$(dist_dir_for_target "$(detect_target)")"

  # Try dist/bin/synthesizer first, then FE_SYN/bin/synthesizer
  synthesizer_binary="$dist_dir/bin/synthesizer"
  if [[ ! -f "$synthesizer_binary" ]]; then
    synthesizer_binary="$FE_SYN/bin/synthesizer"
  fi
  [[ -f "$synthesizer_binary" ]] || { err "Synthesizer binary not found. Tried: $dist_dir/bin/synthesizer and $FE_SYN/bin/synthesizer"; echo "💡 Build the binary first: cd packages/frontend/synthesizer && ./build-binary.sh" >&2; exit 1; }

  log "TokamakL2JS Tx: executing synthesizer binary..."
  verbose "Command: $synthesizer_binary tokamak-ch-tx ${TOKAMAK_CH_TX_ARGS[*]}"

  local binary_dir
  binary_dir="$(dirname "$synthesizer_binary")"
  if (cd "$binary_dir" && "$synthesizer_binary" tokamak-ch-tx "${TOKAMAK_CH_TX_ARGS[@]}"); then
    ok "TokamakL2JS Tx completed successfully"
  else
    err "TokamakL2JS Tx failed"
    exit 1
  fi

  local synth_src synth_dest synth_items
  synth_src="$FE_SYN/outputs"
  synth_dest="$dist_dir/resource/synthesizer/output"
  [[ -d "$synth_src" ]] || { err "Synth outputs not found: $synth_src"; exit 1; }
  mkdir -p "$synth_dest"
  shopt -s dotglob nullglob
  synth_items=("$synth_src"/*)
  shopt -u dotglob nullglob
  (( ${#synth_items[@]} > 0 )) || { err "Synth outputs empty: $synth_src"; exit 1; }
  mv -f "${synth_items[@]}" "$synth_dest/"
  ok "Synth outputs moved -> $synth_dest"
}

# Get Participant Balances
