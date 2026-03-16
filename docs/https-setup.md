# HTTPS Setup Guide

The dashboard runs plain HTTP by default. HTTPS is optional but required if you want
CryptPad embeds to work (browsers block mixed-content iframes) or if you expose the
dashboard over a local network.

When TLS certificates are present in `dashboard/certs/`, the server automatically:
- Starts HTTPS on port `4444` (or `HTTPS_PORT` in your `.env`)
- Keeps HTTP running on port `3000` and redirects all requests to HTTPS

---

## Option A — Windows (recommended, one command)

`setup-https.ps1` automates the full process: it runs `npm install`, generates a
self-signed certificate, and installs it into the Windows Trusted Root CA store so
Chrome and Edge trust it without a browser warning.

**1. Open PowerShell as Administrator**

Right-click the Start button → *Windows PowerShell (Admin)* or *Terminal (Admin)*.

**2. Run the script**

```powershell
cd C:\path\to\cyberspace\dashboard
.\setup-https.ps1
```

The script will:
1. Run `npm install` to ensure all dependencies (including `selfsigned`) are present
2. Call `node generate-cert.js` to generate `certs/cert.pem` and `certs/key.pem`
3. Import the certificate into the Windows Local Machine → Trusted Root CA certificate store

**3. Restart the dashboard**

```powershell
cd C:\path\to\cyberspace\dashboard
npm start
```

Open **https://localhost:4444** in Chrome or Edge. You should see a secure padlock — no
certificate warning.

> **Note:** Firefox maintains its own certificate store and will still show a warning.
> You can add a security exception in Firefox manually, or import the cert via
> *Settings → Privacy & Security → Certificates → View Certificates → Authorities → Import*.

---

## Option B — Windows (manual via Node.js)

If you prefer not to run the PowerShell script, you can generate the certificate manually
and install it yourself.

**1. Generate the certificate**

```bash
cd dashboard
npm install        # ensures 'selfsigned' devDependency is installed
node generate-cert.js
```

This writes two files:
- `dashboard/certs/cert.pem` — the certificate (valid 10 years, SHA-256, 2048-bit RSA)
- `dashboard/certs/key.pem` — the private key

**2. Trust the certificate in Windows**

Open `certmgr.msc` (Certificate Manager) or use the MMC snap-in:

1. Press `Win+R`, type `certmgr.msc`, press Enter
2. Expand *Trusted Root Certification Authorities* → right-click *Certificates* → *All Tasks → Import*
3. Browse to `dashboard/certs/cert.pem`
4. Place it in *Trusted Root Certification Authorities*
5. Click Finish

Alternatively, from an Administrator PowerShell:

```powershell
$certBytes = [System.IO.File]::ReadAllBytes("C:\path\to\cyberspace\dashboard\certs\cert.pem")
$x509      = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($certBytes)
$store = [System.Security.Cryptography.X509Certificates.X509Store]::new("Root", "LocalMachine")
$store.Open("ReadWrite")
$store.Add($x509)
$store.Close()
```

**3. Start the dashboard and verify**

```bash
cd dashboard
npm start
```

Open **https://localhost:4444**. The padlock should be green.

---

## Option C — Linux / macOS

There is no shell script equivalent for Linux — generate the certificate with Node.js
directly, then trust it at the OS or browser level.

**1. Generate the certificate**

```bash
cd dashboard
npm install
node generate-cert.js
```

Output: `dashboard/certs/cert.pem` and `dashboard/certs/key.pem`.

**2. Trust the certificate**

*Ubuntu / Debian:*
```bash
sudo cp dashboard/certs/cert.pem /usr/local/share/ca-certificates/cyberspace.crt
sudo update-ca-certificates
```

*macOS:*
```bash
sudo security add-trusted-cert -d -r trustRoot \
  -k /Library/Keychains/System.keychain \
  dashboard/certs/cert.pem
```

> **Note:** Chrome on Linux uses the system NSS database. After updating system CAs,
> restart Chrome. Firefox (all platforms) requires manual import — see Option A note above.

**3. Start the dashboard**

```bash
cd dashboard
npm start
```

Open **https://localhost:4444**.

---

## Using a custom HTTPS port

Set `HTTPS_PORT` in `dashboard/.env`:

```env
HTTPS_PORT=8443
```

Then access the dashboard at `https://localhost:8443`.

---

## Bringing your own certificates

If you already have certificates (e.g. from a local CA, mkcert, or a real domain):

1. Place them as:
   - `dashboard/certs/cert.pem` — the full certificate chain
   - `dashboard/certs/key.pem` — the private key
2. Ensure they are valid for `localhost` or `127.0.0.1` (check the SAN extension)
3. Restart the dashboard — it will pick them up automatically

The `generate-cert.js` script skips generation if both files already exist.

---

## Regenerating certificates

The generated certificate is valid for 10 years. To regenerate:

```bash
# Delete the certs folder
rm -rf dashboard/certs          # Linux/macOS
Remove-Item -Recurse dashboard\certs   # PowerShell

# Re-run generation (Windows: use setup-https.ps1; Linux: node generate-cert.js)
```

Remember to re-import the new certificate into your system trust store.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `ERR_CERT_AUTHORITY_INVALID` in Chrome | Cert not trusted | Run `setup-https.ps1` as admin, or manually import cert into Root CA store |
| `ERR_CERT_COMMON_NAME_INVALID` | Cert doesn't cover `localhost` | Regenerate — delete `certs/` and re-run |
| Server starts on `:3000` only, no HTTPS | `certs/` folder missing or empty | Run `node generate-cert.js` |
| `Missing dependency` error | `selfsigned` not installed | Run `npm install` inside `dashboard/` |
| Firefox still shows warning | Firefox uses its own CA store | Import cert via Firefox Settings → Certificates |
| CryptPad iframe blocked | HTTP/HTTPS mismatch | Ensure dashboard is on HTTPS before embedding |
