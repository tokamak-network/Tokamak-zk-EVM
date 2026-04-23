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
    echo "  ║    ▀█▀ █▀█ █▄▀ ▄▀█ █▀▄▀█ ▄▀█ █▄▀ ─ ▀█ █▄▀ ─ █▀▀ █░█ █▀▄▀█      ║"
    echo "  ║    ░█░ █▄█ █░█ █▀█ █░▀░█ █▀█ █░█ ─ █▄ █░█ ─ ██▄ ▀▄▀ █░▀░█      ║"
    echo "  ║                                                                ║"
    echo -e "  ║                 ${BRIGHT_WHITE}Prerequisites Setup for macOS${BRIGHT_CYAN}                  ║"
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
    
    case "$stat_type" in
        "installed")
            echo -e "  ${BRIGHT_GREEN}${ICON_CHECK}${RESET} ${WHITE}${message}${RESET} ${DIM}${details}${RESET}"
            ;;
        "missing")
            echo -e "  ${BRIGHT_RED}${ICON_CROSS}${RESET} ${WHITE}${message}${RESET} ${DIM}(not installed)${RESET}"
            ;;
        "installing")
            echo -e "  ${BRIGHT_YELLOW}${ICON_GEAR}${RESET} ${WHITE}${message}${RESET} ${DIM}${details}${RESET}"
            ;;
        "info")
            echo -e "  ${BRIGHT_CYAN}${ICON_INFO}${RESET} ${WHITE}${message}${RESET} ${DIM}${details}${RESET}"
            ;;
        "warning")
            echo -e "  ${BRIGHT_YELLOW}${ICON_WARNING}${RESET} ${YELLOW}${message}${RESET} ${DIM}${details}${RESET}"
            ;;
        "error")
            echo -e "  ${BRIGHT_RED}${ICON_CROSS}${RESET} ${RED}${message}${RESET} ${DIM}${details}${RESET}"
            ;;
        "success")
            echo -e "  ${BRIGHT_GREEN}${ICON_SPARKLE}${RESET} ${GREEN}${message}${RESET} ${DIM}${details}${RESET}"
            ;;
    esac
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

