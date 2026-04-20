#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

WORKSPACE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$WORKSPACE_ROOT"

CRS_DRIVE_FOLDER_ID="1Xvm8mdliHJZafzE5jaPidK4xqWAM0F9A"
CRS_DRIVE_FOLDER_URL="https://drive.google.com/drive/mobile/folders"
CRS_DOWNLOAD_BASE_URL="https://drive.usercontent.google.com/download"

PLATFORM=""
DO_SIGN=false
DO_SETUP=true
DO_TRUSTED_SETUP=false
TARGET_DIR_OVERRIDE=""
PACKAGE_STAGING_DIR=""
TARGET=""
BACKEND_PATH=""
OUT_PACKAGE=""
COMMON_TARBALL=""
BACKEND_TARBALL=""
COMMON_URL=""
BACKEND_URL=""
SCRIPTS_SOURCE=""
INSTALLED_SUBCIRCUIT_PACKAGE_DIR=""
INSTALLED_SYNTHESIZER_PACKAGE_DIR=""
APP_SIGN_ID=""
NOTARY_PROFILE=""

cleanup_staging_dir() {
    if [[ -n "$PACKAGE_STAGING_DIR" && -d "$PACKAGE_STAGING_DIR" ]]; then
        rm -rf "$PACKAGE_STAGING_DIR"
    fi
}

trap cleanup_staging_dir EXIT

detect_platform() {
    case "$(uname -s)" in
        Darwin*) echo "macos" ;;
        Linux*)  echo "linux" ;;
        *)       echo "unknown" ;;
    esac
}

show_help() {
    cat << EOF
Usage: $0 [OPTIONS]

Platform Selection:
  --platform PLATFORM    Target platform: linux, macos (auto-detected if not specified)
  --linux                Build for Linux (shorthand for --platform linux)
  --macos                Build for macOS (shorthand for --platform macos)

Build Options:
  --trusted-setup        Build trusted-setup and generate CRS locally
  --no-setup             Skip setup artifact provisioning
  --target-dir <path>    Override install target directory

macOS-specific Options:
  --sign                 Sign and notarize macOS binaries

Other Options:
  --help                 Show this help message

Examples:
  $0 --linux
  $0 --macos --trusted-setup
  $0 --platform linux --no-setup
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --platform)
            PLATFORM="${2:-}"
            shift 2
            ;;
        --linux)
            PLATFORM="linux"
            shift
            ;;
        --macos)
            PLATFORM="macos"
            shift
            ;;
        --sign)
            DO_SIGN=true
            shift
            ;;
        --trusted-setup)
            DO_TRUSTED_SETUP=true
            shift
            ;;
        --no-setup)
            DO_SETUP=false
            shift
            ;;
        --target-dir)
            TARGET_DIR_OVERRIDE="${2:-}"
            shift 2
            ;;
        --help)
            show_help
            exit 0
            ;;
        *)
            if [[ "$1" =~ ^-- ]]; then
                echo "Unknown option: $1" >&2
                exit 1
            fi
            shift
            ;;
    esac
done

if [[ -z "$PLATFORM" ]]; then
    PLATFORM="$(detect_platform)"
    echo "Auto-detected platform: $PLATFORM"
fi

if [[ "$DO_SETUP" == "false" && "$DO_TRUSTED_SETUP" == "true" ]]; then
    echo "--trusted-setup cannot be combined with --no-setup" >&2
    exit 1
fi

case "$PLATFORM" in
    linux|macos) ;;
    *)
        echo "Unsupported platform: $PLATFORM" >&2
        exit 1
        ;;
esac

echo "Packaging from workspace root: $(pwd)"
echo "Configuration: PLATFORM=${PLATFORM}, DO_SETUP=${DO_SETUP}, DO_TRUSTED_SETUP=${DO_TRUSTED_SETUP}, DO_SIGN=${DO_SIGN}"

setup_platform_config() {
    case "$PLATFORM" in
        linux)
            setup_linux_config
            ;;
        macos)
            setup_macos_config
            ;;
    esac
}

