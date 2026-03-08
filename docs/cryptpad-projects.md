# CryptPad Projects — Setup & Usage Guide

The Projects panel embeds your CryptPad Kanban boards directly into the Cyberspace dashboard. A project switcher at the top lets you move between boards without leaving the interface. Project metadata (names, URLs, members) is stored on the dashboard server so every browser tab and every person sharing the same dashboard sees the same project list.

Important: needs https to function.

---

## How it works

CryptPad encrypts all board data end-to-end in your browser — the dashboard server never reads your tasks. The integration works by loading your board inside an iframe using CryptPad's embed mode (`&embed=true`), which strips the navigation chrome and shows only the board content. Your existing cryptpad.fr login session handles authentication automatically.

What the dashboard stores server-side:
- Project name, description, color
- CryptPad edit URL and (optional) view URL
- Member names (for display only — no account linking)

What stays inside CryptPad (dashboard never touches it):
- Your tasks, cards, columns
- Board contents and history
- Encryption keys

---

## Step 1: Create a Kanban board on CryptPad

1. Go to [cryptpad.fr](https://cryptpad.fr) and sign in (free account works)
2. Click **New** → **Kanban**
3. Give the board a name and set it up however you like
4. The URL in your address bar while editing the board is your **edit URL**

---

## Step 2: Get the URLs you need

**Edit URL** (required to add the project):
- The URL in your browser address bar while the board is open
- Format: `https://cryptpad.fr/kanban/#/2/kanban/edit/HASH/`
- Anyone with this URL can edit the board — treat it like a shared password

**View URL** (optional — for read-only sharing):
1. Open the board on CryptPad
2. Click the **Share** icon (chain link icon in the toolbar)
3. Select **View** access
4. Copy the link

---

## Step 3: Add the project in the dashboard

1. Press **P** or click the **🗂** button in the dashboard header to open the Projects panel
2. Click the **+** button in the project switcher bar
3. Fill in the form:
   - **Project Name** — shown as the pill label in the switcher
   - **CryptPad Edit URL** — paste the URL from your browser address bar
   - **View-Only URL** — optional; shown in the fallback panel if embedding fails
   - **Description** — optional; shown in the fallback panel
   - **Members** — comma-separated names for reference (e.g. `Alex, Sam, Jordan`)
   - **Color** — pick a color for the switcher pill
4. Click **Create Project**

The board loads immediately in the Projects panel.

---

## Step 4: Managing multiple projects

Each project gets a pill button at the top of the panel. Click any pill to switch boards. The last selected project is remembered per browser.

**To edit a project's metadata:** click the ✏ button in the switcher bar (only visible when a project is selected)

**To delete a project:** click the 🗑 button. This removes the project from the dashboard only — your CryptPad board is completely unaffected.

Project metadata updates are instantly broadcast to all open dashboard tabs via WebSocket.

---

## Collaborating with others

For collaboration to work, everyone needs:

1. **Access to the same dashboard instance** — same `http://localhost:3000` or a shared server
2. **Their own cryptpad.fr login** with access to the board (via the edit or view URL)

Share the **edit URL** with anyone who should be able to make changes, or the **view URL** for read-only access. CryptPad handles access through URL possession — there is no user/permission management on the CryptPad side beyond controlling who has the link.

When someone adds, edits or deletes a project in the dashboard, all other open dashboard instances update in real time.

---

## Embed mode explained

When a board is loaded in the Projects panel, the dashboard appends `&embed=true` to the CryptPad URL automatically. This activates CryptPad's official embed mode, which:

- Hides the top navigation bar
- Hides the left sidebar
- Shows only the board content itself

The board is **fully functional** in embed mode — you can add, edit, and move cards; create and rename columns; and use all standard Kanban features.

---

## Fallback: when the iframe doesn't load

Some browser configurations (strict third-party cookie blocking, extensions like uBlock in hard mode) prevent CryptPad from loading inside an iframe. If loading takes more than 10 seconds without success, the panel switches to fallback mode and shows:

- A direct **Open in CryptPad ↗** button (opens the full board in a new tab)
- Your project description and member list
- A view-only link if one was configured

**Common fixes:**

| Symptom | Fix |
|---------|-----|
| Blank white area, then fallback | Make sure you're logged into cryptpad.fr in the same browser, then reload |
| Always shows fallback in Firefox | Disable enhanced tracking protection for `cryptpad.fr` |
| Always shows fallback with uBlock | Allow `cryptpad.fr` frames in uBlock settings |

---

## Keyboard shortcut

| Key | Action |
|-----|--------|
| `P` | Toggle the Projects panel |

---

## Limitations

- **No server-side task sync** — the dashboard cannot read board task data (E2E encrypted). CryptPad is the one source of truth for task content.
- **Login required per browser** — each person needs their own cryptpad.fr session with access to the board.
- **Iframe restrictions** — strict browser security settings may block embedding. The fallback panel handles this gracefully.
- **cryptpad.fr only** — URL validation requires `https://cryptpad.fr/`. Self-hosted CryptPad instances are not blocked but must start with your instance's domain. To support a self-hosted instance, update the regex in the `validateProjectInput` function in `dashboard/server.js`.

---

## Troubleshooting

**"URL must be a CryptPad link" error when creating a project:**
Double-check you copied the URL directly from your browser address bar while the board was open, not from a share dialog. It must start with `https://cryptpad.fr/`.

**Board loads but I can't edit anything:**
You may be viewing with the view-only URL rather than the edit URL. Check the URL you entered and make sure it contains `/edit/` in the path.

**Changes made by a collaborator don't appear:**
CryptPad syncs changes in real time within the board itself. If you don't see their changes, try reloading the panel (switch away and back, or reload the page).

**The project list is out of sync between two people:**
Project metadata syncs via WebSocket. Both people need to have the server running and be connected. Check the connection indicator in the bottom-right of the dashboard.
