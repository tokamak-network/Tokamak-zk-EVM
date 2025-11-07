#!/usr/bin/env python3
"""
Analyze Batch GPU Analysis Results
Analyzes and visualizes GPU usage data from multiple transaction proofs.
Usage: python3 analyze_batch_results.py <summary.csv> <gpu_data.csv> [output_dir]
"""

import sys
import csv
import argparse
from datetime import datetime
from pathlib import Path
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from typing import Dict, List, Tuple


def load_summary_data(summary_file: str) -> List[Dict]:
    """Load summary data from CSV."""
    data = []
    with open(summary_file, "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Convert numeric fields
            try:
                row["tx_number"] = int(row["tx_number"])
                row["synth_time_s"] = float(row["synth_time_s"])
                row["preprocess_time_s"] = float(row["preprocess_time_s"])
                row["prove_time_s"] = float(row["prove_time_s"])
                row["verify_time_s"] = float(row["verify_time_s"])
                row["total_time_s"] = float(row["total_time_s"])
                row["avg_gpu_util_%"] = float(row["avg_gpu_util_%"])
                row["max_gpu_util_%"] = float(row["max_gpu_util_%"])
                row["avg_mem_util_%"] = float(row["avg_mem_util_%"])
                row["max_mem_util_%"] = float(row["max_mem_util_%"])
                data.append(row)
            except (ValueError, KeyError) as e:
                print(f"Warning: Skipping row due to error: {e}")
                continue
    return data


def load_gpu_data(gpu_file: str) -> Dict[int, List[Dict]]:
    """Load GPU data from consolidated CSV, grouped by transaction number."""
    data = {}
    with open(gpu_file, "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                tx_num = int(row["tx_number"])
                if tx_num not in data:
                    data[tx_num] = []

                data[tx_num].append(
                    {
                        "timestamp": row["timestamp"],
                        "gpu_util": float(row["gpu_util_%"]),
                        "mem_util": float(row["memory_util_%"]),
                        "mem_used": float(row["memory_used_MiB"]),
                        "temp": float(row["temperature_C"]),
                        "power": float(row["power_W"]),
                    }
                )
            except (ValueError, KeyError) as e:
                print(f"Warning: Skipping GPU data row: {e}")
                continue
    return data


def print_statistics(summary_data: List[Dict]):
    """Print summary statistics."""
    total = len(summary_data)
    successful = sum(1 for row in summary_data if row["status"] == "success")
    failed = total - successful

    print("\n" + "=" * 70)
    print("BATCH ANALYSIS STATISTICS")
    print("=" * 70)

    print(f"\nOverall Results:")
    print(f"  Total Transactions: {total}")
    print(f"  Successful: {successful} ({successful / total * 100:.1f}%)")
    print(f"  Failed: {failed} ({failed / total * 100:.1f}%)")

    if not successful:
        print("\nNo successful transactions to analyze.")
        return

    # Filter successful transactions
    success_data = [row for row in summary_data if row["status"] == "success"]

    # Timing statistics
    total_times = [row["total_time_s"] for row in success_data]
    synth_times = [row["synth_time_s"] for row in success_data]
    preprocess_times = [row["preprocess_time_s"] for row in success_data]
    prove_times = [row["prove_time_s"] for row in success_data]
    verify_times = [row["verify_time_s"] for row in success_data]

    print(f"\n" + "=" * 70)
    print(f"PROVING TIME ANALYSIS (PRIMARY FOCUS)")
    print(f"=" * 70)
    print(f"\n  Prove Time Statistics:")
    print(f"    Average: {np.mean(prove_times):.2f}s")
    print(f"    Median: {np.median(prove_times):.2f}s")
    print(f"    Min: {np.min(prove_times):.2f}s")
    print(f"    Max: {np.max(prove_times):.2f}s")
    print(f"    Std Dev: {np.std(prove_times):.2f}s")
    print(f"    Range: {np.max(prove_times) - np.min(prove_times):.2f}s")

    # Percentiles for prove time
    print(f"\n  Prove Time Percentiles:")
    print(f"    25th percentile: {np.percentile(prove_times, 25):.2f}s")
    print(f"    50th percentile (median): {np.percentile(prove_times, 50):.2f}s")
    print(f"    75th percentile: {np.percentile(prove_times, 75):.2f}s")
    print(f"    90th percentile: {np.percentile(prove_times, 90):.2f}s")
    print(f"    95th percentile: {np.percentile(prove_times, 95):.2f}s")

    print(f"\n  Prove Time as % of Total Time:")
    prove_percentage = (np.mean(prove_times) / np.mean(total_times)) * 100
    print(f"    Average: {prove_percentage:.1f}%")
    print(f"    (Prove is the dominant stage in the proving pipeline)")

    print(f"\nTiming Statistics (all stages):")
    print(f"  Total Time:")
    print(f"    Average: {np.mean(total_times):.2f}s")
    print(f"    Median: {np.median(total_times):.2f}s")
    print(f"    Min: {np.min(total_times):.2f}s")
    print(f"    Max: {np.max(total_times):.2f}s")
    print(f"    Std Dev: {np.std(total_times):.2f}s")

    print(f"\n  Stage Breakdown (averages):")
    print(
        f"    Synthesizer: {np.mean(synth_times):.2f}s ({np.mean(synth_times) / np.mean(total_times) * 100:.1f}%)"
    )
    print(
        f"    Preprocess: {np.mean(preprocess_times):.2f}s ({np.mean(preprocess_times) / np.mean(total_times) * 100:.1f}%)"
    )
    print(f"    Prove: {np.mean(prove_times):.2f}s ({prove_percentage:.1f}%)")
    print(
        f"    Verify: {np.mean(verify_times):.2f}s ({np.mean(verify_times) / np.mean(total_times) * 100:.1f}%)"
    )

    # GPU statistics
    avg_gpu_utils = [row["avg_gpu_util_%"] for row in success_data]
    max_gpu_utils = [row["max_gpu_util_%"] for row in success_data]
    avg_mem_utils = [row["avg_mem_util_%"] for row in success_data]
    max_mem_utils = [row["max_mem_util_%"] for row in success_data]

    print(f"\n" + "=" * 70)
    print(f"GPU & MEMORY UTILIZATION DURING PROVING")
    print(f"=" * 70)

    # Calculate statistical validity metrics
    n_success = len(success_data)
    sem_avg_gpu = np.std(avg_gpu_utils) / np.sqrt(n_success)
    sem_avg_mem = np.std(avg_mem_utils) / np.sqrt(n_success)
    ci_95_gpu = 1.96 * sem_avg_gpu
    ci_95_mem = 1.96 * sem_avg_mem

    print(f"  Average GPU Utilization:")
    print(f"    Mean: {np.mean(avg_gpu_utils):.2f}%")
    print(f"    95% Confidence Interval: ±{ci_95_gpu:.2f}%")
    print(f"    Median: {np.median(avg_gpu_utils):.2f}%")
    print(f"    Std Dev: {np.std(avg_gpu_utils):.2f}%")
    print(f"    Range: [{np.min(avg_gpu_utils):.2f}%, {np.max(avg_gpu_utils):.2f}%]")
    print(
        f"    Coef. of Variation: {(np.std(avg_gpu_utils) / np.mean(avg_gpu_utils) * 100) if np.mean(avg_gpu_utils) > 0 else 0:.1f}%"
    )

    print(f"\n  Peak GPU Utilization:")
    print(f"    Mean: {np.mean(max_gpu_utils):.2f}%")
    print(f"    Median: {np.median(max_gpu_utils):.2f}%")
    print(f"    Std Dev: {np.std(max_gpu_utils):.2f}%")
    print(f"    Range: [{np.min(max_gpu_utils):.2f}%, {np.max(max_gpu_utils):.2f}%]")

    print(f"\n  Average Memory Utilization:")
    print(f"    Mean: {np.mean(avg_mem_utils):.2f}%")
    print(f"    95% Confidence Interval: ±{ci_95_mem:.2f}%")
    print(f"    Median: {np.median(avg_mem_utils):.2f}%")
    print(f"    Std Dev: {np.std(avg_mem_utils):.2f}%")
    print(f"    Range: [{np.min(avg_mem_utils):.2f}%, {np.max(avg_mem_utils):.2f}%]")
    print(
        f"    Coef. of Variation: {(np.std(avg_mem_utils) / np.mean(avg_mem_utils) * 100) if np.mean(avg_mem_utils) > 0 else 0:.1f}%"
    )

    print(f"\n  Peak Memory Utilization:")
    print(f"    Mean: {np.mean(max_mem_utils):.2f}%")
    print(f"    Median: {np.median(max_mem_utils):.2f}%")
    print(f"    Std Dev: {np.std(max_mem_utils):.2f}%")
    print(f"    Range: [{np.min(max_mem_utils):.2f}%, {np.max(max_mem_utils):.2f}%]")

    # Correlation between prove time and GPU utilization
    prove_gpu_corr = np.corrcoef(prove_times, avg_gpu_utils)[0, 1]
    prove_maxgpu_corr = np.corrcoef(prove_times, max_gpu_utils)[0, 1]

    print(f"\n  Correlation with Prove Time:")
    print(f"    Prove Time vs Avg GPU Util: r = {prove_gpu_corr:.3f}")
    print(f"    Prove Time vs Max GPU Util: r = {prove_maxgpu_corr:.3f}")

    if abs(prove_gpu_corr) < 0.3:
        print(
            f"    → Weak correlation: GPU utilization doesn't strongly affect prove time"
        )
    elif abs(prove_gpu_corr) < 0.7:
        print(
            f"    → Moderate correlation: GPU utilization partially affects prove time"
        )
    else:
        print(
            f"    → Strong correlation: GPU utilization significantly affects prove time"
        )

    # Statistical validity summary
    print(f"\n" + "=" * 70)
    print(f"STATISTICAL VALIDITY ASSESSMENT")
    print(f"=" * 70)
    print(f"  Sample Size: {n_success} successful transactions")
    print(f"  Standard Error of Mean (GPU): {sem_avg_gpu:.3f}%")
    print(f"  Standard Error of Mean (Memory): {sem_avg_mem:.3f}%")
    print(f"\n  Data Quality Assessment:")
    if n_success >= 20:
        print(f"    ✓ GOOD - Large sample size (n={n_success})")
        print(f"    → Statistical estimates are reliable")
        print(f"    → Confidence intervals are narrow")
    elif n_success >= 10:
        print(f"    ✓ MODERATE - Moderate sample size (n={n_success})")
        print(f"    → Results are indicative but could be refined")
        print(f"    → Consider collecting more data for greater precision")
    else:
        print(f"    ⚠ LIMITED - Small sample size (n={n_success})")
        print(f"    → Results should be interpreted with caution")
        print(f"    → More data strongly recommended")

    print(f"\n  Key Findings:")
    print(
        f"    • GPU Utilization: {np.mean(avg_gpu_utils):.2f}% ± {ci_95_gpu:.2f}% (95% CI)"
    )
    print(
        f"    • Memory Utilization: {np.mean(avg_mem_utils):.2f}% ± {ci_95_mem:.2f}% (95% CI)"
    )

    # Interpretation
    if np.mean(avg_gpu_utils) < 20:
        print(f"    • ⚠ LOW GPU utilization - GPU is underutilized during proving")
        print(f"    • Potential for optimization or GPU may not be critical bottleneck")
    elif np.mean(avg_gpu_utils) < 60:
        print(f"    • MODERATE GPU utilization - Balanced workload")
    else:
        print(f"    • HIGH GPU utilization - GPU is heavily utilized")

    if np.mean(avg_mem_utils) < 20:
        print(f"    • LOW Memory utilization - Memory is not a bottleneck")
    elif np.mean(avg_mem_utils) < 60:
        print(f"    • MODERATE Memory utilization - Balanced usage")
    else:
        print(f"    • HIGH Memory utilization - Consider memory optimization")

    print("=" * 70 + "\n")


def plot_timing_distribution(summary_data: List[Dict], output_dir: Path):
    """Plot timing distribution across transactions."""
    success_data = [row for row in summary_data if row["status"] == "success"]

    if not success_data:
        print("No successful transactions to plot timing distribution.")
        return

    fig, axes = plt.subplots(2, 2, figsize=(16, 12))
    fig.suptitle(
        "Proving Time Analysis - Primary Focus", fontsize=16, fontweight="bold"
    )

    tx_numbers = [row["tx_number"] for row in success_data]
    synth_times = [row["synth_time_s"] for row in success_data]
    preprocess_times = [row["preprocess_time_s"] for row in success_data]
    prove_times = [row["prove_time_s"] for row in success_data]
    verify_times = [row["verify_time_s"] for row in success_data]

    # Plot 1: Prove time per transaction (MAIN FOCUS)
    axes[0, 0].bar(
        tx_numbers, prove_times, color="coral", edgecolor="darkred", linewidth=1.5
    )
    axes[0, 0].axhline(
        y=np.mean(prove_times),
        color="red",
        linestyle="--",
        linewidth=2,
        label=f"Mean: {np.mean(prove_times):.1f}s",
    )
    axes[0, 0].axhline(
        y=np.median(prove_times),
        color="orange",
        linestyle=":",
        linewidth=2,
        label=f"Median: {np.median(prove_times):.1f}s",
    )
    axes[0, 0].set_xlabel("Transaction Number", fontweight="bold")
    axes[0, 0].set_ylabel("Prove Time (s)", fontweight="bold")
    axes[0, 0].set_title(
        "Prove Time per Transaction (PRIMARY METRIC)", fontweight="bold", fontsize=12
    )
    axes[0, 0].grid(True, alpha=0.3)
    axes[0, 0].legend()

    # Plot 2: Stacked bar chart of stages
    axes[0, 1].bar(tx_numbers, synth_times, label="Synthesizer", color="skyblue")
    axes[0, 1].bar(
        tx_numbers,
        preprocess_times,
        bottom=synth_times,
        label="Preprocess",
        color="lightgreen",
    )
    axes[0, 1].bar(
        tx_numbers,
        prove_times,
        bottom=[s + p for s, p in zip(synth_times, preprocess_times)],
        label="Prove",
        color="coral",
    )
    axes[0, 1].bar(
        tx_numbers,
        verify_times,
        bottom=[
            s + p + pr for s, p, pr in zip(synth_times, preprocess_times, prove_times)
        ],
        label="Verify",
        color="plum",
    )
    axes[0, 1].set_xlabel("Transaction Number")
    axes[0, 1].set_ylabel("Time (s)")
    axes[0, 1].set_title("Stage Timing Breakdown")
    axes[0, 1].legend()
    axes[0, 1].grid(True, alpha=0.3)

    # Plot 3: Histogram of prove times with statistics
    axes[1, 0].hist(prove_times, bins=20, color="coral", edgecolor="darkred", alpha=0.7)
    axes[1, 0].axvline(
        x=np.mean(prove_times),
        color="red",
        linestyle="--",
        linewidth=2,
        label=f"Mean: {np.mean(prove_times):.1f}s",
    )
    axes[1, 0].axvline(
        x=np.median(prove_times),
        color="orange",
        linestyle=":",
        linewidth=2,
        label=f"Median: {np.median(prove_times):.1f}s",
    )
    axes[1, 0].set_xlabel("Prove Time (s)", fontweight="bold")
    axes[1, 0].set_ylabel("Frequency")
    axes[1, 0].set_title("Prove Time Distribution", fontweight="bold")
    axes[1, 0].grid(True, alpha=0.3)
    axes[1, 0].legend()

    # Add statistics text
    stats_text = f"σ = {np.std(prove_times):.1f}s\nMin = {np.min(prove_times):.1f}s\nMax = {np.max(prove_times):.1f}s"
    axes[1, 0].text(
        0.98,
        0.97,
        stats_text,
        transform=axes[1, 0].transAxes,
        verticalalignment="top",
        horizontalalignment="right",
        bbox=dict(boxstyle="round", facecolor="wheat", alpha=0.8),
    )

    # Plot 4: Box plot comparison (emphasize prove time)
    stage_data = [synth_times, preprocess_times, prove_times, verify_times]
    bp = axes[1, 1].boxplot(
        stage_data, labels=["Synth", "Preproc", "Prove", "Verify"], patch_artist=True
    )
    # Highlight prove time box
    bp["boxes"][2].set_facecolor("coral")
    bp["boxes"][2].set_linewidth(2)
    for i in [0, 1, 3]:
        bp["boxes"][i].set_facecolor("lightblue")
    axes[1, 1].set_ylabel("Time (s)", fontweight="bold")
    axes[1, 1].set_title(
        "Stage Timing Comparison (Prove Highlighted)", fontweight="bold"
    )
    axes[1, 1].grid(True, alpha=0.3)

    plt.tight_layout()
    output_file = output_dir / "timing_distribution.png"
    plt.savefig(output_file, dpi=300, bbox_inches="tight")
    print(f"Saved timing distribution plot: {output_file}")
    plt.close()


def plot_gpu_utilization(summary_data: List[Dict], output_dir: Path):
    """Plot GPU utilization statistics."""
    success_data = [row for row in summary_data if row["status"] == "success"]

    if not success_data:
        print("No successful transactions to plot GPU utilization.")
        return

    fig, axes = plt.subplots(2, 2, figsize=(16, 12))
    fig.suptitle("GPU Utilization Across Transactions", fontsize=16, fontweight="bold")

    tx_numbers = [row["tx_number"] for row in success_data]

    # Plot 1: Average GPU utilization
    axes[0, 0].plot(
        tx_numbers,
        [row["avg_gpu_util_%"] for row in success_data],
        "b-o",
        linewidth=2,
        markersize=4,
    )
    axes[0, 0].set_xlabel("Transaction Number")
    axes[0, 0].set_ylabel("Average GPU Utilization (%)")
    axes[0, 0].set_title("Average GPU Utilization per Transaction")
    axes[0, 0].set_ylim([0, 105])
    axes[0, 0].grid(True, alpha=0.3)
    axes[0, 0].axhline(
        y=np.mean([row["avg_gpu_util_%"] for row in success_data]),
        color="r",
        linestyle="--",
        label="Mean",
    )
    axes[0, 0].legend()

    # Plot 2: Max GPU utilization
    axes[0, 1].plot(
        tx_numbers,
        [row["max_gpu_util_%"] for row in success_data],
        "g-o",
        linewidth=2,
        markersize=4,
    )
    axes[0, 1].set_xlabel("Transaction Number")
    axes[0, 1].set_ylabel("Max GPU Utilization (%)")
    axes[0, 1].set_title("Peak GPU Utilization per Transaction")
    axes[0, 1].set_ylim([0, 105])
    axes[0, 1].grid(True, alpha=0.3)
    axes[0, 1].axhline(
        y=np.mean([row["max_gpu_util_%"] for row in success_data]),
        color="r",
        linestyle="--",
        label="Mean",
    )
    axes[0, 1].legend()

    # Plot 3: Average memory utilization
    axes[1, 0].plot(
        tx_numbers,
        [row["avg_mem_util_%"] for row in success_data],
        "m-o",
        linewidth=2,
        markersize=4,
    )
    axes[1, 0].set_xlabel("Transaction Number")
    axes[1, 0].set_ylabel("Average Memory Utilization (%)")
    axes[1, 0].set_title("Average Memory Utilization per Transaction")
    axes[1, 0].set_ylim([0, 105])
    axes[1, 0].grid(True, alpha=0.3)
    axes[1, 0].axhline(
        y=np.mean([row["avg_mem_util_%"] for row in success_data]),
        color="r",
        linestyle="--",
        label="Mean",
    )
    axes[1, 0].legend()

    # Plot 4: GPU vs Memory utilization scatter
    axes[1, 1].scatter(
        [row["avg_gpu_util_%"] for row in success_data],
        [row["avg_mem_util_%"] for row in success_data],
        alpha=0.6,
        s=50,
    )
    axes[1, 1].set_xlabel("Average GPU Utilization (%)")
    axes[1, 1].set_ylabel("Average Memory Utilization (%)")
    axes[1, 1].set_title("GPU vs Memory Utilization Correlation")
    axes[1, 1].grid(True, alpha=0.3)

    plt.tight_layout()
    output_file = output_dir / "gpu_utilization.png"
    plt.savefig(output_file, dpi=300, bbox_inches="tight")
    print(f"Saved GPU utilization plot: {output_file}")
    plt.close()


def plot_aggregated_gpu_analysis(
    gpu_data: Dict[int, List[Dict]],
    summary_data: List[Dict],
    output_dir: Path,
):
    """Plot aggregated GPU analysis across all transactions with statistical validation."""
    success_data = [row for row in summary_data if row["status"] == "success"]

    if not success_data:
        print("No successful transactions to plot GPU analysis.")
        return

    # Aggregate GPU data from all transactions
    all_gpu_utils = []
    all_mem_utils = []

    for row in success_data:
        tx_num = row["tx_number"]
        if tx_num in gpu_data:
            tx_gpu = gpu_data[tx_num]
            all_gpu_utils.extend([d["gpu_util"] for d in tx_gpu])
            all_mem_utils.extend([d["mem_util"] for d in tx_gpu])

    if not all_gpu_utils:
        print("Warning: No GPU data available for aggregation")
        return

    # Create comprehensive statistical summary plot
    fig = plt.figure(figsize=(18, 10))
    gs = fig.add_gridspec(2, 3, hspace=0.3, wspace=0.3)
    fig.suptitle(
        "GPU & Memory Usage Statistics During Prove Operations",
        fontsize=18,
        fontweight="bold",
    )

    # Main Plot 1: GPU Utilization - Enhanced with percentiles
    ax1 = fig.add_subplot(gs[0, 0])
    n, bins, patches = ax1.hist(
        all_gpu_utils,
        bins=50,
        color="skyblue",
        edgecolor="navy",
        alpha=0.7,
        density=False,
    )
    mean_gpu = np.mean(all_gpu_utils)
    median_gpu = np.median(all_gpu_utils)
    std_gpu = np.std(all_gpu_utils)
    q1_gpu = np.percentile(all_gpu_utils, 25)
    q3_gpu = np.percentile(all_gpu_utils, 75)

    ax1.axvline(
        x=mean_gpu,
        color="red",
        linestyle="--",
        linewidth=2.5,
        label=f"Mean: {mean_gpu:.2f}%",
    )
    ax1.axvline(
        x=median_gpu,
        color="orange",
        linestyle=":",
        linewidth=2.5,
        label=f"Median: {median_gpu:.2f}%",
    )
    ax1.axvline(
        x=q1_gpu,
        color="green",
        linestyle=":",
        linewidth=1.5,
        alpha=0.6,
        label=f"Q1/Q3: {q1_gpu:.1f}% / {q3_gpu:.1f}%",
    )
    ax1.axvline(
        x=q3_gpu,
        color="green",
        linestyle=":",
        linewidth=1.5,
        alpha=0.6,
    )

    ax1.set_xlabel("GPU Utilization (%)", fontweight="bold", fontsize=11)
    ax1.set_ylabel("Frequency (samples)", fontweight="bold", fontsize=11)
    ax1.set_title("GPU Utilization Distribution", fontweight="bold", fontsize=12)
    ax1.grid(True, alpha=0.3)
    ax1.legend(loc="upper right", fontsize=9)

    # Statistics text with more detail - moved to bottom right to avoid legend overlap
    stats_text = f"n = {len(all_gpu_utils)}\nμ = {mean_gpu:.2f}%\nσ = {std_gpu:.2f}%\nCV = {(std_gpu / mean_gpu * 100) if mean_gpu > 0 else 0:.1f}%\nRange: [{np.min(all_gpu_utils):.1f}, {np.max(all_gpu_utils):.1f}]"
    ax1.text(
        0.98,
        0.03,
        stats_text,
        transform=ax1.transAxes,
        verticalalignment="bottom",
        horizontalalignment="right",
        bbox=dict(boxstyle="round", facecolor="wheat", alpha=0.9),
        fontsize=9,
    )

    # Main Plot 2: Memory Utilization - Enhanced with percentiles
    ax2 = fig.add_subplot(gs[0, 1])
    n, bins, patches = ax2.hist(
        all_mem_utils,
        bins=50,
        color="lightgreen",
        edgecolor="darkgreen",
        alpha=0.7,
        density=False,
    )
    mean_mem = np.mean(all_mem_utils)
    median_mem = np.median(all_mem_utils)
    std_mem = np.std(all_mem_utils)
    q1_mem = np.percentile(all_mem_utils, 25)
    q3_mem = np.percentile(all_mem_utils, 75)

    ax2.axvline(
        x=mean_mem,
        color="red",
        linestyle="--",
        linewidth=2.5,
        label=f"Mean: {mean_mem:.2f}%",
    )
    ax2.axvline(
        x=median_mem,
        color="orange",
        linestyle=":",
        linewidth=2.5,
        label=f"Median: {median_mem:.2f}%",
    )
    ax2.axvline(
        x=q1_mem,
        color="green",
        linestyle=":",
        linewidth=1.5,
        alpha=0.6,
        label=f"Q1/Q3: {q1_mem:.1f}% / {q3_mem:.1f}%",
    )
    ax2.axvline(
        x=q3_mem,
        color="green",
        linestyle=":",
        linewidth=1.5,
        alpha=0.6,
    )

    ax2.set_xlabel("Memory Utilization (%)", fontweight="bold", fontsize=11)
    ax2.set_ylabel("Frequency (samples)", fontweight="bold", fontsize=11)
    ax2.set_title("Memory Utilization Distribution", fontweight="bold", fontsize=12)
    ax2.grid(True, alpha=0.3)
    ax2.legend(loc="upper right", fontsize=9)

    stats_text = f"n = {len(all_mem_utils)}\nμ = {mean_mem:.2f}%\nσ = {std_mem:.2f}%\nCV = {(std_mem / mean_mem * 100) if mean_mem > 0 else 0:.1f}%\nRange: [{np.min(all_mem_utils):.1f}, {np.max(all_mem_utils):.1f}]"
    ax2.text(
        0.98,
        0.03,
        stats_text,
        transform=ax2.transAxes,
        verticalalignment="bottom",
        horizontalalignment="right",
        bbox=dict(boxstyle="round", facecolor="wheat", alpha=0.9),
        fontsize=9,
    )

    # Box plot comparison: GPU vs Memory
    ax3 = fig.add_subplot(gs[0, 2])
    bp = ax3.boxplot(
        [all_gpu_utils, all_mem_utils],
        tick_labels=["GPU Util %", "Mem Util %"],
        patch_artist=True,
        showmeans=True,
        meanline=True,
    )
    bp["boxes"][0].set_facecolor("skyblue")
    bp["boxes"][1].set_facecolor("lightgreen")
    for median in bp["medians"]:
        median.set_color("red")
        median.set_linewidth(2)
    for mean in bp["means"]:
        mean.set_color("blue")
        mean.set_linewidth(2)
        mean.set_linestyle("--")

    ax3.set_ylabel("Utilization (%)", fontweight="bold", fontsize=11)
    ax3.set_title("GPU vs Memory: Box Plot Comparison", fontweight="bold", fontsize=12)
    ax3.grid(True, alpha=0.3, axis="y")
    ax3.legend(
        [bp["medians"][0], bp["means"][0]],
        ["Median", "Mean"],
        loc="upper right",
        fontsize=9,
    )

    # Per-transaction averages - GPU
    ax4 = fig.add_subplot(gs[1, 0])
    avg_gpu_per_tx = [row["avg_gpu_util_%"] for row in success_data]
    tx_nums = [row["tx_number"] for row in success_data]
    ax4.bar(
        tx_nums, avg_gpu_per_tx, color="cornflowerblue", edgecolor="navy", alpha=0.7
    )
    ax4.axhline(
        y=np.mean(avg_gpu_per_tx),
        color="red",
        linestyle="--",
        linewidth=2,
        label=f"Overall Mean: {np.mean(avg_gpu_per_tx):.2f}%",
    )
    ax4.set_xlabel("Transaction Number", fontweight="bold", fontsize=11)
    ax4.set_ylabel("Avg GPU Utilization (%)", fontweight="bold", fontsize=11)
    ax4.set_title(
        "Average GPU Utilization per Transaction", fontweight="bold", fontsize=12
    )
    ax4.grid(True, alpha=0.3, axis="y")
    ax4.legend(fontsize=9)

    # Per-transaction averages - Memory
    ax5 = fig.add_subplot(gs[1, 1])
    avg_mem_per_tx = [row["avg_mem_util_%"] for row in success_data]
    ax5.bar(
        tx_nums, avg_mem_per_tx, color="lightgreen", edgecolor="darkgreen", alpha=0.7
    )
    ax5.axhline(
        y=np.mean(avg_mem_per_tx),
        color="red",
        linestyle="--",
        linewidth=2,
        label=f"Overall Mean: {np.mean(avg_mem_per_tx):.2f}%",
    )
    ax5.set_xlabel("Transaction Number", fontweight="bold", fontsize=11)
    ax5.set_ylabel("Avg Memory Utilization (%)", fontweight="bold", fontsize=11)
    ax5.set_title(
        "Average Memory Utilization per Transaction", fontweight="bold", fontsize=12
    )
    ax5.grid(True, alpha=0.3, axis="y")
    ax5.legend(fontsize=9)

    # Statistical validity assessment panel
    ax6 = fig.add_subplot(gs[1, 2])
    ax6.axis("off")

    # Calculate statistical validity metrics
    n_transactions = len(success_data)
    n_samples = len(all_gpu_utils)
    sem_gpu = std_gpu / np.sqrt(n_samples)  # Standard error of mean
    sem_mem = std_mem / np.sqrt(n_samples)
    ci_95_gpu = 1.96 * sem_gpu  # 95% confidence interval
    ci_95_mem = 1.96 * sem_mem

    validity_text = "STATISTICAL VALIDITY ASSESSMENT\n" + "=" * 40 + "\n\n"
    validity_text += f"Sample Size:\n"
    validity_text += f"  • Transactions: {n_transactions}\n"
    validity_text += f"  • Data points: {n_samples}\n"
    validity_text += f"  • Samples/transaction: {n_samples / n_transactions:.1f}\n\n"

    validity_text += f"GPU Utilization:\n"
    validity_text += f"  • Mean: {mean_gpu:.2f}% ± {ci_95_gpu:.2f}% (95% CI)\n"
    validity_text += f"  • SEM: {sem_gpu:.3f}%\n"
    validity_text += f"  • Coef. of Variation: {(std_gpu / mean_gpu * 100) if mean_gpu > 0 else 0:.1f}%\n\n"

    validity_text += f"Memory Utilization:\n"
    validity_text += f"  • Mean: {mean_mem:.2f}% ± {ci_95_mem:.2f}% (95% CI)\n"
    validity_text += f"  • SEM: {sem_mem:.3f}%\n"
    validity_text += f"  • Coef. of Variation: {(std_mem / mean_mem * 100) if mean_mem > 0 else 0:.1f}%\n\n"

    # Validity assessment
    validity_text += "Data Validity: "
    if n_transactions >= 20 and n_samples >= 100:
        validity_text += "✓ GOOD\n"
        validity_text += f"  Large sample size (n={n_transactions})\n"
        validity_text += f"  provides reliable statistics"
    elif n_transactions >= 10:
        validity_text += "✓ MODERATE\n"
        validity_text += f"  Moderate sample (n={n_transactions})\n"
        validity_text += f"  results are indicative"
    else:
        validity_text += "⚠ LIMITED\n"
        validity_text += f"  Small sample (n={n_transactions})\n"
        validity_text += f"  more data recommended"

    ax6.text(
        0.05,
        0.95,
        validity_text,
        transform=ax6.transAxes,
        verticalalignment="top",
        fontfamily="monospace",
        fontsize=9,
        bbox=dict(boxstyle="round", facecolor="lightblue", alpha=0.8),
    )

    output_file = output_dir / "gpu_memory_usage_analysis.png"
    plt.savefig(output_file, dpi=300, bbox_inches="tight")
    print(f"Saved comprehensive GPU/Memory analysis: {output_file}")
    plt.close()


def plot_correlation_analysis(summary_data: List[Dict], output_dir: Path):
    """Plot correlation between prove time and GPU/Memory utilization."""
    success_data = [row for row in summary_data if row["status"] == "success"]

    if not success_data:
        print("No successful transactions for correlation analysis.")
        return

    fig, axes = plt.subplots(2, 2, figsize=(14, 10))
    fig.suptitle("Prove Time Correlation Analysis", fontsize=16, fontweight="bold")

    prove_times = [row["prove_time_s"] for row in success_data]
    avg_gpu = [row["avg_gpu_util_%"] for row in success_data]
    max_gpu = [row["max_gpu_util_%"] for row in success_data]
    avg_mem = [row["avg_mem_util_%"] for row in success_data]
    max_mem = [row["max_mem_util_%"] for row in success_data]

    # Plot 1: Prove time vs Avg GPU
    axes[0, 0].scatter(prove_times, avg_gpu, alpha=0.6, s=50)
    axes[0, 0].set_xlabel("Prove Time (s)")
    axes[0, 0].set_ylabel("Average GPU Utilization (%)")
    axes[0, 0].set_title("Prove Time vs Average GPU Utilization")
    axes[0, 0].grid(True, alpha=0.3)
    corr = np.corrcoef(prove_times, avg_gpu)[0, 1]
    axes[0, 0].text(
        0.05,
        0.95,
        f"r = {corr:.3f}",
        transform=axes[0, 0].transAxes,
        verticalalignment="top",
    )

    # Plot 2: Prove time vs Max GPU
    axes[0, 1].scatter(prove_times, max_gpu, alpha=0.6, s=50, color="green")
    axes[0, 1].set_xlabel("Prove Time (s)")
    axes[0, 1].set_ylabel("Peak GPU Utilization (%)")
    axes[0, 1].set_title("Prove Time vs Peak GPU Utilization")
    axes[0, 1].grid(True, alpha=0.3)
    corr = np.corrcoef(prove_times, max_gpu)[0, 1]
    axes[0, 1].text(
        0.05,
        0.95,
        f"r = {corr:.3f}",
        transform=axes[0, 1].transAxes,
        verticalalignment="top",
    )

    # Plot 3: Prove time vs Avg Memory
    axes[1, 0].scatter(prove_times, avg_mem, alpha=0.6, s=50, color="red")
    axes[1, 0].set_xlabel("Prove Time (s)")
    axes[1, 0].set_ylabel("Average Memory Utilization (%)")
    axes[1, 0].set_title("Prove Time vs Average Memory Utilization")
    axes[1, 0].grid(True, alpha=0.3)
    corr = np.corrcoef(prove_times, avg_mem)[0, 1]
    axes[1, 0].text(
        0.05,
        0.95,
        f"r = {corr:.3f}",
        transform=axes[1, 0].transAxes,
        verticalalignment="top",
    )

    # Plot 4: Prove time vs Max Memory
    axes[1, 1].scatter(prove_times, max_mem, alpha=0.6, s=50, color="purple")
    axes[1, 1].set_xlabel("Prove Time (s)")
    axes[1, 1].set_ylabel("Peak Memory Utilization (%)")
    axes[1, 1].set_title("Prove Time vs Peak Memory Utilization")
    axes[1, 1].grid(True, alpha=0.3)
    corr = np.corrcoef(prove_times, max_mem)[0, 1]
    axes[1, 1].text(
        0.05,
        0.95,
        f"r = {corr:.3f}",
        transform=axes[1, 1].transAxes,
        verticalalignment="top",
    )

    plt.tight_layout()
    output_file = output_dir / "correlation_analysis.png"
    plt.savefig(output_file, dpi=300, bbox_inches="tight")
    print(f"Saved correlation analysis plot: {output_file}")
    plt.close()


def generate_report(summary_data: List[Dict], output_dir: Path):
    """Generate a markdown report."""
    report_file = output_dir / "ANALYSIS_REPORT.md"

    success_data = [row for row in summary_data if row["status"] == "success"]
    total = len(summary_data)
    successful = len(success_data)
    failed = total - successful

    with open(report_file, "w") as f:
        f.write("# GPU Analysis Batch Report\n\n")
        f.write(f"**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")

        f.write("## Summary\n\n")
        f.write(f"- **Total Transactions:** {total}\n")
        f.write(f"- **Successful:** {successful} ({successful / total * 100:.1f}%)\n")
        f.write(f"- **Failed:** {failed} ({failed / total * 100:.1f}%)\n\n")

        if not success_data:
            f.write("No successful transactions to analyze.\n")
            return

        # Timing statistics
        f.write("## Timing Statistics\n\n")
        f.write("### Overall Performance\n\n")
        total_times = [row["total_time_s"] for row in success_data]
        f.write(f"| Metric | Value |\n")
        f.write(f"|--------|-------|\n")
        f.write(f"| Average Total Time | {np.mean(total_times):.2f}s |\n")
        f.write(f"| Median Total Time | {np.median(total_times):.2f}s |\n")
        f.write(f"| Min Total Time | {np.min(total_times):.2f}s |\n")
        f.write(f"| Max Total Time | {np.max(total_times):.2f}s |\n")
        f.write(f"| Std Dev | {np.std(total_times):.2f}s |\n\n")

        f.write("### Stage Breakdown (Average)\n\n")
        f.write(f"| Stage | Time (s) | Percentage |\n")
        f.write(f"|-------|----------|------------|\n")
        avg_synth = np.mean([row["synth_time_s"] for row in success_data])
        avg_preproc = np.mean([row["preprocess_time_s"] for row in success_data])
        avg_prove = np.mean([row["prove_time_s"] for row in success_data])
        avg_verify = np.mean([row["verify_time_s"] for row in success_data])
        avg_total = avg_synth + avg_preproc + avg_prove + avg_verify

        f.write(
            f"| Synthesizer | {avg_synth:.2f} | {avg_synth / avg_total * 100:.1f}% |\n"
        )
        f.write(
            f"| Preprocess | {avg_preproc:.2f} | {avg_preproc / avg_total * 100:.1f}% |\n"
        )
        f.write(f"| Prove | {avg_prove:.2f} | {avg_prove / avg_total * 100:.1f}% |\n")
        f.write(
            f"| Verify | {avg_verify:.2f} | {avg_verify / avg_total * 100:.1f}% |\n\n"
        )

        # GPU statistics
        f.write("## GPU Utilization Statistics\n\n")
        f.write("### Average GPU Utilization\n\n")
        avg_gpu_utils = [row["avg_gpu_util_%"] for row in success_data]
        f.write(f"| Metric | Value |\n")
        f.write(f"|--------|-------|\n")
        f.write(f"| Mean | {np.mean(avg_gpu_utils):.2f}% |\n")
        f.write(f"| Median | {np.median(avg_gpu_utils):.2f}% |\n")
        f.write(f"| Min | {np.min(avg_gpu_utils):.2f}% |\n")
        f.write(f"| Max | {np.max(avg_gpu_utils):.2f}% |\n")
        f.write(f"| Std Dev | {np.std(avg_gpu_utils):.2f}% |\n\n")

        f.write("### Peak GPU Utilization\n\n")
        max_gpu_utils = [row["max_gpu_util_%"] for row in success_data]
        f.write(f"| Metric | Value |\n")
        f.write(f"|--------|-------|\n")
        f.write(f"| Mean | {np.mean(max_gpu_utils):.2f}% |\n")
        f.write(f"| Median | {np.median(max_gpu_utils):.2f}% |\n")
        f.write(f"| Min | {np.min(max_gpu_utils):.2f}% |\n")
        f.write(f"| Max | {np.max(max_gpu_utils):.2f}% |\n")
        f.write(f"| Std Dev | {np.std(max_gpu_utils):.2f}% |\n\n")

        f.write("## Generated Visualizations\n\n")
        f.write(
            "- `timing_distribution.png` - Timing distribution across all transactions\n"
        )
        f.write("- `gpu_utilization.png` - GPU utilization patterns\n")
        f.write(
            "- `correlation_analysis.png` - Correlation between time and GPU usage\n"
        )
        f.write(
            "- `gpu_timeline_tx_*.png` - Detailed GPU timeline for individual transactions\n\n"
        )

        f.write("## Key Findings\n\n")

        # Calculate some insights
        high_gpu_util = sum(1 for row in success_data if row["avg_gpu_util_%"] > 80)
        low_gpu_util = sum(1 for row in success_data if row["avg_gpu_util_%"] < 30)

        f.write(
            f"- **{high_gpu_util}/{successful}** transactions had high GPU utilization (>80%)\n"
        )
        f.write(
            f"- **{low_gpu_util}/{successful}** transactions had low GPU utilization (<30%)\n"
        )
        f.write(
            f"- Prove stage accounts for **{avg_prove / avg_total * 100:.1f}%** of total time on average\n"
        )

    print(f"Generated report: {report_file}")


def main():
    parser = argparse.ArgumentParser(description="Analyze batch GPU analysis results")
    parser.add_argument("summary_file", help="Path to summary CSV file")
    parser.add_argument("gpu_file", help="Path to consolidated GPU data CSV file")
    parser.add_argument(
        "--output-dir",
        "-o",
        help="Output directory for plots (default: same as summary file)",
    )

    args = parser.parse_args()

    # Set output directory
    if args.output_dir:
        output_dir = Path(args.output_dir)
    else:
        output_dir = Path(args.summary_file).parent

    output_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 70)
    print("GPU BATCH ANALYSIS")
    print("=" * 70)
    print(f"Summary file: {args.summary_file}")
    print(f"GPU data file: {args.gpu_file}")
    print(f"Output directory: {output_dir}")
    print()

    try:
        # Load data
        print("Loading data...")
        summary_data = load_summary_data(args.summary_file)
        gpu_data = load_gpu_data(args.gpu_file)

        if not summary_data:
            print("Error: No data loaded from summary file")
            sys.exit(1)

        # Print statistics
        print_statistics(summary_data)

        # Generate plots
        print("\nGenerating visualizations...")
        plot_timing_distribution(summary_data, output_dir)
        plot_gpu_utilization(summary_data, output_dir)
        plot_correlation_analysis(summary_data, output_dir)
        plot_aggregated_gpu_analysis(gpu_data, summary_data, output_dir)

        # Generate report
        print("\nGenerating report...")
        generate_report(summary_data, output_dir)

        print("\n" + "=" * 70)
        print("ANALYSIS COMPLETE")
        print("=" * 70)
        print(f"\nAll outputs saved to: {output_dir}")
        print("\nGenerated Files:")
        print("  📊 timing_distribution.png - PROVING TIME focused analysis")
        print("  📈 gpu_utilization.png - GPU usage patterns per transaction")
        print("  📉 correlation_analysis.png - Prove time vs GPU correlation")
        print(
            "  📊 gpu_memory_usage_analysis.png - COMPREHENSIVE GPU/MEMORY STATISTICS"
        )
        print("  📋 ANALYSIS_REPORT.md - Comprehensive report")
        print(
            "\n🎯 PRIMARY FOCUS: Check 'gpu_memory_usage_analysis.png' for complete GPU/Memory analysis"
        )
        print(
            "🎯 STATISTICS: Includes mean, std dev, confidence intervals, and validity assessment"
        )
        print()

    except Exception as e:
        print(f"\nError: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