setup_linux_config() {
    local ubuntu_major="22"
    if [[ -r /etc/os-release ]]; then
        . /etc/os-release
        if [[ -n "${VERSION_ID:-}" ]]; then
            ubuntu_major="${VERSION_ID%%.*}"
        fi
    fi
    if [[ "$ubuntu_major" != "20" && "$ubuntu_major" != "22" ]]; then
        ubuntu_major="22"
    fi

    local default_target="dist/linux${ubuntu_major}"
    if [[ -n "$TARGET_DIR_OVERRIDE" ]]; then
        TARGET="$TARGET_DIR_OVERRIDE"
    else
        TARGET="$default_target"
    fi

    BACKEND_PATH="backend-lib/icicle"
    OUT_PACKAGE="tokamak-zk-evm-linux${ubuntu_major}.tar.gz"

    local base_url="https://github.com/ingonyama-zk/icicle/releases/download/v3.8.0"
    COMMON_TARBALL="icicle_3_8_0-ubuntu${ubuntu_major}.tar.gz"
    BACKEND_TARBALL="icicle_3_8_0-ubuntu${ubuntu_major}-cuda122.tar.gz"
    COMMON_URL="${base_url}/${COMMON_TARBALL}"
    BACKEND_URL="${base_url}/${BACKEND_TARBALL}"
    SCRIPTS_SOURCE=".run_scripts/linux"
}

setup_macos_config() {
    local default_target="dist/macOS"
    if [[ -n "$TARGET_DIR_OVERRIDE" ]]; then
        TARGET="$TARGET_DIR_OVERRIDE"
    else
        TARGET="$default_target"
    fi

    BACKEND_PATH="backend-lib/icicle"
    OUT_PACKAGE="tokamak-zk-evm-macOS.zip"
    COMMON_TARBALL="icicle_3_8_0-macOS.tar.gz"
    BACKEND_TARBALL="icicle_3_8_0-macOS-Metal.tar.gz"
    COMMON_URL="https://github.com/ingonyama-zk/icicle/releases/download/v3.8.0/${COMMON_TARBALL}"
    BACKEND_URL="https://github.com/ingonyama-zk/icicle/releases/download/v3.8.0/${BACKEND_TARBALL}"
    SCRIPTS_SOURCE=".run_scripts/macOS"
    APP_SIGN_ID='3524416ED3903027378EA41BB258070785F977F9'
    NOTARY_PROFILE='tokamak-zk-evm-backend'
}

require_command() {
    local name="$1"
    command -v "$name" >/dev/null 2>&1 || {
        echo "Required command not found: $name" >&2
        exit 1
    }
}

json_get() {
    local json_path="$1"
    local field_path="$2"
    node - "$json_path" "$field_path" <<'NODE'
const fs = require('fs');
const [jsonPath, fieldPath] = process.argv.slice(2);
const payload = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
let value = payload;
for (const key of fieldPath.split('.')) {
  if (value === null || value === undefined || !(key in value)) {
    console.error(`Missing JSON field ${fieldPath} in ${jsonPath}`);
    process.exit(1);
  }
  value = value[key];
}
if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
  process.stdout.write(String(value));
} else {
  process.stdout.write(JSON.stringify(value));
}
NODE
}

find_named_file_or_die() {
    local root_dir="$1"
    local filename="$2"
    local found
    found="$(find "$root_dir" -type f -name "$filename" 2>/dev/null | head -n 1)"
    [[ -n "$found" ]] || {
        echo "Missing ${filename} under ${root_dir}" >&2
        exit 1
    }
    printf '%s\n' "$found"
}

copy_scripts() {
    echo "[*] Copying wrapper scripts..."
    rm -rf -- "$TARGET"
    mkdir -p "$TARGET"
    cp -r "${SCRIPTS_SOURCE}/"* "$TARGET"
}

install_published_packages() {
    require_command npm

    PACKAGE_STAGING_DIR="$(mktemp -d -t tokamak_install_packages.XXXXXX)"
    printf '{ "private": true }\n' > "${PACKAGE_STAGING_DIR}/package.json"

    echo "[*] Installing published npm packages..."
    (
        cd "$PACKAGE_STAGING_DIR"
        npm install --silent --ignore-scripts --no-save \
            @tokamak-zk-evm/subcircuit-library@latest \
            @tokamak-zk-evm/synthesizer-node@latest
    )

    INSTALLED_SUBCIRCUIT_PACKAGE_DIR="${PACKAGE_STAGING_DIR}/node_modules/@tokamak-zk-evm/subcircuit-library"
    INSTALLED_SYNTHESIZER_PACKAGE_DIR="${PACKAGE_STAGING_DIR}/node_modules/@tokamak-zk-evm/synthesizer-node"

    [[ -d "$INSTALLED_SUBCIRCUIT_PACKAGE_DIR" ]] || {
        echo "Installed subcircuit-library package not found" >&2
        exit 1
    }
    [[ -d "$INSTALLED_SYNTHESIZER_PACKAGE_DIR" ]] || {
        echo "Installed synthesizer-node package not found" >&2
        exit 1
    }
}

