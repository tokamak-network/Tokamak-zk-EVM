# PowerShell 향상된 실시간 Docker 컨테이너 모니터링
# Usage: .\realtime_monitor_enhanced.ps1 -Container "container_name_or_id"

param(
    [Parameter(Mandatory=$true)]
    [string]$Container,
    
    [Parameter(Mandatory=$false)]
    [int]$RefreshInterval = 1,
    
    [Parameter(Mandatory=$false)]
    [string]$BenchmarkName = "realtime_monitor"
)

$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$OutputDir = "${BenchmarkName}_${Timestamp}"
$CsvFile = "${OutputDir}\stats.csv"
$JsonFile = "${OutputDir}\stats.json"
$LogFile = "${OutputDir}\monitoring.log"
$SummaryFile = "${OutputDir}\summary.json"

# 출력 디렉토리 생성
New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

Write-Host "=== Enhanced Real-time Docker Container Monitor ===" -ForegroundColor Cyan
Write-Host "Container: $Container" -ForegroundColor Yellow
Write-Host "Refresh Interval: $RefreshInterval second(s)" -ForegroundColor Yellow
Write-Host "Output Directory: $OutputDir" -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop and generate reports..." -ForegroundColor Yellow
Write-Host ""

# 메타데이터 초기화
$MonitoringData = @{
    metadata = @{
        container_name = $Container
        benchmark_name = $BenchmarkName
        start_time = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffffZ")
        end_time = $null
        duration_seconds = $null
        refresh_interval = $RefreshInterval
        host_info = @{
            os = $env:OS
            computer_name = $env:COMPUTERNAME
            user = $env:USERNAME
            docker_version = (docker --version 2>$null)
        }
    }
    performance_data = @()
    events = @()
    analysis = @{}
}

# CSV 헤더 작성
"timestamp,iso_timestamp,cpu_percent,memory_usage_mb,memory_percent,net_io_in,net_io_out,block_io_in,block_io_out" | Out-File -FilePath $CsvFile -Encoding UTF8

# JSON 배열 초기화
$PerformanceData = @()
$Events = @()

$previousCpu = 0
$cpuTrend = ""
$StartTime = Get-Date

# 로그 시작
"=== Realtime Monitoring Started ===" | Out-File -FilePath $LogFile -Encoding UTF8
"Start Time: $(Get-Date)" | Add-Content -Path $LogFile
"Container: $Container" | Add-Content -Path $LogFile
"" | Add-Content -Path $LogFile

