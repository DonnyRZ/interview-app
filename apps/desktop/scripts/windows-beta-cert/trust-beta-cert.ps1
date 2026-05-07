param(
  [string] $CertificatePath,
  [switch] $Force
)

$ErrorActionPreference = "Stop"

$desktopRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
if (-not $CertificatePath) {
  $CertificatePath = Join-Path $desktopRoot "certs\beta\InterviewAppBetaCodeSigning.cer"
}

if (-not (Test-Path $CertificatePath)) {
  throw "Certificate not found at $CertificatePath. Run npm run cert:beta:create first."
}

$certificate = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($CertificatePath)

Write-Host "This will trust the beta certificate for the current Windows user only."
Write-Host "Subject:    $($certificate.Subject)"
Write-Host "Thumbprint: $($certificate.Thumbprint)"
Write-Host ""
Write-Host "Only do this for a beta certificate you created or intentionally received from the app publisher."

if (-not $Force) {
  $confirmation = Read-Host "Type TRUST to continue"
  if ($confirmation -ne "TRUST") {
    Write-Host "Trust step cancelled."
    exit 1
  }
}

Import-Certificate -FilePath $CertificatePath -CertStoreLocation "Cert:\CurrentUser\Root" | Out-Null
Import-Certificate -FilePath $CertificatePath -CertStoreLocation "Cert:\CurrentUser\TrustedPublisher" | Out-Null

Write-Host ""
Write-Host "Beta certificate trusted for the current user."
Write-Host "Store: Cert:\CurrentUser\Root"
Write-Host "Store: Cert:\CurrentUser\TrustedPublisher"
