/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

var { ExtensionCommon } = ChromeUtils.importESModule(
  "resource://gre/modules/ExtensionCommon.sys.mjs"
);
var { ThreadPaneColumns } = ChromeUtils.importESModule(
  "chrome://messenger/content/ThreadPaneColumns.mjs"
);
var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { ExtensionSupport } = ChromeUtils.importESModule(
  "resource:///modules/ExtensionSupport.sys.mjs"
);

const COLUMN_ID = "toCcColumn";
const WINDOW_LISTENER_ID = "to-cc-column-tooltip";
const MESSENGER_URL = "chrome://messenger/content/messenger.xhtml";
// Thunderbird gives custom column cells the class "<lowercased id>-column".
const CELL_SELECTOR = `td.${COLUMN_ID.toLowerCase()}-column`;

// Turns a raw (possibly MIME-encoded) address header into "Name, Name, ...".
// Falls back to the email address when an entry has no display name.
function formatAddresses(header) {
  if (!header) {
    return "";
  }
  try {
    return MailServices.headerParser
      .parseEncodedHeader(header, null)
      .map(a => a.name || a.email)
      .filter(Boolean)
      .join(", ");
  } catch (e) {
    return header;
  }
}

function getToCcText(msgHdr) {
  const to = formatAddresses(msgHdr.recipients);
  const cc = formatAddresses(msgHdr.ccList);
  if (to && cc) {
    return `${to} | Cc: ${cc}`;
  }
  return to || (cc ? `Cc: ${cc}` : "");
}

// Thunderbird sets no tooltip on custom column cells, so set one on hover,
// but only when the text is wider than the cell (i.e. shown with an ellipsis).
// The check runs on every hover because rows are recycled and columns resized.
function onMouseOver(event) {
  const cell = event.target.closest?.(CELL_SELECTOR);
  if (!cell) {
    return;
  }
  const style = cell.ownerDocument.defaultView.getComputedStyle(cell);
  const available =
    cell.clientWidth -
    parseFloat(style.paddingInlineStart) -
    parseFloat(style.paddingInlineEnd);
  // The cell clips overflow at paint time only, so a range over its contents
  // still reports the full, untruncated text width.
  const range = cell.ownerDocument.createRange();
  range.selectNodeContents(cell);
  const needed = range.getBoundingClientRect().width;

  if (needed > available + 1) {
    cell.title = cell.textContent;
  } else {
    cell.removeAttribute("title");
  }
}

// The message list lives in nested about:3pane documents, whose mouse events
// propagate up to the main messenger window, so one listener per window is enough.
function addTooltipListener(window) {
  window.addEventListener("mouseover", onMouseOver, true);
}

function removeTooltipListener(window) {
  window.removeEventListener("mouseover", onMouseOver, true);
}

var toCcColumn = class extends ExtensionCommon.ExtensionAPI {
  onShutdown(isAppShutdown) {
    if (isAppShutdown) {
      return;
    }
    ExtensionSupport.unregisterWindowListener(WINDOW_LISTENER_ID);
    for (const window of ExtensionSupport.openWindows) {
      if (window.location.href == MESSENGER_URL) {
        removeTooltipListener(window);
      }
    }
    ThreadPaneColumns.removeCustomColumn(COLUMN_ID);
  }

  getAPI(context) {
    return {
      toCcColumn: {
        async register() {
          // Avoid the "id is already used" error if the background page reloads.
          if (ThreadPaneColumns.getCustomColumns().some(c => c.id == COLUMN_ID)) {
            return;
          }
          ThreadPaneColumns.addCustomColumn(COLUMN_ID, {
            name: "To & Cc",
            hidden: false,
            resizable: true,
            sortable: true,
            textCallback: getToCcText,
          });
          ExtensionSupport.registerWindowListener(WINDOW_LISTENER_ID, {
            chromeURLs: [MESSENGER_URL],
            onLoadWindow: addTooltipListener,
          });
        },
      },
    };
  }
};
