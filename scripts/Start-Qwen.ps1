
$ErrorActionPreference = 'Stop'

# Resolve project paths relative to this script.
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeFolder = Join-Path $projectRoot '.local-qwen'
$launcher = Join-Path $PSScriptRoot 'start-qwen.mjs'
$nodePath = (Get-Command node -ErrorAction Stop).Source

# Verify that the local llama.cpp runtime is installed.
$executable = Join-Path $runtimeFolder 'signed-bin\llama-server.exe'

if (-not (Test-Path -LiteralPath $executable)) {
    throw 'Model is not installed. Run npm run setup:qwen in the project folder.'
}

Write-Output "Preparing Chitra UI at http://127.0.0.1:5173/ ..."

# Check whether the local web UI is already running.
$uiReady = $false

try {
    $null = Invoke-WebRequest `
        -Uri 'http://127.0.0.1:5173/' `
        -TimeoutSec 2 `
        -UseBasicParsing

    $uiReady = $true
}
catch {
    # UI is not running yet.
}

# Start the local UI if needed.
if (-not $uiReady) {
    $uiLauncher = Join-Path $PSScriptRoot 'start-local-ui.mjs'

    Start-Process `
        -FilePath $nodePath `
        -ArgumentList @('"' + $uiLauncher + '"') `
        -WorkingDirectory $projectRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $runtimeFolder 'ui.log') `
        -RedirectStandardError (Join-Path $runtimeFolder 'ui-error.log')

    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        try {
            $null = Invoke-WebRequest `
                -Uri 'http://127.0.0.1:5173/' `
                -TimeoutSec 1 `
                -UseBasicParsing

            $uiReady = $true
            break
        }
        catch {
            Start-Sleep -Seconds 1
        }
    }

    if (-not $uiReady) {
        throw 'The local app did not start. See .local-qwen/ui-error.log. Run npm run build if the app has not been built.'
    }
}

# Check whether the Qwen bridge is already running.
$bridgeRunning = $false

try {
    $null = Invoke-RestMethod `
        -Uri 'http://127.0.0.1:8765/health' `
        -TimeoutSec 2

    $bridgeRunning = $true
}
catch {
    # HTTP 503 means the bridge exists but the model is loading.
    $statusCode = 0

    if ($_.Exception.Response) {
        $statusCode = [int]$_.Exception.Response.StatusCode
    }

    if ($statusCode -eq 503) {
        $bridgeRunning = $true
    }
}

if ($bridgeRunning) {
    Write-Output 'Chitra Qwen is already running or loading.'
    exit 0
}

# Start the local Qwen model and bridge.
Start-Process `
    -FilePath $nodePath `
    -ArgumentList @('"' + $launcher + '"') `
    -WorkingDirectory $projectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $runtimeFolder 'bridge.log') `
    -RedirectStandardError (Join-Path $runtimeFolder 'bridge-error.log')

Write-Output 'Starting Chitra Qwen. Wait for the model to load, then check the connection in the app.'
