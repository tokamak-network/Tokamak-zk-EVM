# GPU Analysis - Multiple Transactions

This directory contains tools for running GPU analysis on multiple Ethereum transactions to understand GPU utilization patterns during zero-knowledge proof generation.

## Overview

The workflow consists of three main steps:

1. **Fetch Random Transactions** - Collect random transaction hashes from Etherscan
2. **Run GPU Analysis** - Execute the proving pipeline on each transaction while monitoring GPU usage
3. **Analyze Results** - Generate statistics and visualizations from the collected data

## Prerequisites

### System Requirements

- NVIDIA GPU with CUDA support
- `nvidia-smi` command available
- Sufficient disk space for proof artifacts (several GB)

### Software Requirements

- Python 3.8+
- Node.js and npm
- Bash shell
- Built backend binaries (`preprocess`, `prove`, `verify`)

### Python Dependencies

Install required Python packages:

```bash
pip install requests matplotlib numpy
```

Or if you have a virtual environment (recommended):

```bash
cd gpu_analysis_mul_tx
python3 -m venv venv
source venv/bin/activate
pip install requests matplotlib numpy
```

## Quick Start

### Step 1: Fetch Random Transactions

Fetch 500 random transaction hashes from recent Ethereum blocks:

```bash
python3 fetch_random_txs.py --count 500 --output transactions.json
```

**With Etherscan API key (recommended for better rate limits):**

```bash
python3 fetch_random_txs.py --count 500 --api-key YOUR_API_KEY --output transactions.json
```

Get a free API key at: https://etherscan.io/apis

**Note:** This script uses Etherscan API v2 endpoint. If you encounter deprecation warnings, the script has been updated to handle them properly.

**Options:**
- `--count N` - Number of transactions to fetch (default: 500)
- `--output FILE` - Output file path (default: transactions.json)
- `--api-key KEY` - Etherscan API key (optional but recommended)
- `--max-blocks N` - Number of recent blocks to sample from (default: 1000)
- `--chainid ID` - Chain ID for Etherscan API v2 (default: 1 for Ethereum Mainnet, 11155111 for Sepolia)

**Output:**
- `transactions.json` - JSON file with transaction data
- `transactions.txt` - Plain text file (one transaction per line)

### Step 2: Run GPU Analysis

Execute the proving pipeline on all fetched transactions with GPU monitoring:

```bash
chmod +x run_gpu_analysis_batch.sh
./run_gpu_analysis_batch.sh transactions.json
```

**Custom output directory:**

```bash
./run_gpu_analysis_batch.sh transactions.json ./my_results
```

**What it does:**
- Runs synthesizer, preprocess, prove, and verify for each transaction
- Monitors GPU usage (utilization, memory, temperature, power) every 100ms
- Records timing for each stage
- Tracks success/failure for each transaction
- Saves individual results and consolidated data

**Output Structure:**

```
batch_results/
├── summary_TIMESTAMP.csv                    # Summary of all transactions
├── consolidated_gpu_data_TIMESTAMP.csv      # All GPU data combined
├── batch_run_TIMESTAMP.log                  # Detailed execution log
└── individual_results/
    ├── tx_1/
    │   ├── transaction_hash.txt
    │   ├── gpu_usage.csv
    │   ├── prove.log
    │   ├── preprocess/
    │   └── prove/
    ├── tx_2/
    └── ...
```

### Step 3: Analyze Results

Generate statistics and visualizations:

```bash
python3 analyze_batch_results.py batch_results/summary_*.csv batch_results/consolidated_gpu_data_*.csv
```

**Custom output directory:**

```bash
python3 analyze_batch_results.py summary.csv gpu_data.csv --output-dir ./analysis_output
```

**Options:**
- `--output-dir DIR` - Directory to save plots (default: same as summary file)
- `--max-timeline-plots N` - Maximum number of detailed timeline plots (default: 10)

**Generated Files:**

1. **ANALYSIS_REPORT.md** - Comprehensive markdown report with statistics
2. **timing_distribution.png** - Timing analysis across transactions (PRIMARY - proving time focus)
3. **gpu_utilization.png** - GPU utilization patterns per transaction
4. **correlation_analysis.png** - Correlation between timing and GPU usage
5. **gpu_aggregated_metrics.png** - Aggregated GPU statistics across all transactions (mean, std dev, distributions)

## Understanding the Results

### Summary CSV Format

The `summary_*.csv` file contains one row per transaction with these columns:

| Column | Description |
|--------|-------------|
| tx_number | Sequential transaction number (1-based) |
| tx_hash | Ethereum transaction hash |
| status | success or failed |
| synth_time_s | Synthesizer execution time |
| preprocess_time_s | Preprocess execution time |
| prove_time_s | Prove execution time |
| verify_time_s | Verify execution time |
| total_time_s | Total execution time |
| avg_gpu_util_% | Average GPU utilization percentage |
| max_gpu_util_% | Peak GPU utilization percentage |
| avg_mem_util_% | Average GPU memory utilization |
| max_mem_util_% | Peak GPU memory utilization |
| error_message | Error description (if failed) |

### Consolidated GPU Data Format

The `consolidated_gpu_data_*.csv` file contains GPU samples from all transactions:

| Column | Description |
|--------|-------------|
| tx_number | Transaction number |
| tx_hash | Transaction hash |
| timestamp | Sample timestamp |
| gpu_util_% | GPU utilization percentage |
| memory_util_% | GPU memory utilization percentage |
| memory_used_MiB | GPU memory used in MiB |
| memory_total_MiB | Total GPU memory in MiB |
| temperature_C | GPU temperature in Celsius |
| power_W | GPU power draw in Watts |
| sm_clock_MHz | SM clock frequency in MHz |
| mem_clock_MHz | Memory clock frequency in MHz |

### Key Metrics to Analyze

1. **Success Rate** - Percentage of transactions that completed successfully
2. **GPU Utilization** - How efficiently the GPU is being used
3. **Stage Timing** - Which stage (synth, preprocess, prove, verify) takes the most time
4. **Correlation** - Relationship between execution time and GPU utilization
5. **Consistency** - Variance in performance across different transactions

## Advanced Usage

### Filtering Specific Transaction Types

You can manually edit `transactions.txt` to include only specific types of transactions:

```bash
# Fetch transactions
python3 fetch_random_txs.py --count 1000 --output all_txs.txt

# Filter for specific transactions (e.g., based on manual inspection)
grep -E "0xabcd|0x1234" all_txs.txt > filtered_txs.txt

# Run analysis
./run_gpu_analysis_batch.sh filtered_txs.txt
```

### Running Subsets

To test with a smaller subset first:

```bash
# Take first 10 transactions
head -10 transactions.txt > test_txs.txt
./run_gpu_analysis_batch.sh test_txs.txt ./test_results
```

### Resuming Failed Transactions

The batch script creates individual directories for each transaction. To retry failed transactions:

1. Check `summary_*.csv` for failed transactions
2. Extract their hashes
3. Create a new transaction file with only failed hashes
4. Run the batch script again

### Analyzing Individual Transactions

To analyze a single transaction in detail:

```bash
# Extract GPU data for transaction 5
awk -F',' 'NR==1 || $1==5' batch_results/consolidated_gpu_data_*.csv > tx5_gpu.csv

# Use the existing plot script from gpu_analysis
cd ../gpu_analysis
python3 plot_gpu_usage.py ../gpu_analysis_mul_tx/tx5_gpu.csv
```

## Troubleshooting

### No transactions fetched

- Check your internet connection
- Verify Etherscan API is accessible
- Try using an API key for better rate limits
- Increase `--max-blocks` parameter

### GPU monitoring fails

- Verify `nvidia-smi` is installed and working: `nvidia-smi`
- Check NVIDIA drivers are properly installed
- Ensure you have CUDA-capable GPU

### Synthesizer/Prove failures

- Check `batch_run_*.log` for detailed error messages
- Verify backend binaries are built: `ls ../packages/backend/target/release/`
- Ensure RPC_URL is configured in `.env`
- Check disk space for proof artifacts

### Out of memory errors

- Reduce the batch size (process fewer transactions)
- Close other GPU-intensive applications
- Monitor GPU memory: `watch -n 1 nvidia-smi`

### Python dependencies missing

```bash
pip install requests matplotlib numpy
```

### Script permission errors

```bash
chmod +x run_gpu_analysis_batch.sh
chmod +x fetch_random_txs.py
chmod +x analyze_batch_results.py
```

## Performance Tips

1. **Use Etherscan API Key** - Significantly faster transaction fetching
2. **Run during off-hours** - Less RPC rate limiting
3. **Batch by size** - Start with 10-50 transactions to test, then scale up
4. **Monitor resources** - Keep an eye on disk space and GPU memory
5. **Parallel analysis** - You can run multiple analysis scripts on the same data simultaneously

## Output File Sizes

Approximate disk space requirements:

- Each transaction proof artifacts: ~100-500 MB
- GPU CSV per transaction: ~1-5 MB
- Summary CSV: < 1 MB
- Plots: ~1-5 MB each
- Logs: ~10-100 MB for batch run

**For 500 transactions**: Plan for at least 50-250 GB of free disk space.

## Integration with Existing GPU Analysis

This toolset complements the existing `gpu_analysis/` directory:

- **gpu_analysis/** - Single transaction analysis, detailed profiling
- **gpu_analysis_mul_tx/** - Multi-transaction batch analysis, statistical patterns

Use them together:
1. Run batch analysis to identify interesting patterns
2. Use single transaction analysis for deep dives on specific cases

## Example Workflow

Complete example from start to finish:

```bash
# 1. Setup environment
cd gpu_analysis_mul_tx
python3 -m venv venv
source venv/bin/activate
pip install requests matplotlib numpy

# 2. Fetch transactions
python3 fetch_random_txs.py --count 100 --api-key YOUR_KEY --output txs.json

# 3. Run GPU analysis (this will take a while)
chmod +x run_gpu_analysis_batch.sh
./run_gpu_analysis_batch.sh txs.json ./results

# 4. Analyze results
python3 analyze_batch_results.py results/summary_*.csv results/consolidated_gpu_data_*.csv

# 5. View results
cat results/ANALYSIS_REPORT.md
ls results/*.png
```

## Citation

If you use this toolset in your research, please cite the Tokamak Network zk-EVM project.

## Contributing

Contributions are welcome! Please submit issues or pull requests to the main repository.

## License

See the main repository LICENSE file.
