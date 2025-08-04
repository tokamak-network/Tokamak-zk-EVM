#!/bin/bash

# Docker 컨테이너 외부 모니터링 스크립트
# Usage: ./monitor_container.sh <container_name> <command> [benchmark_name]

CONTAINER_NAME="$1"
COMMAND="$2"
BENCHMARK_NAME="${3:-benchmark}"

if [ -z "$CONTAINER_NAME" ] || [ -z "$COMMAND" ]; then
    echo "Usage: $0 <container_name> <command> [benchmark_name]"
    echo "Example: $0 my-container 'cargo run -p prove' prove_test"
    exit 1
fi

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUTPUT_DIR="${BENCHMARK_NAME}_${TIMESTAMP}"
CSV_FILE="${OUTPUT_DIR}/stats.csv"
LOG_FILE="${OUTPUT_DIR}/execution.log"
SUMMARY_FILE="${OUTPUT_DIR}/summary.txt"

# 출력 디렉토리 생성
mkdir -p "$OUTPUT_DIR"

echo "=== Docker Container CPU Benchmark Started ===" | tee "$SUMMARY_FILE"
echo "Container: $CONTAINER_NAME" | tee -a "$SUMMARY_FILE"
echo "Command: $COMMAND" | tee -a "$SUMMARY_FILE"
echo "Output Directory: $OUTPUT_DIR" | tee -a "$SUMMARY_FILE"
echo "Start Time: $(date)" | tee -a "$SUMMARY_FILE"
echo "" | tee -a "$SUMMARY_FILE"

# CSV 헤더 작성
echo "timestamp,cpu_percent,memory_usage_mb,memory_percent,net_io_in,net_io_out,block_io_in,block_io_out" > "$CSV_FILE"

# 백그라운드 모니터링 함수
monitor_container() {
    while true; do
        TIMESTAMP=$(date +%s)
        
        # docker stats에서 정보 가져오기
        STATS=$(docker stats --no-stream --format "{{.CPUPerc}},{{.MemUsage}},{{.MemPerc}},{{.NetIO}},{{.BlockIO}}" "$CONTAINER_NAME" 2>/dev/null)
        
        if [ -n "$STATS" ]; then
            # 데이터 파싱
            CPU_PERCENT=$(echo "$STATS" | cut -d',' -f1 | sed 's/%//')
            MEM_USAGE=$(echo "$STATS" | cut -d',' -f2 | cut -d'/' -f1 | sed 's/MiB\|MB\|GiB\|GB//g' | tr -d ' ')
            MEM_PERCENT=$(echo "$STATS" | cut -d',' -f3 | sed 's/%//')
            NET_IO=$(echo "$STATS" | cut -d',' -f4)
            BLOCK_IO=$(echo "$STATS" | cut -d',' -f5)
            
            # 네트워크 I/O 파싱 (예: 1.2kB / 2.3kB)
            NET_IO_IN=$(echo "$NET_IO" | cut -d'/' -f1 | tr -d ' ')
            NET_IO_OUT=$(echo "$NET_IO" | cut -d'/' -f2 | tr -d ' ')
            
            # 블록 I/O 파싱
            BLOCK_IO_IN=$(echo "$BLOCK_IO" | cut -d'/' -f1 | tr -d ' ')
            BLOCK_IO_OUT=$(echo "$BLOCK_IO" | cut -d'/' -f2 | tr -d ' ')
            
            # 메모리를 MB로 변환 (GiB인 경우)
            if echo "$STATS" | grep -q "GiB\|GB"; then
                MEM_USAGE=$(echo "$MEM_USAGE * 1024" | bc 2>/dev/null || echo "$MEM_USAGE")
            fi
            
            # CSV에 기록
            echo "$TIMESTAMP,$CPU_PERCENT,$MEM_USAGE,$MEM_PERCENT,$NET_IO_IN,$NET_IO_OUT,$BLOCK_IO_IN,$BLOCK_IO_OUT" >> "$CSV_FILE"
            
            # 실시간 출력
            printf "\r[%s] CPU: %s%% | Memory: %sMB (%s%%) | Net: %s/%s | Block: %s/%s" \
                   "$(date +%H:%M:%S)" "$CPU_PERCENT" "$MEM_USAGE" "$MEM_PERCENT" \
                   "$NET_IO_IN" "$NET_IO_OUT" "$BLOCK_IO_IN" "$BLOCK_IO_OUT"
        fi
        
        sleep 1
    done
}

