<#
  Creates Desktop shortcuts for CrewOps:
    - "CrewOps"        starts the server. Close window to stop.
    - "CrewOps - Stop" force-stops anything left running.
  Re-run any time; it overwrites the existing shortcuts.
  ASCII-only on purpose (Windows PowerShell 5.1 reads non-BOM scripts as ANSI).
#>
$ProjectDir = Split-Path -Parent $PSScriptRoot
$Icon       = Join-Path $ProjectDir "apps\web\public\icons\app.ico"
$PwSh       = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$Desktop    = [Environment]::GetFolderPath("Desktop")
$wsh        = New-Object -ComObject WScript.Shell

function New-Shortcut {
  param([string]$Name, [string]$Script, [string]$Desc)
  $lnk = Join-Path $Desktop "$Name.lnk"
  $s = $wsh.CreateShortcut($lnk)
  $s.TargetPath       = $PwSh
  $s.Arguments        = "-NoProfile -ExecutionPolicy Bypass -File `"$(Join-Path $ProjectDir "scripts\$Script")`""
  $s.WorkingDirectory = $ProjectDir
  $s.IconLocation     = "$Icon,0"
  $s.Description      = $Desc
  $s.WindowStyle      = 1
  $s.Save()
  Write-Host "   [OK] $lnk" -ForegroundColor Green
}

Write-Host "`n>> Snelkoppelingen aanmaken op het bureaublad..." -ForegroundColor Cyan
New-Shortcut -Name "CrewOps"        -Script "start-app.ps1" -Desc "Start CrewOps (lokale server). Sluit het venster om te stoppen."
New-Shortcut -Name "CrewOps - Stop" -Script "stop-app.ps1"  -Desc "Stop CrewOps en alle achtergrondprocessen."
Write-Host "   Klaar. Dubbelklik 'CrewOps' op je bureaublad om te starten.`n" -ForegroundColor Yellow
