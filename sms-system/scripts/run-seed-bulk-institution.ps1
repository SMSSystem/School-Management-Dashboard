<#
.SYNOPSIS
  Wrapper invoked by Windows Task Scheduler to run the bulk-seed script once
  per day. See docs/seed/BULK_SEED_SPEC.md §10.

.DESCRIPTION
  Task Scheduler's execution environment is minimal and can't be relied on
  to carry the interactive shell's PATH or working directory, so this
  wrapper resolves node.exe and the service-account key path explicitly,
  sets the correct working directory, and redirects all output to a
  timestamped log file under scripts/logs/ (gitignored via the repo's
  existing top-level `logs`/`*.log` rules) — matching §9's "Windows Task
  Scheduler is configured to redirect that output to a local log file for
  later review without needing to watch the console live."

  Not registered with Task Scheduler by this file itself — see
  register-seed-task.ps1, which is a separate, manually-run, one-time setup
  step (§14 item 8/10).

.PARAMETER KeyPath
  Path to the service-account JSON key. Defaults to
  scripts/service-account.json (the existing convention — see §15).

.PARAMETER Budget
  Optional override for the per-run Firestore write budget. Defaults to the
  seed script's own built-in ~10,000/day budget (§3/§4.3) — do not raise
  this for the real scheduled run; it exists for local testing only.
#>
param(
  [string]$KeyPath = (Join-Path $PSScriptRoot 'service-account.json'),
  [int]$Budget
)

$repoRoot = Split-Path -Parent $PSScriptRoot  # sms-system/
$logsDir = Join-Path $PSScriptRoot 'logs'
if (-not (Test-Path $logsDir)) { New-Item -ItemType Directory -Path $logsDir | Out-Null }

$startTimestamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$logFile = Join-Path $logsDir "seed-$startTimestamp.log"

function Write-Log {
  param([string]$Message)
  "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message" | Add-Content -Path $logFile -Encoding utf8
}

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
  Write-Log 'ERROR: node.exe not found on PATH in this Task Scheduler session. Aborting.'
  exit 1
}

if (-not (Test-Path $KeyPath)) {
  Write-Log "ERROR: service-account key not found at $KeyPath. Aborting."
  exit 1
}

Set-Location $repoRoot

$scriptArgs = @('scripts/seed-bulk-institution.mjs', "--key=$KeyPath")
if ($PSBoundParameters.ContainsKey('Budget')) { $scriptArgs += "--budget=$Budget" }

Write-Log "Starting: node $($scriptArgs -join ' ')"
& $nodeCmd.Source @scriptArgs *>> $logFile
$exitCode = $LASTEXITCODE

Write-Log "Finished with exit code $exitCode"
exit $exitCode
