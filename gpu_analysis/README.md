# GPU Analysis Tools

This directory contains tools for monitoring and analyzing GPU usage during proof generation in the Tokamak-zk-EVM system.

## Overview

The GPU analysis toolkit provides:
- **GPU monitoring scripts** - Monitor GPU utilization, memory, temperature, and power during proof generation
- **Visualization tools** - Generate plots and charts from GPU usage data
- **Analysis reports** - Pre-generated analysis reports and documentation

## Directory Contents

```
gpu_analysis/
├── README.md                              # This file
├── run-prove-with-gpu-monitoring.sh       # Main script to run prove with GPU monitoring
├── run-synthesizer.sh                     # Run synthesizer to generate circuit
├── plot_gpu_usage.py                      # Python script to visualize GPU usage
├── setup-python-env.sh                    # Setup Python environment for plotting
├── GPU_UTILIZATION_ANALYSIS_REPORT.md     # Detailed GPU utilization analysis report
├── COMPLETE_WORKFLOW.md                   # Complete workflow documentation
├── DIRECT_PROVE_GUIDE.md                  # Direct prove guide
├── GPU_MONITORING_README.md               # GPU monitoring setup guide
├── results/                               # Output directory (created automatically)
│   ├── gpu_usage_*.csv                    # GPU usage data logs
│   ├── prove_*.log                        # Prove execution logs
│   ├── gpu_usage_*.png                    # Generated plots
│   └── transaction_hash.txt               # Transaction hash being processed
└── images/                                # Analysis images (if any)
```

## Quick Start

### Prerequisites

1. **NVIDIA GPU with CUDA support**
   ```bash
   nvidia-smi  # Verify GPU is accessible
   ```

2. **Python 3.8+** (for visualization)
   ```bash
   python3 --version
   ```

3. **Tokamak-zk-EVM built with release profile**
   ```bash
   cd /<your-route>/Tokamak-zk-EVM/packages/backend
   cargo build --release
   ```

### Setup (One-time)

1. **Setup Python environment** (required for visualization):
   ```bash
   cd /<your-route>/Tokamak-zk-EVM/gpu_analysis
   ./setup-python-env.sh
   ```

   This will:
   - Create a Python virtual environment in `venv/`
   - Install required packages (matplotlib, numpy)
   - Verify the installation

## Usage

### Running Proof Generation with GPU Monitoring

The main script runs the complete proof generation pipeline while monitoring GPU metrics:

```bash
# Navigate to the gpu_analysis directory
cd /<your-route>/Tokamak-zk-EVM/gpu_analysis

# Activate Python virtual environment (for plotting)
source ../venv/bin/activate

# Run prove with GPU monitoring
./run-prove-with-gpu-monitoring.sh <TX_HASH> [OUTPUT_DIR]
```

**Arguments:**
- `TX_HASH` - Transaction hash to prove (with or without 0x prefix)
- `OUTPUT_DIR` - (Optional) Directory to save outputs. Default: `./results`

**Example:**
```bash
./run-prove-with-gpu-monitoring.sh 0xad6795bca9cf6b70f6ed2d728eae677d66510b3b25f2542f7f57920f858d9fd0
```

**What it does:**
1. Runs synthesizer to generate circuit from transaction
2. Runs preprocess with GPU monitoring
3. Runs prove with GPU monitoring
4. Runs verify to validate the proof
5. Saves all GPU metrics and logs

### Running Just the Synthesizer

To only generate the circuit without proving:

```bash
./run-synthesizer.sh <TX_HASH>
```

**Example:**
```bash
./run-synthesizer.sh 0xad6795bca9cf6b70f6ed2d728eae677d66510b3b25f2542f7f57920f858d9fd0
```

## Getting Results

### Output Files

After running the prove script, you'll find the following in the output directory (default: `./results`):

1. **GPU Usage Data** (`gpu_usage_YYYYMMDD_HHMMSS.csv`)
   - CSV file with detailed GPU metrics sampled every 100ms
   - Columns: timestamp, gpu_util_%, memory_util_%, memory_used_MiB, memory_total_MiB, temperature_C, power_W, sm_clock_MHz, mem_clock_MHz

