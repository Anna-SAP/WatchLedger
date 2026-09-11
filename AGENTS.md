# WatchLedger development workflow

- After changing plugin functionality, run relevant tests, then `node build.mjs` to build both browser extensions and synchronize the configured installed copy. Do not treat updating only this Git checkout as delivery.
- `.watchledger-local.json` is ignored local configuration. Its `outputDirectory` identifies the actual browser installation. Keep this file local; never embed its machine-specific path in tracked source.
- A configured synchronization failure is a delivery failure: fix it or report the exact blocker. Do not silently use `--no-sync` to claim the installed extension is updated. Use `node build.mjs --no-sync` for isolated tests or intermediate builds only.
- Preserve the installed extension directory, Chromium manifest key, Firefox ID, browser storage, pending queue, and local database. Never uninstall/re-add the user's extension to update it.
- The browser must reload its existing extension after files synchronize. Tell the user when that step remains; a GitHub merge or successful file copy alone does not reload a running extension.
