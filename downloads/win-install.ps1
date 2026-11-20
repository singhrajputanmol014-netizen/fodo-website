# FODO Studio for Windows - one-line installer for PCs where Smart App Control blocks the Setup.exe.
# Open PowerShell (Start > type PowerShell > Enter), paste this line and press Enter:
#   irm https://www.fodo.co.in/downloads/win-install.ps1 | iex
# It downloads FODO-Studio-Setup.zip from fodo.co.in, checks its SHA-256 against app.json, unpacks it and runs the
# normal FODO Studio install (Python 3.12 and FFmpeg come from winget, signed by their publishers).
# Files downloaded by PowerShell carry no "from the internet" mark, so Windows does not block FODO's own files.
# Only plain PowerShell commands are used here (works in Constrained Language Mode too).
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$base = 'https://www.fodo.co.in/downloads'
Write-Host ''
Write-Host 'FODO Studio installer for Windows' -ForegroundColor Cyan
if (-not ($env:PROCESSOR_ARCHITECTURE -match '64' -or $env:PROCESSOR_ARCHITEW6432)) { Write-Host 'FODO Studio needs 64-bit Windows 10 or 11.' -ForegroundColor Red; return }
$tmp = Join-Path $env:TEMP 'FODO-Studio-Install'
if (Test-Path $tmp) { Remove-Item -LiteralPath $tmp -Recurse -Force }
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$zip = Join-Path $tmp 'FODO-Studio-Setup.zip'
Write-Host 'Checking the latest version...'
$app = Invoke-RestMethod -UseBasicParsing -Uri ($base + '/app.json?x=' + (Get-Random))
$want = $app.files.windows_zip
Write-Host ('Downloading FODO Studio ' + $app.version + ' (' + ('{0:N1}' -f ($want.bytes / 1MB)) + ' MB)...')
Invoke-WebRequest -UseBasicParsing -Uri ($base + '/' + $want.name) -OutFile $zip
$got = (Get-FileHash -Algorithm SHA256 -LiteralPath $zip).Hash.ToLower()
if ($got -ne $want.sha256) { Write-Host 'The download is damaged (checksum does not match). Run the line again.' -ForegroundColor Red; return }
Write-Host 'Download checked. Unpacking...'
# Windows' own tar.exe (signed by Microsoft, in Windows 10 1803+ and 11) unpacks zips in any PowerShell mode
if (Get-Command tar.exe -ErrorAction SilentlyContinue) { & tar.exe -xf $zip -C $tmp; if ($LASTEXITCODE -ne 0) { Write-Host 'Could not unpack the download. Run the line again.' -ForegroundColor Red; return } }
else { Expand-Archive -LiteralPath $zip -DestinationPath $tmp -Force }
Get-ChildItem -LiteralPath $tmp -Recurse -File | Unblock-File
$src = Join-Path $tmp 'FODO Studio'
$dst = Join-Path $env:LOCALAPPDATA 'FODO Studio'
New-Item -ItemType Directory -Force -Path $dst | Out-Null
Get-ChildItem -Force -LiteralPath $src | Where-Object { $_.Name -ne 'Install FODO Studio.bat' } | Copy-Item -Destination $dst -Recurse -Force
Get-ChildItem -LiteralPath $dst -Recurse -File | Unblock-File
Write-Host ('Installed to ' + $dst)
# Desktop icon (skipped quietly where Windows does not allow it)
try {
  $s = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'FODO Studio.lnk'))
  $s.TargetPath = (Join-Path $dst 'FODO Studio.bat'); $s.WorkingDirectory = $dst; $s.IconLocation = (Join-Path $dst 'fodo.ico'); $s.WindowStyle = 7; $s.Save()
  Write-Host 'Desktop icon made.'
} catch { Write-Host ('No desktop icon (Windows did not allow it). Open FODO Studio from: ' + $dst + '\FODO Studio.bat') -ForegroundColor Yellow }
Write-Host 'Setting up (5 to 15 minutes the first time)...' -ForegroundColor Cyan
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $dst 'setup.ps1')
Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
Write-Host ''
Write-Host 'Done. Opening FODO Studio...' -ForegroundColor Green
Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', ('"' + (Join-Path $dst 'FODO Studio.bat') + '"') -WorkingDirectory $dst -WindowStyle Minimized
