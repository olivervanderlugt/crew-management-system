<#
  CrewOps launcher - one double-click to start the app, self-healing on failure.

  What it does:
    1. Pre-flight checks (Node, env file, dependencies) and fixes what it can.
    2. Frees port 3000 if a stale server is holding it.
    3. Starts the Next.js dev server inside a Windows Job Object so that
       closing this window (even via the X button) kills the whole server
       tree - no leftover background node processes.
    4. Waits until the server is listening, then opens your browser.
    5. If it fails to start, it reads the log, explains the likely cause,
       and tries one automatic recovery (clear .next cache) before giving up.

  Stop it by closing this window or pressing Ctrl+C.

  NOTE: This file is intentionally ASCII-only. Windows PowerShell 5.1 reads
  scripts without a BOM using the ANSI code page, so non-ASCII characters
  would display as garbage. Keep it ASCII.
#>
param(
  [int]$Port = 3000,
  [int]$ReadyTimeoutSec = 90,
  [switch]$Smoke   # internal: start, verify, then exit (used for automated testing)
)

$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent $PSScriptRoot
$WebDir     = Join-Path $ProjectDir "apps\web"
$Url        = "http://localhost:$Port"
$LogOut     = Join-Path $env:TEMP "dev.out.log"
$LogErr     = Join-Path $env:TEMP "dev.err.log"

function Say  ($m) { Write-Host "   $m" }
function Step ($m) { Write-Host "`n>> $m" -ForegroundColor Cyan }
function Good ($m) { Write-Host "   [OK] $m" -ForegroundColor Green }
function Warn ($m) { Write-Host "   [!]  $m" -ForegroundColor Yellow }
function Fail ($m) { Write-Host "   [X]  $m" -ForegroundColor Red }

function Banner {
  Clear-Host
  Write-Host ""
  Write-Host "  ==========================================" -ForegroundColor DarkYellow
  Write-Host "        CrewOps  -  Crew Management System" -ForegroundColor Yellow
  Write-Host "        lokale server starten..." -ForegroundColor Yellow
  Write-Host "  ==========================================" -ForegroundColor DarkYellow
}

# -- Find the PID(s) listening on the port ----------------------------
function Get-PortPids {
  param([int]$P)
  $pids = @()
  try {
    $pids = Get-NetTCPConnection -LocalPort $P -State Listen -ErrorAction Stop |
            Select-Object -ExpandProperty OwningProcess -Unique
  } catch {
    $pids = netstat -ano | Select-String ":$P\s" | ForEach-Object {
      ($_ -split '\s+')[-1]
    } | Where-Object { $_ -match '^\d+$' -and $_ -ne '0' } | Select-Object -Unique
  }
  return @($pids | ForEach-Object { [int]$_ })
}

# -- Kill a process and its whole child tree --------------------------
function Stop-Tree {
  param([int]$ProcId)
  if (-not $ProcId) { return }
  & taskkill.exe /PID $ProcId /T /F *> $null
}

function Free-Port {
  param([int]$P)
  $pids = Get-PortPids -P $P
  if ($pids.Count -gt 0) {
    Warn "Poort $P is bezet (PID: $($pids -join ', ')) - oude server wordt gestopt."
    foreach ($procId in $pids) { Stop-Tree -ProcId $procId }
    Start-Sleep -Milliseconds 800
    $still = Get-PortPids -P $P
    if ($still.Count -gt 0) { Fail "Kon poort $P niet vrijmaken."; return $false }
    Good "Poort $P vrijgemaakt."
  } else {
    Good "Poort $P is vrij."
  }
  return $true
}

# -- Job Object: KILL_ON_JOB_CLOSE so the tree dies when this window closes --
$JobCs = @"
using System;
using System.Runtime.InteropServices;
public static class FecJob {
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr CreateJobObject(IntPtr a, string n);
  [DllImport("kernel32.dll")] public static extern bool SetInformationJobObject(IntPtr h, int t, IntPtr i, uint l);
  [DllImport("kernel32.dll")] public static extern bool AssignProcessToJobObject(IntPtr h, IntPtr p);
  [StructLayout(LayoutKind.Sequential)] struct BASIC { public long a; public long b; public uint LimitFlags; public UIntPtr d; public UIntPtr e; public uint f; public UIntPtr g; public uint h; public uint i; }
  [StructLayout(LayoutKind.Sequential)] struct IOC { public ulong a,b,c,d,e,f; }
  [StructLayout(LayoutKind.Sequential)] struct EXT { public BASIC Basic; public IOC Io; public UIntPtr a; public UIntPtr b; public UIntPtr c; public UIntPtr d; }
  public static IntPtr Create() {
    IntPtr h = CreateJobObject(IntPtr.Zero, null);
    EXT info = new EXT();
    info.Basic.LimitFlags = 0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
    int len = Marshal.SizeOf(info);
    IntPtr p = Marshal.AllocHGlobal(len);
    Marshal.StructureToPtr(info, p, false);
    SetInformationJobObject(h, 9, p, (uint)len); // 9 = ExtendedLimitInformation
    Marshal.FreeHGlobal(p);
    return h;
  }
  public static bool Assign(IntPtr job, IntPtr proc) { return AssignProcessToJobObject(job, proc); }
}
"@

