# deploy_full.ps1 - Full deploy: backend + frontend + migrate
# Chay: .\deploy_full.ps1

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

$SSH_OPTS = @("-i", $SSH_KEY, "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=30", "-o", "BatchMode=yes")
$SCP_OPTS = @("-i", $SSH_KEY, "-o", "StrictHostKeyChecking=no", "-o", "BatchMode=yes")
$VPS = "${VPS_USER}@${VPS_HOST}"
$LOCAL = $REPO_ROOT

function Run-SSH {
    param([string]$cmd)
    $result = & ssh @SSH_OPTS $VPS $cmd
    if ($LASTEXITCODE -ne 0) {
        Write-Host "FAIL: $cmd" -ForegroundColor Red
        exit 1
    }
    return $result
}

# =============================================
Write-Host "=== 1. Upload backend files ===" -ForegroundColor Cyan
# =============================================

$BACKEND_FILES = @(
    "jewelry_backend/company_bank_accounts.py",
    "jewelry_backend/config_routes.py",
    "jewelry_backend/catalog_routes.py",
    "jewelry_backend/orders_routes.py",
    "jewelry_backend/print_routes.py",
    "jewelry_backend/models.py",
    "jewelry_backend/setup_base.py",
    "jewelry_backend/gold_sync.py",
    "jewelry_backend/utils.py"
)

foreach ($file in $BACKEND_FILES) {
    $local_path = "$LOCAL\backend\$($file -replace '/', '\')"
    $remote_path = "${VPS}:${REMOTE_DIR}/backend/$file"
    Write-Host "  Upload: $file" -ForegroundColor Gray
    & scp @SCP_OPTS $local_path $remote_path
    if ($LASTEXITCODE -ne 0) {
        Write-Host "FAIL: Upload $file gap loi!" -ForegroundColor Red
        exit 1
    }
}
Write-Host "Backend files uploaded OK" -ForegroundColor Green

# =============================================
Write-Host ""
Write-Host "=== 2. Upload migrate_don_hang.py ===" -ForegroundColor Cyan
# =============================================
& scp @SCP_OPTS "$LOCAL\migrate_don_hang.py" "${VPS}:${REMOTE_DIR}/migrate_don_hang.py"
if ($LASTEXITCODE -ne 0) { Write-Host "FAIL: Upload migrate gap loi!" -ForegroundColor Red; exit 1 }
Write-Host "migrate_don_hang.py uploaded OK" -ForegroundColor Green

# =============================================
Write-Host ""
Write-Host "=== 3. Restart backend ===" -ForegroundColor Cyan
# =============================================
Run-SSH "systemctl restart jewelry && sleep 3 && systemctl is-active jewelry"
Write-Host "Backend restarted OK" -ForegroundColor Green

# =============================================
Write-Host ""
Write-Host "=== 4. Chay migrate PostgreSQL ===" -ForegroundColor Cyan
# =============================================
Run-SSH "cd /var/www/jewelry && source backend/venv/bin/activate && python migrate_don_hang.py 2>&1 | tail -20"
Write-Host "Migration done" -ForegroundColor Green

# =============================================
Write-Host ""
Write-Host "=== 5. Upload frontend dist ===" -ForegroundColor Cyan
# =============================================
$LOCAL_DIST = "$LOCAL\frontend\dist"
& scp @SCP_OPTS -r "${LOCAL_DIST}\*" "${VPS}:${REMOTE_DIR}/dist/"
if ($LASTEXITCODE -ne 0) {
    Write-Host "FAIL: Frontend upload gap loi!" -ForegroundColor Red
    exit 1
}
Run-SSH "find ${REMOTE_DIR}/dist -type d -exec chmod 755 {} + && find ${REMOTE_DIR}/dist -type f -exec chmod 644 {} +"
Write-Host "Frontend uploaded OK" -ForegroundColor Green

Write-Host ""
Write-Host "=== Deploy hoan tat! ===" -ForegroundColor Green
Write-Host "Live: https://jewelry.n-lux.com" -ForegroundColor Yellow