get_command_path() {
    local command_name=$1
    if command -v "$command_name" &> /dev/null; then
        command -v "$command_name"
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

get_cmake_status() {
    if command -v cmake &> /dev/null; then
        echo "v$(cmake --version | head -n1 | awk '{print $3}')"
    else
        echo ""
    fi
}

get_tar_status() {
    if command -v tar &> /dev/null; then
        tar --version 2>&1 | head -n1
    else
        echo ""
    fi
}

get_unzip_status() {
    if command -v unzip &> /dev/null; then
        unzip -v 2>&1 | head -n1
    else
        echo ""
    fi
}

get_cc_status() {
    get_command_path "cc"
}

get_cxx_status() {
    get_command_path "c++"
}

get_install_name_tool_status() {
    get_command_path "install_name_tool"
}

DEPENDENCIES=(
    "homebrew|Homebrew|get_homebrew_status|install_homebrew|"
    "node|node|get_node_status|install_node|"
    "npm|npm|get_npm_status||node"
    "rust|rust|get_rust_status|install_rust|"
    "cargo|cargo|get_cargo_status||rust"
    "cmake|cmake|get_cmake_status|install_cmake|"
    "tar|tar|get_tar_status||"
    "unzip|unzip|get_unzip_status|install_unzip|"
    "cc|cc|get_cc_status||"
    "cxx|c++|get_cxx_status||"
    "install_name_tool|install_name_tool|get_install_name_tool_status||"
)

MISSING_DEPS=()
INSTALLABLE_DEPS=()
MANUAL_DEPS=()

contains_item() {
    local needle=$1
    shift
    local item
    for item in "$@"; do
        if [[ "$item" == "$needle" ]]; then
            return 0
        fi
    done
    return 1
}

dependency_name() {
    local target_id=$1
    local dep id name status_func installer bundled_with
    for dep in "${DEPENDENCIES[@]}"; do
        IFS='|' read -r id name status_func installer bundled_with <<< "$dep"
        if [[ "$id" == "$target_id" ]]; then
            echo "$name"
            return
        fi
    done
    echo "$target_id"
}

dependency_installer() {
    local target_id=$1
    local dep id name status_func installer bundled_with
    for dep in "${DEPENDENCIES[@]}"; do
        IFS='|' read -r id name status_func installer bundled_with <<< "$dep"
        if [[ "$id" == "$target_id" ]]; then
            echo "$installer"
            return
        fi
    done
    echo ""
}

dependency_bundled_with() {
    local target_id=$1
    local dep id name status_func installer bundled_with
    for dep in "${DEPENDENCIES[@]}"; do
        IFS='|' read -r id name status_func installer bundled_with <<< "$dep"
        if [[ "$id" == "$target_id" ]]; then
            echo "$bundled_with"
            return
        fi
    done
    echo ""
}

collect_missing_dependencies() {
    local dep id name status_func installer bundled_with status
    MISSING_DEPS=()
    for dep in "${DEPENDENCIES[@]}"; do
        IFS='|' read -r id name status_func installer bundled_with <<< "$dep"
        status="$($status_func)"
        if [[ -n "$status" ]]; then
            print_status "installed" "$name" "($status)"
        else
            print_status "missing" "$name"
            MISSING_DEPS+=("$id")
        fi
    done
}

split_installable_dependencies() {
    local id installer bundled_with
    INSTALLABLE_DEPS=()
    MANUAL_DEPS=()
    for id in "${MISSING_DEPS[@]}"; do
        installer="$(dependency_installer "$id")"
        bundled_with="$(dependency_bundled_with "$id")"
        if [[ -n "$installer" ]]; then
            INSTALLABLE_DEPS+=("$id")
        elif [[ -n "$bundled_with" ]] && contains_item "$bundled_with" "${MISSING_DEPS[@]}"; then
            continue
        else
            MANUAL_DEPS+=("$id")
        fi
    done
}

verify_dependencies() {
    local all_success=true
    local dep id name status_func installer bundled_with status
    for dep in "${DEPENDENCIES[@]}"; do
        IFS='|' read -r id name status_func installer bundled_with <<< "$dep"
        status="$($status_func)"
        if [[ -n "$status" ]]; then
            print_status "installed" "$name" "($status)"
        else
            print_status "error" "$name" "(installation failed or manual setup required)"
            all_success=false
        fi
    done

    [[ "$all_success" == "true" ]]
}

# ============================================================================
# INSTALLATION FUNCTIONS
# ============================================================================

refresh_homebrew_path() {
    if [[ -x /opt/homebrew/bin/brew ]]; then
        eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [[ -x /usr/local/bin/brew ]]; then
        eval "$(/usr/local/bin/brew shellenv)"
    fi
}

install_homebrew() {
    print_installing "Homebrew"
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    
    # Add Homebrew to PATH for Apple Silicon
    if [[ $(uname -m) == 'arm64' ]]; then
        echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
        eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
    refresh_homebrew_path
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

install_cmake() {
    print_installing "CMake (via Homebrew)"
    brew install cmake
    print_status "success" "CMake installed successfully!"
}

install_unzip() {
    print_installing "unzip (via Homebrew)"
    brew install unzip
    print_status "success" "unzip installed successfully!"
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
    
    collect_missing_dependencies
    split_installable_dependencies
    
    # ========================================================================
    # STEP 2: Summary
    # ========================================================================
    echo ""
    echo -e "  ${DIM}────────────────────────────────────────${RESET}"
    
    if [[ ${#MISSING_DEPS[@]} -eq 0 ]]; then
        echo ""
        echo -e "  ${BRIGHT_GREEN}${BOLD}${ICON_DONE} All dependencies are installed!${RESET}"
        echo ""
        echo -e "  ${BRIGHT_CYAN}You're ready to use Tokamak zk-EVM.${RESET}"
        echo -e "  ${DIM}Run the installed CLI:${RESET} ${BOLD}tokamak-cli --install${RESET}"
        echo ""
        exit 0
    fi
    
    echo ""
    echo -e "  ${BRIGHT_YELLOW}${ICON_WARNING}${RESET} ${YELLOW}${#MISSING_DEPS[@]} missing dependencies found:${RESET}"
    for dep in "${MISSING_DEPS[@]}"; do
        echo -e "     ${DIM}•${RESET} ${WHITE}$(dependency_name "$dep")${RESET}"
    done
    echo ""

    if [[ ${#MANUAL_DEPS[@]} -gt 0 ]]; then
        echo -e "  ${BRIGHT_YELLOW}${ICON_WARNING}${RESET} ${YELLOW}Manual setup is required for:${RESET}"
        for dep in "${MANUAL_DEPS[@]}"; do
            echo -e "     ${DIM}•${RESET} ${WHITE}$(dependency_name "$dep")${RESET}"
        done
        echo ""
    fi

    if [[ ${#INSTALLABLE_DEPS[@]} -eq 0 ]]; then
        echo -e "  ${DIM}Install the missing manual dependencies and run this script again.${RESET}"
        echo ""
        exit 1
    fi
    
    # ========================================================================
    # STEP 3: Ask for confirmation
    # ========================================================================
    echo -e "  ${BRIGHT_CYAN}Would you like to install auto-installable dependencies?${RESET}"
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
    if contains_item "homebrew" "${INSTALLABLE_DEPS[@]}"; then
        install_homebrew
        refresh_homebrew_path
    fi
    
    # Install other dependencies
    for dep in "${INSTALLABLE_DEPS[@]}"; do
        case $dep in
            homebrew) ;; # Already handled above
            node) install_node ;;
            rust) install_rust ;;
            cmake) install_cmake ;;
            unzip) install_unzip ;;
        esac
    done
    
    # ========================================================================
    # STEP 5: Verify installation
    # ========================================================================
    print_section "${ICON_CHECK} Verifying Installation"
    
    local all_success
    if verify_dependencies; then
        all_success=0
    else
        all_success=1
    fi
    
    # ========================================================================
    # STEP 6: Final message
    # ========================================================================
    echo ""
    echo -e "  ${DIM}────────────────────────────────────────${RESET}"
    echo ""
    
    if [[ "$all_success" -eq 0 ]]; then
        echo -e "  ${BRIGHT_GREEN}${BOLD}${ICON_DONE} Setup completed successfully!${RESET}"
        echo ""
        echo -e "  ${BRIGHT_CYAN}Next steps:${RESET}"
        echo -e "  ${DIM}1.${RESET} ${WHITE}Restart your terminal${RESET} ${DIM}(to refresh PATH)${RESET}"
        echo -e "  ${DIM}2.${RESET} ${WHITE}Run the installed CLI:${RESET} ${BOLD}tokamak-cli --install${RESET}"
        echo -e "  ${DIM}3.${RESET} ${WHITE}Run synthesis with either:${RESET} ${BOLD}tokamak-cli --synthesize <INPUT_DIR>${RESET}"
        echo ""
        echo -e "  ${DIM}For more information, see README.md${RESET}"
    else
        echo -e "  ${BRIGHT_YELLOW}${ICON_WARNING} Some installations may have failed.${RESET}"
        echo -e "  ${DIM}Please check the errors above and try installing manually.${RESET}"
        echo ""
        echo -e "  ${BRIGHT_CYAN}Manual installation guides:${RESET}"
        echo -e "  ${DIM}• Node.js:${RESET}  https://nodejs.org/"
        echo -e "  ${DIM}• Rust:${RESET}     https://www.rust-lang.org/tools/install"
        echo -e "  ${DIM}• CMake:${RESET}    https://cmake.org/download/"
        echo -e "  ${DIM}• Apple developer tools:${RESET} xcode-select --install"
    fi
    
    echo ""
}

# Run main function
main "$@"