$script:Job = [IntPtr]::Zero
$script:Server = $null

function Init-Job {
  try {
    if (-not ("FecJob" -as [type])) { Add-Type -TypeDefinition $JobCs -Language CSharp -ErrorAction Stop }
    $script:Job = [FecJob]::Create()
    return $true
  } catch {
    Warn "Job Object niet beschikbaar - opruimen gebeurt via Ctrl+C/stop-knop."
    return $false
  }
}

function Start-Server {
  $nextCmd = Join-Path $WebDir "node_modules\.bin\next.CMD"
  if (-not (Test-Path $nextCmd)) { throw "next is niet geinstalleerd (apps/web/node_modules ontbreekt)." }
  if (Test-Path $LogOut) { Remove-Item $LogOut -Force -ErrorAction SilentlyContinue }
  if (Test-Path $LogErr) { Remove-Item $LogErr -Force -ErrorAction SilentlyContinue }

  $script:Server = Start-Process -FilePath $nextCmd `
    -ArgumentList @("dev", "--port", "$Port") `
    -WorkingDirectory $WebDir `
    -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $LogOut -RedirectStandardError $LogErr

  if ($script:Job -ne [IntPtr]::Zero) {
    try { [FecJob]::Assign($script:Job, $script:Server.Handle) | Out-Null } catch {}
  }
  return $script:Server
}

function Wait-Ready {
  param([int]$TimeoutSec)
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  $spin = '|','/','-','\'; $i = 0
  while ((Get-Date) -lt $deadline) {
    if ($script:Server.HasExited) { return $false }   # crashed during startup
    $ok = $false
    try {
      $c = New-Object System.Net.Sockets.TcpClient
      $iar = $c.BeginConnect("127.0.0.1", $Port, $null, $null)
      if ($iar.AsyncWaitHandle.WaitOne(500)) { $c.EndConnect($iar); $ok = $c.Connected }
      $c.Close()
    } catch { $ok = $false }
    if ($ok) { Write-Host "`r   " -NoNewline; return $true }
    Write-Host ("`r   bezig met opstarten {0}" -f $spin[$i % 4]) -NoNewline -ForegroundColor DarkGray
    $i++; Start-Sleep -Milliseconds 400
  }
  return $false
}

# -- Read the logs and explain a failure in plain language ------------
function Diagnose {
  $out = ""; $err = ""
  if (Test-Path $LogOut) { $out = Get-Content $LogOut -Raw -ErrorAction SilentlyContinue }
  if (Test-Path $LogErr) { $err = Get-Content $LogErr -Raw -ErrorAction SilentlyContinue }
  $all = "$out`n$err"
  $hint = $null; $recoverable = $false
  if     ($all -match "EADDRINUSE")                                   { $hint = "Poort $Port is nog bezet door een ander proces."; $recoverable = $true }
  elseif ($all -match "Module not found|Can't resolve")               { $hint = "Ontbrekende of niet-gebouwde module - meestal opgelost door de .next-cache te wissen."; $recoverable = $true }
  elseif ($all -match "Invalid supabaseUrl|URL and Key are required") { $hint = "Supabase env-variabelen kloppen niet. Controleer .env.local (NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY)." }
  elseif ($all -match "ENOENT.*node_modules|Cannot find module 'next'"){ $hint = "Dependencies ontbreken. Voer 'pnpm install' uit."; $recoverable = $true }
  return [pscustomobject]@{ Hint = $hint; Recoverable = $recoverable; Tail = ($all -split "`n" | Select-Object -Last 25) -join "`n" }
}

function Show-LogTail {
  Write-Host ""
  Write-Host "   -- Laatste serverlog ------------------------------" -ForegroundColor DarkGray
  (Diagnose).Tail -split "`n" | ForEach-Object { Write-Host "   $_" -ForegroundColor DarkGray }
  Write-Host "   ---------------------------------------------------" -ForegroundColor DarkGray
}

# -- Cleanup (Ctrl+C via finally; window-close handled by Job) --------
function Cleanup {
  if ($script:Server -and -not $script:Server.HasExited) { Stop-Tree -ProcId $script:Server.Id }
  Free-Port -P $Port | Out-Null
}

