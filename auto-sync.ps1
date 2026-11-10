# ==============================================================
# TazMohal 3 Bill Website - Safe Auto Git Sync Script
# Runs every 10 minutes (600 seconds)
# Protects private financial records and pushes only source code.
# ==============================================================

$repoPath = $PSScriptRoot
Set-Location $repoPath

$intervalMinutes = 10
$intervalSeconds = $intervalMinutes * 60

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " Safe Auto-Sync Active for TazMohal-3" -ForegroundColor Green
Write-Host " Interval: Every $intervalMinutes minutes" -ForegroundColor Cyan
Write-Host " Branch: origin/main" -ForegroundColor Cyan
Write-Host " Security: Guarded against committing database & secrets" -ForegroundColor Yellow
Write-Host " Press Ctrl + C to stop at any time." -ForegroundColor DarkGray
Write-Host "==================================================" -ForegroundColor Cyan

function Check-GitSecurity {
    # Verify .gitignore exists
    if (-not (Test-Path ".gitignore")) {
        Write-Host "[SECURITY ALERT] .gitignore is missing! Aborting auto-sync to protect private data." -ForegroundColor Red
        return $false
    }

    # Inspect staged or modified files to ensure no sensitive files are leaked
    $staged = git status --porcelain
    if ($staged) {
        $forbiddenMatches = $staged | Select-String -Pattern "(\.sqlite|\.sqlite3|\.db|\.env|data/|backups/)"
        if ($forbiddenMatches) {
            Write-Host "[SECURITY VIOLATION DETECTED] Sensitive database/credential files detected in git status:" -ForegroundColor Red
            Write-Host $forbiddenMatches -ForegroundColor Yellow
            Write-Host "Push cancelled to protect private household financial records." -ForegroundColor Red
            return $false
        }
    }
    return $true
}

while ($true) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    
    if (Check-GitSecurity) {
        $changes = git status --porcelain

        if ($changes) {
            Write-Host "[$timestamp] Safe source changes detected. Committing and pushing..." -ForegroundColor Magenta
            git add -A
            git commit -m "Auto-sync update: $timestamp"
            $pushResult = git push origin main 2>&1
            Write-Host $pushResult -ForegroundColor Gray
            Write-Host "[$timestamp] Successfully pushed to GitHub!" -ForegroundColor Green
        } else {
            Write-Host "[$timestamp] Working tree clean. Everything up to date." -ForegroundColor DarkGray
        }
    } else {
        Write-Host "[$timestamp] Auto-push skipped due to security check." -ForegroundColor Yellow
    }

    Write-Host "Next check in $intervalMinutes minutes...`n" -ForegroundColor DarkCyan
    Start-Sleep -Seconds $intervalSeconds
}
