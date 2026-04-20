# Synthesize one Tokamak L2 transaction snapshot via synthesizer-node.
normalize_synthesize_args() {
  SYNTHESIZE_ARGS=()

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

    SYNTHESIZE_ARGS=(
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
        SYNTHESIZE_ARGS+=("$option_name" "$option_value")
        shift 2
        ;;
      *)
        SYNTHESIZE_ARGS+=("$1")
        shift
        ;;
    esac
  done
}

run_synthesizer_node() {
  local run_dir
  local -a synth_command
  normalize_synthesize_args "$@"
  dist_dir="$(dist_dir_for_target "$(detect_target)")"
  run_dir="$FE_SYN"
  synth_command=(npm run --workspace @tokamak-zk-evm/synthesizer-node cli -- tokamak-ch-tx)

  [[ -f "$FE_SYN/package.json" ]] || { err "Synthesizer workspace package.json not found: $FE_SYN/package.json"; exit 1; }
  [[ -f "$FE_SYN/node-cli/src/cli/index.ts" ]] || { err "Synthesizer CLI entrypoint not found: $FE_SYN/node-cli/src/cli/index.ts"; exit 1; }

  local synth_src
  synth_src="$FE_SYN/node-cli/outputs"
  rm -rf "$synth_src"

  log "Synthesize: executing synthesizer-node CLI..."
  verbose "Command: ${synth_command[*]} ${SYNTHESIZE_ARGS[*]}"

  if (cd "$run_dir" && "${synth_command[@]}" "${SYNTHESIZE_ARGS[@]}"); then
    ok "Synthesize completed successfully"
  else
    err "Synthesize failed"
    exit 1
  fi

  local synth_dest synth_items
  synth_dest="$dist_dir/resource/synthesizer/output"
  [[ -d "$synth_src" ]] || { err "Synth outputs not found: $synth_src"; exit 1; }
  rm -rf "$synth_dest"
  mkdir -p "$synth_dest"
  shopt -s dotglob nullglob
  synth_items=("$synth_src"/*)
  shopt -u dotglob nullglob
  (( ${#synth_items[@]} > 0 )) || { err "Synth outputs empty: $synth_src"; exit 1; }
  mv -f "${synth_items[@]}" "$synth_dest/"
  ok "Synth outputs moved -> $synth_dest"
}

# Get Participant Balances