# ====================================================================
Banner

# 1) Node present?
Step "Controleer Node.js"
try { $nv = (& node -v) 2>$null; if (-not $nv) { throw } ; Good "Node $nv" }
catch { Fail "Node.js niet gevonden. Installeer via https://nodejs.org (LTS) en probeer opnieuw."; Read-Host "`nDruk op Enter om te sluiten"; exit 1 }

# 2) Env file present + filled?
Step "Controleer .env.local"
$envFile = Join-Path $ProjectDir ".env.local"
if (-not (Test-Path $envFile)) {
  Fail ".env.local ontbreekt in $ProjectDir."
  Say  "Maak het aan op basis van .env.example en vul je Supabase-sleutels in."
  Read-Host "`nDruk op Enter om te sluiten"; exit 1
}
$envText = Get-Content $envFile -Raw
if ($envText -match "<project-ref>|<anon-key>|<paste-") {
  Warn ".env.local bevat nog placeholders - vul je echte sleutels in."
} else { Good ".env.local aanwezig en ingevuld." }

# 3) Dependencies installed? (auto-install if missing)
Step "Controleer dependencies"
if (-not (Test-Path (Join-Path $WebDir "node_modules\.bin\next.CMD"))) {
  Warn "node_modules ontbreekt - 'pnpm install' wordt uitgevoerd (kan even duren)..."
  Push-Location $ProjectDir
  try { & pnpm install }
  catch { Pop-Location; Fail "pnpm install mislukte. Is pnpm geinstalleerd? (npm i -g pnpm)"; Read-Host "`nDruk op Enter om te sluiten"; exit 1 }
  Pop-Location
}
Good "Dependencies aanwezig."

# 4) Free the port
Step "Maak poort $Port vrij"
if (-not (Free-Port -P $Port)) { Read-Host "`nDruk op Enter om te sluiten"; exit 1 }

# 5) Start (with one automatic recovery attempt)
Init-Job | Out-Null
$ready = $false
for ($attempt = 1; $attempt -le 2 -and -not $ready; $attempt++) {
  Step ("Start de server" + $(if ($attempt -gt 1) { " (nieuwe poging na herstel)" } else { "" }))
  Start-Server | Out-Null
  $ready = Wait-Ready -TimeoutSec $ReadyTimeoutSec

  if (-not $ready) {
    $d = Diagnose
    Fail "Server kwam niet online binnen $ReadyTimeoutSec s."
    if ($d.Hint) { Warn $d.Hint }
    Show-LogTail
    if ($script:Server -and -not $script:Server.HasExited) { Stop-Tree -ProcId $script:Server.Id }

    if ($attempt -eq 1 -and $d.Recoverable) {
      Step "Automatisch herstel: .next-cache wissen"
      Remove-Item (Join-Path $WebDir ".next") -Recurse -Force -ErrorAction SilentlyContinue
      Free-Port -P $Port | Out-Null
      Good "Cache gewist - opnieuw proberen."
    } else {
      break
    }
  }
}

if (-not $ready) {
  Write-Host ""
  Fail "Kon CrewOps niet starten. Zie de loguitvoer hierboven."
  Say  "Volledige logs: $LogOut  en  $LogErr"
  Read-Host "`nDruk op Enter om te sluiten"
  Cleanup
  exit 1
}

Good "Server draait!"
Write-Host ""
Write-Host "   +----------------------------------------------+" -ForegroundColor Green
Write-Host "   |  CrewOps draait op:  $Url" -ForegroundColor Green
Write-Host "   |  Login:          admin@example.com" -ForegroundColor Green
Write-Host "   +----------------------------------------------+" -ForegroundColor Green

if ($Smoke) { Say "SMOKE OK"; Cleanup; exit 0 }

Step "Browser openen"
Start-Process $Url
Good "Geopend in je browser."

Write-Host ""
Write-Host "  Sluit dit venster (of druk Ctrl+C) om CrewOps te stoppen." -ForegroundColor Yellow
Write-Host "  Live serverlog hieronder:" -ForegroundColor DarkGray
Write-Host ""

# Tail the live log until the user stops it; finally{} cleans up on Ctrl+C,
# and the Job Object cleans up if the window is closed with the X button.
try {
  Get-Content $LogOut -Wait -Tail 5 -ErrorAction SilentlyContinue |
    ForEach-Object { Write-Host "   $_" -ForegroundColor DarkGray }
} finally {
  Write-Host "`n>> CrewOps wordt gestopt..." -ForegroundColor Cyan
  Cleanup
  Good "Gestopt. Geen achtergrondprocessen meer actief."
}
