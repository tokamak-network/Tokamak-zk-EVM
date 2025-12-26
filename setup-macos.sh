#!/bin/zsh

# ============================================================================
# Tokamak zk-EVM - macOS Prerequisites Setup Script
# ============================================================================
# This script automatically checks and installs all required dependencies
# for running Tokamak zk-EVM on macOS.
# ============================================================================

set -e

# ============================================================================
# COLORS AND STYLES
# ============================================================================
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

# Foreground colors
RED='\033[31m'
GREEN='\033[32m'
YELLOW='\033[33m'
BLUE='\033[34m'
MAGENTA='\033[35m'
CYAN='\033[36m'
WHITE='\033[37m'

# Bright foreground colors
BRIGHT_RED='\033[91m'
BRIGHT_GREEN='\033[92m'
BRIGHT_YELLOW='\033[93m'
BRIGHT_BLUE='\033[94m'
BRIGHT_MAGENTA='\033[95m'
BRIGHT_CYAN='\033[96m'
BRIGHT_WHITE='\033[97m'

# ============================================================================
# ICONS (Unicode)
# ============================================================================
ICON_CHECK="✓"
ICON_CROSS="✗"
ICON_GEAR="⚙"
ICON_PACKAGE="📦"
ICON_ROCKET="🚀"
ICON_WARNING="⚠️"
ICON_INFO="ℹ️"
ICON_SPARKLE="✨"
ICON_WRENCH="🔧"
ICON_DONE="🎉"

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

print_banner() {
    echo ""
    echo -e "${BRIGHT_CYAN}${BOLD}"
    echo "  ╔════════════════════════════════════════════════════════════════╗"
    echo "  ║                                                                ║"
    echo "  ║   ████████╗ ██████╗ ██╗  ██╗ █████╗ ███╗   ███╗ █████╗ ██╗  ██╗║"
    echo "  ║   ╚══██╔══╝██╔═══██╗██║ ██╔╝██╔══██╗████╗ ████║██╔══██╗██║ ██╔╝║"
    echo "  ║      ██║   ██║   ██║█████╔╝ ███████║██╔████╔██║███████║█████╔╝ ║"
    echo "  ║      ██║   ██║   ██║██╔═██╗ ██╔══██║██║╚██╔╝██║██╔══██║██╔═██╗ ║"
    echo "  ║      ██║   ╚██████╔╝██║  ██╗██║  ██║██║ ╚═╝ ██║██║  ██║██║  ██╗║"
    echo "  ║      ╚═╝    ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝║"
    echo "  ║                                                                ║"
    echo -e "  ║          ${BRIGHT_MAGENTA}zk-EVM Prerequisites Setup for macOS${BRIGHT_CYAN}              ║"
    echo "  ║                                                                ║"
    echo "  ╚════════════════════════════════════════════════════════════════╝"
    echo -e "${RESET}"
    echo ""
}

print_section() {
    echo ""
    echo -e "${BRIGHT_BLUE}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
    echo -e "${BRIGHT_BLUE}${BOLD}  $1${RESET}"
    echo -e "${BRIGHT_BLUE}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
    echo ""
}

