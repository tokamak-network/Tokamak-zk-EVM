# PowerShell 스크립트: Docker 컨테이너 CPU 벤치마킹
# Usage: .\monitor_container.ps1 -ContainerName "container_name" -Command "cargo run -p prove" -BenchmarkName "prove_test"

param(
    [Parameter(Mandatory=$true)]
    [string]$ContainerName,
    
    [Parameter(Mandatory=$true)]
    [string]$Command,
    
    [Parameter(Mandatory=$false)]
    [string]$BenchmarkName = "benchmark"
)

$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$OutputDir = "${BenchmarkName}_${Timestamp}"
$CsvFile = "${OutputDir}\stats.csv"
$LogFile = "${OutputDir}\execution.log"

# 출력 디렉토리 생성
New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

Write-Host "=== Docker Container CPU Benchmark Started ===" -ForegroundColor Green
Write-Host "Container: $ContainerName" -ForegroundColor Yellow
Write-Host "Command: $Command" -ForegroundColor Yellow
Write-Host "Output Directory: $OutputDir" -ForegroundColor Yellow
Write-Host "Start Time: $(Get-Date)" -ForegroundColor Yellow

# CSV 헤더 작성
"timestamp,cpu_percent,memory_usage_mb,memory_percent,net_io,block_io" | Out-File -FilePath $CsvFile -Encoding UTF8

# 백그라운드 모니터링 Job 시작
$MonitoringJob = Start-Job -ScriptBlock {
    param($ContainerName, $CsvFile)
    
    while ($true) {
        $timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
        
        try {
            # docker stats를 한 번만 실행해서 현재 상태 가져오기
            $stats = docker stats --no-stream --format "{{.CPUPerc}},{{.MemUsage}},{{.MemPerc}},{{.NetIO}},{{.BlockIO}}" $ContainerName 2>$null
            
            if ($stats) {
                $parts = $stats.Split(',')
                $cpuPercent = $parts[0] -replace '%', ''
                $memUsage = $parts[1].Split('/')[0].Trim() -replace 'MiB|MB|GiB|GB', ''
                $memPercent = $parts[2] -replace '%', ''
                $netIO = $parts[3]
                $blockIO = $parts[4]
                
                # 메모리를 MB로 변환
                if ($parts[1] -match 'GiB|GB') {
                    $memUsage = [math]::Round([float]$memUsage * 1024, 2)
                }
                
                $line = "$timestamp,$cpuPercent,$memUsage,$memPercent,$netIO,$blockIO"
                Add-Content -Path $CsvFile -Value $line
            }
        } catch {
            # 에러 무시하고 계속 진행
        }
        
        Start-Sleep -Seconds 1
    }
} -ArgumentList $ContainerName, $CsvFile

# 명령 실행
$StartTime = Get-Date
Write-Host "`nExecuting command in container..." -ForegroundColor Cyan

try {
    # 컨테이너에서 명령 실행
    $result = docker exec $ContainerName bash -c "cd /app/packages && $Command" 2>&1
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

Write-Host "`n=== Benchmark Completed ===" -ForegroundColor Green
Write-Host "End Time: $(Get-Date)" -ForegroundColor Yellow
Write-Host "Total Duration: $([math]::Round($Duration, 2)) seconds" -ForegroundColor Yellow
Write-Host "Exit Code: $ExitCode" -ForegroundColor Yellow

# 결과 분석
if (Test-Path $CsvFile) {
    $stats = Import-Csv $CsvFile
    
    if ($stats.Count -gt 0) {
        $avgCpu = ($stats.cpu_percent | Measure-Object -Average).Average
        $maxCpu = ($stats.cpu_percent | Measure-Object -Maximum).Maximum
        $minCpu = ($stats.cpu_percent | Measure-Object -Minimum).Minimum
        
        $avgMem = ($stats.memory_usage_mb | Measure-Object -Average).Average
        $maxMem = ($stats.memory_usage_mb | Measure-Object -Maximum).Maximum
        
        Write-Host "`n=== CPU Usage Analysis ===" -ForegroundColor Cyan
        Write-Host "Average CPU: $([math]::Round($avgCpu, 1))%" -ForegroundColor White
        Write-Host "Peak CPU: $([math]::Round($maxCpu, 1))%" -ForegroundColor White
        Write-Host "Min CPU: $([math]::Round($minCpu, 1))%" -ForegroundColor White
        
        Write-Host "`n=== Memory Usage Analysis ===" -ForegroundColor Cyan
        Write-Host "Average Memory: $([math]::Round($avgMem, 0)) MB" -ForegroundColor White
        Write-Host "Peak Memory: $([math]::Round($maxMem, 0)) MB" -ForegroundColor White
        
        # 낮은 CPU 사용률 구간 찾기
        $lowCpuPeriods = $stats | Where-Object { [float]$_.cpu_percent -lt 50 }
        if ($lowCpuPeriods.Count -gt 0) {
            Write-Host "`n=== Low CPU Periods (<50%) ===" -ForegroundColor Yellow
            Write-Host "Found $($lowCpuPeriods.Count) periods with low CPU usage" -ForegroundColor White
            $lowCpuPeriods | Select-Object -First 10 | ForEach-Object {
                $time = [DateTimeOffset]::FromUnixTimeSeconds($_.timestamp).ToString("HH:mm:ss")
                Write-Host "  $time : $($_.cpu_percent)%" -ForegroundColor Gray
            }
        }
    }
}

Write-Host "`nResults saved in: $OutputDir" -ForegroundColor Green
Write-Host "Files:" -ForegroundColor Yellow
Write-Host "  - stats.csv: CPU/Memory statistics" -ForegroundColor Gray
Write-Host "  - execution.log: Command output" -ForegroundColor Gray