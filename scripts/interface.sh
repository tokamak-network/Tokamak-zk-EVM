#   - Before executing any internal shell script, this CLI normalizes line endings via dos2unix
#     and ensures the script is executable, to avoid Windows CRLF issues.
# Commands:
#   --install [--trusted-setup] [--no-setup]  Install published runtime packages, build backend binaries, and prepare setup artifacts
#   --synthesize <INPUT_DIR|OPTIONS...>  Execute TokamakL2JS Channel transaction via synthesizer-node and sync outputs into dist
#   --preprocess [<SYNTH_OUTPUT_ZIP|DIR>]  Run backend preprocess step (dist only); optionally sync preprocess inputs into dist before running (DIR/ZIP must include permutation.json + instance.json)
#   --prove [<SYNTH_OUTPUT_ZIP|DIR>] Run backend prove step and collect artifacts in dist (DIR/ZIP must include placementVariables.json + permutation.json + instance.json)
#   --verify [<PROOF_ZIP|DIR>]   Verify a proof from dist outputs (default: dist; DIR/ZIP must include proof.json + preprocess.json + instance.json)
#   --extract-proof <OUTPUT_ZIP> Gather proof artifacts from dist and zip them to the given path
#   --doctor                     Check system requirements and health
#   --help                       Show usage
# Options:
#   --verbose                    Show detailed output
#   --trusted-setup             Build trusted-setup and generate CRS locally during --install
#   --no-setup                  Skip setup artifact provisioning during --install

# ---------- CLI ----------
print_usage() {
  cat <<'USAGE'

Commands:
  --install [--trusted-setup] [--no-setup]
      Install and setup Tokamak ZKP
      Installs `@tokamak-zk-evm/subcircuit-library` and `@tokamak-zk-evm/synthesizer-node`
      from npm, builds backend release binaries, and prepares dist resources
      By default, setup artifacts are downloaded from the published CRS Google Drive folder
      Use `--trusted-setup` to build `trusted-setup` and generate CRS locally instead
      Use `--no-setup` to skip setup artifact provisioning entirely

  --synthesize <INPUT_DIR|OPTIONS...>
      Execute TokamakL2JS Channel transaction using the synthesizer-node CLI
      Supported inputs:
        <INPUT_DIR>      Directory containing previous_state_snapshot.json, transaction.json, block_info.json, and contract_codes.json
      Or provide:
        --previous-state  Path to previous state snapshot JSON
        --transaction     Path to transaction snapshot JSON
        --block-info      Path to block information JSON
        --contract-code   Path to contract code JSON
      File inputs are resolved to absolute paths before execution
      For options, run: cd packages/frontend/synthesizer && npm run --workspace @tokamak-zk-evm/synthesizer-node cli -- --help

  --preprocess [<SYNTH_OUTPUT_ZIP|DIR>]
      Run backend preprocess stage (after --synthesize)
      If a synthesizer outputs directory/zip is provided, it must include `permutation.json` and `instance.json`; other synthesizer output files are not required for preprocess

  --prove [<SYNTH_OUTPUT_ZIP|DIR>]
      Run backend prove stage (after --synthesize)
      If zip or directory is provided, it must include `placementVariables.json`, `permutation.json`, and `instance.json`; other synthesizer output files are not required for prove

  --verify [<PROOF_ZIP|DIR>]
      Verify a proof saved under dist (default: dist)
      If zip or directory is provided, it must include `proof.json`, `preprocess.json`, and `instance.json`

  --extract-proof <OUTPUT_ZIP_PATH>
      Collect minimal proof artifacts required for verification and zip to the given path

  --doctor
      Check system requirements and health

  --help
      Show this help

Options:
  --verbose       Show detailed output
  --trusted-setup  Build trusted-setup and generate CRS locally during --install
  --no-setup       Skip setup artifact provisioning during --install
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
      CMD="install"
      shift
      while [[ $# -gt 0 ]]; do
        case "$1" in
          --trusted-setup)
            INSTALL_USE_TRUSTED_SETUP=true
            shift
            ;;
          --no-setup)
            INSTALL_SKIP_SETUP=true
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
      CMD="synthesize"
      shift
      SYNTHESIZE_ARGS=()
      while [[ $# -gt 0 ]]; do
        case "$1" in
          --verbose)
            VERBOSE=true
            shift
            ;;
          *)
            SYNTHESIZE_ARGS+=("$1")
            shift
            ;;
        esac
      done
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
  install) step_install ;;
  synthesize) step_synthesize "${SYNTHESIZE_ARGS[@]}" ;;
  preprocess) step_preprocess "${ARG1:-}" ;;
  prove) step_prove "${ARG1:-}" ;;
  verify) step_verify "${ARG1:-}" ;;
  extract_proof) step_extract_proof "$ARG1" ;;
  doctor) step_doctor ;;
esac
