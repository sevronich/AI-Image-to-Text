$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeFolder = Join-Path $projectRoot '.local-qwen'
$launcher = Join-Path $PSScriptRoot 'start-qwen.mjs'
$nodePath = (Get-Command node -ErrorAction Stop).Source
if (-not (Test-Path -LiteralPath (Join-Path $runtimeFolder 'bin\llama-server.exe'))) {
    throw 'Model is not installed. Run npm run setup:qwen in the project folder.'
}
try {
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8765/health' -TimeoutSec 2
    Write-Output 'Chitra Qwen is already running.'
    exit 0
} catch { }
Start-Process -FilePath $nodePath -ArgumentList @('"' + $launcher + '"') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeFolder 'bridge.log') -RedirectStandardError (Join-Path $runtimeFolder 'bridge-error.log')
Write-Output 'Starting Chitra Qwen. Return to the website and check the connection after the model loads.'
