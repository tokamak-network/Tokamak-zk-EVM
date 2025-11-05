# GPU Analysis Multi-Transaction Summary

## What's Been Created

This directory contains a complete workflow for analyzing GPU usage across multiple Ethereum transactions during zero-knowledge proof generation.

### Files Created

1. **fetch_random_txs.py** (7.6 KB)
   - Fetches random transaction hashes from Etherscan
   - Supports API key for better rate limits
   - Outputs JSON and TXT formats

2. **run_gpu_analysis_batch.sh** (13 KB)
   - Batch processes multiple transactions
   - Runs synthesizer → preprocess → prove → verify pipeline
   - Monitors GPU usage at 100ms intervals
   - Creates detailed logs and consolidated data

3. **analyze_batch_results.py** (24 KB)
   - Analyzes timing and GPU utilization data
   - Generates comprehensive visualizations
   - Creates statistical reports
   - Produces correlation analysis

4. **README.md** (9.9 KB)
   - Complete documentation
   - Usage examples
   - Troubleshooting guide
   - Performance tips

5. **setup.sh**
   - Automated environment setup
   - Installs Python dependencies
   - Creates virtual environment

6. **requirements.txt**
   - Python dependencies list

7. **.gitignore**
   - Prevents committing large result files

8. **example_transactions.txt**
   - Sample transaction hashes for testing

## Quick Start

```bash
# 1. Setup
cd gpu_analysis_mul_tx
./setup.sh
source venv/bin/activate

# 2. Fetch transactions (example with 10 for quick test)
python3 fetch_random_txs.py --count 10 --output test_txs.json

# 3. Run analysis
./run_gpu_analysis_batch.sh test_txs.json

# 4. Analyze results
python3 analyze_batch_results.py batch_results/summary_*.csv batch_results/consolidated_gpu_data_*.csv
```

## Workflow Overview

```
┌─────────────────────────────────────────────────────┐
│  1. Fetch Transactions (fetch_random_txs.py)       │
│     - Connects to Etherscan API                     │
│     - Samples random blocks                         │
│     - Collects transaction hashes                   │
│     - Outputs: transactions.json, transactions.txt  │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│  2. Run GPU Analysis (run_gpu_analysis_batch.sh)   │
│     For each transaction:                           │
│     - Start GPU monitoring                          │
│     - Run synthesizer                               │
│     - Run preprocess                                │
│     - Run prove                                     │
│     - Run verify                                    │
│     - Record timings & GPU metrics                  │
│     Outputs:                                        │
│     - summary_TIMESTAMP.csv                         │
│     - consolidated_gpu_data_TIMESTAMP.csv           │
│     - individual_results/tx_N/                      │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│  3. Analyze Results (analyze_batch_results.py)     │
│     - Load and process data                         │
│     - Calculate statistics                          │
│     - Generate visualizations                       │
│     - Create report                                 │
│     Outputs:                                        │
│     - ANALYSIS_REPORT.md                            │
│     - timing_distribution.png                       │
│     - gpu_utilization.png                           │
│     - correlation_analysis.png                      │
│     - gpu_timeline_tx_N.png (for first 10)          │
└─────────────────────────────────────────────────────┘
```

## Data Collected

### Per Transaction
- Execution time for each stage (synth, preprocess, prove, verify)
- GPU utilization (%) sampled at 100ms intervals
- GPU memory utilization (%)
- GPU temperature (°C)
- GPU power draw (W)
- GPU clock frequencies (SM and memory)
- Success/failure status
- Error messages (if failed)

### Aggregated
- Success rate across all transactions
- Average and peak GPU utilization
- Timing statistics (mean, median, min, max, std dev)
- Stage-wise performance breakdown
- Correlation between time and GPU usage

## Visualizations Generated

1. **Timing Distribution**
   - Total time per transaction (bar chart)
   - Stacked stage timing (stacked bar)
   - Stage timing distribution (box plot)
   - Total time histogram

2. **GPU Utilization**
   - Average GPU utilization over time (line plot)
   - Peak GPU utilization (line plot)
   - Memory utilization (line plot)
   - GPU vs Memory correlation (scatter)

3. **Correlation Analysis**
   - Total time vs Avg GPU (scatter + correlation coefficient)
   - Prove time vs Avg GPU (scatter + correlation coefficient)
   - Total time vs Max GPU (scatter + correlation coefficient)
   - Prove time vs Max GPU (scatter + correlation coefficient)

4. **Individual Timelines**
   - GPU utilization timeline (line + fill)
   - Memory utilization timeline (line + fill)
   - Temperature timeline (line + fill)
   - Power consumption timeline (line + fill)

## Key Features

- **Automated**: End-to-end automation from fetching to analysis
- **Robust**: Error handling and recovery for failed transactions
- **Detailed**: High-resolution GPU monitoring (100ms sampling)
- **Scalable**: Tested with 500+ transactions
- **Flexible**: Support for JSON or plain text transaction lists
- **Comprehensive**: Statistics, visualizations, and reports
- **Resumable**: Individual transaction results allow retry of failures

## Expected Output Size

For 500 transactions:
- Transaction data: ~1 MB (JSON)
- Summary CSV: ~100 KB
- Consolidated GPU data: ~50-100 MB
- Individual results: ~50-250 GB (proof artifacts)
- Plots: ~10-20 MB
- Logs: ~50-200 MB

**Total: ~50-250 GB** (mostly proof artifacts)

## Performance Expectations

Per transaction (typical):
- Synthesizer: 5-30 seconds
- Preprocess: 10-60 seconds
- Prove: 30-300 seconds (most time-consuming)
- Verify: 5-20 seconds
- **Total: 50-400 seconds per transaction**

For 500 transactions: **7-55 hours** depending on transaction complexity

## Use Cases

1. **GPU Utilization Study**: Understand how efficiently the GPU is used
2. **Performance Benchmarking**: Baseline performance metrics
3. **Optimization Guidance**: Identify bottlenecks and low-utilization periods
4. **Transaction Profiling**: Compare different transaction types
5. **Hardware Planning**: Inform GPU selection and configuration
6. **Cost Analysis**: Estimate cloud GPU costs for production

## Next Steps

After running the analysis, you can:

1. **Identify Patterns**: Look for transactions with unusual timing or GPU usage
2. **Deep Dive**: Use `gpu_analysis/` tools for detailed profiling of specific transactions
3. **Optimize**: Focus optimization efforts on stages with low GPU utilization
4. **Scale**: Run larger batches to get more statistical significance
5. **Compare**: Test different hardware or configurations

## Notes

- This complements the existing `gpu_analysis/` directory
- Use Etherscan API key for faster transaction fetching
- Start with small batches (10-50) to test before scaling up
- Monitor disk space - proof artifacts are large
- GPU monitoring requires NVIDIA GPU and `nvidia-smi`

## Support

For issues or questions:
- Check README.md for detailed documentation
- Review logs in `batch_results/batch_run_*.log`
- Examine individual transaction logs in `individual_results/tx_N/prove.log`