2. **Prove Log** (`prove_YYYYMMDD_HHMMSS.log`)
   - Complete log of the prove execution
   - Includes output from synthesizer, preprocess, prove, and verify steps

3. **Proof Artifacts**
   - `prove/` - Generated proof files
   - `preprocess/` - Preprocessed circuit data

4. **Transaction Hash** (`transaction_hash.txt`)
   - The transaction hash that was processed

### Visualizing GPU Usage

After running the prove script, visualize the GPU usage:

```bash
# Make sure venv is activated
source ../venv/bin/activate

# Generate plot (display on screen)
python3 plot_gpu_usage.py results/gpu_usage_*.csv

# Generate plot (save to file)
python3 plot_gpu_usage.py results/gpu_usage_*.csv results/gpu_usage_plot.png
```

**What you'll see:**
- GPU Utilization % over time
- Memory Utilization % over time
- Temperature (°C) over time
- Power Draw (W) over time
- Statistics: Average, Max, Min values for each metric

### Reading the Statistics

The script automatically prints GPU usage statistics at the end:

```
GPU Usage Summary:
  Average GPU Utilization: 85.3%
  Max GPU Utilization: 98.2%
  Average Memory Utilization: 72.1%
  Max Memory Utilization: 89.5%
```

The visualization script also prints detailed statistics:

```
GPU Usage Summary Statistics
==================================================
Duration: 127.45 seconds
Samples: 1275
Sample Rate: 10.00 Hz

GPU Utilization:
  Average: 85.32%
  Maximum: 98.20%
  Minimum: 12.40%

Memory Utilization:
  Average: 72.15%
  Maximum: 89.50%
  Average Used: 15234.23 MiB

Temperature:
  Average: 65.30°C
  Maximum: 72.00°C

Power Draw:
  Average: 285.40W
  Maximum: 320.50W
  Total Energy: 0.010123 Wh
```

## Workflow Examples

### Example 1: Quick Proof with Monitoring

```bash
cd /<your-route>/Tokamak-zk-EVM/gpu_analysis
source ../venv/bin/activate

# Run prove with monitoring
./run-prove-with-gpu-monitoring.sh 0xabc123...

# View plot on screen
python3 plot_gpu_usage.py results/gpu_usage_*.csv

# Save plot for reporting
python3 plot_gpu_usage.py results/gpu_usage_*.csv results/analysis_$(date +%Y%m%d).png
```

### Example 2: Multiple Runs with Organized Results

```bash
cd /<your-route>/Tokamak-zk-EVM/gpu_analysis
source ../venv/bin/activate

# Run multiple transactions
./run-prove-with-gpu-monitoring.sh 0xabc123... results/run1
./run-prove-with-gpu-monitoring.sh 0xdef456... results/run2
./run-prove-with-gpu-monitoring.sh 0xghi789... results/run3

# Compare GPU usage
python3 plot_gpu_usage.py results/run1/gpu_usage_*.csv results/run1_gpu.png
python3 plot_gpu_usage.py results/run2/gpu_usage_*.csv results/run2_gpu.png
python3 plot_gpu_usage.py results/run3/gpu_usage_*.csv results/run3_gpu.png
```

### Example 3: Debug Workflow (Step-by-step)

```bash
cd /<your-route>/Tokamak-zk-EVM/gpu_analysis

# Step 1: Generate circuit
./run-synthesizer.sh 0xabc123...

# Step 2: Run prove with monitoring
source ../venv/bin/activate
./run-prove-with-gpu-monitoring.sh 0xabc123... results/debug_run

# Step 3: Analyze results
python3 plot_gpu_usage.py results/debug_run/gpu_usage_*.csv
cat results/debug_run/prove_*.log  # Check logs if needed
```

## Troubleshooting

### Python Environment Issues

**Problem:** `matplotlib` or `numpy` not found
```bash
# Solution: Reinstall Python environment
cd /<your-route>/Tokamak-zk-EVM/gpu_analysis
./setup-python-env.sh
source ../venv/bin/activate
```

