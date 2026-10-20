# To & Cc Column for Thunderbird

Adds a **To & Cc** column to the Thunderbird message list. It shows the To recipients, then the Cc recipients:

```
Alice Smith, Bob Jones | Cc: Carol White
```

- Shows the display name of each recipient, or the email address when there is no name.
- The column can be sorted.
- When the text is too wide for the column, hover over the cell to see the full list in a tooltip.

Thunderbird's built-in *Recipient* column shows only the To field. This add-on shows both.

## Requirements

Thunderbird 153 to 160.

The add-on uses Thunderbird internals, so the add-on site requires a maximum version. It is raised
after checking each new Thunderbird release.

## Install

From [addons.thunderbird.net](https://addons.thunderbird.net) (once listed), or:

1. Download the `.xpi` file from the [Releases](../../releases) page.
2. In Thunderbird, open **Tools → Add-ons and Themes**.
3. Click the gear icon, then **Install Add-on From File…**, and select the `.xpi` file.
4. If the column is not visible, right-click the message list column header and enable **To & Cc**.

## Why it needs full access

Thunderbird has no WebExtension API for adding message list columns. This add-on therefore uses an
[Experiment API](https://webextension-api.thunderbird.net/en/latest/guides/experiments.html), which runs
with full access to Thunderbird. It uses that access only to:

- register the column with Thunderbird's internal `ThreadPaneColumns` module, and
- listen for mouse hover over the column's cells to set the tooltip.

It does not read message bodies, store data, or make network requests. All the code is in
[`src/experiment/implementation.js`](src/experiment/implementation.js).

Because it uses Thunderbird internals, a future Thunderbird release may break it. Please open an issue if it does.

## Build

```powershell
.\build.ps1
```

This writes `dist\to-cc-column-<version>.xpi`.

## License

[Mozilla Public License 2.0](LICENSE)
