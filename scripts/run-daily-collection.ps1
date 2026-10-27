$ErrorActionPreference = "Stop"
$projectPath = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectPath

$npm = (Get-Command npm.cmd -ErrorAction Stop).Source
& $npm run sources:collect
exit $LASTEXITCODE
