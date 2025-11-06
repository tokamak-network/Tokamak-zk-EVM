# 🚀MPC Ceremony Guidlines for Tokamak zk-EVM

This guide provides step-by-step instructions to run the MPC (Multi-Party Computation) ceremony for Tokamak zk-EVM setup.

⚙️ Prerequisites

Before running the MPC ceremony, ensure you follow the [prerequisites](https://github.com/tokamak-network/Tokamak-zk-EVM/blob/main/README.md) of Tokamak zk-EVM (at least until end of step 4). Ensure the frontend is running properly.
Install openSSL on your system. 

🛡️ **Phase 1:**
Navigate to the backend directory:
```bash
cd "$pwd/packages/backend"
```

🛠️ **Initialize Phase 1**

This step initializes Phase 1 (takes a few seconds): 
Here replace the **blockhash** value with a data that is not predictable inadvance. 
For initialization (compressed form):
```bash
 cargo run --release --bin phase1_initialize -- \
  --s-max 512 \
  --mode testing \
  --setup-params-file setupParams.json  \
  --outfolder ./setup/mpc-setup/output \
  --compress false
```

## Options:
**--s-max** *value* : sets s_max value to another integer (for testing it should be min 128)
**--mode** *random/testin*g: Use **random** for actual MPC ceremony, **testing** for testing mode.
**--setup-params-file** *setupParams.json*: Takes input parameters file.
**--outfolder** *./setup/mpc-setup/output* : Defines the folder to write the output files.
**--compress** *true/false*: **true** outputs EC points in compressed form, **false** outputs EC points in uncompressed form.

📌 In random initialize mode, it prompts to enter a blockhash for an unpredictable input. Give a hash output of a block (eg. Bitcoin block hash https://www.blockchain.com/explorer/blocks/btc/).
It should be *64 hexadecimal characters* (eg: for 901,620th Bitcoin Block
0000000000000000000111043d2144755ed8bdf0c6a91fa292d3e544ebee963b)

🔄 **Next Contributor Phase-1** (~60 minutes)

Each next contributor in Phase-1 runs *phase1_next_contributor*.
For testing mode run:
```bash
cargo run --release --bin phase1_next_contributor -- --outfolder ./setup/mpc-setup/output --mode testing
```
📌 For testing purpose run this once as we want to generate the same combined_sigma as trusted setup.
For a real MPC setup set **--mode random**.

🌐 **Beacon Contribution** (optional)

Optionally, you can add extra entropy from unpredictable deterministic inputs (like future Bitcoin block hashes):
```bash
cargo run --release --bin phase1_next_contributor -- --outfolder ./setup/mpc-setup/output --mode beacon
```

✅ **Phase-1 Batch Verification** (30 mins to a couple of hours depending on the number of contributors)

Each "Next Contributor's execution" already includes verification of the previous contributor automatically, but for batch verification of all contributions run:
```bash
cargo run --release --bin phase1_batch_verify -- --outfolder ./setup/mpc-setup/output
```

📝 **Prepare Phase-2**

For testing, start with running the following once to generate *phase2_acc_0.json* to be able to prepare phase-2 initial files:
```bash
cargo run --release --bin phase2_testing_prepare
```
📌Here for testing s_max is set to 128.

The following starts the prepare phase-2.
⚠️ Note: This step can take a significant amount of time (days):
```bash
cargo run --release --bin phase2_prepare -- --outfolder ./setup/mpc-setup/output
```
📌 When it prompts *Enter the last contributor's index* please type the *index* i of the last phase1_acc_i.json file generated in Phase-1. You can skip this for testing as we have the required file generated in *phase2_testing_prepare*.

🔄 **Next Contributor Phase-2**
Each next contributor in Phase-2 runs:
```bash
cargo run --release --bin phase2_next_contributor -- --outfolder ./setup/mpc-setup/output --mode random
```

✅ **Phase-2 Batch Verification** (30 mins to a couple of hours based on the number participants)
Each "Next Contributor's execution" includes verification of the previous contributor automatically, but for batch verification of all contributions run:
```bash
cargo run --release --bin phase2_batch_verify -- --outfolder ./setup/mpc-setup/output
```

📝 **Generate final output files**
Run this code once to generate final outputs: 
```bash
cargo run --release --bin phase2_gen_files -- --outfolder ./setup/mpc-setup/output
```
When it prompts *Enter the last contributor's index* please type the *index* i of the last *phase2_acc_i.json* file generated in Phase-1.
The final output files are: "sigma_preprocess.json", "sigma_verify.json" and "combined_sigma.json"

**CRC output** is the *combined_sigma.json* file.