# Explicit user-run installer: create a per-user startup shortcut, no admin required.
$ErrorActionPreference = 'Stop'
$runtime = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\pythonw.exe'
if (!(Test-Path -LiteralPath $runtime)) {
    $command = Get-Command pythonw -ErrorAction SilentlyContinue
    if (!$command) { throw 'pythonw.exe not found. Install Python 3.10+ first.' }
    $runtime = $command.Source
}
$startupDirectory = [Environment]::GetFolderPath('Startup')
$link = Join-Path $startupDirectory 'WatchLedger.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($link)
$shortcut.TargetPath = $runtime
$shortcut.Arguments = '"' + (Join-Path $PSScriptRoot 'server.py') + '" --no-browser'
$shortcut.WorkingDirectory = $PSScriptRoot
$shortcut.WindowStyle = 7
$shortcut.Save()
Write-Host ('Enabled per-user startup: ' + $link)
Write-Host 'Keep this application folder in place. Starts at the next Windows sign-in.'
