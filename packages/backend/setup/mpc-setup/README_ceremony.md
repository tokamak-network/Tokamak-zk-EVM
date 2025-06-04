**MPC Ceremony for Tokamak zk-EVM**

This guide provides step-by-step instructions to run the MPC (Multi-Party Computation) ceremony for Tokamak zk-EVM setup.

⚙️ Prerequisites

Before running the MPC ceremony, ensure you follow the main prerequisites[View Markdown](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/README.md) of Tokamak zk-EVM. Ensure the frontend is running properly.

🛡️ **Phase 1:**
Navigate to the backend directory:
```bash
cd "$pwd/packages/backend"
```

🛠️ **Initialize Phase 1**

This step initializes Phase 1 (takes a few seconds): 

For initialization (compressed form):
```bash
 cargo run --release --bin phase1_initialize -- \
  --s-max 512 \
  --blockhash 000000000000000000010d25c535f487edea60d3088b0166a627d6e85c3d2d05 \
  --mode random \
  --setup-params-file setupParams.json  \
  --outfolder ./setup/mpc-setup/output \
  --compress true
```
For initialization (uncompressed form):
```bash
 cargo run --release --bin phase1_initialize -- \
  --s-max 512 \
  --blockhash 000000000000000000010d25c535f487edea60d3088b0166a627d6e85c3d2d05 \
  --mode random \
  --setup-params-file setupParams.json  \
  --outfolder ./setup/mpc-setup/output \
  --compress false
```

🔄 **Next Contributor** (40~60 minutes)

Each next contributor will run:
```bash
cargo run --release --bin phase1_next_contributor -- --outfolder ./setup/mpc-setup/output --mode random
```

🌐 Beacon Contribution (optional - skip this for testing)

Optionally, you can add extra entropy from unpredictable deterministic inputs (like future Bitcoin block hashes):
```bash
cargo run --release --bin phase1_next_contributor -- --outfolder ./setup/mpc-setup/output --mode beacon
```

✅ Batch Verification (30mins to a couple of hours based on number participants)

Each "Next Contributor's execution" includes verification of the previous contributor automatically, but for batch verification of all contributions run:
```bash
cargo run --release --bin verify_phase1_computations -- --outfolder ./setup/mpc-setup/output
```

📝 Prepare Phase 2

⚠️ Note: This step can take a significant amount of time (days):
```bash
cargo run --release --bin phase2_prepare -- --outfolder ./setup/mpc-setup/output
```

🔄 Next Contributor Phase 2 (few minutes each)
```bash
cargo run --release --bin phase2_next_contributor -- --outfolder ./setup/mpc-setup/output --mode random
```

**CRC output**: phase2_latest_combined_sigma.json. We use the same structure with Tokamak zk-EVM trusted set-up output.
Now use "phase2_latest_combined_sigma.json" to check Tokamak zk-EVM Prove and Verify.