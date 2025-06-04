**MPC Ceremony for Tokamak zk-EVM**

This guide provides step-by-step instructions to run the MPC (Multi-Party Computation) tests for Tokamak zk-EVM setup.

⚙️ **Prerequisites**

Before running the MPC ceremony, ensure you follow the main prerequisites of Tokamak zk-EVM. Ensure the frontend is running properly.

📌 Modes

There are two modes available:

🧪 *Testing Mode*: Useful for compatibility checks by setting predefined initial parameters. It basically sets \alpha = 7, x = 3, y = 5 this should be set same in the trusted setup for testing purposes. 

🎲 *Random Mode*: Used for real-world parameter generation with randomly generated parameters.

🛡️ **Phase 1:** Testing Mode

Navigate to the backend directory:
```bash
cd "$pwd/packages/backend"
```
🛠️ **Initialize Phase 1**

This step initializes Phase 1 (takes a few seconds): 

For testing initialization:
```bash
cargo run --release --bin phase1_initialize -- \
  --s-max 128 \
  --mode testing \
  --setup-params-file setupParams.json  \
  --outfolder ./setup/mpc-setup/output \
  --compress true
```

🔄 **Next Contributor Phase-1** (20-30 minutes)

Each next contributor will run:

For testing mode:
```bash
cargo run --release --bin phase1_next_contributor -- --outfolder ./setup/mpc-setup/output --mode testing
```
(for testing purpose run this once as we want to generate the same combined_sigma as trusted setup)

🌐 **Beacon Contribution** (optional - skip this for testing)

Optionally, you can add extra entropy from unpredictable deterministic inputs (like future Bitcoin block hashes):
```bash
cargo run --release --bin phase1_next_contributor -- --outfolder ./setup/mpc-setup/output --mode beacon
```
✅ **Batch Verification**

Each "Next Contributor's execution" includes verification of the previous contributor automatically, but for batch verification of all contributions run:
```bash
cargo run --release --bin verify_phase1_computations -- --outfolder ./setup/mpc-setup/output
```

📝 **Prepare Phase 2**

⚠️ Note: This step can take a significant amount of time (days):
```bash
cargo run --release --bin phase2_prepare -- --outfolder ./setup/mpc-setup/output
```
Alternatively, for testing purpose, use the existing output from the trusted setup. Copy combined_sigma.json from trusted setup.
Rename it as phase2_latest_combined_sigma.json. Paste it into the ./setup/mpc-setup/output folder. 
Note that for testing purpose in trusted setup we basically set \alpha = 7, x = 3, y = 5, \gamma = 1, \delta = 1, \etha = 1.

🔄 **Next Contributor Phase-2** (few minutes each)
```bash
cargo run --release --bin phase2_next_contributor -- --outfolder ./setup/mpc-setup/output --mode random
```
**CRC output** is the *phase2_latest_combined_sigma.json* file. We use the same structure with Tokamak zk-EVM trusted set-up output.
Now use "phase2_latest_combined_sigma.json" to check Tokamak zk-EVM Prove and Verify.

💡 Switching to Random Mode

To use Random Mode, simply change the mode parameter to --mode random

This ensures randomness in the parameter generation required for actual deployments.