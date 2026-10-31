$ErrorActionPreference = 'Stop'

# Stop only Chitra processes started from this project checkout.
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
# A terminal may launch the wrappers with relative paths. Identify those
# through their children whose executable/config belongs to this checkout.
$modelPath = Join-Path $projectRoot '.local-qwen\signed-bin\llama-server.exe'
$wranglerPath = Join-Path $projectRoot 'node_modules\wrangler\'
$configPath = Join-Path $projectRoot 'dist\server\wrangler.json'
$ownedChildren = @($processes | Where-Object {
    ($_.Name -eq 'llama-server.exe' -and $_.ExecutablePath -eq $modelPath) -or
    ($_.Name -eq 'node.exe' -and $_.CommandLine -and
     $_.CommandLine.IndexOf($wranglerPath, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and
     $_.CommandLine.IndexOf($configPath, [StringComparison]::OrdinalIgnoreCase) -ge 0)
})
$taskIds += @($ownedChildren | Select-Object -ExpandProperty ProcessId)
foreach ($child in $ownedChildren) {
    $parent = $processes | Where-Object { $_.ProcessId -eq $child.ParentProcessId }
    if ($parent.Name -eq 'node.exe' -and $parent.CommandLine -match 'scripts[\\/](start-qwen|start-local-ui)\.mjs') {
        $taskIds += $parent.ProcessId
    }
}
# Include only descendants of the two launchers belonging to this checkout.
for ($level = 0; $level -lt 8; $level++) {
    $taskIds += @($processes | Where-Object { $_.ParentProcessId -in $taskIds -and $_.ProcessId -notin $taskIds } | Select-Object -ExpandProperty ProcessId)
}
$taskIds = @($taskIds | Select-Object -Unique)
# Stop children first so the model and UI cannot leave orphaned processes.
for ($index = $taskIds.Count - 1; $index -ge 0; $index--) {
    Stop-Process -Id $taskIds[$index] -Force -ErrorAction SilentlyContinue
}
Write-Output "Chitra app and model stopped for $projectRoot. Other projects were not stopped."
