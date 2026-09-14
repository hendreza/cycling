# Start Verge on this computer

Your project folder is **`/home/hendre/Projects/cycling`**.

## Start

Open a terminal in that folder and run:

```sh
./START_VERGE.sh
```

Or paste this into a terminal from anywhere:

```sh
/home/hendre/Projects/cycling/START_VERGE.sh
```

The file starts the app and its local API, waits until both respond, and opens **http://localhost:5173** in your browser. If the browser does not open, click that address yourself. Keep the terminal open while using Verge.

**Stop:** return to that terminal and press **Ctrl+C**. This stops the services started by that terminal. Starting again keeps your saved routes and access blocks. If Verge is already running, the launcher uses that instance instead of starting duplicates; stop it from its original terminal.

## Optional file-manager shortcut

**Start Verge.desktop** in this folder is a Linux shortcut that runs the same launcher in a terminal. Depending on your desktop/file manager, you may need to allow it to launch or choose “Run as a program”. Some file managers open shortcuts as text; use the terminal command above in that case. Nothing has been installed into your Desktop or application menu.

The shortcut points to the current project location. If you move the project, update its `Exec`, `Path` and `Icon` entries. `START_VERGE.sh` itself works from the moved project folder.

## If it does not start

| What you see | What to do |
| --- | --- |
| Browser cannot connect | Wait for `Ready: http://localhost:5173` in the terminal. Check the error printed there if it stops. |
| Port 5173 or 8000 already in use | Wait briefly if another Verge launch is starting. Otherwise stop your previous Verge terminal with Ctrl+C, then retry. The launcher does not kill unrelated processes. |
| Permission denied | Run `sh /home/hendre/Projects/cycling/START_VERGE.sh`, or enable the file’s executable permission. |
| Missing Python, Node or dependencies | This installation needs Python 3.13, Node 22 and the project dependencies. See the setup section in README.md. Avoid reinstalling an already working app. |
| No downloaded road data | Use the existing road-download instructions in README.md. A new installation needs the local road dataset. |
| Browser shows a different saved session | Use `localhost:5173` consistently. Browsers store `localhost` and `127.0.0.1` sessions separately. |

For a startup without opening a browser: `./START_VERGE.sh --no-browser`.

This starts your private computer installation. It does not publish Verge, create an Android app or open a phone transfer automatically. Wi-Fi GPX transfer is a separate action in the app. Your existing files stay in `data/`; do not delete that folder to troubleshoot startup.

## Planning the next version

Start with [the release plan](docs/RELEASE_PLAN.md). It links to the mobile approach, area expansion plan and legal review work. These are proposals for discussion; public hosting, accounts, new coverage and app-store submission have not been implemented by this planning task.
