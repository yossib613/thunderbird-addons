/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Shared by the background script and the dialogs.
//
// Each message's note and reminder is one storage.local entry, keyed by the
// message's Message-ID header. A copy of a message in another account or folder
// keeps the same Message-ID, so it shows the same note. One key per message
// means the dialogs and the background script never overwrite each other.
//
// Item: { subject, author, note, dueAt (ms or null), fired, markUnread, flag,
//         folders (ids of the folders known to hold a copy),
//         refs (Message-IDs of the earlier messages in the thread) }

const ITEM_PREFIX = "item:";
const SETTINGS_KEY = "settings";
// { lastCheck (ms), lastError (string or null) }, written by the background script.
const STATUS_KEY = "status";
const DEFAULT_SETTINGS = { checkMinutes: 1 };
// The background script posts the changed storage keys here. The dialogs use
// this, not browser.storage.onChanged: an extension listener in a window is
// removed while Thunderbird unloads the window, which logs errors.
const CHANGES_CHANNEL = "notes-reminders-changes";

async function getSettings() {
  const stored = (await browser.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY];
  return { ...DEFAULT_SETTINGS, ...stored };
}

async function getStatus() {
  return (await browser.storage.local.get(STATUS_KEY))[STATUS_KEY] || {};
}

function normalizeMessageId(id) {
  return (id || "").trim().replace(/^<|>$/g, "");
}

function itemKey(messageId) {
  return ITEM_PREFIX + normalizeMessageId(messageId);
}

async function getItem(messageId) {
  const key = itemKey(messageId);
  return (await browser.storage.local.get(key))[key] || null;
}

// Saves the item, or removes it when it has no note and no reminder.
async function putItem(messageId, item) {
  const key = itemKey(messageId);
  if (!item || (!item.note && !item.dueAt)) {
    await browser.storage.local.remove(key);
  } else {
    await browser.storage.local.set({ [key]: item });
  }
}

// Returns a Map of Message-ID -> item.
async function getAllItems() {
  const all = await browser.storage.local.get(null);
  const items = new Map();
  for (const [key, item] of Object.entries(all)) {
    if (key.startsWith(ITEM_PREFIX)) {
      items.set(key.slice(ITEM_PREFIX.length), item);
    }
  }
  return items;
}

async function* listMessages(page) {
  yield* page.messages;
  while (page.id) {
    page = await browser.messages.continueList(page.id);
    yield* page.messages;
  }
}

// Returns the copies of the message in the item's known folders. It never
// searches all folders: that logs errors for IMAP folders with no local data,
// fails on saved search folders, and makes Owl for Exchange log errors.
// Errors are collected in `errors`, so one bad folder does not hide the others.
async function findCopies(messageId, item, errors = []) {
  if (!item.folders?.length) {
    errors.push(`${item.subject}: no folder stored. Open the note with "Note & reminder…" and save it once.`);
    return [];
  }
  const copies = [];
  for (const folderId of item.folders) {
    try {
      const page = await browser.messages.query({ headerMessageId: messageId, folderId });
      for await (const message of listMessages(page)) {
        copies.push(message);
      }
    } catch (e) {
      errors.push(`${item.subject}: search of ${folderId} failed: ${e.message}`);
    }
  }
  return copies;
}

async function openMessage(messageId, item) {
  const errors = [];
  const [copy] = await findCopies(messageId, item, errors);
  if (!copy) {
    throw new Error(errors.join("\n") || "The message was not found in its folders.");
  }
  await browser.messageDisplay.open({ messageId: copy.id, location: "tab" });
}

function formatDue(ms) {
  return new Date(ms).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// <input type="datetime-local"> works in local time with no time zone.
function toInputValue(ms) {
  const d = new Date(ms);
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Returns ms, or null when the input is empty or only partly filled in
// (the input then reports an empty value).
function fromInputValue(value) {
  const ms = value ? new Date(value).getTime() : NaN;
  return Number.isNaN(ms) ? null : ms;
}

// Quick reminder times. All return ms since epoch.
function inHours(hours) {
  return Date.now() + hours * 3600 * 1000;
}

function tomorrowAt(hour) {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

function nextMondayAt(hour) {
  const d = new Date();
  d.setDate(d.getDate() + (((8 - d.getDay()) % 7) || 7));
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}