print_status() {
    local stat_type=$1
    local message=$2
    local details=$3
    
    if [ "$stat_type" = "installed" ]; then
        echo -e "  ${BRIGHT_GREEN}${ICON_CHECK}${RESET} ${WHITE}${message}${RESET} ${DIM}${details}${RESET}"
    elif [ "$stat_type" = "missing" ]; then
        echo -e "  ${BRIGHT_RED}${ICON_CROSS}${RESET} ${WHITE}${message}${RESET} ${DIM}(not installed)${RESET}"
    elif [ "$stat_type" = "installing" ]; then
        echo -e "  ${BRIGHT_YELLOW}${ICON_GEAR}${RESET} ${WHITE}${message}${RESET} ${DIM}${details}${RESET}"
    elif [ "$stat_type" = "info" ]; then
        echo -e "  ${BRIGHT_CYAN}${ICON_INFO}${RESET} ${WHITE}${message}${RESET} ${DIM}${details}${RESET}"
    elif [ "$stat_type" = "warning" ]; then
        echo -e "  ${BRIGHT_YELLOW}${ICON_WARNING}${RESET} ${YELLOW}${message}${RESET} ${DIM}${details}${RESET}"
    elif [ "$stat_type" = "error" ]; then
        echo -e "  ${BRIGHT_RED}${ICON_CROSS}${RESET} ${RED}${message}${RESET} ${DIM}${details}${RESET}"
    elif [ "$stat_type" = "success" ]; then
        echo -e "  ${BRIGHT_GREEN}${ICON_SPARKLE}${RESET} ${GREEN}${message}${RESET} ${DIM}${details}${RESET}"
    fi
}

print_installing() {
    local package=$1
    echo ""
    echo -e "  ${BRIGHT_MAGENTA}${ICON_PACKAGE}${RESET} ${MAGENTA}Installing ${BOLD}${package}${RESET}${MAGENTA}...${RESET}"
    echo -e "  ${DIM}────────────────────────────────────────${RESET}"
}

# ============================================================================
# DEPENDENCY CHECK FUNCTIONS
# ============================================================================

check_macos() {
    if [[ "$(uname)" != "Darwin" ]]; then
        echo -e "${BRIGHT_RED}${BOLD}ERROR: This script is for macOS only!${RESET}"
        exit 1
    fi
}

get_homebrew_status() {
    if command -v brew &> /dev/null; then
        brew --version | head -n1
    else
        echo ""
    fi
}

get_node_status() {
    if command -v node &> /dev/null; then
        node --version
    else
        echo ""
    fi
}

get_npm_status() {
    if command -v npm &> /dev/null; then
        echo "v$(npm --version)"
    else
        echo ""
    fi
}

get_rust_status() {
    if command -v rustc &> /dev/null; then
        echo "v$(rustc --version | awk '{print $2}')"
    else
        echo ""
    fi
}

get_cargo_status() {
    if command -v cargo &> /dev/null; then
        echo "v$(cargo --version | awk '{print $2}')"
    else
        echo ""
    fi
}

get_circom_status() {
    if command -v circom &> /dev/null; then
        circom --version 2>&1 | head -n1
    else
        echo ""
    fi
}

get_cmake_status() {
    if command -v cmake &> /dev/null; then
        echo "v$(cmake --version | head -n1 | awk '{print $3}')"
    else
        echo ""
    fi
}

get_dos2unix_status() {
    if command -v dos2unix &> /dev/null; then
        dos2unix --version 2>&1 | head -n1
    else
        echo ""
    fi
}

get_git_status() {
    if command -v git &> /dev/null; then
        echo "v$(git --version | awk '{print $3}')"
    else
        echo ""
    fi
}

get_bun_status() {
    if command -v bun &> /dev/null; then
        echo "$(bun --version)"
    else
        echo ""
    fi
}

# ============================================================================
# INSTALLATION FUNCTIONS
# ============================================================================

install_homebrew() {
    print_installing "Homebrew"
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    
    # Add Homebrew to PATH for Apple Silicon
    if [[ $(uname -m) == 'arm64' ]]; then
        echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
        eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
    print_status "success" "Homebrew installed successfully!"
}

install_node() {
    print_installing "Node.js (via Homebrew)"
    brew install node
    print_status "success" "Node.js installed successfully!"
}

install_rust() {
    print_installing "Rust (via rustup)"
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
    print_status "success" "Rust installed successfully!"
}

