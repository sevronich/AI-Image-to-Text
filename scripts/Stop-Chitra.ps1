$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$launcherPaths = @(
    (Join-Path $PSScriptRoot 'start-qwen.mjs'),
    (Join-Path $PSScriptRoot 'start-local-ui.mjs')
)
$processes = @(Get-CimInstance Win32_Process)
$taskIds = @($processes | Where-Object {
    $command = $_.CommandLine
    $_.Name -eq 'node.exe' -and $command -and @($launcherPaths | Where-Object { $command.Contains($_) }).Count -gt 0
} | Select-Object -ExpandProperty ProcessId)
# Include only descendants of the two launchers belonging to this checkout.
for ($level = 0; $level -lt 8; $level++) {
    $taskIds += @($processes | Where-Object { $_.ParentProcessId -in $taskIds -and $_.ProcessId -notin $taskIds } | Select-Object -ExpandProperty ProcessId)
}
$taskIds = @($taskIds | Select-Object -Unique)
for ($index = $taskIds.Count - 1; $index -ge 0; $index--) {
    Stop-Process -Id $taskIds[$index] -Force -ErrorAction SilentlyContinue
}
Write-Output "Chitra app and model stopped for $projectRoot. Other projects were not stopped."
