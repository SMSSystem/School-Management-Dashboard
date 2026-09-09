<#
.SYNOPSIS
  One-time setup: registers the daily Windows Scheduled Task that runs the
  bulk-seed script. See docs/seed/BULK_SEED_SPEC.md §10, §14 items 8 and 10.

.DESCRIPTION
  NOT run automatically by anything, and not run as part of building this
  script — a human runs this manually, once, and ONLY after
  scripts/seed-bulk-institution.mjs has been reviewed and merged to main
  (§14 item 10: "Task Scheduler should be executing the reviewed, merged
  version, not a private local script that could silently drift from what a
  reviewer actually approved"). Running this against an unmerged
  feature-branch checkout defeats that safeguard — don't.

  Registers a task that:
    - Fires once daily at the given local time (default 03:00 — a
      low-traffic hour on a personal dev machine).
    - Runs only when the current user is logged on (LogonType Interactive).
      Deliberately not "whether logged on or not": that would require
      storing this Windows account's password in Task Scheduler (or running
      as SYSTEM, which risks a different/missing PATH for node.exe) for a
      tool that's explicitly a personal-dev-machine convenience, not a
      server automation. A missed day because the machine was off or
      logged out costs nothing but time — §10's resilience note already
      covers this; the next scheduled run just resumes from the checkpoint.
    - Does NOT retry automatically on failure (no -RestartCount/
      -RestartInterval). §11 already establishes the seed script itself
      stops cleanly on any error and relies on the next scheduled run to
      resume — an OS-level retry-loop on top of that would reintroduce the
      exact "backoff-and-hammer" behavior §11 explicitly rejects.
    - Does not wake the machine to run (no -WakeToRun) — a personal dev
      machine should not be woken from sleep by a background stress-test
      tool.
    - Requires network availability to start (-RunOnlyIfNetworkAvailable)
      and is allowed to run on battery power, in case this is a laptop.

.PARAMETER TriggerTime
  Local time of day to run, as a string parseable by Get-Date (default
  "03:00").
#>
param(
  [string]$TriggerTime = '03:00'
)

$ErrorActionPreference = 'Stop'

$taskName = 'SMS-Bulk-Seed-Institution'
$wrapperPath = Join-Path $PSScriptRoot 'run-seed-bulk-institution.ps1'

if (-not (Test-Path $wrapperPath)) {
  throw "Wrapper script not found at $wrapperPath. Run this from the reviewed/merged sms-system/scripts checkout, not a partial copy."
}

if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
  throw "A scheduled task named '$taskName' already exists. Remove it first with:`n  Unregister-ScheduledTask -TaskName '$taskName' -Confirm:`$false`nif you intend to re-register it (e.g. after changing -TriggerTime)."
}

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$wrapperPath`""

$trigger = New-ScheduledTaskTrigger -Daily -At $TriggerTime

$settings = New-ScheduledTaskSettingsSet `
  -RunOnlyIfNetworkAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries

$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Description 'Daily budgeted run of the disposable bulk-seed stress-test script (docs/seed/BULK_SEED_SPEC.md). Safe to remove once teardown (spec section 12) is complete -- see spec section 14 item 11.' `
  | Out-Null

Write-Host "Registered scheduled task '$taskName' -- daily at $TriggerTime, runs $wrapperPath."
Write-Host "Verify:  Get-ScheduledTask -TaskName '$taskName' | Get-ScheduledTaskInfo"
Write-Host "Remove:  Unregister-ScheduledTask -TaskName '$taskName' -Confirm:`$false"
