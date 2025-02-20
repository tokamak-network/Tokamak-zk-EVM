.PHONY: all build test clean

# Default command
all: build

# Build commands
build: build-buildqap build-mpc build-tokamak

build-buildqap:
	@echo "Building buildQAP..."
	cd packages/buildQAP && npm install && npm run build

build-mpc:
	@echo "Building MPC..."
	cd packages/mpc/rust-src && cargo build
	cd packages/mpc/contracts && forge build

build-tokamak:
	@echo "Building Tokamak zk-SNARK..."
	cd packages/tokamak-zk-snark/rust-src && cargo build
	cd packages/tokamak-zk-snark/contracts && forge build

# Test commands
test: test-buildqap test-mpc test-tokamak

test-buildqap:
	@echo "Testing buildQAP..."
	cd packages/buildQAP && npm test

test-mpc:
	@echo "Testing MPC..."
	cd packages/mpc/rust-src && cargo test
	cd packages/mpc/contracts && forge test

test-tokamak:
	@echo "Testing Tokamak zk-SNARK..."
	cd packages/tokamak-zk-snark/rust-src && cargo test
	cd packages/tokamak-zk-snark/contracts && forge test

# Clean commands
clean:
	@echo "Cleaning all packages..."
	cd packages/buildQAP && npm run clean
	cd packages/mpc/rust-src && cargo clean
	cd packages/tokamak-zk-snark/rust-src && cargo clean
	find . -name "node_modules" -type d -prune -exec rm -rf '{}' +