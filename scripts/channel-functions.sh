# TokamakL2JS Channel transaction (via synthesizer binary)
step_tokamak_ch_tx() {
  local target dist_dir synthesizer_binary
  target="$(detect_target)"
  dist_dir="$(dist_dir_for_target "$target")"

  # Try dist/bin/synthesizer first, then packages/bin/synthesizer, then FE_SYN/bin/synthesizer
  synthesizer_binary="$dist_dir/bin/synthesizer"
  if [[ ! -f "$synthesizer_binary" ]]; then
    synthesizer_binary="$ROOT/packages/bin/synthesizer"
  fi
  if [[ ! -f "$synthesizer_binary" ]]; then
    synthesizer_binary="$FE_SYN/bin/synthesizer"
  fi
  [[ -f "$synthesizer_binary" ]] || { err "Synthesizer binary not found. Tried: $dist_dir/bin/synthesizer, $ROOT/packages/bin/synthesizer, and $FE_SYN/bin/synthesizer"; echo "💡 Build the binary first: cd packages/frontend/synthesizer && ./build-binary.sh" >&2; exit 1; }

  local args=("$@")

  log "TokamakL2JS Tx: executing synthesizer binary..."
  verbose "Command: $synthesizer_binary tokamak-ch-tx ${args[*]}"

  # Use binary's directory as cwd (for resource files)
  local binary_dir="$(dirname "$synthesizer_binary")"
  pushd "$binary_dir" >/dev/null
  if "$synthesizer_binary" tokamak-ch-tx "${args[@]}"; then
    ok "TokamakL2JS Tx completed successfully"
  else
    err "TokamakL2JS Tx failed"
    popd >/dev/null
    exit 1
  fi
  popd >/dev/null
}

# Get Participant Balances