copy_published_resources() {
    local subcircuit_library_dir synthesizer_dist_dir
    subcircuit_library_dir="${INSTALLED_SUBCIRCUIT_PACKAGE_DIR}/subcircuits/library"
    synthesizer_dist_dir="${INSTALLED_SYNTHESIZER_PACKAGE_DIR}/dist"

    [[ -d "$subcircuit_library_dir" ]] || {
        echo "Published subcircuit library payload missing: $subcircuit_library_dir" >&2
        exit 1
    }
    [[ -d "$synthesizer_dist_dir" ]] || {
        echo "Published synthesizer dist missing: $synthesizer_dist_dir" >&2
        exit 1
    }

    echo "[*] Copying published subcircuit library..."
    mkdir -p "${TARGET}/resource/qap-compiler/library"
    cp -R "${subcircuit_library_dir}/." "${TARGET}/resource/qap-compiler/library/"
    cp "${INSTALLED_SUBCIRCUIT_PACKAGE_DIR}/build-metadata.json" "${TARGET}/resource/qap-compiler/build-metadata.json"

    echo "[*] Copying published synthesizer dist..."
    mkdir -p "${TARGET}/bin/synthesizer"
    cp -R "${synthesizer_dist_dir}/." "${TARGET}/bin/synthesizer/"
}

build_backend() {
    require_command cargo

    echo "[*] Building backend release binaries..."
    (
        cd packages/backend
        if [[ "$DO_TRUSTED_SETUP" == "true" ]]; then
            cargo build -p trusted-setup --release
        fi
        cargo build -p preprocess --release
        cargo build -p prove --release
        cargo build -p verify --release
    )
}

copy_backend_binary() {
    local binary_name="$1"
    local binary_path metadata_path
    binary_path="packages/backend/target/release/${binary_name}"
    metadata_path="packages/backend/target/release/build-metadata-${binary_name}.json"

    [[ -f "$binary_path" ]] || {
        echo "Missing backend binary: $binary_path" >&2
        exit 1
    }
    [[ -f "$metadata_path" ]] || {
        echo "Missing backend build metadata: $metadata_path" >&2
        exit 1
    }

    cp -f "$binary_path" "${TARGET}/bin/"
    cp -f "$metadata_path" "${TARGET}/bin/"
}

copy_backend_binaries() {
    mkdir -p "${TARGET}/bin"
    copy_backend_binary preprocess
    copy_backend_binary prove
    copy_backend_binary verify
    if [[ "$DO_TRUSTED_SETUP" == "true" ]]; then
        copy_backend_binary trusted-setup
    fi
}

download_and_extract_icicle() {
    require_command curl
    require_command tar

    echo "[*] Downloading ICICLE runtime packages..."
    curl -fL --retry 3 -o "$BACKEND_TARBALL" "$BACKEND_URL"
    curl -fL --retry 3 -o "$COMMON_TARBALL" "$COMMON_URL"

    tar -xzf "$BACKEND_TARBALL"
    tar -xzf "$COMMON_TARBALL"

    mkdir -p "${TARGET}/${BACKEND_PATH}"
    cp -R icicle/. "${TARGET}/${BACKEND_PATH}/"

    rm -rf "$BACKEND_TARBALL" "$COMMON_TARBALL" icicle
}

configure_macos_rpath() {
    if [[ "$PLATFORM" != "macos" ]]; then
        return
    fi

    require_command install_name_tool

    local rpath binary
    rpath="@executable_path/../${BACKEND_PATH}/lib"
    for binary in trusted-setup preprocess prove verify; do
        if [[ -f "${TARGET}/bin/${binary}" ]]; then
            install_name_tool -add_rpath "$rpath" "${TARGET}/bin/${binary}" || true
        fi
    done
}

drive_direct_download_url() {
    local file_id="$1"
    printf '%s?id=%s&export=download&confirm=t\n' "$CRS_DOWNLOAD_BASE_URL" "$file_id"
}

