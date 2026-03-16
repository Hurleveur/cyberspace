# Autostart Guide

Run the Cyberspace dashboard automatically on boot so it is always available when
you open your browser, without manually starting a terminal.

---

## Windows — Windows Service (node-windows)

The `install-service.js` script registers the dashboard as a native Windows Service
using the `node-windows` package. The service runs under the LocalSystem account, starts
on boot, and restarts automatically on crash.

### Prerequisites

- Node.js 18+
- `npm install` already run inside `dashboard/`
- **PowerShell or Command Prompt running as Administrator**

### Install the service

```powershell
cd C:\path\to\cyberspace\dashboard
npm install
node install-service.js
```

The script will:
1. Register the service as **Cyberspace Dashboard** in Windows Services
2. Start it immediately

You can verify it is running in `services.msc` — look for *Cyberspace Dashboard*.

### Manage the service

| Action | Command |
|--------|---------|
| Check status | Open `services.msc` → find *Cyberspace Dashboard* |
| Stop | `Stop-Service "Cyberspace Dashboard"` |
| Start | `Start-Service "Cyberspace Dashboard"` |
| Restart | `Restart-Service "Cyberspace Dashboard"` |
| View logs | See the `daemon/` subfolder created next to `server.js` |

### Uninstall the service

A corresponding `uninstall-service.js` can be used if you add one, or uninstall directly:

```powershell
sc.exe delete "Cyberspace Dashboard"
```

> Run this in an elevated (Administrator) PowerShell.

---

## Windows — Alternative: WinSW daemon wrapper

The `dashboard/daemon/` folder contains a pre-configured [WinSW](https://github.com/winsw/winsw)
XML descriptor (`cyberspacedashboard.xml`) for use with the WinSW binary.

### Steps

1. **Download WinSW** from the [WinSW releases page](https://github.com/winsw/winsw/releases).
   Rename the downloaded `.exe` to `cyberspacedashboard.exe` and place it alongside
   `cyberspacedashboard.xml` in `dashboard/daemon/`.

2. **Edit the XML** — update the `<argument>` paths to match your actual install location
   if it differs from `C:\Users\galaxy\Desktop\cyberspace`.

3. **Install** (run as Administrator):

   ```powershell
   cd C:\path\to\cyberspace\dashboard\daemon
   .\cyberspacedashboard.exe install
   .\cyberspacedashboard.exe start
   ```

4. **Verify** in `services.msc` — you should see *Cyberspace Dashboard*.

### WinSW management commands

```powershell
.\cyberspacedashboard.exe status
.\cyberspacedashboard.exe stop
.\cyberspacedashboard.exe start
.\cyberspacedashboard.exe restart
.\cyberspacedashboard.exe uninstall
```

Logs rotate automatically and are written to the `daemon/` folder.

---

## Linux — PM2

[PM2](https://pm2.keymetrics.io/) is a production process manager for Node.js. It handles
autostart via systemd or init scripts and provides log rotation, crash recovery, and a
monitoring interface.

### 1. Install PM2

```bash
npm install -g pm2
```

### 2. Start the dashboard

```bash
cd /path/to/cyberspace/dashboard
pm2 start server.js --name cyberspace-dashboard
```

To include environment variables from your `.env` file, use the `--env` flag or an
ecosystem config (see below).

### 3. Enable autostart on boot

```bash
pm2 save                  # persist the current process list
pm2 startup               # generate and display the startup command
```

`pm2 startup` will print a command like:

```bash
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u youruser --hp /home/youruser
```

Copy and run that command exactly as printed — it registers PM2 with systemd so it
starts on boot. Then run `pm2 save` again to snapshot the process list.

### 4. Verify

```bash
pm2 list                  # show all managed processes
pm2 show cyberspace-dashboard   # detailed info + uptime
pm2 logs cyberspace-dashboard   # tail live logs
```

Open `http://localhost:3000` (or `https://localhost:4444` if HTTPS is configured).

### PM2 management commands

| Action | Command |
|--------|---------|
| Stop | `pm2 stop cyberspace-dashboard` |
| Restart | `pm2 restart cyberspace-dashboard` |
| Delete (stop + remove) | `pm2 delete cyberspace-dashboard` |
| Tail logs | `pm2 logs cyberspace-dashboard` |
| Monitor CPU/RAM | `pm2 monit` |

### Optional — PM2 ecosystem config

Create `dashboard/ecosystem.config.js` for repeatable configuration:

```js
module.exports = {
  apps: [{
    name: 'cyberspace-dashboard',
    script: './server.js',
    cwd: '/path/to/cyberspace/dashboard',
    env: {
      NODE_ENV: 'production',
      HTTP_PORT: 3000,
      HTTPS_PORT: 4444,
    },
    max_restarts: 10,
    restart_delay: 3000,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }]
};
```

Then start with:

```bash
pm2 start ecosystem.config.js
pm2 save
```

---

## macOS — PM2 (launchd)

Same as Linux — PM2 works on macOS and integrates with launchd:

```bash
npm install -g pm2
cd /path/to/cyberspace/dashboard
pm2 start server.js --name cyberspace-dashboard
pm2 save
pm2 startup          # follow the printed instruction to register with launchd
```

---

## Checking that it works

After setting up autostart (any platform):

1. Reboot your machine
2. Wait 30–60 seconds for services to start
3. Open `http://localhost:3000` (HTTP) or `https://localhost:4444` (HTTPS)
4. The dashboard should load without any manual intervention

---

## Environment variables

The service reads `dashboard/.env` at startup. If you change `.env`, restart the service
for changes to take effect:

- **Windows (node-windows):** `Restart-Service "Cyberspace Dashboard"`
- **Windows (WinSW):** `.\cyberspacedashboard.exe restart`
- **Linux/macOS (PM2):** `pm2 restart cyberspace-dashboard`

See [docs/https-setup.md](https-setup.md) for HTTPS configuration — you can combine
autostart with HTTPS so the secure dashboard is always available on boot.
