param(
  [string] $CertificatePath,
  [string] $PfxPath
)

$ErrorActionPreference = "Stop"

$desktopRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
if (-not $CertificatePath) {
  $CertificatePath = Join-Path $desktopRoot "certs\beta\InterviewAppBetaCodeSigning.cer"
}
if (-not $PfxPath) {
  $PfxPath = Join-Path $desktopRoot "certs\beta\InterviewAppBetaCodeSigning.pfx"
}

$helperPath = Join-Path $desktopRoot "native\windows-loopback\bin\WasapiLoopbackProbe.exe"
$packagedAppPath = Join-Path $desktopRoot "release\win-unpacked\Interview App.exe"
$packagedHelperPath = Join-Path $desktopRoot "release\win-unpacked\resources\native\windows-loopback\WasapiLoopbackProbe.exe"
$releaseDir = Join-Path $desktopRoot "release"
$hasFailure = $false

function Write-Check {
  param(
    [string] $Status,
    [string] $Message
  )
  Write-Host "[$Status] $Message"
}

function Test-CertStore {
  param(
    [string] $Thumbprint,
    [string] $StoreName
  )

  $store = New-Object System.Security.Cryptography.X509Certificates.X509Store($StoreName, "CurrentUser")
  try {
    $store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadOnly)
    foreach ($certificate in $store.Certificates) {
      if ($certificate.Thumbprint -eq $Thumbprint) {
        return $true
      }
    }
    return $false
  } finally {
    $store.Close()
  }
}

function Check-Signature {
  param(
    [string] $Label,
    [string] $FilePath
  )

  if (-not (Test-Path $FilePath)) {
    Write-Check "WARN" "$Label not found: $FilePath"
    return
  }

  $signature = Get-AuthenticodeSignature -FilePath $FilePath
  if ($signature.Status -eq "Valid") {
    Write-Check "OK" "$Label signature valid: $FilePath"
  } else {
    Write-Check "FAIL" "$Label signature status is $($signature.Status): $FilePath"
    $script:hasFailure = $true
  }
}

if (Test-Path $CertificatePath) {
  $certificate = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($CertificatePath)
  Write-Check "OK" "CER exists: $CertificatePath"
  Write-Check "INFO" "Certificate thumbprint: $($certificate.Thumbprint)"

  if (Test-CertStore $certificate.Thumbprint "Root") {
    Write-Check "OK" "Certificate trusted in CurrentUser Root."
  } else {
    Write-Check "FAIL" "Certificate is not trusted in CurrentUser Root. Run npm run cert:beta:trust."
    $hasFailure = $true
  }

  if (Test-CertStore $certificate.Thumbprint "TrustedPublisher") {
    Write-Check "OK" "Certificate trusted in CurrentUser TrustedPublisher."
  } else {
    Write-Check "FAIL" "Certificate is not trusted in CurrentUser TrustedPublisher. Run npm run cert:beta:trust."
    $hasFailure = $true
  }
} else {
  Write-Check "FAIL" "CER not found: $CertificatePath"
  $hasFailure = $true
}

if (Test-Path $PfxPath) {
  Write-Check "OK" "PFX exists locally: $PfxPath"
} else {
  Write-Check "FAIL" "PFX not found: $PfxPath"
  $hasFailure = $true
}

Check-Signature "Native helper" $helperPath
Check-Signature "Packaged app" $packagedAppPath
Check-Signature "Packaged helper" $packagedHelperPath

if (Test-Path $releaseDir) {
  Get-ChildItem -Path $releaseDir -Filter "*.exe" -File -ErrorAction SilentlyContinue |
    ForEach-Object {
      Check-Signature "Release executable" $_.FullName
    }
}

if ($hasFailure) {
  exit 1
}

Write-Host ""
Write-Host "Beta certificate checks passed."
