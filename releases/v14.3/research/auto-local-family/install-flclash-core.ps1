param([ValidateSet('Install','Rollback')][string]$Action='Install')
$ErrorActionPreference = 'Stop'
$rwWork = $PSScriptRoot
$rwStage = Join-Path $rwWork 'bin'
$rwBackup = Join-Path $rwWork 'deployment\backup'
$rwInstall = [IO.Path]::GetFullPath('C:\Program Files\FlClash')
$rwNames = @('FlClashCore.exe','FlClashHelperService.exe','manifest.json')
$rwExpectedOriginal = @('ff0bfb9172a8331da6c5dac38028f47d805b433e8b2796b61c1767d8fb6792d3','9c06f5ec0cc36938eef27490253f9bf60ea72c71f89cfe4c5e1e261e2d3fa3f8')
$rwProof = Get-Content -LiteralPath (Join-Path $rwWork 'candidate-binaries.json') -Raw | ConvertFrom-Json
$rwStatusFile = Join-Path $rwWork ('deployment\'+$Action.ToLower()+'-result.json')
$rwPrincipal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if (!$rwPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Administrator required for the existing FlClash service. No files changed.' }
if ($rwInstall -ne 'C:\Program Files\FlClash') { throw 'Unexpected installation directory' }
function Get-RwHash([string]$rwFile) { (Get-FileHash -LiteralPath $rwFile -Algorithm SHA256).Hash.ToLowerInvariant() }
function Stop-RwClient {
  Get-Process -Name 'FlClash' -ErrorAction SilentlyContinue | Stop-Process -Force
  Stop-Service -Name 'FlClashHelperService' -ErrorAction Stop
  Get-Process -Name 'FlClashCore' -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Milliseconds 500
}
function Start-RwClient {
  Start-Service -Name 'FlClashHelperService'
  Start-Process -FilePath (Join-Path $rwInstall 'FlClash.exe') -WorkingDirectory $rwInstall -WindowStyle Hidden
}
New-Item -ItemType Directory -Path (Split-Path $rwStatusFile) -Force | Out-Null
$rwCurrentHash = Get-RwHash (Join-Path $rwInstall 'FlClashCore.exe')
if ($Action -eq 'Install') {
  if ($rwExpectedOriginal -notcontains $rwCurrentHash) { throw 'Installed core changed since preflight; no files changed' }
  foreach ($rwFile in $rwProof.files) {
    if ($rwNames -notcontains $rwFile.file) { throw 'Unexpected candidate filename' }
    if ((Get-RwHash (Join-Path $rwStage $rwFile.file)) -ne $rwFile.sha256) { throw 'Candidate hash mismatch' }
  }
  if (Test-Path -LiteralPath $rwBackup) { throw 'Backup already exists; refusing to replace it' }
  New-Item -ItemType Directory -Path $rwBackup | Out-Null
  foreach ($rwName in $rwNames) { Copy-Item -LiteralPath (Join-Path $rwInstall $rwName) -Destination (Join-Path $rwBackup $rwName) }
  $rwBackupHashes = @($rwNames | ForEach-Object { @{file=$_;sha256=(Get-RwHash (Join-Path $rwBackup $_))} })
  $rwBackupHashes | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $rwBackup 'hashes.json') -Encoding utf8
  $rwSource = $rwStage
} else {
  if ($rwCurrentHash -ne $rwProof.coreSHA256) { throw 'Installed core does not match this candidate; no files changed' }
  $rwSaved = Get-Content -LiteralPath (Join-Path $rwBackup 'hashes.json') -Raw | ConvertFrom-Json
  foreach ($rwFile in $rwSaved) { if ((Get-RwHash (Join-Path $rwBackup $rwFile.file)) -ne $rwFile.sha256) { throw 'Backup hash mismatch' } }
  $rwSource = $rwBackup
}
try {
  Stop-RwClient
  foreach ($rwName in $rwNames) { Copy-Item -LiteralPath (Join-Path $rwSource $rwName) -Destination (Join-Path $rwInstall $rwName) -Force }
  foreach ($rwName in $rwNames) { if ((Get-RwHash (Join-Path $rwInstall $rwName)) -ne (Get-RwHash (Join-Path $rwSource $rwName))) { throw 'Installed file hash mismatch' } }
  Start-RwClient
  Start-Sleep -Seconds 5
  $rwService = Get-Service -Name 'FlClashHelperService'
  if ($rwService.Status -ne 'Running' -or !(Get-Process -Name 'FlClashCore' -ErrorAction SilentlyContinue)) { throw 'FlClash service/core did not start' }
  @{status='PASS';action=$Action;coreSHA256=(Get-RwHash (Join-Path $rwInstall 'FlClashCore.exe'));helperSHA256=(Get-RwHash (Join-Path $rwInstall 'FlClashHelperService.exe'));serviceRunning=$true;coreRunning=$true;otherApplicationsChanged=$false} | ConvertTo-Json | Set-Content -LiteralPath $rwStatusFile -Encoding utf8
} catch {
  $rwFailure = $_.Exception.Message
  if ($Action -eq 'Install') {
    try { Stop-RwClient; foreach ($rwName in $rwNames) { Copy-Item -LiteralPath (Join-Path $rwBackup $rwName) -Destination (Join-Path $rwInstall $rwName) -Force }; Start-RwClient; $rwRollback='RESTORED_ORIGINAL' } catch { $rwRollback='FAILED' }
  } else { $rwRollback='NOT_APPLICABLE' }
  @{status='FAIL';action=$Action;error=$rwFailure;rollback=$rwRollback} | ConvertTo-Json | Set-Content -LiteralPath $rwStatusFile -Encoding utf8
  throw $rwFailure
}
