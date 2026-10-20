/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const CHECK_ALARM = "check-reminders";
let dueWindowId = null;
let managerWindowId = null;
// The alarm can fire while a slow check (many folders to search) still runs.
let checking = false;

function cellText(item) {
  const parts = [];
  if (item.dueAt) {
    parts.push(`${item.fired ? "⏰ DUE" : "⏰"} ${formatDue(item.dueAt)}`);
  }
  if (item.note) {
    parts.push(`📝 ${item.note.replace(/\s+/g, " ").trim()}`);
  }
  return parts.join(" · ");
}

async function pushTexts() {
  const texts = {};
  const laterTexts = {};
  for (const [messageId, item] of await getAllItems()) {
    const text = cellText(item);
    texts[messageId] = text;
    for (const earlierId of item.refs || []) {
      (laterTexts[earlierId] ||= []).push(text);
    }
  }
  await browser.notesColumn.setTexts(texts, laterTexts);
}

function openEditor(message) {
  browser.windows.create({
    type: "popup",
    url: `dialog/note.html?id=${message.id}`,
    width: 480,
    height: 460,
  });
}

// Focuses the window if it is still open, else opens it. Returns the window id.
async function openSingleWindow(windowId, url, width, height) {
  if (windowId != null) {
    try {
      await browser.windows.update(windowId, { focused: true });
      return windowId;
    } catch (e) {
      // The window was closed.
    }
  }
  return (await browser.windows.create({ type: "popup", url, width, height })).id;
}

async function openDueWindow() {
  dueWindowId = await openSingleWindow(dueWindowId, "dialog/due.html", 560, 420);
}

async function openManager() {
  managerWindowId = await openSingleWindow(managerWindowId, "dialog/manager.html", 980, 620);
}

// Keeps each item's folder list current when a message with a note is moved
// or copied, e.g. saved from one account to a folder of another account.
async function trackFolders(originalMessages, newMessages, isMove) {
  const originals = [];
  for await (const message of listMessages(originalMessages)) {
    originals.push(message);
  }
  let i = 0;
  for await (const message of listMessages(newMessages)) {
    const original = originals[i++];
    const item = await getItem(message.headerMessageId);
    if (!item || !message.folder) {
      continue;
    }
    const folders = new Set(item.folders || []);
    if (isMove && original?.folder) {
      folders.delete(original.folder.id);
    }
    folders.add(message.folder.id);
    await putItem(message.headerMessageId, { ...item, folders: [...folders] });
  }
}

browser.messages.onMoved.addListener((originals, moved) => trackFolders(originals, moved, true));
browser.messages.onCopied.addListener((originals, copied) => trackFolders(originals, copied, false));

// Marks the copies unread and/or flagged. A failure here must not stop the
// reminder from showing, so errors are returned, not thrown.
async function applyActions(messageId, item) {
  const update = {};
  if (item.markUnread) {
    update.read = false;
  }
  if (item.flag) {
    update.flagged = true;
  }
  if (!Object.keys(update).length) {
    return [];
  }
  const errors = [];
  const copies = await findCopies(messageId, item, errors);
  if (!copies.length && item.folders?.length) {
    errors.push(`${item.subject}: not found in its folders, so not marked unread or flagged.`);
  }
  for (const copy of copies) {
    try {
      await browser.messages.update(copy.id, update);
    } catch (e) {
      errors.push(`${item.subject}: ${e.message}`);
    }
  }
  return errors;
}

async function checkReminders() {
  if (checking) {
    return;
  }
  checking = true;
  const errors = [];
  try {
    const now = Date.now();
    const fired = [];
    for (const [messageId, item] of await getAllItems()) {
      if (!item.dueAt || item.fired || item.dueAt > now) {
        continue;
      }
      // Mark it fired first, so a later failure cannot make it fire twice.
      await putItem(messageId, { ...item, fired: true });
      fired.push(item);
      errors.push(...(await applyActions(messageId, item)));
    }
    if (fired.length) {
      await openDueWindow();
      browser.notifications
        .create({
          type: "basic",
          title: fired.length == 1 ? "Reminder" : `${fired.length} reminders`,
          message: fired.map(i => i.subject || "(no subject)").join("\n"),
        })
        .catch(e => console.error("Notes & Reminders: notification failed", e));
    }
  } catch (e) {
    errors.push(e.message);
  } finally {
    checking = false;
    for (const error of errors) {
      console.error("Notes & Reminders:", error);
    }
    await browser.storage.local.set({
      [STATUS_KEY]: { lastCheck: Date.now(), lastError: errors.join("\n") || null },
    });
  }
}

async function scheduleChecks() {
  const { checkMinutes } = await getSettings();
  // Creating an alarm with an existing name replaces it.
  browser.alarms.create(CHECK_ALARM, { periodInMinutes: checkMinutes });
}

browser.menus.create({
  id: "edit-note",
  title: "Note && reminder…",
  contexts: ["message_list"],
});
browser.menus.create({
  id: "open-manager",
  title: "All notes && reminders…",
  contexts: ["message_list", "tools_menu"],
});

browser.menus.onClicked.addListener(info => {
  if (info.menuItemId == "open-manager") {
    openManager();
    return;
  }
  const message = info.selectedMessages?.messages[0];
  if (info.menuItemId == "edit-note" && message) {
    openEditor(message);
  }
});

browser.browserAction.onClicked.addListener(openManager);

browser.messageDisplayAction.onClicked.addListener(async tab => {
  const message = await browser.messageDisplay.getDisplayedMessage(tab.id);
  if (message) {
    openEditor(message);
  }
});

browser.notifications.onClicked.addListener(openDueWindow);

browser.runtime.onMessage.addListener(message => {
  if (message?.type == "checkNow") {
    return checkReminders();
  }
});

const changesChannel = new BroadcastChannel(CHANGES_CHANNEL);

browser.storage.onChanged.addListener((changes, area) => {
  if (area != "local") {
    return;
  }
  changesChannel.postMessage(Object.keys(changes));
  if (SETTINGS_KEY in changes) {
    scheduleChecks();
  }
  if (Object.keys(changes).some(key => key.startsWith(ITEM_PREFIX))) {
    pushTexts();
  }
});

browser.alarms.onAlarm.addListener(alarm => {
  if (alarm.name == CHECK_ALARM) {
    checkReminders();
  }
});

(async () => {
  await browser.notesColumn.register();
  await pushTexts();
  await scheduleChecks();
  // Fires reminders that fell due while Thunderbird was closed.
  await checkReminders();
  // Shows again the reminders that fired before but were not snoozed or done.
  if ([...(await getAllItems()).values()].some(item => item.fired)) {
    await openDueWindow();
  }
})();
