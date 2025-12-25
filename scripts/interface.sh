#   - Before executing any internal shell script, this CLI normalizes line endings via dos2unix
#     and ensures the script is executable, to avoid Windows CRLF issues.
# Commands:
#   --install <API_KEY|RPC_URL> [--bun]  Install frontend deps, run backend packaging, compile qap-compiler, write synthesizer/.env
#   --synthesize <TX_CONFIG_JSON>  Run frontend synthesizer with config JSON and sync outputs into dist
#   --preprocess                 Run backend preprocess step (dist only)
#   --prove [<SYNTH_OUTPUT_ZIP|DIR>] Run backend prove step and collect artifacts in dist
#   --verify [<PROOF_ZIP|DIR>]   Verify a proof from dist outputs (default: detected dist for current platform)
#   --extract-proof <OUTPUT_DIR> Gather proof artifacts from dist and zip them to OUTPUT_DIR/transaction_zkp.zip
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

  --preprocess
      Run backend preprocess stage (after --synthesize)

  --prove [<SYNTH_OUTPUT_ZIP|DIR>]
      Run backend prove stage and collect artifacts (after --synthesize)
      If zip or directory is provided, sync synth outputs into dist before proving

  --verify [<PROOF_ZIP|DIR>]
      Verify a proof saved under dist (default: detected dist for current platform)
      If zip or directory is provided, sync proof.json into dist before verifying
      Tokamak ZKP must be installed via "--install"

  --extract-proof <OUTPUT_DIR>
      Collect minimal proof artifacts required for verification and zip to <OUTPUT_DIR>/transaction_zkp.zip

  --doctor
      Check system requirements and health

  --l2-transfer [OPTIONS...]
      Execute L2 State Channel transfer using synthesizer binary
      For options, see: bin/synthesizer l2-transfer --help

  --get-balances [OPTIONS...]
      Get participant balances from state snapshot or on-chain deposits
      For options, see: bin/synthesizer get-balances --help

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
      CMD="synthesize"; ARG1="${2:-}";
      [[ -n "$ARG1" ]] || { err "--synthesize requires <TX_CONFIG_JSON>"; echo "💡 Provide the path to your transaction config JSON" >&2; exit 1; }
      [[ -z "${3:-}" ]] || { err "Too many arguments for --synthesize"; exit 1; }
      break
      ;;
    --preprocess)
      CMD="preprocess"
      [[ -z "${2:-}" ]] || { err "Too many arguments for --preprocess"; exit 1; }
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
      [[ -n "$ARG1" ]] || { err "--extract-proof requires <OUTPUT_DIR>"; exit 1; }
      [[ -z "${3:-}" ]] || { err "Too many arguments for --extract-proof"; exit 1; }
      break
      ;;
    --doctor)
      CMD="doctor"
      break
      ;;
    --l2-transfer)
      CMD="l2_transfer"
      shift # Remove --l2-transfer
      # Collect all remaining arguments
      L2_TRANSFER_ARGS=()
      while [[ $# -gt 0 ]]; do
        L2_TRANSFER_ARGS+=("$1")
        shift
      done
      break
      ;;
    --get-balances)
      CMD="get_balances"
      shift # Remove --get-balances
      # Collect all remaining arguments
      GET_BALANCES_ARGS=()
      while [[ $# -gt 0 ]]; do
        GET_BALANCES_ARGS+=("$1")
        shift
      done
      break
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
  preprocess) step_preprocess ;;
  prove) step_prove "${ARG1:-}" ;;
  verify) step_verify "${ARG1:-}" ;;
  extract_proof) step_extract_proof "$ARG1" ;;
  doctor) step_doctor ;;
  l2_transfer) step_l2_transfer "${L2_TRANSFER_ARGS[@]}" ;;
  get_balances) step_get_balances "${GET_BALANCES_ARGS[@]}" ;;
esac