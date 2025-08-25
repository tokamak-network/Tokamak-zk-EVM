#!/bin/bash

# Local CI/CD Testing Script
# This script simulates the GitHub Actions workflow locally

set -e

echo "🧪 Local CI/CD Testing for Tokamak-zk-EVM"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test functions
test_comment_language() {
    echo -e "${BLUE}🔍 Testing Comment Language Check...${NC}"
    
    # Check for Korean characters in comments
    echo "Checking for Korean characters in code files..."
    
    # Find files with Korean comments
    korean_files=()
    
    # Check TypeScript/JavaScript files
    while IFS= read -r -d '' file; do
        if grep -l "[\u3131-\u3163\uac00-\ud7a3]" "$file" 2>/dev/null | grep -E "(//|/\*)" >/dev/null 2>&1; then
            korean_files+=("$file")
        fi
    done < <(find . -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -print0)
    
    if [ ${#korean_files[@]} -gt 0 ]; then
        echo -e "${RED}❌ Korean comments found in:${NC}"
        for file in "${korean_files[@]}"; do
            echo "  - $file"
        done
        return 1
    else
        echo -e "${GREEN}✅ All comments are in English${NC}"
        return 0
    fi
}

test_tokamak_cli_installation() {
    echo -e "${BLUE}🔧 Testing tokamak-cli Installation...${NC}"
    
    # Check if tokamak-cli exists and is executable
    if [ ! -f "./tokamak-cli" ]; then
        echo -e "${RED}❌ tokamak-cli not found${NC}"
        return 1
    fi
    
    if [ ! -x "./tokamak-cli" ]; then
        echo -e "${YELLOW}⚠️  Making tokamak-cli executable...${NC}"
        chmod +x ./tokamak-cli
    fi
    
    # Test help command
    echo "Testing tokamak-cli --help..."
    if ./tokamak-cli --help >/dev/null 2>&1; then
        echo -e "${GREEN}✅ tokamak-cli is working${NC}"
        return 0
    else
        echo -e "${RED}❌ tokamak-cli --help failed${NC}"
        return 1
    fi
}

test_dependencies() {
    echo -e "${BLUE}📦 Testing Dependencies...${NC}"
    
    # Check Node.js
    if command -v node >/dev/null 2>&1; then
        node_version=$(node --version)
        echo -e "${GREEN}✅ Node.js: $node_version${NC}"
    else
        echo -e "${RED}❌ Node.js not found${NC}"
        return 1
    fi
    
    # Check npm
    if command -v npm >/dev/null 2>&1; then
        npm_version=$(npm --version)
        echo -e "${GREEN}✅ npm: $npm_version${NC}"
    else
        echo -e "${RED}❌ npm not found${NC}"
        return 1
    fi
    
    # Check if package.json exists in synthesizer
    if [ -f "packages/frontend/synthesizer/package.json" ]; then
        echo -e "${GREEN}✅ Synthesizer package.json found${NC}"
    else
        echo -e "${RED}❌ Synthesizer package.json not found${NC}"
        return 1
    fi
    
    return 0
}

test_file_structure() {
    echo -e "${BLUE}📁 Testing File Structure...${NC}"
    
    required_files=(
        "tokamak-cli"
        "packages/frontend/qap-compiler"
        "packages/frontend/synthesizer"
        "packages/backend"
        ".github/workflows/required-tests.yml"
        ".github/workflows/comment-language-check.yml"
    )
    
    missing_files=()
    
    for file in "${required_files[@]}"; do
        if [ ! -e "$file" ]; then
            missing_files+=("$file")
        fi
    done
    
    if [ ${#missing_files[@]} -gt 0 ]; then
        echo -e "${RED}❌ Missing required files:${NC}"
        for file in "${missing_files[@]}"; do
            echo "  - $file"
        done
        return 1
    else
        echo -e "${GREEN}✅ All required files present${NC}"
        return 0
    fi
}

test_workflow_syntax() {
    echo -e "${BLUE}📝 Testing Workflow Syntax...${NC}"
    
    # Check if act can parse workflows
    if command -v act >/dev/null 2>&1; then
        echo "Checking workflow syntax with act..."
        if act --list >/dev/null 2>&1; then
            echo -e "${GREEN}✅ Workflow syntax is valid${NC}"
            return 0
        else
            echo -e "${RED}❌ Workflow syntax errors detected${NC}"
            act --list
            return 1
        fi
    else
        echo -e "${YELLOW}⚠️  act not available, skipping syntax check${NC}"
        return 0
    fi
}

# Main test execution
main() {
    echo "Starting local CI/CD tests..."
    echo ""
    
    tests=(
        "test_file_structure"
        "test_dependencies" 
        "test_tokamak_cli_installation"
        "test_comment_language"
        "test_workflow_syntax"
    )
    
    passed=0
    failed=0
    
    for test in "${tests[@]}"; do
        echo ""
        if $test; then
            ((passed++))
        else
            ((failed++))
        fi
    done
    
    echo ""
    echo "=========================================="
    echo -e "${BLUE}📊 Test Results Summary${NC}"
    echo "=========================================="
    echo -e "${GREEN}✅ Passed: $passed${NC}"
    echo -e "${RED}❌ Failed: $failed${NC}"
    echo ""
    
    if [ $failed -eq 0 ]; then
        echo -e "${GREEN}🎉 All tests passed! CI/CD setup looks good.${NC}"
        echo ""
        echo "Next steps:"
        echo "1. Commit your changes"
        echo "2. Create a PR to test the actual GitHub Actions"
        echo "3. Set up required secrets in GitHub repository settings"
        return 0
    else
        echo -e "${RED}🚫 Some tests failed. Please fix the issues before proceeding.${NC}"
        return 1
    fi
}

# Run main function
main "$@"
