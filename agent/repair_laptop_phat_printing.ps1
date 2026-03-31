[CmdletBinding()]
param(
    [string[]]$PrinterNames = @(
        'Canon LBP2900',
        'EPSON TM-T81III Receipt6'
    ),
    [switch]$SkipQueueClear,
    [switch]$SkipTestPrint
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Write-Step {
    param([string]$Message)
    Write-Host "[STEP] $Message" -ForegroundColor Cyan
}

function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Gray
}

function Assert-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Hay chay script nay bang PowerShell -> Run as administrator.'
    }
}

function Ensure-DwordValue {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][int]$Value
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -Path $Path -Force | Out-Null
    }
    New-ItemProperty -Path $Path -Name $Name -PropertyType DWord -Value $Value -Force | Out-Null
}

function Enable-FirewallDisplayGroupSafe {
    param([string]$DisplayGroup)

    try {
        Enable-NetFirewallRule -DisplayGroup $DisplayGroup -ErrorAction Stop | Out-Null
        Write-Info "Da bat firewall group '$DisplayGroup'."
    }
    catch {
        Write-Warning "Khong bat duoc firewall group '$DisplayGroup': $($_.Exception.Message)"
    }
}

function Restart-SpoolerSafe {
    Write-Step 'Khoi dong lai Print Spooler'
    Restart-Service -Name Spooler -Force
    $service = Get-Service -Name Spooler
    if ($service.Status -ne 'Running') {
        throw "Print Spooler dang o trang thai '$($service.Status)'."
    }
}

function Get-PrinterSafe {
    param([string]$PrinterName)

    try {
        return Get-Printer -Name $PrinterName -ErrorAction Stop
    }
    catch {
        return $null
    }
}

function Ensure-PrinterShared {
    param([string]$PrinterName)

    $printer = Get-PrinterSafe -PrinterName $PrinterName
    if (-not $printer) {
        throw "Khong tim thay printer '$PrinterName' tren may nay."
    }

    $shareName = if ([string]::IsNullOrWhiteSpace($printer.ShareName)) { $PrinterName } else { $printer.ShareName }
    $needsUpdate = (-not $printer.Shared) -or ($printer.ShareName -ne $shareName)

    if ($needsUpdate) {
        Set-Printer -Name $PrinterName -Shared $true -ShareName $shareName -ErrorAction Stop
        $printer = Get-Printer -Name $PrinterName -ErrorAction Stop
    }

    [pscustomobject]@{
        Name       = $printer.Name
        Shared     = [bool]$printer.Shared
        ShareName  = $printer.ShareName
        DriverName = $printer.DriverName
        PortName   = $printer.PortName
        Status     = [string]$printer.PrinterStatus
        UncPath    = "\\$env:COMPUTERNAME\$($printer.ShareName)"
    }
}

function Clear-PrinterQueue {
    param([string]$PrinterName)

    $jobs = @(Get-PrintJob -PrinterName $PrinterName -ErrorAction SilentlyContinue)
    foreach ($job in $jobs) {
        Remove-PrintJob -PrinterName $PrinterName -ID $job.ID -ErrorAction SilentlyContinue
    }
    return $jobs.Count
}

