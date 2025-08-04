# PowerShell 실시간 Docker 컨테이너 모니터링
# Usage: .\realtime_monitor.ps1 -ContainerName "container_name"

param(
    [Parameter(Mandatory=$true)]
    [string]$ContainerName,
    
    [Parameter(Mandatory=$false)]
    [int]$RefreshInterval = 1,
    
    [Parameter(Mandatory=$false)]
    [switch]$SaveToFile
)

if ($SaveToFile) {
    $LogFile = "realtime_monitor_$(Get-Date -Format 'yyyyMMdd_HHmmss').csv"
    "timestamp,cpu_percent,memory_usage_mb,memory_percent,net_io,block_io" | Out-File -FilePath $LogFile -Encoding UTF8
    Write-Host "Saving data to: $LogFile" -ForegroundColor Green
}

Write-Host "=== Real-time Docker Container Monitor ===" -ForegroundColor Cyan
Write-Host "Container: $ContainerName" -ForegroundColor Yellow
Write-Host "Refresh Interval: $RefreshInterval second(s)" -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop..." -ForegroundColor Yellow
Write-Host ""

$previousCpu = 0
$cpuTrend = ""

try {
    while ($true) {
        $timestamp = Get-Date
        
        try {
            # Docker stats 가져오기
            $stats = docker stats --no-stream --format "{{.CPUPerc}},{{.MemUsage}},{{.MemPerc}},{{.NetIO}},{{.BlockIO}}" $ContainerName 2>$null
            
            if ($stats) {
                $parts = $stats.Split(',')
                $cpuPercent = [float]($parts[0] -replace '%', '')
                $memUsage = $parts[1].Split('/')[0].Trim()
                $memPercent = [float]($parts[2] -replace '%', '')
                $netIO = $parts[3]
                $blockIO = $parts[4]
                
                # CPU 트렌드 계산
                if ($cpuPercent -gt $previousCpu + 5) {
                    $cpuTrend = "UP"
                    $cpuColor = "Red"
                } elseif ($cpuPercent -lt $previousCpu - 5) {
                    $cpuTrend = "DOWN"
                    $cpuColor = "Green"
                } else {
                    $cpuTrend = "STABLE"
                    $cpuColor = "Yellow"
                }
                
                # 메모리 색상
                if ($memPercent -gt 80) { 
                    $memColor = "Red" 
                } elseif ($memPercent -gt 60) { 
                    $memColor = "Yellow" 
                } else { 
                    $memColor = "Green" 
                }
                
                # 화면 출력
                Write-Host "[$($timestamp.ToString('HH:mm:ss'))] CPU: $($cpuPercent.ToString('F1'))% ($cpuTrend) | Memory: $memUsage ($($memPercent.ToString('F1'))%) | Net: $netIO | Block: $blockIO" -ForegroundColor White
                
                # 파일 저장
                if ($SaveToFile) {
                    $memUsageMB = $memUsage -replace 'MiB|MB|GiB|GB', ''
                    if ($memUsage -match 'GiB|GB') {
                        $memUsageMB = [math]::Round([float]$memUsageMB * 1024, 2)
                    }
                    "$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds()),$cpuPercent,$memUsageMB,$memPercent,$netIO,$blockIO" | Add-Content -Path $LogFile
                }
                
                $previousCpu = $cpuPercent
                
                # 경고 표시
                if ($cpuPercent -gt 95) {
                    Write-Host "  WARNING: HIGH CPU USAGE!" -ForegroundColor Red
                }
                if ($memPercent -gt 95) {
                    Write-Host "  WARNING: HIGH MEMORY USAGE!" -ForegroundColor Red
                }
                
            } else {
                Write-Host "[$($timestamp.ToString('HH:mm:ss'))] Container not found or not running" -ForegroundColor Red
            }
        } catch {
            Write-Host "[$($timestamp.ToString('HH:mm:ss'))] Error: $_" -ForegroundColor Red
        }
        
        Start-Sleep -Seconds $RefreshInterval
    }
} catch {
    Write-Host ""
    Write-Host "Monitoring stopped." -ForegroundColor Yellow
    if ($SaveToFile) {
        Write-Host "Data saved to: $LogFile" -ForegroundColor Green
    }
}