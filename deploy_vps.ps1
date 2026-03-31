# deploy_vps.ps1
# Chay: .\deploy_vps.ps1
# SSH key: id_ed25519 (mac dinh tai ~/.ssh/id_ed25519)

$VPS_HOST = "31.97.76.62"
$VPS_USER = "root"
$REMOTE_DIR = "/var/www/jewelry"
$SSH_KEY = "$env:USERPROFILE\.ssh\id_ed25519"

Write-Host "=== 1. Git pull + restart backend tren VPS ===" -ForegroundColor Cyan
ssh -i $SSH_KEY "${VPS_USER}@${VPS_HOST}" @"
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
$LOCAL_DIST = "d:\Dropbox\_Documents\_Vlance_2026\jewelry\frontend\dist"

# Upload toan bo dist/ len VPS (overwrite)
scp -i $SSH_KEY -r "${LOCAL_DIST}\*" "${VPS_USER}@${VPS_HOST}:${REMOTE_DIR}/dist/"

if ($LASTEXITCODE -ne 0) {
    Write-Host "FAIL: Frontend upload gap loi!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== Deploy hoan tat! ===" -ForegroundColor Green
Write-Host "Live: https://jewelry.n-lux.com" -ForegroundColor Yellow