# 모니터링 시작 (백그라운드)
monitor_container &
MONITOR_PID=$!

# 잠시 대기
sleep 2

# 컨테이너에서 명령 실행
START_TIME=$(date +%s)
echo "Executing command in container..." | tee -a "$SUMMARY_FILE"

# 명령 실행 및 로그 저장
docker exec "$CONTAINER_NAME" bash -c "cd /app/packages && $COMMAND" 2>&1 | tee "$LOG_FILE"
COMMAND_EXIT_CODE=${PIPESTATUS[0]}

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# 모니터링 중지
kill $MONITOR_PID 2>/dev/null
echo "" # 새 줄

echo "" | tee -a "$SUMMARY_FILE"
echo "=== Benchmark Completed ===" | tee -a "$SUMMARY_FILE"
echo "End Time: $(date)" | tee -a "$SUMMARY_FILE"
echo "Total Duration: ${DURATION} seconds" | tee -a "$SUMMARY_FILE"
echo "Exit Code: $COMMAND_EXIT_CODE" | tee -a "$SUMMARY_FILE"

# 결과 분석
if [ -f "$CSV_FILE" ]; then
    echo "" | tee -a "$SUMMARY_FILE"
    echo "=== Performance Analysis ===" | tee -a "$SUMMARY_FILE"
    
    # CPU 분석
    CPU_AVG=$(awk -F',' 'NR>1 && $2!="" {sum+=$2; count++} END {if(count>0) print sum/count}' "$CSV_FILE")
    CPU_MAX=$(awk -F',' 'NR>1 && $2!="" {if($2>max || max=="") max=$2} END {print max}' "$CSV_FILE")
    CPU_MIN=$(awk -F',' 'NR>1 && $2!="" {if($2<min || min=="") min=$2} END {print min}' "$CSV_FILE")
    
    if [ -n "$CPU_AVG" ]; then
        echo "CPU Usage:" | tee -a "$SUMMARY_FILE"
        echo "  Average: ${CPU_AVG}%" | tee -a "$SUMMARY_FILE"
        echo "  Peak: ${CPU_MAX}%" | tee -a "$SUMMARY_FILE"
        echo "  Minimum: ${CPU_MIN}%" | tee -a "$SUMMARY_FILE"
    fi
    
    # 메모리 분석
    MEM_AVG=$(awk -F',' 'NR>1 && $3!="" {sum+=$3; count++} END {if(count>0) print sum/count}' "$CSV_FILE")
    MEM_MAX=$(awk -F',' 'NR>1 && $3!="" {if($3>max || max=="") max=$3} END {print max}' "$CSV_FILE")
    
    if [ -n "$MEM_AVG" ]; then
        echo "" | tee -a "$SUMMARY_FILE"
        echo "Memory Usage:" | tee -a "$SUMMARY_FILE"
        echo "  Average: ${MEM_AVG} MB" | tee -a "$SUMMARY_FILE"
        echo "  Peak: ${MEM_MAX} MB" | tee -a "$SUMMARY_FILE"
    fi
    
    # 낮은 CPU 사용률 구간 찾기
    echo "" | tee -a "$SUMMARY_FILE"
    echo "Low CPU Usage Periods (<50%):" | tee -a "$SUMMARY_FILE"
    awk -F',' 'NR>1 && $2!="" && $2<50 {
        time = strftime("%H:%M:%S", $1)
        print "  " time ": " $2 "%"
    }' "$CSV_FILE" | head -10 | tee -a "$SUMMARY_FILE"
    
    # 높은 CPU 사용률 구간
    echo "" | tee -a "$SUMMARY_FILE"
    echo "High CPU Usage Periods (>90%):" | tee -a "$SUMMARY_FILE"
    awk -F',' 'NR>1 && $2!="" && $2>90 {
        time = strftime("%H:%M:%S", $1)
        print "  " time ": " $2 "%"
    }' "$CSV_FILE" | head -10 | tee -a "$SUMMARY_FILE"
fi

echo "" | tee -a "$SUMMARY_FILE"
echo "Results saved in: $OUTPUT_DIR" | tee -a "$SUMMARY_FILE"
echo "Files:" | tee -a "$SUMMARY_FILE"
echo "  - stats.csv: Detailed statistics" | tee -a "$SUMMARY_FILE"
echo "  - execution.log: Command output" | tee -a "$SUMMARY_FILE"
echo "  - summary.txt: This summary" | tee -a "$SUMMARY_FILE"

exit $COMMAND_EXIT_CODE