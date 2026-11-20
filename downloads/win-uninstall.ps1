# FODO Studio for Windows - one-line uninstaller.
# Open PowerShell (Start > type PowerShell > Enter), paste this line and press Enter:
#   irm https://www.fodo.co.in/downloads/win-uninstall.ps1 | iex
# Also runs from Settings > Apps > FODO Studio > Uninstall (a copy is saved as "Uninstall FODO Studio.ps1").
# Removes FODO Studio from %LOCALAPPDATA%\FODO Studio (one-line install and Setup.exe alike), its icons and its
# Apps entry. Your videos and exports (the storage folder) are kept unless you type YES.
# Python, FFmpeg and Ollama are separate apps and are left alone (remove them in Settings > Apps if you like).
# Only plain PowerShell commands are used here (works in Constrained Language Mode too).
$ErrorActionPreference = 'Continue'
$dst = Join-Path $env:LOCALAPPDATA 'FODO Studio'
$reg = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\FODOStudio'
Write-Host ''
Write-Host 'FODO Studio uninstaller for Windows' -ForegroundColor Cyan
Set-Location -LiteralPath $env:TEMP
if (-not (Test-Path -LiteralPath $dst)) {
  Write-Host 'FODO Studio is not installed for this Windows user (nothing in ' $dst ').' -ForegroundColor Yellow
  if (Test-Path $reg) { Remove-Item -Path $reg -Recurse -Force -ErrorAction SilentlyContinue }
  return
}
$keepVideos = $true
if (Test-Path -LiteralPath (Join-Path $dst 'storage')) {
  Write-Host ''
  Write-Host 'Your videos and exports are in:' (Join-Path $dst 'storage')
  $a = Read-Host 'Delete them too? Type YES to delete, or just press Enter to keep them'
  if ($a -eq 'YES' -or $a -eq 'yes') { $keepVideos = $false }
}

Write-Host 'Closing FODO Studio...'
# the app's own Python, FFmpeg and helpers run from inside the install folder
Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path -like ($dst + '\*') } | Stop-Process -Force -ErrorAction SilentlyContinue
# the black FODO Studio window (cmd running "FODO Studio.bat")
try {
  Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" -ErrorAction Stop | Where-Object { $_.CommandLine -like '*FODO Studio.bat*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
} catch { }
Start-Sleep -Seconds 2

Write-Host 'Removing icons...'
$links = @(
  (Join-Path $env:USERPROFILE 'Desktop\FODO Studio.lnk'),
  (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\FODO Studio.lnk'),
  (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\FODO Studio')
)
if ($env:OneDrive) { $links += (Join-Path $env:OneDrive 'Desktop\FODO Studio.lnk') }
foreach ($l in $links) { if (Test-Path -LiteralPath $l) { Remove-Item -LiteralPath $l -Recurse -Force -ErrorAction SilentlyContinue } }
if (Test-Path $reg) { Remove-Item -Path $reg -Recurse -Force -ErrorAction SilentlyContinue }

Write-Host 'Removing FODO Studio files...'
Get-ChildItem -Force -LiteralPath $dst | Where-Object { -not ($keepVideos -and $_.Name -eq 'storage') } |
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
$left = @(Get-ChildItem -Force -LiteralPath $dst -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne 'storage' })
if (-not $keepVideos -or -not (Test-Path -LiteralPath (Join-Path $dst 'storage'))) {
  if ($left.Count -eq 0) { Remove-Item -LiteralPath $dst -Recurse -Force -ErrorAction SilentlyContinue }
}

Write-Host ''
if ($left.Count -gt 0) {
  Write-Host 'Some files were still in use and could not be removed. Restart the PC and run this line again.' -ForegroundColor Yellow
} elseif ($keepVideos -and (Test-Path -LiteralPath (Join-Path $dst 'storage'))) {
  Write-Host 'FODO Studio is removed. Your videos are kept in:' (Join-Path $dst 'storage') -ForegroundColor Green
} else {
  Write-Host 'FODO Studio is removed.' -ForegroundColor Green
}
Write-Host 'Your FODO key stays on your account: you can install FODO Studio again any time and log in with the same email.'
