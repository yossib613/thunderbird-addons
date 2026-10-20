# Thunderbird add-ons — Solutionist Ltd

| Folder | Add-on | ID |
|---|---|---|
| [`to-cc-column`](to-cc-column) | **To & Cc Column** — shows To and Cc recipients in one message list column | `to-cc-column@solutionist-ltd.com` |
| [`notes-reminders`](notes-reminders) | **Notes & Reminders** — notes and reminders on messages, shown in a message list column | `notes-reminders@solutionist-ltd.com` |

Each folder is a self-contained add-on with its own `README.md`, `LICENSE` (MPL 2.0) and `build.ps1`.
Run `build.ps1` in a folder to write that add-on's `.xpi` to its `dist` folder.

Both add-ons use an Experiment API (Thunderbird's internal `ThreadPaneColumns` module), so each sets a
`strict_max_version` and must be checked against each new Thunderbird release.
