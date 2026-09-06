param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$bundled = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
$pythonCmd = Get-Command python -ErrorAction SilentlyContinue
if (Test-Path -LiteralPath $bundled) { $runtime = $bundled }
elseif ($pythonCmd) { $runtime = $pythonCmd.Source }
else { throw 'Python 3.10+ is required. Install Python then run Start.cmd again.' }
$arguments = @((Join-Path $PSScriptRoot 'server.py'))
if ($NoBrowser) { $arguments += '--no-browser' }
& $runtime @arguments