select_latest_drive_archive() {
    require_command curl
    local html
    html="$(curl -fsSL "${CRS_DRIVE_FOLDER_URL}/${CRS_DRIVE_FOLDER_ID}")"

    DRIVE_FOLDER_HTML="$html" node - <<'NODE'
const vm = require('vm');

const html = process.env.DRIVE_FOLDER_HTML || '';
const match = html.match(/window\['_DRIVE_ivd'\]\s*=\s*('(?:\\.|[^'])*')/);
if (!match) {
  console.error('Unable to locate Google Drive listing payload.');
  process.exit(1);
}

const decoded = vm.runInNewContext(match[1]);
const payload = JSON.parse(decoded);
const entriesById = new Map();

function extractGeneratedAt(name) {
  const match = name.match(/v(\d+)\.(\d+)\.(\d+)-(\d{8}T\d{6}Z)\.zip$/i);
  if (!match) {
    return null;
  }
  return {
    version: [Number(match[1]), Number(match[2]), Number(match[3])],
    generatedAt: match[4],
  };
}

function walk(node) {
  if (!Array.isArray(node)) {
    return;
  }

  if (typeof node[0] === 'string' && typeof node[2] === 'string' && node[3] === 'application/zip') {
    const parsed = extractGeneratedAt(node[2]);
    if (parsed) {
      entriesById.set(node[0], {
        fileId: node[0],
        name: node[2],
        version: parsed.version,
        generatedAt: parsed.generatedAt,
      });
    }
  }

  for (const child of node) {
    walk(child);
  }
}

walk(payload);

const entries = [...entriesById.values()];
if (entries.length === 0) {
  console.error('No CRS archive matching the expected naming convention was found in Google Drive.');
  process.exit(1);
}

entries.sort((left, right) => {
  for (let index = 0; index < 3; index += 1) {
    if (left.version[index] !== right.version[index]) {
      return right.version[index] - left.version[index];
    }
  }
  return right.generatedAt.localeCompare(left.generatedAt);
});

const best = entries[0];
process.stdout.write(`${best.fileId}\t${best.name}`);
NODE
}

download_latest_crs_archive() {
    local download_dir="$1"
    local selection file_id archive_name archive_path

    selection="$(select_latest_drive_archive)"
    IFS=$'\t' read -r file_id archive_name <<< "$selection"
    [[ -n "$file_id" && -n "$archive_name" ]] || {
        echo "Failed to resolve the latest CRS archive from Google Drive." >&2
        exit 1
    }

    archive_path="${download_dir}/${archive_name}"
    echo "[*] Downloading CRS archive: ${archive_name}" >&2
    curl -fL --retry 3 -o "$archive_path" "$(drive_direct_download_url "$file_id")"
    printf '%s\t%s\n' "$archive_path" "$archive_name"
}

extract_zip_archive() {
    local zip_path="$1"
    local dest_dir="$2"
    require_command unzip
    if ! unzip -tqq "$zip_path" >/dev/null 2>&1; then
        if grep -Eq "hasn't given you permission to download this file|hasn&#39;t given you permission to download this file|Google Drive - Can&#39;t download file" "$zip_path" 2>/dev/null; then
            echo "Google Drive denied downloading the selected CRS archive. The folder listing is visible, but the file is not downloadable with the current permissions: ${CRS_DRIVE_FOLDER_URL}/${CRS_DRIVE_FOLDER_ID}" >&2
            exit 1
        fi
        echo "Downloaded CRS archive is not a valid zip file: $zip_path" >&2
        exit 1
    fi
    unzip -q "$zip_path" -d "$dest_dir"
}

validate_downloaded_crs_versions() {
    local extracted_dir="$1"
    local archive_name="$2"
    local mpc_metadata_path installed_subcircuit_metadata_path
    local installed_subcircuit_version mpc_subcircuit_version mpc_version backend_version

    mpc_metadata_path="$(find_named_file_or_die "$extracted_dir" "build-metadata-mpc-setup.json")"
    installed_subcircuit_metadata_path="${INSTALLED_SUBCIRCUIT_PACKAGE_DIR}/build-metadata.json"
    [[ -f "$installed_subcircuit_metadata_path" ]] || {
        echo "Installed subcircuit-library build metadata is missing." >&2
        exit 1
    }

    installed_subcircuit_version="$(json_get "$installed_subcircuit_metadata_path" "packageVersion")"
    mpc_subcircuit_version="$(json_get "$mpc_metadata_path" "dependencies.subcircuitLibrary.buildVersion")"

    if [[ "$mpc_subcircuit_version" != "$installed_subcircuit_version" ]]; then
        echo "CRS archive ${archive_name} was built against subcircuit-library ${mpc_subcircuit_version}, but the installed subcircuit-library version is ${installed_subcircuit_version}." >&2
        exit 1
    fi

    mpc_version="$(json_get "$mpc_metadata_path" "packageVersion")"
    for backend in preprocess prove verify; do
        backend_version="$(json_get "packages/backend/target/release/build-metadata-${backend}.json" "packageVersion")"
        if [[ "$backend_version" != "$mpc_version" ]]; then
            echo "Backend package ${backend} has version ${backend_version}, but the downloaded CRS expects backend version ${mpc_version}." >&2
            exit 1
        fi
    done
}

