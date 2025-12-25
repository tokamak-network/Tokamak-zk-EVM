# L2 State Channel Transfer
step_l2_transfer() {
  local target dist_dir output_dir synthesizer_binary
  target="$(detect_target)"
  dist_dir="$(dist_dir_for_target "$target")"
  output_dir="$dist_dir/resource/synthesizer/output"

  # Try dist/bin/synthesizer first, then packages/bin/synthesizer, then FE_SYN/bin/synthesizer
  synthesizer_binary="$dist_dir/bin/synthesizer"
  if [[ ! -f "$synthesizer_binary" ]]; then
    synthesizer_binary="$ROOT/packages/bin/synthesizer"
  fi
  if [[ ! -f "$synthesizer_binary" ]]; then
    synthesizer_binary="$FE_SYN/bin/synthesizer"
  fi
  [[ -f "$synthesizer_binary" ]] || { err "Synthesizer binary not found. Tried: $dist_dir/bin/synthesizer, $ROOT/packages/bin/synthesizer, and $FE_SYN/bin/synthesizer"; echo "💡 Build the binary first: cd packages/frontend/synthesizer && ./build-binary.sh" >&2; exit 1; }

  # Check if --output is already specified in arguments
  local has_output=false
  local args=("$@")
  local i=0
  while [[ $i -lt ${#args[@]} ]]; do
    if [[ "${args[$i]}" == "--output" ]]; then
      has_output=true
      break
    fi
    ((i++))
  done

  # If --output not specified, use dist directory
  if [[ "$has_output" == false ]]; then
    mkdir -p "$output_dir"
    args+=("--output" "$output_dir")
    log "L2 Transfer: using default output directory → $output_dir"
  else
    verbose "L2 Transfer: using custom output directory from --output option"
  fi

  log "L2 Transfer: executing synthesizer binary..."
  verbose "Command: $synthesizer_binary l2-transfer ${args[*]}"

  # Use binary's directory as cwd (for resource files)
  local binary_dir="$(dirname "$synthesizer_binary")"
  pushd "$binary_dir" >/dev/null
  if "$synthesizer_binary" l2-transfer "${args[@]}"; then
    # If custom output was used, sync to dist directory
    if [[ "$has_output" == true ]]; then
      local custom_output=""
      i=0
      while [[ $i -lt ${#args[@]} ]]; do
        if [[ "${args[$i]}" == "--output" && $((i+1)) -lt ${#args[@]} ]]; then
          custom_output="${args[$((i+1))]}"
          break
        fi
        ((i++))
      done
      if [[ -n "$custom_output" && -d "$custom_output" ]]; then
        log "L2 Transfer: syncing outputs from $custom_output → $output_dir"
        mkdir -p "$output_dir"
        cp -af "$custom_output/." "$output_dir/"
        ok "L2 Transfer: outputs synced to $output_dir"
      fi
    fi
    ok "L2 transfer completed successfully"
    ok "Outputs available in $output_dir"
  else
    err "L2 transfer failed"
    popd >/dev/null
    exit 1
  fi
  popd >/dev/null
}

# Get Participant Balances
step_get_balances() {
  local target dist_dir default_snapshot synthesizer_binary
  target="$(detect_target)"
  dist_dir="$(dist_dir_for_target "$target")"
  default_snapshot="$dist_dir/resource/synthesizer/output/state_snapshot.json"

  # Try dist/bin/synthesizer first, then packages/bin/synthesizer, then FE_SYN/bin/synthesizer
  synthesizer_binary="$dist_dir/bin/synthesizer"
  if [[ ! -f "$synthesizer_binary" ]]; then
    synthesizer_binary="$ROOT/packages/bin/synthesizer"
  fi
  if [[ ! -f "$synthesizer_binary" ]]; then
    synthesizer_binary="$FE_SYN/bin/synthesizer"
  fi
  [[ -f "$synthesizer_binary" ]] || { err "Synthesizer binary not found. Tried: $dist_dir/bin/synthesizer, $ROOT/packages/bin/synthesizer, and $FE_SYN/bin/synthesizer"; echo "💡 Build the binary first: cd packages/frontend/synthesizer && ./build-binary.sh" >&2; exit 1; }

  # Check if --snapshot is already specified in arguments
  local has_snapshot=false
  local args=("$@")
  local i=0
  while [[ $i -lt ${#args[@]} ]]; do
    if [[ "${args[$i]}" == "--snapshot" ]]; then
      has_snapshot=true
      break
    fi
    ((i++))
  done

  # If --snapshot not specified and default exists, use it
  if [[ "$has_snapshot" == false && -f "$default_snapshot" ]]; then
    args+=("--snapshot" "$default_snapshot")
    log "Get Balances: using default snapshot → $default_snapshot"
  elif [[ "$has_snapshot" == false ]]; then
    verbose "Get Balances: no snapshot specified, will fetch from on-chain"
  else
    verbose "Get Balances: using custom snapshot from --snapshot option"
  fi

  log "Get Balances: executing synthesizer binary..."
  verbose "Command: $synthesizer_binary get-balances ${args[*]}"

  # Use binary's directory as cwd (for resource files)
  local binary_dir="$(dirname "$synthesizer_binary")"
  pushd "$binary_dir" >/dev/null
  if "$synthesizer_binary" get-balances "${args[@]}"; then
    ok "Balances retrieved successfully"
  else
    err "Failed to get balances"
    popd >/dev/null
    exit 1
  fi
  popd >/dev/null
}