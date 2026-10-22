# Notes & Reminders for Thunderbird

Add a note and a reminder to any message. A **Notes** column in the message list shows them:

```
⏰ 21/10/2026, 09:00 · 📝 Call Dave back about the invoice
```

- **Collapsed threads.** The top row of a thread also shows the notes of the later messages in it,
  marked `↳`, so a note on the third message is visible when the thread is collapsed. Thunderbird does
  not tell the column if a thread is collapsed, so the top row shows them when it is expanded too. The add-on
  finds the later messages from their `References` header, which it reads when you save the note.
- **Across accounts.** Notes are stored by the message's `Message-ID` header. A copy of the message
  in another account or folder has the same `Message-ID`, so it shows the same note and reminder.
- **Reminders.** When a reminder is due, the add-on marks every copy of the message as unread and/or
  flagged, shows a notification, and opens a *Reminders due* window. There you can open the message,
  mark it done, or snooze it for 30 minutes, 1 hour, 1 day, or until a date and time you pick. Reminders that fall due while Thunderbird is closed fire at the next start.
  Reminders that fired but were not snoozed or done show again at the next start.
- **Notes manager.** One window lists all notes and reminders. You can search, filter, and edit them
  in place, and set how often reminders are checked (default: every minute).

## Use

- Right-click a message in the list and choose **Note & reminder…**, or
- open a message and click the **Note & reminder** button in the message header toolbar.
- To see all notes, click the **Notes** toolbar button, or choose **All notes & reminders…** from the
  message list right-click menu or the Tools menu.
- The manager shows the time of the last check, and any errors from it. **Check now** runs a check at once.

If the column is not visible, right-click the message list column header and enable **Notes**.

## Requirements

Thunderbird 153 to 160.

## Install

1. Run `.\build.ps1`.
2. In Thunderbird, open **Tools → Add-ons and Themes**.
3. Click the gear icon, then **Install Add-on From File…**, and select `dist\notes-reminders-<version>.xpi`.

## Finding the copies of a message

Each note also stores the folders that hold a copy of the message. The add-on adds the folder when you
save a note, and updates the list when Thunderbird moves or copies the message. To mark copies unread or
flagged, it searches only those folders. It never searches all folders: that logs errors for IMAP
folders that have no local data, fails on saved search folders, and makes Owl for Exchange log errors.

Notes saved before version 1.2.0 have no folder list and no `References` list. For these, reminders
still show, but the message is not marked unread or flagged, and the note does not show on a collapsed
thread. To fix one, open it with **Note & reminder…** and click **Save**.

When you delete a message (moved to Trash, or deleted permanently), the add-on removes that folder from
the list. When no known copy is left, it removes the note and reminder too. A copy in another account
keeps the note. Restoring a message from Trash does not bring the note back.

## Data

Notes and reminders are stored in the add-on's local storage in your Thunderbird profile. They are not
stored in the messages, so other mail clients do not see them. Removing the add-on deletes them.

## Why it needs full access

Thunderbird has no WebExtension API for adding message list columns. This add-on therefore uses an
[Experiment API](https://webextension-api.thunderbird.net/en/latest/guides/experiments.html), which runs
with full access to Thunderbird. It uses that access only to:

- register the column with Thunderbird's internal `ThreadPaneColumns` module,
- listen for mouse hover over the column's cells to set the tooltip.

All the code is in [`src/experiment/implementation.js`](src/experiment/implementation.js).

Because it uses Thunderbird internals, a future Thunderbird release may break it.

## Build

```powershell
.\build.ps1
```

This writes `dist\notes-reminders-<version>.xpi`.

## License

[Mozilla Public License 2.0](LICENSE)
