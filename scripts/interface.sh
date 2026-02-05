#   - Before executing any internal shell script, this CLI normalizes line endings via dos2unix
#     and ensures the script is executable, to avoid Windows CRLF issues.
# Commands:
#   --install <API_KEY|RPC_URL> [--bun]  Install frontend deps, run backend packaging, compile qap-compiler, write synthesizer/.env
#   --synthesize <TX_CONFIG_JSON>  Run frontend synthesizer with config JSON and sync outputs into dist
#   --synthesize --tokamak-ch-tx [OPTIONS...]  Execute TokamakL2JS Channel transaction using synthesizer binary
#   --preprocess [PERMUTATION_JSON_PATH]  Run backend preprocess step (dist only); optionally copy permutation.json into dist before running
#   --prove [<SYNTH_OUTPUT_ZIP|DIR>] Run backend prove step and collect artifacts in dist
#   --verify [<PROOF_ZIP|DIR>]   Verify a proof from dist outputs (default: dist)
#   --extract-proof <OUTPUT_ZIP> Gather proof artifacts from dist and zip them to the given path
#   --doctor                     Check system requirements and health
#   --help                       Show usage
# Options:
#   --verbose                    Show detailed output
#   --bun                        Use Bun for packaging during --install

# ---------- CLI ----------
print_usage() {
  cat <<'USAGE'

Commands:
  --install <API_KEY|RPC_URL> [--bun]
      Install and setup Tokamak ZKP

  --synthesize <TX_CONFIG_JSON>
      Run frontend synthesizer with an input transaction config JSON

  --synthesize --tokamak-ch-tx [OPTIONS...]
      Execute TokamakL2JS Channel transaction using synthesizer binary
      Required:
        --previous-state  JSON string of previous state snapshot
        --transaction     RLP string of transaction
        --block-info      JSON string of block information
        --contract-code   Hexadecimal string of contract code
      For options, see: bin/synthesizer tokamak-ch-tx --help

  --preprocess [PERMUTATION_JSON_PATH]
      Run backend preprocess stage (after --synthesize)
      If a permutation.json path is provided (obtainable from --synthesize), it will be copied into dist/resource/synthesizer/output before running preprocess

  --prove [<SYNTH_OUTPUT_ZIP|DIR>]
      Run backend prove stage and collect artifacts (after --synthesize)
      If zip or directory is provided, sync synth outputs into dist before proving

  --verify [<PROOF_ZIP|DIR>]
      Verify a proof saved under dist (default: dist)
      If zip or directory is provided, sync proof.json into dist before verifying
      Tokamak ZKP must be installed via "--install"

  --extract-proof <OUTPUT_ZIP_PATH>
      Collect minimal proof artifacts required for verification and zip to the given path

  --doctor
      Check system requirements and health

  --help
      Show this help

Options:
  --verbose       Show detailed output
  --bun           Use Bun for packaging during --install
USAGE
}

# Parse args
[[ $# -gt 0 ]] || { print_usage; exit 1; }

# Handle flags first
while [[ $# -gt 0 ]]; do
  case "$1" in
    --verbose)
      VERBOSE=true
      shift
      ;;
    --install)
      CMD="install"; ARG1="${2:-}";
      [[ -n "$ARG1" ]] || { err "--install requires <API_KEY|RPC_URL>"; echo "💡 Get an API key from https://dashboard.alchemy.com/" >&2; exit 1; }
      shift 2
      while [[ $# -gt 0 ]]; do
        case "$1" in
          --bun)
            INSTALL_USE_BUN=true
            shift
            ;;
          --verbose)
            VERBOSE=true
            shift
            ;;
          *)
            err "Unknown option for --install: $1"
            exit 1
            ;;
        esac
      done
      break
      ;;
    --synthesize)
      if [[ "${2:-}" == "--tokamak-ch-tx" ]]; then
        CMD="tokamak_ch_tx"
        shift 2 # Remove --synthesize --tokamak-ch-tx
        L2_TRANSFER_ARGS=()
        while [[ $# -gt 0 ]]; do
          L2_TRANSFER_ARGS+=("$1")
          shift
        done
        break
      fi
      CMD="synthesize"; ARG1="${2:-}";
      [[ -n "$ARG1" ]] || { err "--synthesize requires <TX_CONFIG_JSON>"; echo "💡 Provide the path to your transaction config JSON" >&2; exit 1; }
      [[ -z "${3:-}" ]] || { err "Too many arguments for --synthesize"; exit 1; }
      break
      ;;
    --preprocess)
      CMD="preprocess"; ARG1="${2:-}";
      [[ -z "${3:-}" ]] || { err "Too many arguments for --preprocess"; exit 1; }
      break
      ;;
    --prove)
      CMD="prove";
      ARG1="${2:-}";
      [[ -z "${3:-}" ]] || { err "Too many arguments for --prove"; exit 1; }
      break
      ;;
    --verify)
      CMD="verify";
      ARG1="${2:-}";
      [[ -z "${3:-}" ]] || { err "Too many arguments for --verify"; exit 1; }
      break
      ;;
    --extract-proof)
      CMD="extract_proof"; ARG1="${2:-}";
      [[ -n "$ARG1" ]] || { err "--extract-proof requires <OUTPUT_ZIP_PATH>"; exit 1; }
      [[ -z "${3:-}" ]] || { err "Too many arguments for --extract-proof"; exit 1; }
      break
      ;;
    --doctor)
      CMD="doctor"
      break
      ;;
    --l2-transfer)
      err "--l2-transfer has moved; use --synthesize --tokamak-ch-tx"
      exit 1
      ;;
    --help|-h)
      print_usage; exit 0
      ;;
    *)
      err "Unknown option: $1"; print_usage; exit 1
      ;;
  esac
done

[[ -n "${CMD:-}" ]] || { err "No command specified"; print_usage; exit 1; }

# Dispatch
case "$CMD" in
  install) step_install "$ARG1" ;;
  synthesize) step_synthesize "$ARG1" ;;
  preprocess) step_preprocess "${ARG1:-}" ;;
  prove) step_prove "${ARG1:-}" ;;
  verify) step_verify "${ARG1:-}" ;;
  extract_proof) step_extract_proof "$ARG1" ;;
  doctor) step_doctor ;;
  tokamak_ch_tx) step_tokamak_ch_tx "${L2_TRANSFER_ARGS[@]}" ;;
esac
