#Requires -RunAsAdministrator

$scriptDir = $PSScriptRoot
$certsDir  = Join-Path $scriptDir "certs"
$certFile  = Join-Path $certsDir "cert.pem"
$keyFile   = Join-Path $certsDir "key.pem"

Set-Location $scriptDir

if (-not ((Test-Path $certFile) -and (Test-Path $keyFile))) {
    Write-Host "Installing npm dependencies..." -ForegroundColor Cyan
    & npm install --silent
    if ($LASTEXITCODE -ne 0) {
        Write-Error "npm install failed."
        exit 1
    }

    Write-Host "Generating certificate..." -ForegroundColor Cyan
    & node generate-cert.js
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Certificate generation failed."
        exit 1
    }

    if (-not (Test-Path $certFile)) {
        Write-Error "cert.pem was not created."
        exit 1
    }
}

Write-Host "Installing certificate into Windows Trusted Root CA store..." -ForegroundColor Cyan

$certBytes = [System.IO.File]::ReadAllBytes($certFile)
$x509      = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($certBytes)

$store = [System.Security.Cryptography.X509Certificates.X509Store]::new(
    [System.Security.Cryptography.X509Certificates.StoreName]::Root,
    [System.Security.Cryptography.X509Certificates.StoreLocation]::LocalMachine
)
$store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
$store.Add($x509)
$store.Close()

Write-Host ""
Write-Host "Done! Certificate installed and trusted." -ForegroundColor Green
Write-Host ""
Write-Host "Restart the dashboard server, then open:" -ForegroundColor Cyan
Write-Host "  https://localhost:3443" -ForegroundColor White
Write-Host ""
Write-Host "CryptPad embeds will now work in Chrome and Edge." -ForegroundColor Green