install_circom() {
    print_installing "Circom (from source)"
    
    # Run in a subshell to avoid changing the current directory
    (
        local tmp_dir=$(mktemp -d)
        cd "$tmp_dir"
        
        echo -e "  ${DIM}Cloning circom repository...${RESET}"
        git clone https://github.com/iden3/circom.git
        cd circom
        
        echo -e "  ${DIM}Building circom (this may take a few minutes)...${RESET}"
        cargo build --release
        
        echo -e "  ${DIM}Installing circom binary...${RESET}"
        cargo install --path circom
        
        cd /
        rm -rf "$tmp_dir"
    )
    
    print_status "success" "Circom installed successfully!"
}

install_cmake() {
    print_installing "CMake (via Homebrew)"
    brew install cmake
    print_status "success" "CMake installed successfully!"
}

install_dos2unix() {
    print_installing "dos2unix (via Homebrew)"
    brew install dos2unix
    print_status "success" "dos2unix installed successfully!"
}

install_git() {
    print_installing "Git (via Homebrew)"
    brew install git
    print_status "success" "Git installed successfully!"
}

install_bun() {
    print_installing "Bun (via official installer)"
    curl -fsSL https://bun.sh/install | bash
    # Add bun to current session
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
    print_status "success" "Bun installed successfully!"
}

# ============================================================================
# MAIN SCRIPT
# ============================================================================

