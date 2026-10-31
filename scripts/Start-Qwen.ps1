$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeFolder = Join-Path $projectRoot '.local-qwen'
$launcher = Join-Path $PSScriptRoot 'start-qwen.mjs'
$nodePath = (Get-Command node -ErrorAction Stop).Source
if (-not (Test-Path -LiteralPath (Join-Path $runtimeFolder 'signed-bin\llama-server.exe'))) {
    throw 'Model is not installed. Run npm run setup:qwen in the project folder.'
}
$uiReady = $false
try { $null = Invoke-WebRequest -Uri 'http://127.0.0.1:5173/' -TimeoutSec 2 -UseBasicParsing; $uiReady = $true } catch { }
if (-not $uiReady) {
    $uiLauncher = Join-Path $PSScriptRoot 'start-local-ui.mjs'
    Start-Process -FilePath $nodePath -ArgumentList @('"' + $uiLauncher + '"') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeFolder 'ui.log') -RedirectStandardError (Join-Path $runtimeFolder 'ui-error.log')
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        try { $null = Invoke-WebRequest -Uri 'http://127.0.0.1:5173/' -TimeoutSec 1 -UseBasicParsing; $uiReady = $true; break } catch { Start-Sleep -Seconds 1 }
    }
    if (-not $uiReady) { throw 'The local app did not start. See .local-qwen/ui-error.log. Run npm run build if the app has not been built.' }
}
try {
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8765/health' -TimeoutSec 2
    Write-Output 'Chitra Qwen is already running.'
    exit 0
} catch { }
Start-Process -FilePath $nodePath -ArgumentList @('"' + $launcher + '"') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeFolder 'bridge.log') -RedirectStandardError (Join-Path $runtimeFolder 'bridge-error.log')
Write-Output 'Starting Chitra Qwen. Return to the website and check the connection after the model loads.'
