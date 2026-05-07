param(
  [string] $Subject = "CN=Interview App Beta Code Signing",
  [string] $OutputDir,
  [string] $Provider = "Microsoft Enhanced RSA and AES Cryptographic Provider",
  [int] $Years = 3,
  [switch] $Force
)

$ErrorActionPreference = "Stop"

function Get-ExistingCertificate {
  param([string] $Subject)

  $store = New-Object System.Security.Cryptography.X509Certificates.X509Store("My", "CurrentUser")
  try {
    $store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadOnly)
    return $store.Certificates |
      Where-Object { $_.Subject -eq $Subject -and $_.HasPrivateKey } |
      Sort-Object NotAfter -Descending |
      Select-Object -First 1
  } finally {
    $store.Close()
  }
}

$desktopRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
if (-not $OutputDir) {
  $OutputDir = Join-Path $desktopRoot "certs\beta"
}

$certName = "InterviewAppBetaCodeSigning"
$pfxPath = Join-Path $OutputDir "$certName.pfx"
$cerPath = Join-Path $OutputDir "$certName.cer"

if ((Test-Path $pfxPath) -and -not $Force) {
  throw "PFX already exists at $pfxPath. Re-run with -Force only if you intentionally want to replace it."
}

New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

$existingCert = Get-ExistingCertificate -Subject $Subject

if ($existingCert -and -not $Force) {
  $cert = $existingCert
  Write-Host "Reusing existing beta code-signing certificate."
} else {
  $cert = New-SelfSignedCertificate `
    -Subject $Subject `
    -Type CodeSigning `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -KeyExportPolicy Exportable `
    -Provider $Provider `
    -KeyAlgorithm RSA `
    -KeyLength 2048 `
    -HashAlgorithm SHA256 `
    -NotAfter (Get-Date).AddYears($Years)
  Write-Host "Created beta code-signing certificate."
}

if ($env:WINDOWS_BETA_CERT_PASSWORD) {
  $securePassword = ConvertTo-SecureString -String $env:WINDOWS_BETA_CERT_PASSWORD -AsPlainText -Force
} else {
  $securePassword = Read-Host "Create a password for the beta PFX" -AsSecureString
}

Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $securePassword -Force | Out-Null
Export-Certificate -Cert $cert -FilePath $cerPath -Force | Out-Null

Write-Host ""
Write-Host "Beta certificate files created:"
Write-Host "  PFX private key: $pfxPath"
Write-Host "  CER public cert: $cerPath"
Write-Host "  Thumbprint:      $($cert.Thumbprint)"
Write-Host ""
Write-Host "Keep the PFX private. Share only the CER with beta testers who need to trust the beta build."
