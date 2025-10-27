# Tokamak Groth16 zkSNARK Implementation
# Makefile for building circuits, trusted setup, prover, and verifier

.PHONY: all clean circuits trusted-setup prover verifier test compile-circuits setup-demo trusted-setup-only

# Default target
all: circuits trusted-setup prover verifier

# Clean all build artifacts
clean:
	@echo "Cleaning build artifacts..."
	rm -rf build/
	rm -rf target/
	rm -rf trusted-setup/target/
	rm -rf trusted-setup/output/
	rm -rf prover/target/
	rm -rf verifier/target/
	rm -f *.bin *.json *.ptau
	@echo "Clean completed"

# Compile circuits
circuits:
	@echo "Compiling Groth16 circuits..."
	mkdir -p build
	cd circuits && ./circom-2.0 main_optimized.circom --r1cs --wasm --sym --output ../build/
	@echo "Circuit compilation completed"

# Build trusted setup
trusted-setup:
	@echo "Building trusted setup..."
	cd trusted-setup && cargo build --release
	@echo "Trusted setup build completed"

# Build prover
prover: trusted-setup
	@echo "Building prover..."
	cd prover && cargo build --release
	@echo "Prover build completed"

# Build verifier
verifier: trusted-setup prover
	@echo "Building verifier..."
	cd verifier && cargo build --release
	@echo "Verifier build completed"

# Compile circuits only
compile-circuits: circuits

# Run trusted setup demo (full ceremony with circuits)
setup-demo: circuits trusted-setup
	@echo "Running complete trusted setup ceremony..."
	@echo "Creating output directory..."
	mkdir -p trusted-setup/output
	cd trusted-setup && cargo run --release --bin trusted_setup_demo
	@echo "Trusted setup demo completed"
	@echo "Output files generated in trusted-setup/output/:"
	@ls -la trusted-setup/output/ 2>/dev/null || echo "  (no files generated - check for errors above)"

# Run trusted setup only (Powers of Tau generation without circuit)
trusted-setup-only: trusted-setup
	@echo "Running Powers of Tau generation (without circuit-specific setup)..."
	@echo "Creating output directory..."
	mkdir -p trusted-setup/output
	cd trusted-setup && cargo run --release --bin trusted_setup_demo
	@echo "Powers of Tau generation completed"
	@echo "Note: Circuit-specific keys require compiled R1CS file (run 'make setup-demo' for full ceremony)"
	@echo "Output files generated in trusted-setup/output/:"
	@ls -la trusted-setup/output/ 2>/dev/null || echo "  (no files generated - check for errors above)"

# Run all tests
test:
	@echo "Running all tests..."
	cd trusted-setup && cargo test
	cd prover && cargo test
	cd verifier && cargo test
	@echo "All tests completed"

# Run specific component tests
test-trusted-setup:
	cd trusted-setup && cargo test

test-prover:
	cd prover && cargo test

test-verifier:
	cd verifier && cargo test

# Build documentation
docs:
	@echo "Building documentation..."
	cd trusted-setup && cargo doc --no-deps
	cd prover && cargo doc --no-deps
	cd verifier && cargo doc --no-deps
	@echo "Documentation build completed"

# Show circuit statistics
circuit-stats: circuits
	@echo "Circuit Statistics:"
	@echo "==================="
	@if [ -f build/main_optimized.r1cs ]; then \
		echo "R1CS file size: $$(du -h build/main_optimized.r1cs | cut -f1)"; \
	fi
	@if [ -f build/main_optimized.sym ]; then \
		echo "Symbol file size: $$(du -h build/main_optimized.sym | cut -f1)"; \
	fi
	@if [ -d build/main_optimized_js ]; then \
		echo "WASM size: $$(du -sh build/main_optimized_js | cut -f1)"; \
	fi

# Help target
help:
	@echo "Tokamak Groth16 zkSNARK Build System"
	@echo "===================================="
	@echo ""
	@echo "Available targets:"
	@echo "  all                - Build everything (circuits, trusted-setup, prover, verifier)"
	@echo "  clean              - Clean all build artifacts including output folder"
	@echo "  circuits           - Compile Groth16 circuits"
	@echo "  trusted-setup      - Build trusted setup component"
	@echo "  prover             - Build prover component"
	@echo "  verifier           - Build verifier component"
	@echo "  setup-demo         - Run complete trusted setup ceremony (with circuits)"
	@echo "  trusted-setup-only - Run Powers of Tau generation only (no circuit required)"
	@echo "  test               - Run all tests"
	@echo "  test-*             - Run specific component tests"
	@echo "  docs               - Build documentation"
	@echo "  circuit-stats      - Show compiled circuit statistics"
	@echo "  help               - Show this help message"
	@echo ""
	@echo "Output files are generated in trusted-setup/output/"