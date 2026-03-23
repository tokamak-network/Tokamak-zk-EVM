# TokamakL2JS Channel transaction (via dist binary or source CLI fallback)
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
  local dist_dir synthesizer_binary run_dir
  local -a synth_command
  normalize_tokamak_ch_tx_args "$@"
  dist_dir="$(dist_dir_for_target "$(detect_target)")"

  # Prefer dist/bin/synthesizer. If it is absent, fall back to the source CLI.
  synthesizer_binary="$dist_dir/bin/synthesizer"
  if [[ -f "$synthesizer_binary" ]]; then
    synth_command=("$synthesizer_binary" tokamak-ch-tx)
    run_dir="$(dirname "$synthesizer_binary")"
    log "TokamakL2JS Tx: executing dist synthesizer binary..."
  else
    [[ -f "$FE_SYN/tsconfig.dev.json" ]] || { err "Synthesizer tsconfig not found: $FE_SYN/tsconfig.dev.json"; exit 1; }
    [[ -f "$FE_SYN/src/interface/cli/index.ts" ]] || { err "Synthesizer CLI entrypoint not found: $FE_SYN/src/interface/cli/index.ts"; exit 1; }
    synth_command=(node --import tsx src/interface/cli/index.ts tokamak-ch-tx)
    run_dir="$FE_SYN"
    log "TokamakL2JS Tx: executing synthesizer source CLI..."
  fi
  verbose "Command: ${synth_command[*]} ${TOKAMAK_CH_TX_ARGS[*]}"

  if (cd "$run_dir" && "${synth_command[@]}" "${TOKAMAK_CH_TX_ARGS[@]}"); then
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
