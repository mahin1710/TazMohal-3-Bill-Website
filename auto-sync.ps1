# ==============================================================
# TazMohal 3 Bill Website - Auto Git Sync Script
# Checks for changes every 10 minutes (600 seconds)
# and pushes to GitHub if any modifications are detected.
# ==============================================================

$repoPath = $PSScriptRoot
Set-Location $repoPath

$intervalMinutes = 10
$intervalSeconds = $intervalMinutes * 60

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " Auto-sync started for TazMohal-3-Bill-Website" -ForegroundColor Green
Write-Host " Interval: Every $intervalMinutes minutes" -ForegroundColor Cyan
Write-Host " Remote: origin/main" -ForegroundColor Cyan
Write-Host " Press Ctrl + C to stop at any time." -ForegroundColor Yellow
Write-Host "==================================================" -ForegroundColor Cyan

while ($true) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $changes = git status --porcelain

    if ($changes) {
        Write-Host "[$timestamp] Changes detected! Committing and pushing..." -ForegroundColor Magenta
        git add -A
        git commit -m "Auto-sync update: $timestamp"
        $pushResult = git push origin main 2>&1
        Write-Host $pushResult -ForegroundColor Gray
        Write-Host "[$timestamp] Successfully pushed to GitHub!" -ForegroundColor Green
    } else {
        Write-Host "[$timestamp] No changes detected. Working tree clean." -ForegroundColor DarkGray
    }

    Write-Host "Next check in $intervalMinutes minutes...`n" -ForegroundColor DarkCyan
    Start-Sleep -Seconds $intervalSeconds
}