install_downloaded_setup() {
    local output_dir archive_dir archive_info archive_path archive_name extracted_dir
    output_dir="${TARGET}/resource/setup/output"
    mkdir -p "$output_dir"

    archive_dir="$(mktemp -d -t tokamak_crs_download.XXXXXX)"
    archive_info="$(download_latest_crs_archive "$archive_dir")"
    IFS=$'\t' read -r archive_path archive_name <<< "$archive_info"

    extracted_dir="$(mktemp -d -t tokamak_crs_extract.XXXXXX)"
    extract_zip_archive "$archive_path" "$extracted_dir"
    validate_downloaded_crs_versions "$extracted_dir" "$archive_name"

    cp -f "$(find_named_file_or_die "$extracted_dir" "combined_sigma.rkyv")" "${output_dir}/combined_sigma.rkyv"
    cp -f "$(find_named_file_or_die "$extracted_dir" "sigma_preprocess.rkyv")" "${output_dir}/sigma_preprocess.rkyv"
    cp -f "$(find_named_file_or_die "$extracted_dir" "sigma_verify.rkyv")" "${output_dir}/sigma_verify.rkyv"
    cp -f "$(find_named_file_or_die "$extracted_dir" "build-metadata-mpc-setup.json")" "${output_dir}/build-metadata-mpc-setup.json"

    local provenance_path
    provenance_path="$(find "$extracted_dir" -type f -name "crs_provenance.json" 2>/dev/null | head -n 1 || true)"
    if [[ -n "$provenance_path" ]]; then
        cp -f "$provenance_path" "${output_dir}/crs_provenance.json"
    fi

    rm -rf "$archive_dir" "$extracted_dir"
}

run_trusted_setup() {
    local setup_script="${TARGET}/1_run-trusted-setup.sh"
    [[ -f "${TARGET}/bin/trusted-setup" ]] || {
        echo "trusted-setup binary is missing from ${TARGET}/bin" >&2
        exit 1
    }

    dos2unix "$setup_script" >/dev/null 2>&1 || true
    chmod +x "$setup_script"
    "$setup_script"
}

handle_setup() {
    local output_dir="${TARGET}/resource/setup/output"
    mkdir -p "$output_dir"

    if [[ "$DO_SETUP" == "false" ]]; then
        printf 'Setup artifacts were skipped during packaging.\n' > "${output_dir}/README.txt"
        return
    fi

    if [[ "$DO_TRUSTED_SETUP" == "true" ]]; then
        echo "[*] Generating CRS with trusted-setup..."
        run_trusted_setup
        return
    fi

    echo "[*] Downloading published CRS artifacts..."
    install_downloaded_setup
}

sign_macos_binaries() {
    if [[ "$PLATFORM" != "macos" || "$DO_SIGN" != "true" ]]; then
        return
    fi

    find "$TARGET" -type f \( -perm -111 -o -name "*.dylib" -o -name "*.so" \) -print0 | \
        xargs -0 -I{} codesign --force --options runtime --entitlements entitlements.plist --timestamp -s "$APP_SIGN_ID" "{}"
}

package_distribution() {
    if [[ -n "$TARGET_DIR_OVERRIDE" ]]; then
        echo "[*] Skipping archive generation for explicit target directory ${TARGET_DIR_OVERRIDE}."
        return
    fi

    mkdir -p dist
    rm -f "dist/${OUT_PACKAGE}"

    case "$PLATFORM" in
        macos)
            ( cd "$TARGET" && ditto -c -k --sequesterRsrc . "../../dist/${OUT_PACKAGE}" )
            if [[ "$DO_SIGN" == "true" ]]; then
                xcrun notarytool submit "dist/${OUT_PACKAGE}" --keychain-profile "$NOTARY_PROFILE" --wait
            fi
            ;;
        linux)
            tar -C "$TARGET" -c . | gzip -9 > "dist/${OUT_PACKAGE}"
            ;;
    esac
}

main() {
    setup_platform_config
    copy_scripts
    install_published_packages
    copy_published_resources
    build_backend
    copy_backend_binaries
    download_and_extract_icicle
    configure_macos_rpath
    handle_setup
    sign_macos_binaries
    package_distribution
    echo "Packaging completed successfully for ${PLATFORM}."
}

main
