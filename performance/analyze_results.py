#!/usr/bin/env python3
"""
Docker 컨테이너 벤치마크 결과 분석 스크립트
Usage: python analyze_results.py <csv_file>
"""

import sys
import pandas as pd
import matplotlib.pyplot as plt
from datetime import datetime
import argparse
import os

def convert_size_to_mb(size_str):
    """크기 문자열을 MB로 변환"""
    if pd.isna(size_str) or size_str == '':
        return 0
    
    size_str = str(size_str).strip()
    
    if 'GiB' in size_str or 'GB' in size_str:
        return float(size_str.replace('GiB', '').replace('GB', '').strip()) * 1024
    elif 'MiB' in size_str or 'MB' in size_str:
        return float(size_str.replace('MiB', '').replace('MB', '').strip())
    elif 'KiB' in size_str or 'KB' in size_str:
        return float(size_str.replace('KiB', '').replace('KB', '').strip()) / 1024
    else:
        try:
            return float(size_str)
        except:
            return 0

def analyze_benchmark_results(csv_file):
    """벤치마크 결과 분석"""
    
    try:
        # CSV 파일 읽기
        df = pd.read_csv(csv_file)
        
        if len(df) == 0:
            print("Error: CSV file is empty")
            return
        
        # 타임스탬프를 datetime으로 변환
        if 'timestamp' in df.columns:
            df['datetime'] = pd.to_datetime(df['timestamp'], unit='s')
            start_time = df['datetime'].min()
            end_time = df['datetime'].max()
            duration = (end_time - start_time).total_seconds()
        else:
            duration = len(df)  # 샘플 수로 대체
        
        print("=" * 50)
        print("DOCKER CONTAINER BENCHMARK ANALYSIS")
        print("=" * 50)
        print(f"CSV File: {csv_file}")
        print(f"Data Points: {len(df)}")
        print(f"Duration: {duration:.1f} seconds")
        
        if 'datetime' in df.columns:
            print(f"Start Time: {start_time.strftime('%Y-%m-%d %H:%M:%S')}")
            print(f"End Time: {end_time.strftime('%Y-%m-%d %H:%M:%S')}")
        
        print()
        
        # CPU 분석
        if 'cpu_percent' in df.columns:
            # 빈 값 제거
            cpu_data = pd.to_numeric(df['cpu_percent'], errors='coerce').dropna()
            
            if len(cpu_data) > 0:
                print("CPU USAGE ANALYSIS")
                print("-" * 30)
                print(f"Average CPU: {cpu_data.mean():.1f}%")
                print(f"Peak CPU: {cpu_data.max():.1f}%")
                print(f"Minimum CPU: {cpu_data.min():.1f}%")
                print(f"Std Deviation: {cpu_data.std():.1f}%")
                print()
                
                # CPU 사용률 분포
                low_usage = len(cpu_data[cpu_data < 30])
                medium_usage = len(cpu_data[(cpu_data >= 30) & (cpu_data < 70)])
                high_usage = len(cpu_data[cpu_data >= 70])
                
                print("CPU Usage Distribution:")
                print(f"  Low (<30%): {low_usage} samples ({low_usage/len(cpu_data)*100:.1f}%)")
                print(f"  Medium (30-70%): {medium_usage} samples ({medium_usage/len(cpu_data)*100:.1f}%)")
                print(f"  High (>70%): {high_usage} samples ({high_usage/len(cpu_data)*100:.1f}%)")
                print()
                
                # 성능 비효율 구간 분석
                idle_periods = cpu_data[cpu_data < 20]
                if len(idle_periods) > 0:
                    print(f"⚠️  Potential idle periods: {len(idle_periods)} samples with CPU < 20%")
                
                overload_periods = cpu_data[cpu_data > 95]
                if len(overload_periods) > 0:
                    print(f"⚠️  Potential overload periods: {len(overload_periods)} samples with CPU > 95%")
                print()
        
        # 메모리 분석
        if 'memory_usage_mb' in df.columns:
            # 메모리 데이터 정리
            df['memory_mb_clean'] = df['memory_usage_mb'].apply(convert_size_to_mb)
            memory_data = df['memory_mb_clean'][df['memory_mb_clean'] > 0]
            
            if len(memory_data) > 0:
                print("MEMORY USAGE ANALYSIS")
                print("-" * 30)
                print(f"Average Memory: {memory_data.mean():.0f} MB")
                print(f"Peak Memory: {memory_data.max():.0f} MB")
                print(f"Minimum Memory: {memory_data.min():.0f} MB")
                print(f"Memory Growth: {memory_data.iloc[-1] - memory_data.iloc[0]:+.0f} MB")
                print()
        
        # 메모리 퍼센트 분석
        if 'memory_percent' in df.columns:
            mem_percent_data = pd.to_numeric(df['memory_percent'], errors='coerce').dropna()
            
            if len(mem_percent_data) > 0:
                print("MEMORY PERCENTAGE ANALYSIS")
                print("-" * 30)
                print(f"Average Memory %: {mem_percent_data.mean():.1f}%")
                print(f"Peak Memory %: {mem_percent_data.max():.1f}%")
                
                if mem_percent_data.max() > 90:
                    print("⚠️  High memory usage detected (>90%)")
                print()
        
        # 성능 요약
        print("PERFORMANCE SUMMARY")
        print("-" * 30)
        
        if 'cpu_percent' in df.columns:
            cpu_data = pd.to_numeric(df['cpu_percent'], errors='coerce').dropna()
            avg_cpu = cpu_data.mean() if len(cpu_data) > 0 else 0
            
            if avg_cpu > 80:
                print("🔥 High CPU utilization - Good performance")
            elif avg_cpu > 50:
                print("⚡ Moderate CPU utilization")
            else:
                print("🐌 Low CPU utilization - Potential bottlenecks")
        
        efficiency = calculate_efficiency(df)
        if efficiency:
            print(f"Overall Efficiency: {efficiency:.1f}%")
        
        print()
        
        # 시각화 생성
        create_visualizations(df, csv_file)
        
    except Exception as e:
        print(f"Error analyzing {csv_file}: {e}")
        import traceback
        traceback.print_exc()