**Problem:** `python3-venv` module not available
```bash
# Solution: Install venv package
sudo apt-get update
sudo apt-get install python3-venv python3-pip
```

### GPU Monitoring Issues

**Problem:** `nvidia-smi: command not found`
```bash
# Solution: Verify NVIDIA drivers are installed
nvidia-smi
# If not installed, install NVIDIA drivers for your GPU
```

**Problem:** GPU usage shows 0% throughout
- Check if the backend is actually using GPU (verify icicle library is loaded)
- Check if CUDA is properly configured
- Verify `LD_LIBRARY_PATH` includes icicle library path

### Proof Generation Issues

**Problem:** Synthesizer fails
- Verify the transaction hash is valid
- Check network connectivity for fetching transaction data
- Review synthesizer logs in the prove log file

**Problem:** Prove fails
- Ensure the build is up to date: `cargo build --release`
- Check disk space for output directories
- Review the prove log file for specific error messages

### Path Issues

**Problem:** Scripts can't find backend binaries
- Verify you've built the project: `cargo build --release`
- Check that paths in scripts are correct
- Run scripts from the `gpu_analysis/` directory

## Script Reference

### run-prove-with-gpu-monitoring.sh

**Purpose:** Run complete proof generation pipeline with GPU monitoring

**Syntax:**
```bash
./run-prove-with-gpu-monitoring.sh <TX_HASH> [OUTPUT_DIR]
```

**Options:**
- `--help` or `-h` - Display help message

**Environment Variables:**
- `LD_LIBRARY_PATH` - Automatically set to include icicle library
- `ICICLE_BACKEND_INSTALL_DIR` - Automatically set to icicle backend path

**Exit Codes:**
- 0 - Success
- 1 - Error (invalid arguments, missing dependencies, or execution failure)

### run-synthesizer.sh

**Purpose:** Generate circuit from transaction

**Syntax:**
```bash
./run-synthesizer.sh <TX_HASH>
```

**Output:** Circuit files in `packages/frontend/synthesizer/examples/outputs`

### plot_gpu_usage.py

**Purpose:** Visualize GPU usage data

**Syntax:**
```bash
python3 plot_gpu_usage.py <csv_file> [output_image]
```

**Arguments:**
- `csv_file` - GPU usage CSV file to plot
- `output_image` - (Optional) Save plot to this file instead of displaying

**Requirements:** matplotlib, numpy (installed via setup-python-env.sh)

### setup-python-env.sh

**Purpose:** Setup Python virtual environment

**Syntax:**
```bash
./setup-python-env.sh
```

**What it does:**
- Creates virtual environment in `../venv/`
- Installs matplotlib and numpy
- Verifies installation

## Additional Resources

- **GPU_UTILIZATION_ANALYSIS_REPORT.md** - Detailed analysis of GPU utilization patterns
- **COMPLETE_WORKFLOW.md** - Complete workflow documentation
- **DIRECT_PROVE_GUIDE.md** - Guide for running prove directly
- **GPU_MONITORING_README.md** - GPU monitoring setup details

## FAQ

**Q: Where are the results stored?**
A: By default in `gpu_analysis/results/`. You can specify a custom directory with the second argument to the prove script.

**Q: Can I run without GPU monitoring?**
A: Yes, use the standard prove commands. See DIRECT_PROVE_GUIDE.md for details.

**Q: How much disk space do I need?**
A: Approximately 500MB-2GB per proof run, depending on circuit size.

**Q: Can I monitor multiple GPUs?**
A: The current scripts monitor all available GPUs. GPU metrics are aggregated.

**Q: How do I cite this work?**
A: See the main project README for citation information.

## Contributing

When adding new analysis tools or scripts to this directory:
1. Update this README with usage instructions
2. Ensure all outputs go to the `results/` subdirectory
3. Add appropriate error handling and help messages
4. Test with various transaction hashes

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review the detailed documentation files in this directory
3. Check project issues at the main repository
4. Verify your setup with `nvidia-smi` and check driver versions

---

**Last Updated:** 2025-11-05
**Maintainer:** Tokamak-zk-EVM Team
