param(
  [ValidateSet("package", "dist")]
  [string] $Target = "package",
  [string] $PfxPath,
  [string] $Password
)

$ErrorActionPreference = "Stop"

$desktopRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
if (-not $PfxPath) {
  $PfxPath = Join-Path $desktopRoot "certs\beta\InterviewAppBetaCodeSigning.pfx"
}

if (-not (Test-Path $PfxPath)) {
  throw "PFX not found at $PfxPath. Run npm run cert:beta:create first."
}

function Convert-SecureStringToPlainText {
  param([System.Security.SecureString] $SecureString)

  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureString)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

if (-not $Password) {
  if ($env:WINDOWS_BETA_CERT_PASSWORD) {
    $Password = $env:WINDOWS_BETA_CERT_PASSWORD
  } else {
    $securePassword = Read-Host "Enter beta PFX password" -AsSecureString
    $Password = Convert-SecureStringToPlainText $securePassword
  }
}

$previousCertificateFile = $env:WINDOWS_CERTIFICATE_FILE
$previousCertificatePassword = $env:WINDOWS_CERTIFICATE_PASSWORD

try {
  $env:WINDOWS_CERTIFICATE_FILE = (Resolve-Path $PfxPath).Path
  $env:WINDOWS_CERTIFICATE_PASSWORD = $Password

  Push-Location $desktopRoot
  try {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) {
      exit $LASTEXITCODE
    }

    # electron-builder's built-in signer may need SDK/symlink privileges.
    # For self-signed beta builds, package first, then Authenticode-sign the output.
    $env:WINDOWS_CERTIFICATE_FILE = $null
    $env:WINDOWS_CERTIFICATE_PASSWORD = $null

    if ($Target -eq "dist") {
      & npm.cmd exec -- electron-builder --win nsis --config electron-builder.config.cjs
    } else {
      & npm.cmd exec -- electron-builder --win dir --config electron-builder.config.cjs
    }

    if ($LASTEXITCODE -ne 0) {
      exit $LASTEXITCODE
    }

    $targets = @(
      (Join-Path $desktopRoot "release\win-unpacked\Interview App.exe"),
      (Join-Path $desktopRoot "release\win-unpacked\resources\native\windows-loopback\WasapiLoopbackProbe.exe")
    )

    if ($Target -eq "dist") {
      $installerTargets = Get-ChildItem -Path (Join-Path $desktopRoot "release") -Filter "*.exe" -File -ErrorAction SilentlyContinue |
        Where-Object { $_.DirectoryName -ne (Join-Path $desktopRoot "release\win-unpacked") } |
        Select-Object -ExpandProperty FullName
      $targets += $installerTargets
    }

    $existingTargets = $targets | Where-Object { Test-Path $_ }
    if ($existingTargets.Count -eq 0) {
      throw "No packaged executables found to sign."
    }

    $env:WINDOWS_CERTIFICATE_FILE = (Resolve-Path $PfxPath).Path
    $env:WINDOWS_CERTIFICATE_PASSWORD = $Password
    $env:WINDOWS_SIGN_TARGETS = ($existingTargets -join ";")

    & npm.cmd run sign:native:windows
    if ($LASTEXITCODE -ne 0) {
      exit $LASTEXITCODE
    }
  } finally {
    Pop-Location
  }
} finally {
  $env:WINDOWS_CERTIFICATE_FILE = $previousCertificateFile
  $env:WINDOWS_CERTIFICATE_PASSWORD = $previousCertificatePassword
  $env:WINDOWS_SIGN_TARGETS = $null
}
