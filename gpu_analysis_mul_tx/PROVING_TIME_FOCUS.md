# Proving Time Analysis - Primary Focus

The analysis scripts have been updated to focus primarily on **proving time** as the key performance metric.

## What's Changed

### Console Output
The statistical output now prominently displays:

1. **PROVING TIME ANALYSIS section** (displayed first)
   - Average, Median, Min, Max prove times
   - Standard deviation and range
   - Percentiles (25th, 50th, 75th, 90th, 95th)
   - Prove time as % of total time
   
2. **GPU UTILIZATION DURING PROVING section**
   - Correlation between prove time and GPU utilization
   - Interpretation of correlation strength
   - GPU and memory utilization statistics

### Visualizations

#### 1. timing_distribution.png (PRIMARY)
**Focus: Proving Time Analysis**

- **Top-left**: Prove time per transaction (bar chart with mean/median lines)
- **Top-right**: Stage timing breakdown (stacked view)
- **Bottom-left**: Prove time distribution histogram (with statistics overlay)
- **Bottom-right**: Stage comparison boxplot (prove stage highlighted)

#### 2. correlation_analysis.png
**Focus: Prove Time vs GPU Utilization**

All 4 plots now focus on proving time:
- Prove time vs Average GPU utilization
- Prove time vs Peak GPU utilization
- Includes correlation coefficients (r values)

#### 3. gpu_utilization.png
**Context: GPU Usage During Proving**

- GPU utilization patterns across all transactions
- Memory utilization patterns
- Correlation with proving performance

#### 4. gpu_aggregated_metrics.png
**New: Aggregated GPU Statistics**

- **GPU Utilization Distribution**: Histogram showing distribution of all GPU samples
- **Memory Utilization Distribution**: Memory usage across all transactions
- **Temperature Distribution**: GPU temperature patterns
- **Power Draw Distribution**: Power consumption patterns
- Each plot includes: mean, median, std dev, min/max statistics

## Key Metrics Tracked

### Proving Time Statistics
- **Average**: Mean prove time across all successful transactions
- **Median**: 50th percentile (middle value)
- **Min/Max**: Fastest and slowest prove times
- **Std Dev**: Variability in prove times
- **Percentiles**: Distribution analysis (25th, 75th, 90th, 95th)

### Correlation Analysis
- **Prove Time vs GPU Utilization**: How GPU usage affects prove time
- **Interpretation**:
  - |r| < 0.3: Weak correlation
  - 0.3 ≤ |r| < 0.7: Moderate correlation
  - |r| ≥ 0.7: Strong correlation

### Performance Insights
- Prove time as % of total time (typically 60-80%)
- GPU utilization efficiency during proving
- Variability across different transactions

## How to Interpret Results

### 1. High Prove Time Variability (High Std Dev)
**Indicates**: Different transactions have very different complexity
**Action**: 
- Investigate outliers (very fast or very slow)
- Consider transaction characteristics (opcode types, data size)
- May need different optimization strategies per transaction type

### 2. Low GPU Utilization + High Prove Time
**Indicates**: GPU is underutilized, bottleneck elsewhere
**Possible Causes**:
- CPU-bound operations
- Memory bandwidth limitations
- Data transfer overhead (CPU ↔ GPU)
**Action**: 
- Profile CPU usage
- Optimize data transfers
- Increase GPU workload parallelism

### 3. High GPU Utilization + High Prove Time
**Indicates**: GPU is working hard but still slow
**Possible Causes**:
- Computationally intensive operations (expected)
- Inefficient GPU kernels
- Memory access patterns
**Action**:
- Optimize GPU kernel code
- Improve memory coalescing
- Consider better algorithms

### 4. Low GPU Utilization + Low Prove Time
**Indicates**: Efficient proving with room for more work
**Interpretation**: Good! System is efficient
**Action**: 
- Could potentially batch more transactions
- Current setup is well-optimized

## Example Analysis Workflow

### Step 1: Run Analysis
```bash
python3 analyze_batch_results.py batch_results/summary_*.csv batch_results/consolidated_gpu_data_*.csv
```

### Step 2: Check Console Output
Look for the **PROVING TIME ANALYSIS** section:
```
======================================================================
PROVING TIME ANALYSIS (PRIMARY FOCUS)
======================================================================

  Prove Time Statistics:
    Average: 245.32s
    Median: 238.15s
    Min: 152.40s
    Max: 389.67s
    Std Dev: 45.23s
    Range: 237.27s
```

**Key Questions:**
- Is the average acceptable for your use case?
- Is there high variability (high std dev)?
- Are there outliers (min/max far from average)?

### Step 3: Check GPU Correlation
```
  Correlation with Prove Time:
    Prove Time vs Avg GPU Util: r = 0.234
    → Weak correlation: GPU utilization doesn't strongly affect prove time
```

**Interpretation:**
- **Weak correlation**: Bottleneck is likely NOT GPU computation
  - Focus on: CPU, memory bandwidth, data transfers
- **Strong correlation**: GPU is the primary bottleneck
  - Focus on: GPU kernel optimization, parallelism

### Step 4: Review Plots

**timing_distribution.png**: 
- Look at prove time variability
- Identify outlier transactions
- Check histogram distribution (normal, bimodal, skewed?)

**correlation_analysis.png**:
- Scatter plots show prove time vs GPU utilization
- Look for patterns or clusters
- Check if higher GPU usage → faster proving

### Step 5: Dive Deeper (if needed)
- Check individual transaction logs: `individual_results/tx_N/prove.log`
- Review GPU timelines: `gpu_timeline_tx_N.png`
- Compare fast vs slow transactions

## Quick Commands

### Run Complete Analysis
```bash
cd gpu_analysis_mul_tx

# 1. Fetch transactions
python3 fetch_random_txs.py --count 100 --api-key YOUR_KEY --output txs.json

# 2. Run GPU analysis
./run_gpu_analysis_batch.sh txs.json

# 3. Analyze with prove time focus
python3 analyze_batch_results.py batch_results/summary_*.csv batch_results/consolidated_gpu_data_*.csv
```

### View Results
```bash
# View statistical summary
cat batch_results/ANALYSIS_REPORT.md

# View primary plot
open batch_results/timing_distribution.png  # macOS
xdg-open batch_results/timing_distribution.png  # Linux
```

## Summary

The analysis now provides:
- ✅ **Prominent proving time statistics** in console output
- ✅ **Dedicated proving time visualizations** in plots
- ✅ **Correlation analysis** between prove time and GPU usage
- ✅ **Percentile analysis** for distribution understanding
- ✅ **Clear interpretation guidance** for results

**Primary Metric**: Prove Time (in seconds)
**Primary Plot**: timing_distribution.png
**Primary Goal**: Understand and optimize proving performance