try {
    while ($true) {
        $timestamp = Get-Date
        $unixTimestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
        $isoTimestamp = [DateTimeOffset]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffffZ")
        
        try {
            # Docker stats 가져오기
            $stats = docker stats --no-stream --format "{{.CPUPerc}},{{.MemUsage}},{{.MemPerc}},{{.NetIO}},{{.BlockIO}}" $Container 2>$null
            
            if ($stats) {
                $parts = $stats.Split(',')
                $cpuPercent = [float]($parts[0] -replace '%', '')
                $memUsage = $parts[1].Split('/')[0].Trim()
                $memPercent = [float]($parts[2] -replace '%', '')
                $netIO = $parts[3]
                $blockIO = $parts[4]
                
                # CPU 트렌드 계산
                if ($cpuPercent -gt $previousCpu + 10) {
                    $cpuTrend = "SPIKE UP"
                    $cpuColor = "Red"
                    $Events += @{
                        timestamp = $unixTimestamp
                        type = "cpu_spike"
                        message = "CPU usage spiked from $previousCpu% to $cpuPercent%"
                        severity = "high"
                    }
                } elseif ($cpuPercent -lt $previousCpu - 10) {
                    $cpuTrend = "DROP DOWN"
                    $cpuColor = "Green"
                    $Events += @{
                        timestamp = $unixTimestamp
                        type = "cpu_drop"
                        message = "CPU usage dropped from $previousCpu% to $cpuPercent%"
                        severity = "info"
                    }
                } elseif ($cpuPercent -gt 90) {
                    $cpuTrend = "HIGH"
                    $cpuColor = "Red"
                } elseif ($cpuPercent -lt 10) {
                    $cpuTrend = "LOW"
                    $cpuColor = "Green"
                } else {
                    $cpuTrend = "NORMAL"
                    $cpuColor = "Yellow"
                }
                
                # 메모리 색상 및 이벤트
                if ($memPercent -gt 80) { 
                    $memColor = "Red"
                    if ($memPercent -gt 90) {
                        $Events += @{
                            timestamp = $unixTimestamp
                            type = "memory_high"
                            message = "High memory usage: $memPercent%"
                            severity = "warning"
                        }
                    }
                } elseif ($memPercent -gt 60) { 
                    $memColor = "Yellow" 
                } else { 
                    $memColor = "Green" 
                }
                
                # 메모리를 MB로 변환
                $memUsageMB = $memUsage -replace 'MiB|MB|GiB|GB', ''
                if ($memUsage -match 'GiB|GB') {
                    $memUsageMB = [math]::Round([float]$memUsageMB * 1024, 2)
                }
                
                # 네트워크 I/O 파싱
                $netIOIn = $netIO.Split('/')[0].Trim()
                $netIOOut = $netIO.Split('/')[1].Trim()
                
                # 블록 I/O 파싱
                $blockIOIn = $blockIO.Split('/')[0].Trim()
                $blockIOOut = $blockIO.Split('/')[1].Trim()
                
                # CSV에 추가
                $csvLine = "$unixTimestamp,$isoTimestamp,$cpuPercent,$memUsageMB,$memPercent,$netIOIn,$netIOOut,$blockIOIn,$blockIOOut"
                Add-Content -Path $CsvFile -Value $csvLine
                
                # JSON 데이터 객체 생성
                $dataPoint = @{
                    timestamp = $unixTimestamp
                    iso_timestamp = $isoTimestamp
                    cpu_percent = $cpuPercent
                    memory_usage_mb = [float]$memUsageMB
                    memory_percent = $memPercent
                    network_io = @{
                        input = $netIOIn
                        output = $netIOOut
                    }
                    block_io = @{
                        input = $blockIOIn
                        output = $blockIOOut
                    }
                    cpu_trend = $cpuTrend
                }
                
                $PerformanceData += $dataPoint
                
                # 화면 출력
                Write-Host "[$($timestamp.ToString('HH:mm:ss'))] CPU: $($cpuPercent.ToString('F1'))% ($cpuTrend) | Memory: $memUsage ($($memPercent.ToString('F1'))%) | Net: $netIOIn/$netIOOut | Block: $blockIOIn/$blockIOOut" -ForegroundColor White
                
                # 로그에 기록
                "[$($timestamp.ToString('HH:mm:ss'))] CPU: $($cpuPercent.ToString('F1'))% | Memory: $memUsage | Net: $netIOIn/$netIOOut" | Add-Content -Path $LogFile
                
                $previousCpu = $cpuPercent
                
                # 경고 표시
                if ($cpuPercent -gt 95) {
                    Write-Host "  WARNING: CRITICAL CPU USAGE!" -ForegroundColor Red
                    "  WARNING: CRITICAL CPU USAGE ($cpuPercent%)" | Add-Content -Path $LogFile
                }
                if ($memPercent -gt 95) {
                    Write-Host "  WARNING: CRITICAL MEMORY USAGE!" -ForegroundColor Red
                    "  WARNING: CRITICAL MEMORY USAGE ($memPercent%)" | Add-Content -Path $LogFile
                }
                
            } else {
                Write-Host "[$($timestamp.ToString('HH:mm:ss'))] Container not found or not running" -ForegroundColor Red
                "[$($timestamp.ToString('HH:mm:ss'))] Container not found or not running" | Add-Content -Path $LogFile
            }
        } catch {
            Write-Host "[$($timestamp.ToString('HH:mm:ss'))] Error: $_" -ForegroundColor Red
            "[$($timestamp.ToString('HH:mm:ss'))] Error: $_" | Add-Content -Path $LogFile
        }
        
        Start-Sleep -Seconds $RefreshInterval
    }
} catch {
    # Ctrl+C나 중단 시 실행
    $EndTime = Get-Date
    $Duration = ($EndTime - $StartTime).TotalSeconds
    
    Write-Host ""
    Write-Host "=== Generating Reports ===" -ForegroundColor Cyan
    
    # 메타데이터 완성
    $MonitoringData.metadata.end_time = $EndTime.ToString("yyyy-MM-ddTHH:mm:ss.fffffZ")
    $MonitoringData.metadata.duration_seconds = [math]::Round($Duration, 2)
    $MonitoringData.performance_data = $PerformanceData
    $MonitoringData.events = $Events
    
    # JSON 파일들 생성
    $PerformanceData | ConvertTo-Json -Depth 3 | Out-File -FilePath $JsonFile -Encoding UTF8
    
    # 분석 수행
    if ($PerformanceData.Count -gt 0) {
        $cpuValues = $PerformanceData | ForEach-Object { $_.cpu_percent }
        $memValues = $PerformanceData | ForEach-Object { $_.memory_usage_mb }
        
        $MonitoringData.analysis = @{
            data_points = $PerformanceData.Count
            duration_seconds = [math]::Round($Duration, 2)
            cpu_analysis = @{
                average = [math]::Round(($cpuValues | Measure-Object -Average).Average, 2)
                maximum = ($cpuValues | Measure-Object -Maximum).Maximum
                minimum = ($cpuValues | Measure-Object -Minimum).Minimum
                std_deviation = if ($cpuValues.Count -gt 1) { [math]::Round([System.Math]::Sqrt((($cpuValues | ForEach-Object { ($_ - ($cpuValues | Measure-Object -Average).Average) * ($_ - ($cpuValues | Measure-Object -Average).Average) }) | Measure-Object -Sum).Sum / ($cpuValues.Count - 1)), 2) } else { 0 }
                high_usage_count = ($cpuValues | Where-Object { $_ -gt 80 }).Count
                low_usage_count = ($cpuValues | Where-Object { $_ -lt 20 }).Count
                spikes_count = $Events | Where-Object { $_.type -eq "cpu_spike" } | Measure-Object | Select-Object -ExpandProperty Count
            }
            memory_analysis = @{
                average_mb = [math]::Round(($memValues | Measure-Object -Average).Average, 2)
                peak_mb = ($memValues | Measure-Object -Maximum).Maximum
                minimum_mb = ($memValues | Measure-Object -Minimum).Minimum
                growth_mb = if ($memValues.Count -gt 1) { [math]::Round($memValues[-1] - $memValues[0], 2) } else { 0 }
            }
            efficiency_metrics = @{
                high_cpu_time_percent = [math]::Round((($cpuValues | Where-Object { $_ -gt 50 }).Count / $cpuValues.Count) * 100, 1)
                idle_time_percent = [math]::Round((($cpuValues | Where-Object { $_ -lt 10 }).Count / $cpuValues.Count) * 100, 1)
                event_count = $Events.Count
            }
        }
        
        Write-Host ""
        Write-Host "=== Quick Analysis ===" -ForegroundColor Green
        Write-Host "Data Points: $($PerformanceData.Count)" -ForegroundColor White
        Write-Host "Duration: $([math]::Round($Duration, 1)) seconds" -ForegroundColor White
        Write-Host "Average CPU: $($MonitoringData.analysis.cpu_analysis.average)%" -ForegroundColor White
        Write-Host "Peak CPU: $($MonitoringData.analysis.cpu_analysis.maximum)%" -ForegroundColor White
        Write-Host "Average Memory: $($MonitoringData.analysis.memory_analysis.average_mb) MB" -ForegroundColor White
        Write-Host "Events Detected: $($Events.Count)" -ForegroundColor White
    }
    
    # 최종 요약 JSON 저장
    $MonitoringData | ConvertTo-Json -Depth 5 | Out-File -FilePath $SummaryFile -Encoding UTF8
    
    # 로그 마무리
    "" | Add-Content -Path $LogFile
    "=== Monitoring Completed ===" | Add-Content -Path $LogFile
    "End Time: $EndTime" | Add-Content -Path $LogFile
    "Duration: $([math]::Round($Duration, 2)) seconds" | Add-Content -Path $LogFile
    "Data Points: $($PerformanceData.Count)" | Add-Content -Path $LogFile
    
    Write-Host ""
    Write-Host "Results saved in: $OutputDir" -ForegroundColor Green
    Write-Host "Files generated:" -ForegroundColor Yellow
    Write-Host "  📊 stats.csv - Raw monitoring data (CSV)" -ForegroundColor Gray
    Write-Host "  📋 stats.json - Performance data (JSON)" -ForegroundColor Gray
    Write-Host "  📝 summary.json - Complete analysis report" -ForegroundColor Gray
    Write-Host "  📄 monitoring.log - Monitoring session log" -ForegroundColor Gray
}