def calculate_efficiency(df):
    """성능 효율성 계산"""
    try:
        cpu_data = pd.to_numeric(df['cpu_percent'], errors='coerce').dropna()
        if len(cpu_data) == 0:
            return None
        
        # 50% 이상 CPU 사용률을 보인 시간의 비율
        efficient_time = len(cpu_data[cpu_data >= 50])
        total_time = len(cpu_data)
        
        return (efficient_time / total_time) * 100
    except:
        return None

def create_visualizations(df, csv_file):
    """시각화 생성"""
    
    try:
        fig, axes = plt.subplots(2, 2, figsize=(15, 10))
        fig.suptitle(f'Docker Container Performance Analysis\n{os.path.basename(csv_file)}', fontsize=14)
        
        # CPU 사용률 시계열
        if 'datetime' in df.columns and 'cpu_percent' in df.columns:
            cpu_data = pd.to_numeric(df['cpu_percent'], errors='coerce')
            axes[0, 0].plot(df['datetime'], cpu_data, 'b-', linewidth=1, alpha=0.8)
            axes[0, 0].set_title('CPU Usage Over Time')
            axes[0, 0].set_ylabel('CPU Usage (%)')
            axes[0, 0].grid(True, alpha=0.3)
            axes[0, 0].axhline(y=50, color='orange', linestyle='--', alpha=0.7, label='50% threshold')
            axes[0, 0].axhline(y=80, color='red', linestyle='--', alpha=0.7, label='80% threshold')
            axes[0, 0].legend()
            axes[0, 0].tick_params(axis='x', rotation=45)
        
        # 메모리 사용량 시계열
        if 'datetime' in df.columns and 'memory_usage_mb' in df.columns:
            df['memory_mb_clean'] = df['memory_usage_mb'].apply(convert_size_to_mb)
            memory_data = df['memory_mb_clean']
            axes[0, 1].plot(df['datetime'], memory_data, 'g-', linewidth=1, alpha=0.8)
            axes[0, 1].set_title('Memory Usage Over Time')
            axes[0, 1].set_ylabel('Memory Usage (MB)')
            axes[0, 1].grid(True, alpha=0.3)
            axes[0, 1].tick_params(axis='x', rotation=45)
        
        # CPU 사용률 히스토그램
        if 'cpu_percent' in df.columns:
            cpu_data = pd.to_numeric(df['cpu_percent'], errors='coerce').dropna()
            if len(cpu_data) > 0:
                axes[1, 0].hist(cpu_data, bins=20, alpha=0.7, color='skyblue', edgecolor='black')
                axes[1, 0].set_title('CPU Usage Distribution')
                axes[1, 0].set_xlabel('CPU Usage (%)')
                axes[1, 0].set_ylabel('Frequency')
                axes[1, 0].grid(True, alpha=0.3)
                axes[1, 0].axvline(x=cpu_data.mean(), color='red', linestyle='--', label=f'Mean: {cpu_data.mean():.1f}%')
                axes[1, 0].legend()
        
        # 메모리 vs CPU 산점도
        if 'cpu_percent' in df.columns and 'memory_percent' in df.columns:
            cpu_data = pd.to_numeric(df['cpu_percent'], errors='coerce')
            mem_data = pd.to_numeric(df['memory_percent'], errors='coerce')
            
            # 유효한 데이터만 사용
            valid_mask = ~(cpu_data.isna() | mem_data.isna())
            if valid_mask.sum() > 0:
                axes[1, 1].scatter(cpu_data[valid_mask], mem_data[valid_mask], alpha=0.6, s=10)
                axes[1, 1].set_title('Memory vs CPU Usage')
                axes[1, 1].set_xlabel('CPU Usage (%)')
                axes[1, 1].set_ylabel('Memory Usage (%)')
                axes[1, 1].grid(True, alpha=0.3)
        
        plt.tight_layout()
        
        # 파일명에서 확장자 제거하고 _analysis.png 추가
        output_file = csv_file.replace('.csv', '_analysis.png')
        plt.savefig(output_file, dpi=300, bbox_inches='tight')
        print(f"📊 Visualization saved as: {output_file}")
        
        # 선택적으로 그래프 표시
        # plt.show()
        
    except Exception as e:
        print(f"Error creating visualization: {e}")

def main():
    parser = argparse.ArgumentParser(description='Analyze Docker container benchmark CSV files')
    parser.add_argument('csv_file', help='Path to the CSV file to analyze')
    parser.add_argument('--show-plot', action='store_true', help='Display the plot interactively')
    
    args = parser.parse_args()
    
    if not os.path.exists(args.csv_file):
        print(f"Error: File '{args.csv_file}' not found")
        sys.exit(1)
    
    analyze_benchmark_results(args.csv_file)

if __name__ == '__main__':
    main()