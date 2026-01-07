# TokamakL2JS Channel transaction (via synthesizer binary)
step_tokamak_ch_tx() {
  local dist_dir synthesizer_binary
  dist_dir="$(dist_dir_for_target "$(detect_target)")"

  # Try dist/bin/synthesizer first, then FE_SYN/bin/synthesizer
  synthesizer_binary="$dist_dir/bin/synthesizer"
  if [[ ! -f "$synthesizer_binary" ]]; then
    synthesizer_binary="$FE_SYN/bin/synthesizer"
  fi
  [[ -f "$synthesizer_binary" ]] || { err "Synthesizer binary not found. Tried: $dist_dir/bin/synthesizer and $FE_SYN/bin/synthesizer"; echo "💡 Build the binary first: cd packages/frontend/synthesizer && ./build-binary.sh" >&2; exit 1; }

  log "TokamakL2JS Tx: executing synthesizer binary..."
  verbose "Command: $synthesizer_binary tokamak-ch-tx $*"

  local binary_dir
  binary_dir="$(dirname "$synthesizer_binary")"
  if (cd "$binary_dir" && "$synthesizer_binary" tokamak-ch-tx "$@"); then
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
