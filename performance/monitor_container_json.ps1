# PowerShell 스크립트: Docker 컨테이너 CPU 벤치마킹 (JSON + CSV 출력)
# Usage: .\monitor_container_json.ps1 -Container "container_name_or_id" -Command "cargo run -p prove" -BenchmarkName "prove_test"

param(
    [Parameter(Mandatory=$true)]
    [string]$Container,
    
    [Parameter(Mandatory=$true)]
    [string]$Command,
    
    [Parameter(Mandatory=$false)]
    [string]$BenchmarkName = "benchmark"
)

$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$OutputDir = "${BenchmarkName}_${Timestamp}"
$CsvFile = "${OutputDir}\stats.csv"
$JsonFile = "${OutputDir}\stats.json"
$LogFile = "${OutputDir}\execution.log"
$SummaryFile = "${OutputDir}\summary.json"

# 출력 디렉토리 생성
New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

Write-Host "=== Docker Container CPU Benchmark Started ===" -ForegroundColor Green
Write-Host "Container: $Container" -ForegroundColor Yellow
Write-Host "Command: $Command" -ForegroundColor Yellow
Write-Host "Output Directory: $OutputDir" -ForegroundColor Yellow
Write-Host "Start Time: $(Get-Date)" -ForegroundColor Yellow

# 메타데이터 초기화
$BenchmarkData = @{
    metadata = @{
        container_name = $Container
        command = $Command
        benchmark_name = $BenchmarkName
        start_time = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffffZ")
        end_time = $null
        duration_seconds = $null
        exit_code = $null
        host_info = @{
            os = $env:OS
            computer_name = $env:COMPUTERNAME
            user = $env:USERNAME
            docker_version = (docker --version 2>$null)
        }
    }
    performance_data = @()
    analysis = @{}
}

# CSV 헤더 작성
"timestamp,cpu_percent,memory_usage_mb,memory_percent,net_io,block_io" | Out-File -FilePath $CsvFile -Encoding UTF8

# JSON 배열 초기화
$PerformanceData = @()

# 백그라운드 모니터링 Job 시작
$MonitoringJob = Start-Job -ScriptBlock {
    param($Container, $CsvFile, $JsonFile)
    
    $data = @()
    
    while ($true) {
        $timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
        $isoTimestamp = [DateTimeOffset]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffffZ")
        
        try {
            # docker stats를 한 번만 실행해서 현재 상태 가져오기
            $stats = docker stats --no-stream --format "{{.CPUPerc}},{{.MemUsage}},{{.MemPerc}},{{.NetIO}},{{.BlockIO}}" $Container 2>$null
            
            if ($stats) {
                $parts = $stats.Split(',')
                $cpuPercent = [float]($parts[0] -replace '%', '')
                $memUsage = $parts[1].Split('/')[0].Trim()
                $memPercent = [float]($parts[2] -replace '%', '')
                $netIO = $parts[3]
                $blockIO = $parts[4]
                
                # 메모리를 MB로 변환
                $memUsageMB = $memUsage -replace 'MiB|MB|GiB|GB', ''
                if ($memUsage -match 'GiB|GB') {
                    $memUsageMB = [math]::Round([float]$memUsageMB * 1024, 2)
                }
                
                # CSV에 추가
                $csvLine = "$timestamp,$cpuPercent,$memUsageMB,$memPercent,$netIO,$blockIO"
                Add-Content -Path $CsvFile -Value $csvLine
                
                # JSON 데이터 객체 생성
                $dataPoint = @{
                    timestamp = $timestamp
                    iso_timestamp = $isoTimestamp
                    cpu_percent = $cpuPercent
                    memory_usage_mb = [float]$memUsageMB
                    memory_percent = $memPercent
                    network_io = @{
                        input = ($netIO.Split('/')[0].Trim())
                        output = ($netIO.Split('/')[1].Trim())
                    }
                    block_io = @{
                        input = ($blockIO.Split('/')[0].Trim())
                        output = ($blockIO.Split('/')[1].Trim())
                    }
                }
                
                $data += $dataPoint
                
                # 주기적으로 JSON 파일 업데이트 (매 10초마다)
                if ($data.Count % 10 -eq 0) {
                    $data | ConvertTo-Json -Depth 3 | Out-File -FilePath $JsonFile -Encoding UTF8
                }
            }
        } catch {
            # 에러 무시하고 계속 진행
        }
        
        Start-Sleep -Seconds 1
    }
} -ArgumentList $Container, $CsvFile, $JsonFile