main() {
    clear
    print_banner
    
    check_macos
    
    # ========================================================================
    # STEP 1: Check current status
    # ========================================================================
    print_section "${ICON_WRENCH} Checking System Dependencies"
    
    # Arrays to track status
    local -a missing_deps
    missing_deps=()
    
    # Check Homebrew
    local homebrew_ver=$(get_homebrew_status)
    if [[ -n "$homebrew_ver" ]]; then
        print_status "installed" "homebrew" "($homebrew_ver)"
    else
        print_status "missing" "homebrew"
        missing_deps+=("homebrew")
    fi
    
    # Check Git
    local git_ver=$(get_git_status)
    if [[ -n "$git_ver" ]]; then
        print_status "installed" "git" "($git_ver)"
    else
        print_status "missing" "git"
        missing_deps+=("git")
    fi
    
    # Check Node.js
    local node_ver=$(get_node_status)
    if [[ -n "$node_ver" ]]; then
        print_status "installed" "node" "($node_ver)"
    else
        print_status "missing" "node"
        missing_deps+=("node")
    fi
    
    # Check npm
    local npm_ver=$(get_npm_status)
    if [[ -n "$npm_ver" ]]; then
        print_status "installed" "npm" "($npm_ver)"
    else
        print_status "missing" "npm"
        # npm comes with node, don't add separately
    fi
    
    # Check Rust
    local rust_ver=$(get_rust_status)
    if [[ -n "$rust_ver" ]]; then
        print_status "installed" "rust" "($rust_ver)"
    else
        print_status "missing" "rust"
        missing_deps+=("rust")
    fi
    
    # Check Cargo
    local cargo_ver=$(get_cargo_status)
    if [[ -n "$cargo_ver" ]]; then
        print_status "installed" "cargo" "($cargo_ver)"
    else
        print_status "missing" "cargo"
        # cargo comes with rust, don't add separately
    fi
    
    # Check Circom
    local circom_ver=$(get_circom_status)
    if [[ -n "$circom_ver" ]]; then
        print_status "installed" "circom" "($circom_ver)"
    else
        print_status "missing" "circom"
        missing_deps+=("circom")
    fi
    
    # Check CMake
    local cmake_ver=$(get_cmake_status)
    if [[ -n "$cmake_ver" ]]; then
        print_status "installed" "cmake" "($cmake_ver)"
    else
        print_status "missing" "cmake"
        missing_deps+=("cmake")
    fi
    
    # Check dos2unix
    local dos2unix_ver=$(get_dos2unix_status)
    if [[ -n "$dos2unix_ver" ]]; then
        print_status "installed" "dos2unix" "($dos2unix_ver)"
    else
        print_status "missing" "dos2unix"
        missing_deps+=("dos2unix")
    fi
    
    # Check Bun
    local bun_ver=$(get_bun_status)
    if [[ -n "$bun_ver" ]]; then
        print_status "installed" "bun" "(v$bun_ver)"
    else
        print_status "missing" "bun"
        missing_deps+=("bun")
    fi
    
    # ========================================================================
    # STEP 2: Summary
    # ========================================================================
    echo ""
    echo -e "  ${DIM}────────────────────────────────────────${RESET}"
    
    if [[ ${#missing_deps[@]} -eq 0 ]]; then
        echo ""
        echo -e "  ${BRIGHT_GREEN}${BOLD}${ICON_DONE} All dependencies are installed!${RESET}"
        echo ""
        echo -e "  ${BRIGHT_CYAN}You're ready to use Tokamak zk-EVM.${RESET}"
        echo -e "  ${DIM}Run ${RESET}${BOLD}./tokamak-cli --install <API_KEY>${RESET}${DIM} to get started.${RESET}"
        echo ""
        exit 0
    fi
    
    echo ""
    echo -e "  ${BRIGHT_YELLOW}${ICON_WARNING}${RESET} ${YELLOW}${#missing_deps[@]} missing dependencies found:${RESET}"
    for dep in "${missing_deps[@]}"; do
        echo -e "     ${DIM}•${RESET} ${WHITE}${dep}${RESET}"
    done
    echo ""
    
    # ========================================================================
    # STEP 3: Ask for confirmation
    # ========================================================================
    echo -e "  ${BRIGHT_CYAN}Would you like to install missing dependencies automatically?${RESET}"
    echo -e "  ${DIM}(This may take several minutes depending on your internet connection)${RESET}"
    echo ""
    echo -ne "  ${BRIGHT_WHITE}${BOLD}Proceed? [Y/n]:${RESET} "
    read -r response
    
    if [[ "$response" =~ ^[Nn]$ ]]; then
        echo ""
        echo -e "  ${YELLOW}Installation cancelled.${RESET}"
        echo -e "  ${DIM}You can run this script again anytime.${RESET}"
        echo ""
        exit 0
    fi
    
    # ========================================================================
    # STEP 4: Install missing dependencies
    # ========================================================================
    print_section "${ICON_ROCKET} Installing Dependencies"
    
    # Install Homebrew first (if missing) as it's needed for other packages
    if [[ " ${missing_deps[*]} " =~ " homebrew " ]]; then
        install_homebrew
        # Refresh brew path
        if [[ $(uname -m) == 'arm64' ]]; then
            eval "$(/opt/homebrew/bin/brew shellenv)"
        else
            eval "$(/usr/local/bin/brew shellenv)"
        fi
    fi
    
    # Install other dependencies
    for dep in "${missing_deps[@]}"; do
        case $dep in
            homebrew) ;; # Already handled above
            git) install_git ;;
            node) install_node ;;
            rust) install_rust ;;
            circom) install_circom ;;
            cmake) install_cmake ;;
            dos2unix) install_dos2unix ;;
            bun) install_bun ;;
        esac
    done
    
    # ========================================================================
    # STEP 5: Verify installation
    # ========================================================================
    print_section "${ICON_CHECK} Verifying Installation"
    
    local all_success=true
    
    # Verify Homebrew
    homebrew_ver=$(get_homebrew_status)
    if [[ -n "$homebrew_ver" ]]; then
        print_status "installed" "homebrew" "($homebrew_ver)"
    else
        print_status "error" "homebrew" "(installation failed)"
        all_success=false
    fi
    
    # Verify Git
    git_ver=$(get_git_status)
    if [[ -n "$git_ver" ]]; then
        print_status "installed" "git" "($git_ver)"
    else
        print_status "error" "git" "(installation failed)"
        all_success=false
    fi
    
    # Verify Node.js
    node_ver=$(get_node_status)
    if [[ -n "$node_ver" ]]; then
        print_status "installed" "node" "($node_ver)"
    else
        print_status "error" "node" "(installation failed)"
        all_success=false
    fi
    
    # Verify npm
    npm_ver=$(get_npm_status)
    if [[ -n "$npm_ver" ]]; then
        print_status "installed" "npm" "($npm_ver)"
    else
        print_status "error" "npm" "(installation failed)"
        all_success=false
    fi
    
    # Verify Rust
    rust_ver=$(get_rust_status)
    if [[ -n "$rust_ver" ]]; then
        print_status "installed" "rust" "($rust_ver)"
    else
        print_status "error" "rust" "(installation failed)"
        all_success=false
    fi
    
    # Verify Cargo
    cargo_ver=$(get_cargo_status)
    if [[ -n "$cargo_ver" ]]; then
        print_status "installed" "cargo" "($cargo_ver)"
    else
        print_status "error" "cargo" "(installation failed)"
        all_success=false
    fi
    
    # Verify Circom
    circom_ver=$(get_circom_status)
    if [[ -n "$circom_ver" ]]; then
        print_status "installed" "circom" "($circom_ver)"
    else
        print_status "error" "circom" "(installation failed)"
        all_success=false
    fi
    
    # Verify CMake
    cmake_ver=$(get_cmake_status)
    if [[ -n "$cmake_ver" ]]; then
        print_status "installed" "cmake" "($cmake_ver)"
    else
        print_status "error" "cmake" "(installation failed)"
        all_success=false
    fi
    
    # Verify dos2unix
    dos2unix_ver=$(get_dos2unix_status)
    if [[ -n "$dos2unix_ver" ]]; then
        print_status "installed" "dos2unix" "($dos2unix_ver)"
    else
        print_status "error" "dos2unix" "(installation failed)"
        all_success=false
    fi
    
    # Verify Bun
    bun_ver=$(get_bun_status)
    if [[ -n "$bun_ver" ]]; then
        print_status "installed" "bun" "(v$bun_ver)"
    else
        print_status "error" "bun" "(installation failed)"
        all_success=false
    fi
    
    # ========================================================================
    # STEP 6: Final message
    # ========================================================================
    echo ""
    echo -e "  ${DIM}────────────────────────────────────────${RESET}"
    echo ""
    
    if [[ "$all_success" == "true" ]]; then
        echo -e "  ${BRIGHT_GREEN}${BOLD}${ICON_DONE} Setup completed successfully!${RESET}"
        echo ""
        echo -e "  ${BRIGHT_CYAN}Next steps:${RESET}"
        echo -e "  ${DIM}1.${RESET} ${WHITE}Restart your terminal${RESET} ${DIM}(to refresh PATH)${RESET}"
        echo -e "  ${DIM}2.${RESET} ${WHITE}Run:${RESET} ${BOLD}./tokamak-cli --install <YOUR_ALCHEMY_API_KEY>${RESET}"
        echo ""
        echo -e "  ${DIM}For more information, see README.md${RESET}"
    else
        echo -e "  ${BRIGHT_YELLOW}${ICON_WARNING} Some installations may have failed.${RESET}"
        echo -e "  ${DIM}Please check the errors above and try installing manually.${RESET}"
        echo ""
        echo -e "  ${BRIGHT_CYAN}Manual installation guides:${RESET}"
        echo -e "  ${DIM}• Node.js:${RESET}  https://nodejs.org/"
        echo -e "  ${DIM}• Rust:${RESET}     https://www.rust-lang.org/tools/install"
        echo -e "  ${DIM}• Circom:${RESET}   https://docs.circom.io/getting-started/installation/"
        echo -e "  ${DIM}• CMake:${RESET}    https://cmake.org/download/"
        echo -e "  ${DIM}• Bun:${RESET}      https://bun.sh/"
    fi
    
    echo ""
}

# Run main function
main "$@"
