<#
  Stops the CrewOps dev server and any leftover background node processes.
  Use this if a window was killed abnormally and something is still running.
  ASCII-only on purpose (Windows PowerShell 5.1 reads non-BOM scripts as ANSI).
#>
param([int]$Port = 3000)

function Say ($m) { Write-Host "   $m" }
Write-Host "`n>> CrewOps stoppen..." -ForegroundColor Cyan

$killed = 0

# 1) Whatever is listening on the port (and its child tree)
$pids = @()
try {
  $pids = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop |
          Select-Object -ExpandProperty OwningProcess -Unique
} catch {
  $pids = netstat -ano | Select-String ":$Port\s" | ForEach-Object { ($_ -split '\s+')[-1] } |
          Where-Object { $_ -match '^\d+$' -and $_ -ne '0' } | Select-Object -Unique
}
foreach ($procId in @($pids)) {
  & taskkill.exe /PID $procId /T /F *> $null
  if ($LASTEXITCODE -eq 0) { Say "Gestopt: server op poort $Port (PID $procId)"; $killed++ }
}

# 2) Orphaned node processes still running this project's "next dev"
try {
  $procs = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction Stop |
           Where-Object { $_.CommandLine -and $_.CommandLine -match "CrewOps\\apps\\web|next(\.js)?\W+dev" }
  foreach ($p in $procs) {
    & taskkill.exe /PID $p.ProcessId /T /F *> $null
    if ($LASTEXITCODE -eq 0) { Say "Gestopt: weesproces node (PID $($p.ProcessId))"; $killed++ }
  }
} catch {}

if ($killed -eq 0) { Say "Niets actief - alles was al gestopt." }
Write-Host "   [OK] Klaar." -ForegroundColor Green
Start-Sleep -Milliseconds 600
