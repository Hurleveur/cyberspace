/**
 * Generates a self-signed TLS certificate for localhost.
 * Pure JavaScript — no OpenSSL or system tools required.
 *
 * Usage:  node generate-cert.js
 * Output: certs/cert.pem  (certificate)
 *         certs/key.pem   (private key)
 *
 * Normally called via setup-https.ps1, which also installs the cert
 * into the Windows Trusted Root CA store so Chrome/Edge trust it.
 */

const fs   = require('fs');
const path = require('path');

const CERTS_DIR = path.join(__dirname, 'certs');
const CERT_FILE = path.join(CERTS_DIR, 'cert.pem');
const KEY_FILE  = path.join(CERTS_DIR, 'key.pem');

if (fs.existsSync(CERT_FILE) && fs.existsSync(KEY_FILE)) {
  console.log('Certificates already exist — skipping generation.');
  console.log('Delete the certs/ folder to regenerate.');
  process.exit(0);
}

let selfsigned;
try {
  selfsigned = require('selfsigned');
} catch {
  console.error('Missing dependency. Run:  npm install  inside the dashboard/ folder, then try again.');
  process.exit(1);
}

console.log('Generating self-signed certificate for localhost...');

const attrs = [
  { name: 'commonName',         value: 'localhost' },
  { name: 'organizationName',   value: 'Cyberspace Dashboard' },
  { name: 'organizationalUnitName', value: 'Local Dev' },
];

const pems = selfsigned.generate(attrs, {
  keySize:   2048,
  days:      3650,
  algorithm: 'sha256',
  extensions: [
    { name: 'subjectAltName', altNames: [{ type: 2, value: 'localhost' }, { type: 7, ip: '127.0.0.1' }] },
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', keyCertSign: false, digitalSignature: true, keyEncipherment: true },
    { name: 'extKeyUsage', serverAuth: true },
  ],
});

fs.mkdirSync(CERTS_DIR, { recursive: true });
fs.writeFileSync(CERT_FILE, pems.cert,    { encoding: 'utf8' });
fs.writeFileSync(KEY_FILE,  pems.private, { encoding: 'utf8' });

console.log('Done.');
console.log('  cert.pem:', CERT_FILE);
console.log('  key.pem: ', KEY_FILE);