# 명령 실행
$StartTime = Get-Date
Write-Host "`nExecuting command in container..." -ForegroundColor Cyan

try {
    # 컨테이너에서 명령 실행
    $result = docker exec $Container bash -c "cd /app/packages && $Command" 2>&1
    $ExitCode = $LASTEXITCODE
    
    # 결과를 로그 파일에 저장
    $result | Out-File -FilePath $LogFile -Encoding UTF8
    
} catch {
    Write-Host "Error executing command: $_" -ForegroundColor Red
    $ExitCode = 1
}

$EndTime = Get-Date
$Duration = ($EndTime - $StartTime).TotalSeconds

# 모니터링 Job 중지
Stop-Job $MonitoringJob
Remove-Job $MonitoringJob

# 메타데이터 완성
$BenchmarkData.metadata.end_time = $EndTime.ToString("yyyy-MM-ddTHH:mm:ss.fffffZ")
$BenchmarkData.metadata.duration_seconds = [math]::Round($Duration, 2)
$BenchmarkData.metadata.exit_code = $ExitCode

Write-Host "`n=== Benchmark Completed ===" -ForegroundColor Green
Write-Host "End Time: $(Get-Date)" -ForegroundColor Yellow
Write-Host "Total Duration: $([math]::Round($Duration, 2)) seconds" -ForegroundColor Yellow
Write-Host "Exit Code: $ExitCode" -ForegroundColor Yellow

# JSON 데이터 로드 및 분석
if (Test-Path $JsonFile) {
    try {
        $jsonContent = Get-Content $JsonFile -Raw | ConvertFrom-Json
        $BenchmarkData.performance_data = $jsonContent
        
        if ($jsonContent.Count -gt 0) {
            $cpuValues = $jsonContent | ForEach-Object { $_.cpu_percent }
            $memValues = $jsonContent | ForEach-Object { $_.memory_usage_mb }
            
            $BenchmarkData.analysis = @{
                cpu_analysis = @{
                    average = [math]::Round(($cpuValues | Measure-Object -Average).Average, 2)
                    maximum = ($cpuValues | Measure-Object -Maximum).Maximum
                    minimum = ($cpuValues | Measure-Object -Minimum).Minimum
                    std_deviation = [math]::Round([System.Linq.Enumerable]::StandardDeviation([double[]]$cpuValues), 2)
                    low_usage_count = ($cpuValues | Where-Object { $_ -lt 50 }).Count
                    high_usage_count = ($cpuValues | Where-Object { $_ -gt 80 }).Count
                }
                memory_analysis = @{
                    average_mb = [math]::Round(($memValues | Measure-Object -Average).Average, 2)
                    peak_mb = ($memValues | Measure-Object -Maximum).Maximum
                    minimum_mb = ($memValues | Measure-Object -Minimum).Minimum
                    growth_mb = [math]::Round($memValues[-1] - $memValues[0], 2)
                }
                efficiency_score = [math]::Round((($cpuValues | Where-Object { $_ -gt 50 }).Count / $cpuValues.Count) * 100, 1)
            }
            
            Write-Host "`n=== Performance Analysis ===" -ForegroundColor Cyan
            Write-Host "Average CPU: $($BenchmarkData.analysis.cpu_analysis.average)%" -ForegroundColor White
            Write-Host "Peak CPU: $($BenchmarkData.analysis.cpu_analysis.maximum)%" -ForegroundColor White
            Write-Host "Average Memory: $($BenchmarkData.analysis.memory_analysis.average_mb) MB" -ForegroundColor White
            Write-Host "Efficiency Score: $($BenchmarkData.analysis.efficiency_score)%" -ForegroundColor White
        }
    } catch {
        Write-Host "Warning: Could not analyze JSON data: $_" -ForegroundColor Yellow
    }
}

# 최종 요약 JSON 저장
$BenchmarkData | ConvertTo-Json -Depth 4 | Out-File -FilePath $SummaryFile -Encoding UTF8

Write-Host "`nResults saved in: $OutputDir" -ForegroundColor Green
Write-Host "Files generated:" -ForegroundColor Yellow
Write-Host "  📊 stats.csv - Raw data in CSV format" -ForegroundColor Gray
Write-Host "  📋 stats.json - Raw data in JSON format" -ForegroundColor Gray
Write-Host "  📝 summary.json - Complete benchmark report" -ForegroundColor Gray
Write-Host "  📄 execution.log - Command output" -ForegroundColor Gray