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
var { ExtensionSupport } = ChromeUtils.importESModule(
  "resource:///modules/ExtensionSupport.sys.mjs"
);

const COLUMN_ID = "notesRemindersColumn";
const WINDOW_LISTENER_ID = "notes-reminders-tooltip";
const MESSENGER_URL = "chrome://messenger/content/messenger.xhtml";
// Thunderbird gives custom column cells the class "<lowercased id>-column".
const CELL_SELECTOR = `td.${COLUMN_ID.toLowerCase()}-column`;

// Message-ID (no angle brackets) -> cell text. The background script owns the
// data and pushes it here, because the column callback must answer synchronously.
let texts = new Map();
// Message-ID -> cell texts of the later messages that reference it.
// Thunderbird shows a collapsed thread as its top row only, and the callback
// is not told whether the thread is collapsed, so the top row of a thread also
// shows the notes of the later messages in it. This map comes from the
// References headers, so the callback does not need to open the folder's
// database: that makes some folder add-ons (e.g. Owl for Exchange) log errors.
let laterTexts = new Map();

const nsMsgKey_None = 0xffffffff;

function getCellText(msgHdr) {
  if (texts.size == 0) {
    return "";
  }
  const own = texts.get(msgHdr.messageId);
  // Only the top row of a thread has no parent in the thread.
  const isThreadTop = msgHdr.threadParent == nsMsgKey_None;
  const others = (isThreadTop && laterTexts.get(msgHdr.messageId)) || [];
  if (own) {
    return others.length ? `${own}  (+${others.length} in thread)` : own;
  }
  if (others.length) {
    const more = others.length > 1 ? `  (+${others.length - 1} more)` : "";
    return `↳ ${others[0]}${more}`;
  }
  return "";
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

var notesColumn = class extends ExtensionCommon.ExtensionAPI {
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
    texts = new Map();
    laterTexts = new Map();
  }

  getAPI(context) {
    return {
      notesColumn: {
        async register() {
          // Avoid the "id is already used" error if the background page reloads.
          if (ThreadPaneColumns.getCustomColumns().some(c => c.id == COLUMN_ID)) {
            return;
          }
          ThreadPaneColumns.addCustomColumn(COLUMN_ID, {
            name: "Notes",
            hidden: false,
            resizable: true,
            sortable: true,
            textCallback: getCellText,
          });
          ExtensionSupport.registerWindowListener(WINDOW_LISTENER_ID, {
            chromeURLs: [MESSENGER_URL],
            onLoadWindow: addTooltipListener,
          });
        },

        async setTexts(newTexts, newLaterTexts) {
          texts = new Map(Object.entries(newTexts));
          laterTexts = new Map(Object.entries(newLaterTexts));
          ThreadPaneColumns.refreshCustomColumn(COLUMN_ID);
        },
      },
    };
  }
};
