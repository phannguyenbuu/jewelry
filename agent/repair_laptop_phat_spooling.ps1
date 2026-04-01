[CmdletBinding()]
param(
    [string[]]$PrinterNames = @(
        'Canon LBP2900',
        'EPSON TM-T81III Receipt6'
    ),
    [int]$RecentLogMinutes = 180,
    [string]$ReportRoot = '',
    [switch]$SkipQueueClear,
    [switch]$SkipTestPrint,
    [switch]$KeepSpoolFiles
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

function Write-WarnLine {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Assert-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Hay chay script nay bang PowerShell -> Run as administrator.'
    }
}

function Ensure-Directory {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
    return (Resolve-Path -LiteralPath $Path).Path
}

function Save-JsonFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)]$Data
    )

    $json = $Data | ConvertTo-Json -Depth 8
    Set-Content -LiteralPath $Path -Value $json -Encoding UTF8
}

function Save-TextFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string[]]$Lines
    )

    Set-Content -LiteralPath $Path -Value $Lines -Encoding UTF8
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

    $before = $null
    try {
        $before = (Get-ItemProperty -LiteralPath $Path -Name $Name -ErrorAction Stop).$Name
    }
    catch {
        $before = $null
    }

    New-ItemProperty -Path $Path -Name $Name -PropertyType DWord -Value $Value -Force | Out-Null

    [pscustomobject]@{
        Path   = $Path
        Name   = $Name
        Before = $before
        After  = $Value
    }
}

function Enable-FirewallDisplayGroupSafe {
    param([string]$DisplayGroup)

    try {
        Enable-NetFirewallRule -DisplayGroup $DisplayGroup -ErrorAction Stop | Out-Null
        return [pscustomobject]@{
            DisplayGroup = $DisplayGroup
            Status       = 'enabled'
            Message      = ''
        }
    }
    catch {
        return [pscustomobject]@{
            DisplayGroup = $DisplayGroup
            Status       = 'warning'
            Message      = $_.Exception.Message
        }
    }
}

function Ensure-ServiceRunning {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [ValidateSet('Automatic', 'Manual', 'Disabled')][string]$StartupType = 'Automatic'
    )

    $service = Get-Service -Name $Name -ErrorAction Stop
    $startupBefore = $null
    try {
        $startupBefore = (Get-CimInstance Win32_Service -Filter "Name='$Name'" -ErrorAction Stop).StartMode
    }
    catch {
        $startupBefore = ''
    }

    try {
        Set-Service -Name $Name -StartupType $StartupType -ErrorAction Stop
    }
    catch {
        Write-WarnLine "Khong doi StartupType duoc cho service '$Name': $($_.Exception.Message)"
    }

    if ($service.Status -ne 'Running') {
        Start-Service -Name $Name -ErrorAction Stop
        $service = Get-Service -Name $Name -ErrorAction Stop
    }

    [pscustomobject]@{
        Name          = $service.Name
        DisplayName   = $service.DisplayName
        Status        = [string]$service.Status
        StartupBefore = $startupBefore
        StartupAfter  = $StartupType
    }
}

function Restart-SpoolerSafe {
    Write-Step 'Khoi dong lai Print Spooler'
    Restart-Service -Name Spooler -Force
    Start-Sleep -Seconds 1
    $service = Get-Service -Name Spooler
    if ($service.Status -ne 'Running') {
        throw "Print Spooler dang o trang thai '$($service.Status)'."
    }
}

function Clear-SpoolFiles {
    $spoolDir = Join-Path $env:SystemRoot 'System32\spool\PRINTERS'
    $removed = @()

    Write-Step 'Dung Spooler va xoa file spool treo'
    Stop-Service -Name Spooler -Force
    Start-Sleep -Milliseconds 800

    if (Test-Path -LiteralPath $spoolDir) {
        $files = @(Get-ChildItem -LiteralPath $spoolDir -Force -ErrorAction SilentlyContinue)
        foreach ($file in $files) {
            try {
                Remove-Item -LiteralPath $file.FullName -Force -ErrorAction Stop
                $removed += $file.Name
            }
            catch {
                Write-WarnLine "Khong xoa duoc spool file '$($file.FullName)': $($_.Exception.Message)"
            }
        }
    }

    Start-Service -Name Spooler
    Start-Sleep -Milliseconds 800

    [pscustomobject]@{
        SpoolDirectory = $spoolDir
        RemovedCount   = $removed.Count
        RemovedFiles   = $removed
    }
}

