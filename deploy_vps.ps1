# deploy_vps.ps1
# Chay: .\deploy_vps.ps1
# SSH key: id_ed25519 (mac dinh tai ~/.ssh/id_ed25519)

$VPS_HOST = "31.97.76.62"
$VPS_USER = "root"
$REMOTE_DIR = "/var/www/jewelry"
$REPO_ROOT = $PSScriptRoot
$SSH_KEY = @(
    "$env:USERPROFILE\.ssh\jewelry_vps",
    "$env:USERPROFILE\.ssh\id_ed25519"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $SSH_KEY) {
    throw "Khong tim thay SSH key. Da thu ~/.ssh/jewelry_vps va ~/.ssh/id_ed25519"
}

$SSH_OPTS = @("-i", $SSH_KEY, "-o", "StrictHostKeyChecking=no")
$SCP_OPTS = @("-i", $SSH_KEY, "-o", "StrictHostKeyChecking=no")

Write-Host "=== 1. Git pull + restart backend tren VPS ===" -ForegroundColor Cyan
& ssh @SSH_OPTS "${VPS_USER}@${VPS_HOST}" @"
set -e
cd $REMOTE_DIR
echo '--- Git pull ---'
git pull origin master
echo '--- Restart jewelry service ---'
systemctl restart jewelry
sleep 2
echo '--- Service status ---'
systemctl status jewelry --no-pager | head -15
echo '--- Done backend ---'
"@

if ($LASTEXITCODE -ne 0) {
    Write-Host "FAIL: Backend deploy gap loi!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== 2. Upload frontend dist ===" -ForegroundColor Cyan
$LOCAL_DIST = Join-Path $REPO_ROOT "frontend\dist"

if (-not (Test-Path $LOCAL_DIST)) {
    throw "Khong tim thay frontend dist tai $LOCAL_DIST"
}

# Upload toan bo dist/ len VPS (overwrite)
& scp @SCP_OPTS -r "${LOCAL_DIST}\*" "${VPS_USER}@${VPS_HOST}:${REMOTE_DIR}/dist/"

if ($LASTEXITCODE -ne 0) {
    Write-Host "FAIL: Frontend upload gap loi!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== 3. Fix frontend file permissions ===" -ForegroundColor Cyan
& ssh @SSH_OPTS "${VPS_USER}@${VPS_HOST}" @"
set -e
find ${REMOTE_DIR}/dist -type d -exec chmod 755 {} +
find ${REMOTE_DIR}/dist -type f -exec chmod 644 {} +
"@

if ($LASTEXITCODE -ne 0) {
    Write-Host "FAIL: Frontend chmod gap loi!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== Deploy hoan tat! ===" -ForegroundColor Green
Write-Host "Live: https://jewelry.n-lux.com" -ForegroundColor Yellow
