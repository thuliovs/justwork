param(
  [ValidatePattern('^([01]\d|2[0-3]):[0-5]\d$')]
  [string]$At = "08:00"
)

$ErrorActionPreference = "Stop"
$taskName = "justwork-daily-collection"
$runner = Join-Path $PSScriptRoot "run-daily-collection.ps1"
$powerShell = (Get-Command pwsh.exe -ErrorAction Stop).Source
$action = New-ScheduledTaskAction -Execute $powerShell -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$runner`""
$trigger = New-ScheduledTaskTrigger -Daily -At $At
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "Atualiza diariamente as fontes ativas do justwork." -Force | Out-Null
Write-Host "Tarefa '$taskName' instalada para executar diariamente às $At."