function Wait-PrinterQueueIdle {
    param(
        [string]$PrinterName,
        [int]$TimeoutSeconds = 12
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $lastStatus = ''
    do {
        $jobs = @(Get-PrintJob -PrinterName $PrinterName -ErrorAction SilentlyContinue)
        if ($jobs.Count -eq 0) {
            return [pscustomobject]@{
                QueueEmpty = $true
                JobCount   = 0
                Statuses   = @()
            }
        }

        $statuses = @($jobs | ForEach-Object { [string]$_.JobStatus })
        $lastStatus = ($statuses -join ', ')
        if ($lastStatus -match 'Error|Retained|Blocked|Offline') {
            return [pscustomobject]@{
                QueueEmpty = $false
                JobCount   = $jobs.Count
                Statuses   = $statuses
            }
        }
        Start-Sleep -Milliseconds 800
    }
    while ((Get-Date) -lt $deadline)

    $jobs = @(Get-PrintJob -PrinterName $PrinterName -ErrorAction SilentlyContinue)
    return [pscustomobject]@{
        QueueEmpty = ($jobs.Count -eq 0)
        JobCount   = $jobs.Count
        Statuses   = @($jobs | ForEach-Object { [string]$_.JobStatus })
    }
}

function Invoke-LocalTextProbe {
    param([string]$PrinterName)

    Add-Type -AssemblyName System.Drawing

    $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $text = @(
        'LAPTOP_PHAT local printer probe'
        "Printer: $PrinterName"
        "Time: $stamp"
        'If this page prints, local driver + spooler are working.'
    ) -join [Environment]::NewLine

    $docName = "LAPTOP_PHAT Probe - $PrinterName"
    $doc = New-Object System.Drawing.Printing.PrintDocument
    $doc.DocumentName = $docName
    $doc.PrinterSettings.PrinterName = $PrinterName
    if (-not $doc.PrinterSettings.IsValid) {
        throw "Settings to access printer '$PrinterName' are not valid."
    }
    $doc.PrintController = New-Object System.Drawing.Printing.StandardPrintController
    $doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(50, 50, 50, 50)
    $font = New-Object System.Drawing.Font('Segoe UI', 10)
    $brush = [System.Drawing.Brushes]::Black
    $handler = [System.Drawing.Printing.PrintPageEventHandler]{
        param($sender, $eventArgs)
        $rect = New-Object System.Drawing.RectangleF(
            [single]$eventArgs.MarginBounds.Left,
            [single]$eventArgs.MarginBounds.Top,
            [single]$eventArgs.MarginBounds.Width,
            [single]$eventArgs.MarginBounds.Height
        )
        $format = New-Object System.Drawing.StringFormat
        try {
            $format.Trimming = [System.Drawing.StringTrimming]::Word
            $eventArgs.Graphics.DrawString($text, $font, $brush, $rect, $format)
            $eventArgs.HasMorePages = $false
        }
        finally {
            $format.Dispose()
        }
    }

    try {
        $doc.add_PrintPage($handler)
        $doc.Print()
    }
    finally {
        $doc.remove_PrintPage($handler)
        $font.Dispose()
        $doc.Dispose()
    }

    return $docName
}

Assert-Administrator

Write-Step 'Bat cau hinh chia se printer tren may host'
Ensure-DwordValue -Path 'HKLM:\System\CurrentControlSet\Control\Print' -Name 'RpcAuthnLevelPrivacyEnabled' -Value 0
Ensure-DwordValue -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' -Name 'LocalAccountTokenFilterPolicy' -Value 1

Enable-FirewallDisplayGroupSafe -DisplayGroup 'File and Printer Sharing'
Enable-FirewallDisplayGroupSafe -DisplayGroup 'Remote Service Management'
Enable-FirewallDisplayGroupSafe -DisplayGroup 'Windows Management Instrumentation (WMI)'

Restart-SpoolerSafe

$results = @()
foreach ($printerName in $PrinterNames) {
    Write-Step "Xu ly printer '$printerName'"
    $sharedPrinter = Ensure-PrinterShared -PrinterName $printerName

    $removedJobs = 0
    if (-not $SkipQueueClear) {
        $removedJobs = Clear-PrinterQueue -PrinterName $printerName
        Write-Info "Da xoa $removedJobs job dang cho tren '$printerName'."
    }

    $probe = $null
    if (-not $SkipTestPrint) {
        try {
            $probeDocument = Invoke-LocalTextProbe -PrinterName $printerName
            $probe = Wait-PrinterQueueIdle -PrinterName $printerName -TimeoutSeconds 12
            if (-not $probe.QueueEmpty -and (($probe.Statuses -join ', ') -match 'Error|Retained|Blocked|Offline')) {
                throw "Queue '$printerName' van loi sau khi test: $($probe.Statuses -join ', ')"
            }
            Write-Info "Da gui test print local '$probeDocument' toi '$printerName'."
        }
        catch {
            $results += [pscustomobject]@{
                PrinterName = $sharedPrinter.Name
                ShareName   = $sharedPrinter.ShareName
                UncPath     = $sharedPrinter.UncPath
                Shared      = $sharedPrinter.Shared
                DriverName  = $sharedPrinter.DriverName
                PortName    = $sharedPrinter.PortName
                RemovedJobs = $removedJobs
                TestResult  = 'failed'
                Message     = $_.Exception.Message
            }
            continue
        }
    }

    $results += [pscustomobject]@{
        PrinterName = $sharedPrinter.Name
        ShareName   = $sharedPrinter.ShareName
        UncPath     = $sharedPrinter.UncPath
        Shared      = $sharedPrinter.Shared
        DriverName  = $sharedPrinter.DriverName
        PortName    = $sharedPrinter.PortName
        RemovedJobs = $removedJobs
        TestResult  = if ($SkipTestPrint) { 'skipped' } else { 'ok' }
        Message     = if ($SkipTestPrint) { 'Khong chay test print.' } else { 'Da test print local thanh cong hoac queue khong bao loi.' }
    }
}

Write-Host ''
Write-Host '=== SUMMARY ===' -ForegroundColor Green
$results | Format-Table -AutoSize

Write-Host ''
Write-Host 'Neu ban vua sua xong LAPTOP_PHAT, quay lai CanHang va test lai qua agent.' -ForegroundColor Yellow
