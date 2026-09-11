param([string]$ExtensionId)
$ErrorActionPreference = 'Stop'
$bundled = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
$pythonCmd = Get-Command python -ErrorAction SilentlyContinue
if (Test-Path -LiteralPath $bundled) { $runtime = $bundled }
elseif ($pythonCmd) { $runtime = $pythonCmd.Source }
else { throw 'Python 3.10+ is required. Install Python then try again.' }
$arguments = @((Join-Path $PSScriptRoot 'scripts\native_host.py'), '--install')
if ($ExtensionId) { $arguments += @('--extension-id', $ExtensionId) }
& $runtime @arguments
if ($LASTEXITCODE -ne 0) { throw 'Browser launcher installation failed.' }