function Enable-PrintOperationalLog {
    try {
        & wevtutil.exe set-log 'Microsoft-Windows-PrintService/Operational' /enabled:true | Out-Null
        return [pscustomobject]@{
            LogName = 'Microsoft-Windows-PrintService/Operational'
            Status  = 'enabled'
        }
    }
    catch {
        return [pscustomobject]@{
            LogName = 'Microsoft-Windows-PrintService/Operational'
            Status  = 'warning'
            Message = $_.Exception.Message
        }
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

function Get-PrinterQueueSnapshot {
    param([string]$PrinterName)

    $jobs = @(Get-PrintJob -PrinterName $PrinterName -ErrorAction SilentlyContinue)
    return @($jobs | Select-Object `
        @{Name='Id';Expression={$_.ID}}, `
        @{Name='DocumentName';Expression={$_.DocumentName}}, `
        @{Name='JobStatus';Expression={[string]$_.JobStatus}}, `
        @{Name='SubmittedTime';Expression={$_.SubmittedTime}}, `
        @{Name='Size';Expression={$_.Size}})
}

function Get-PrinterReport {
    param([string]$PrinterName)

    $printer = Get-PrinterSafe -PrinterName $PrinterName
    if (-not $printer) {
        return [pscustomobject]@{
            PrinterName = $PrinterName
            Exists      = $false
        }
    }

    $configuration = $null
    $port = $null
    $driver = $null

    try { $configuration = Get-PrintConfiguration -PrinterName $PrinterName -ErrorAction Stop } catch {}
    try { $port = Get-PrinterPort -Name $printer.PortName -ErrorAction Stop } catch {}
    try { $driver = Get-PrinterDriver -Name $printer.DriverName -ErrorAction Stop } catch {}

    [pscustomobject]@{
        PrinterName           = $printer.Name
        Exists                = $true
        DriverName            = $printer.DriverName
        PortName              = $printer.PortName
        PrinterStatus         = [string]$printer.PrinterStatus
        Shared                = [bool]$printer.Shared
        ShareName             = $printer.ShareName
        Type                  = $printer.Type
        WorkOffline           = [bool]$printer.WorkOffline
        KeepPrintedJobs       = [bool]$printer.KeepPrintedJobs
        PrintProcessor        = $printer.PrintProcessor
        Datatype              = $printer.Datatype
        RenderingMode         = $printer.RenderingMode
        BranchOfficeDisabled  = [bool]$printer.DisableBranchOfficeLogging
        Configuration         = if ($configuration) { $configuration | Select-Object * } else { $null }
        Port                  = if ($port) { $port | Select-Object * } else { $null }
        Driver                = if ($driver) { $driver | Select-Object * } else { $null }
        Queue                 = Get-PrinterQueueSnapshot -PrinterName $PrinterName
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
        [int]$TimeoutSeconds = 18
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
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
        $joinedStatus = ($statuses -join ', ')
        if ($joinedStatus -match 'Error|Retained|Blocked|Offline|PaperOut|UserIntervention') {
            return [pscustomobject]@{
                QueueEmpty = $false
                JobCount   = $jobs.Count
                Statuses   = $statuses
            }
        }

        Start-Sleep -Milliseconds 900
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
        'LAPTOP_PHAT spool repair probe'
        "Computer: $env:COMPUTERNAME"
        "Printer: $PrinterName"
        "Time: $stamp"
        'If this page prints, local driver + spooler are working.'
    ) -join [Environment]::NewLine

    $docName = "LAPTOP_PHAT Probe - $PrinterName - $stamp"
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

function Get-EventMessageSafe {
    param($EventRecord)

    try {
        return [string]$EventRecord.Message
    }
    catch {
        return ''
    }
}

function Convert-EventRecord {
    param($EventRecord)

    [pscustomobject]@{
        TimeCreated = $EventRecord.TimeCreated
        Id          = $EventRecord.Id
        Level       = $EventRecord.LevelDisplayName
        Provider    = $EventRecord.ProviderName
        LogName     = $EventRecord.LogName
        MachineName = $EventRecord.MachineName
        Message     = Get-EventMessageSafe -EventRecord $EventRecord
    }
}

function Get-RecentPrintEvents {
    param(
        [datetime]$Since,
        [string[]]$PrinterNames
    )

    $needles = @($PrinterNames | Where-Object { $_ } | ForEach-Object { $_.ToLowerInvariant() })
    $events = @(Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-PrintService/Operational'; StartTime = $Since } -ErrorAction SilentlyContinue)
    if ($needles.Count -gt 0) {
        $events = @($events | Where-Object {
            $message = (Get-EventMessageSafe -EventRecord $_).ToLowerInvariant()
            foreach ($needle in $needles) {
                if ($message.Contains($needle)) { return $true }
            }
            return $false
        })
    }

    @($events | Sort-Object TimeCreated -Descending | Select-Object -First 250 | ForEach-Object { Convert-EventRecord -EventRecord $_ })
}

function Get-RecentSpoolerSystemEvents {
    param([datetime]$Since)

    $events = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; StartTime = $Since } -ErrorAction SilentlyContinue | Where-Object {
        $_.ProviderName -in @('Service Control Manager', 'PrintService')
    })

    @($events | Sort-Object TimeCreated -Descending | Select-Object -First 120 | ForEach-Object { Convert-EventRecord -EventRecord $_ })
}

Assert-Administrator

$runAt = Get-Date
$since = $runAt.AddMinutes(-1 * [Math]::Max(5, $RecentLogMinutes))
$runId = $runAt.ToString('yyyyMMdd-HHmmss')
$resolvedReportRoot = if ([string]::IsNullOrWhiteSpace($ReportRoot)) {
    Join-Path $PSScriptRoot 'reports'
}
else {
    $ReportRoot
}
$resolvedReportRoot = Ensure-Directory -Path $resolvedReportRoot
$reportDir = Ensure-Directory -Path (Join-Path $resolvedReportRoot "laptop_phat-spool-$runId")
$transcriptPath = Join-Path $reportDir 'transcript.txt'

Start-Transcript -Path $transcriptPath -Force | Out-Null

try {
    Write-Step "Bat dau kiem tra may $env:COMPUTERNAME"

    $summary = [ordered]@{
        ComputerName        = $env:COMPUTERNAME
        RunAt               = $runAt
        ReportDirectory     = $reportDir
        RecentLogMinutes    = $RecentLogMinutes
        RegistryChanges     = @()
        FirewallChanges     = @()
        ServiceChecks       = @()
        SpoolFileCleanup    = $null
        PrinterResults      = @()
        PrintServiceEvents  = @()
        SystemPrintEvents   = @()
        Recommendations     = @()
        OverallStatus       = 'ok'
    }

    Write-Step 'Bat logging cho PrintService/Operational'
    $logResult = Enable-PrintOperationalLog
    if ($logResult.Status -ne 'enabled') {
        $summary.OverallStatus = 'warning'
        $summary.Recommendations += 'Khong bat duoc PrintService/Operational log. Kiem tra Event Log service.'
    }

    Write-Step 'Dam bao service can thiet dang chay'
    $summary.ServiceChecks += Ensure-ServiceRunning -Name 'Spooler' -StartupType 'Automatic'
    $summary.ServiceChecks += Ensure-ServiceRunning -Name 'LanmanServer' -StartupType 'Automatic'

    Write-Step 'Ap dung registry cho printer sharing'
    $summary.RegistryChanges += Ensure-DwordValue -Path 'HKLM:\System\CurrentControlSet\Control\Print' -Name 'RpcAuthnLevelPrivacyEnabled' -Value 0
    $summary.RegistryChanges += Ensure-DwordValue -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' -Name 'LocalAccountTokenFilterPolicy' -Value 1

    Write-Step 'Bat firewall rules can thiet'
    foreach ($displayGroup in @(
        'File and Printer Sharing',
        'Remote Service Management',
        'Windows Management Instrumentation (WMI)',
        'Network Discovery'
    )) {
        $result = Enable-FirewallDisplayGroupSafe -DisplayGroup $displayGroup
        $summary.FirewallChanges += $result
        if ($result.Status -ne 'enabled') {
            $summary.OverallStatus = 'warning'
        }
    }

    if (-not $KeepSpoolFiles) {
        $summary.SpoolFileCleanup = Clear-SpoolFiles
    }
    else {
        Restart-SpoolerSafe
        $summary.SpoolFileCleanup = [pscustomobject]@{
            SpoolDirectory = (Join-Path $env:SystemRoot 'System32\spool\PRINTERS')
            RemovedCount   = 0
            RemovedFiles   = @()
            Skipped        = $true
        }
    }

    foreach ($printerName in $PrinterNames) {
        Write-Step "Xu ly printer '$printerName'"

        $printerResult = [ordered]@{
            PrinterName  = $printerName
            Before       = Get-PrinterReport -PrinterName $printerName
            ShareResult  = $null
            RemovedJobs  = 0
            ProbeResult  = 'skipped'
            ProbeDocName = ''
            QueueAfter   = @()
            After        = $null
            Status       = 'ok'
            Message      = ''
        }

        try {
            $printerResult.ShareResult = Ensure-PrinterShared -PrinterName $printerName

            if (-not $SkipQueueClear) {
                $printerResult.RemovedJobs = Clear-PrinterQueue -PrinterName $printerName
                Write-Info "Da xoa $($printerResult.RemovedJobs) job dang cho tren '$printerName'."
            }

            if (-not $SkipTestPrint) {
                $probeDocument = Invoke-LocalTextProbe -PrinterName $printerName
                $probe = Wait-PrinterQueueIdle -PrinterName $printerName -TimeoutSeconds 18
                $printerResult.ProbeDocName = $probeDocument
                $printerResult.QueueAfter = Get-PrinterQueueSnapshot -PrinterName $printerName

                if (-not $probe.QueueEmpty) {
                    $statuses = ($probe.Statuses -join ', ')
                    throw "Queue '$printerName' van con job sau test print. Statuses: $statuses"
                }

                $printerResult.ProbeResult = 'ok'
                $printerResult.Message = 'Local test print thanh cong va queue da rong.'
                Write-Info "Da gui test print local '$probeDocument' toi '$printerName'."
            }
            else {
                $printerResult.Message = 'Bo qua buoc test print theo tham so.'
            }
        }
        catch {
            $printerResult.Status = 'failed'
            $printerResult.ProbeResult = 'failed'
            $printerResult.Message = $_.Exception.Message
            $printerResult.QueueAfter = Get-PrinterQueueSnapshot -PrinterName $printerName
            $summary.OverallStatus = 'failed'
            $summary.Recommendations += "Kiem tra lai driver/port/queue cua printer '$printerName' tren LAPTOP_PHAT."
            Write-WarnLine $printerResult.Message
        }
        finally {
            $printerResult.After = Get-PrinterReport -PrinterName $printerName
            $summary.PrinterResults += [pscustomobject]$printerResult
        }
    }

    Write-Step 'Thu thap event log va bao cao'
    $summary.PrintServiceEvents = Get-RecentPrintEvents -Since $since -PrinterNames $PrinterNames
    $summary.SystemPrintEvents = Get-RecentSpoolerSystemEvents -Since $since

    if (-not $summary.Recommendations.Count) {
        $summary.Recommendations = @('Neu test print local deu ok, quay lai may CanHang va test in qua agent.')
    }

    Save-JsonFile -Path (Join-Path $reportDir 'summary.json') -Data $summary
    Save-JsonFile -Path (Join-Path $reportDir 'printservice-events.json') -Data $summary.PrintServiceEvents
    Save-JsonFile -Path (Join-Path $reportDir 'system-print-events.json') -Data $summary.SystemPrintEvents

    $summaryLines = @(
        "ComputerName : $($summary.ComputerName)",
        "RunAt        : $($summary.RunAt)",
        "ReportDir    : $($summary.ReportDirectory)",
        "OverallStatus: $($summary.OverallStatus)",
        ''
        'Printers:'
    )

    foreach ($printer in $summary.PrinterResults) {
        $summaryLines += " - $($printer.PrinterName): $($printer.Status) | $($printer.Message)"
    }

    $summaryLines += ''
    $summaryLines += 'Recommendations:'
    foreach ($item in $summary.Recommendations | Select-Object -Unique) {
        $summaryLines += " - $item"
    }

    Save-TextFile -Path (Join-Path $reportDir 'summary.txt') -Lines $summaryLines

    Write-Host ''
    Write-Host '=== SUMMARY ===' -ForegroundColor Green
    $summaryLines | ForEach-Object { Write-Host $_ }
    Write-Host ''
    Write-Host "Da luu bao cao tai: $reportDir" -ForegroundColor Yellow
}
finally {
    Stop-Transcript | Out-Null
}
