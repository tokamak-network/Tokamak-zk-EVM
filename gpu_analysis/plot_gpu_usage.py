#!/usr/bin/env python3
"""
GPU Usage Plotter
Visualizes GPU usage data collected during benchmark runs.
Usage: python3 plot_gpu_usage.py <gpu_usage.csv> [output.png]
"""

import sys
import csv
from datetime import datetime
import matplotlib

matplotlib.use("Agg")  # Use non-interactive backend
import matplotlib.pyplot as plt
import matplotlib.dates as mdates


def parse_timestamp(ts_str):
    """Parse timestamp string to datetime object."""
    # Try different timestamp formats
    formats = [
        "%Y-%m-%d_%H:%M:%S.%f",  # 2025-10-28_14:52:08.350
        "%Y-%m-%d_%H:%M:%S",  # 2025-10-28_14:52:08
        "%Y%m%d_%H%M%S",  # 20251028_145208
    ]

    for fmt in formats:
        try:
            return datetime.strptime(ts_str, fmt)
        except ValueError:
            continue

    # If none work, raise error with helpful message
    raise ValueError(f"Could not parse timestamp: {ts_str}")


def load_gpu_data(csv_file):
    """Load GPU usage data from CSV file."""
    timestamps = []
    gpu_util = []
    mem_util = []
    mem_used = []
    temp = []
    power = []

    with open(csv_file, "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                timestamps.append(parse_timestamp(row["timestamp"]))
                gpu_util.append(float(row["gpu_util_%"]))
                mem_util.append(float(row["memory_util_%"]))
                mem_used.append(float(row["memory_used_MiB"]))
                temp.append(float(row["temperature_C"]))
                power.append(float(row["power_W"]))
            except (ValueError, KeyError) as e:
                print(f"Warning: Skipping row due to error: {e}")
                continue

    return {
        "timestamps": timestamps,
        "gpu_util": gpu_util,
        "mem_util": mem_util,
        "mem_used": mem_used,
        "temp": temp,
        "power": power,
    }


def plot_gpu_usage(data, output_file=None):
    """Create visualization of GPU usage."""
    fig, axes = plt.subplots(4, 1, figsize=(14, 12))
    fig.suptitle("GPU Usage During Benchmark", fontsize=16, fontweight="bold")

    timestamps = data["timestamps"]

    # Convert to relative time in seconds for better readability
    if timestamps:
        start_time = timestamps[0]
        relative_times = [(t - start_time).total_seconds() for t in timestamps]
    else:
        print("Error: No valid timestamp data")
        return

    # Plot 1: GPU Utilization
    axes[0].plot(
        relative_times, data["gpu_util"], "b-", linewidth=1.5, label="GPU Utilization"
    )
    axes[0].fill_between(relative_times, data["gpu_util"], alpha=0.3)
    axes[0].set_ylabel("GPU Utilization (%)", fontweight="bold")
    axes[0].set_ylim([0, 105])
    axes[0].grid(True, alpha=0.3)
    axes[0].legend(loc="upper right")

    # Add statistics
    avg_gpu = sum(data["gpu_util"]) / len(data["gpu_util"]) if data["gpu_util"] else 0
    max_gpu = max(data["gpu_util"]) if data["gpu_util"] else 0
    axes[0].axhline(
        y=avg_gpu, color="r", linestyle="--", alpha=0.5, label=f"Avg: {avg_gpu:.1f}%"
    )
    axes[0].text(
        0.02,
        0.95,
        f"Avg: {avg_gpu:.1f}% | Max: {max_gpu:.1f}%",
        transform=axes[0].transAxes,
        fontsize=10,
        verticalalignment="top",
        bbox=dict(boxstyle="round", facecolor="white", alpha=0.8),
    )

    # Plot 2: Memory Usage
    axes[1].plot(
        relative_times,
        data["mem_util"],
        "g-",
        linewidth=1.5,
        label="Memory Utilization",
    )
    axes[1].fill_between(relative_times, data["mem_util"], alpha=0.3, color="g")
    axes[1].set_ylabel("Memory Utilization (%)", fontweight="bold")
    axes[1].set_ylim([0, 105])
    axes[1].grid(True, alpha=0.3)

    avg_mem = sum(data["mem_util"]) / len(data["mem_util"]) if data["mem_util"] else 0
    max_mem = max(data["mem_util"]) if data["mem_util"] else 0
    axes[1].text(
        0.02,
        0.95,
        f"Avg: {avg_mem:.1f}% | Max: {max_mem:.1f}%",
        transform=axes[1].transAxes,
        fontsize=10,
        verticalalignment="top",
        bbox=dict(boxstyle="round", facecolor="white", alpha=0.8),
    )

    # Plot 3: Temperature
    axes[2].plot(relative_times, data["temp"], "r-", linewidth=1.5, label="Temperature")
    axes[2].fill_between(relative_times, data["temp"], alpha=0.3, color="r")
    axes[2].set_ylabel("Temperature (°C)", fontweight="bold")
    axes[2].grid(True, alpha=0.3)

    avg_temp = sum(data["temp"]) / len(data["temp"]) if data["temp"] else 0
    max_temp = max(data["temp"]) if data["temp"] else 0
    axes[2].text(
        0.02,
        0.95,
        f"Avg: {avg_temp:.1f}°C | Max: {max_temp:.1f}°C",
        transform=axes[2].transAxes,
        fontsize=10,
        verticalalignment="top",
        bbox=dict(boxstyle="round", facecolor="white", alpha=0.8),
    )

    # Plot 4: Power Consumption
    axes[3].plot(relative_times, data["power"], "m-", linewidth=1.5, label="Power Draw")
    axes[3].fill_between(relative_times, data["power"], alpha=0.3, color="m")
    axes[3].set_ylabel("Power Draw (W)", fontweight="bold")
    axes[3].set_xlabel("Time (seconds)", fontweight="bold")
    axes[3].grid(True, alpha=0.3)

    avg_power = sum(data["power"]) / len(data["power"]) if data["power"] else 0
    max_power = max(data["power"]) if data["power"] else 0
    axes[3].text(
        0.02,
        0.95,
        f"Avg: {avg_power:.1f}W | Max: {max_power:.1f}W",
        transform=axes[3].transAxes,
        fontsize=10,
        verticalalignment="top",
        bbox=dict(boxstyle="round", facecolor="white", alpha=0.8),
    )

    plt.tight_layout()

    if output_file:
        plt.savefig(output_file, dpi=300, bbox_inches="tight")
        print(f"Plot saved to: {output_file}")
    else:
        plt.show()


def print_summary(data):
    """Print summary statistics."""
    print("\n" + "=" * 50)
    print("GPU Usage Summary Statistics")
    print("=" * 50)

    if not data["gpu_util"]:
        print("No data available")
        return

    duration = (data["timestamps"][-1] - data["timestamps"][0]).total_seconds()

    print(f"\nDuration: {duration:.2f} seconds")
    print(f"Samples: {len(data['gpu_util'])}")
    print(f"Sample Rate: {len(data['gpu_util']) / duration:.2f} Hz")

    print(f"\nGPU Utilization:")
    print(f"  Average: {sum(data['gpu_util']) / len(data['gpu_util']):.2f}%")
    print(f"  Maximum: {max(data['gpu_util']):.2f}%")
    print(f"  Minimum: {min(data['gpu_util']):.2f}%")

    print(f"\nMemory Utilization:")
    print(f"  Average: {sum(data['mem_util']) / len(data['mem_util']):.2f}%")
    print(f"  Maximum: {max(data['mem_util']):.2f}%")
    print(f"  Average Used: {sum(data['mem_used']) / len(data['mem_used']):.2f} MiB")

    print(f"\nTemperature:")
    print(f"  Average: {sum(data['temp']) / len(data['temp']):.2f}°C")
    print(f"  Maximum: {max(data['temp']):.2f}°C")

    print(f"\nPower Draw:")
    print(f"  Average: {sum(data['power']) / len(data['power']):.2f}W")
    print(f"  Maximum: {max(data['power']):.2f}W")
    print(
        f"  Total Energy: {sum(data['power']) * duration / len(data['power']) / 3600:.6f} Wh"
    )

    print("=" * 50 + "\n")


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 plot_gpu_usage.py <gpu_usage.csv> [output.png]")
        print("\nIf output.png is not specified, it will auto-generate a filename.")
        print("\nExample:")
        print("  python3 plot_gpu_usage.py results/gpu_usage_20231028_143000.csv")
        print(
            "  python3 plot_gpu_usage.py results/gpu_usage_20231028_143000.csv my_plot.png"
        )
        sys.exit(1)

    csv_file = sys.argv[1]

    # Auto-generate output filename if not provided
    if len(sys.argv) > 2:
        output_file = sys.argv[2]
    else:
        # Generate output filename from input CSV filename
        import os

        base_name = os.path.splitext(csv_file)[0]
        output_file = f"{base_name}_plot.png"

    try:
        print(f"Loading GPU usage data from: {csv_file}")
        data = load_gpu_data(csv_file)

        if not data["timestamps"]:
            print("Error: No valid data found in CSV file")
            sys.exit(1)

        print_summary(data)

        # Plot and save
        try:
            plot_gpu_usage(data, output_file)
        except ImportError:
            print("\nWarning: matplotlib not available. Install with:")
            print("  pip3 install matplotlib")
            print("\nStatistics printed above.")

    except FileNotFoundError:
        print(f"Error: File not found: {csv_file}")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
