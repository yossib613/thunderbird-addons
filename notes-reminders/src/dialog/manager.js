/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const $ = id => document.getElementById(id);

// Message-ID -> <li> with unsaved edits. A storage change redraws the list,
// so these items are kept as they are to not lose what is being typed.
const dirtyRows = new Map();
// The pressed filter chip: "all", "reminders", "due" or "notes".
let show = "all";

function stubState(item, dueAt) {
  if (!dueAt) {
    return "none";
  }
  return item.fired && dueAt == item.dueAt ? "due" : dueAt > Date.now() ? "upcoming" : "due";
}

// Due reminders first, then by reminder time, then notes without a reminder by subject.
function compareItems([, a], [, b]) {
  if (!!a.fired != !!b.fired) {
    return a.fired ? -1 : 1;
  }
  if (!!a.dueAt != !!b.dueAt) {
    return a.dueAt ? -1 : 1;
  }
  if (a.dueAt != b.dueAt) {
    return a.dueAt - b.dueAt;
  }
  return (a.subject || "").localeCompare(b.subject || "");
}

function matchesFilter(item) {
  if ((show == "reminders" && !item.dueAt) || (show == "due" && !item.fired) || (show == "notes" && item.dueAt)) {
    return false;
  }
  const search = $("search").value.trim().toLowerCase();
  return !search || [item.subject, item.author, item.note].some(t => (t || "").toLowerCase().includes(search));
}

function createRow(messageId, item) {
  const tr = $("row").content.firstElementChild.cloneNode(true);
  const q = selector => tr.querySelector(selector);

  q(".subject").textContent = item.subject || "(no subject)";
  q(".author").textContent = authorName(item.author);
  q(".author").title = item.author || "";
  q(".state").textContent = item.fired
    ? `Due since ${formatDue(item.dueAt)}`
    : item.dueAt ? `Reminder ${formatDue(item.dueAt)}` : "No reminder";
  fillStub(q(".stub"), item.dueAt, stubState(item, item.dueAt));
  q("textarea").value = item.note || "";
  q(".dueAt").value = item.dueAt ? toInputValue(item.dueAt) : "";
  // Items saved without these fields default to the editor's defaults.
  q(".markUnread").checked = item.markUnread ?? true;
  q(".flag").checked = item.flag ?? true;
  q(".done").hidden = !item.dueAt;
  q(".done").textContent = item.fired ? "Mark as done" : "Clear reminder";

  const markDirty = () => {
    dirtyRows.set(messageId, tr);
    tr.classList.add("dirty");
    q(".save").disabled = false;
    q(".error").textContent = "";
    const dueAt = fromInputValue(q(".dueAt").value);
    fillStub(q(".stub"), dueAt, stubState(item, dueAt));
  };
  for (const input of tr.querySelectorAll("textarea, input")) {
    input.addEventListener("input", markDirty);
    input.addEventListener("change", markDirty);
  }

  q(".subject").addEventListener("click", () =>
    openMessage(messageId, item).catch(e => {
      q(".error").textContent = `Could not open the message: ${e.message}`;
    })
  );

  q(".save").addEventListener("click", async () => {
    const value = q(".dueAt").value;
    const dueAt = fromInputValue(value);
    if (value && !dueAt) {
      q(".error").textContent = "Enter the full date and time, or clear it.";
      return;
    }
    dirtyRows.delete(messageId);
    await putItem(messageId, {
      ...item,
      note: q("textarea").value.trim(),
      dueAt,
      // A changed time re-arms a reminder that already fired.
      fired: !!(item.fired && dueAt == item.dueAt),
      markUnread: q(".markUnread").checked,
      flag: q(".flag").checked,
    });
    renderRows();
  });

  // Clears the reminder but keeps the note. putItem removes the item if no note is left.
  q(".done").addEventListener("click", async () => {
    dirtyRows.delete(messageId);
    await putItem(messageId, { ...item, dueAt: null, fired: false });
    renderRows();
  });

  q(".delete").addEventListener("click", async () => {
    if (confirm(`Delete the note and reminder for "${item.subject || "(no subject)"}"?`)) {
      dirtyRows.delete(messageId);
      await putItem(messageId, null);
      renderRows();
    }
  });

  return tr;
}

async function renderRows() {
  const items = [...(await getAllItems())].sort(compareItems);
  const rows = [];
  for (const [messageId, item] of items) {
    if (dirtyRows.has(messageId)) {
      rows.push(dirtyRows.get(messageId));
    } else if (matchesFilter(item)) {
      rows.push(createRow(messageId, item));
    }
  }
  $("rows").replaceChildren(...rows);
  $("empty").hidden = rows.length > 0;
  $("empty").textContent = items.length
    ? "No notes match. Clear the search or choose All."
    : "No notes yet. Right-click an email and choose Note & reminder… to add one.";
}

async function renderStatus() {
  const { lastCheck, lastError } = await getStatus();
  $("status").textContent = lastCheck ? `Last check: ${formatDue(lastCheck)}` : "Not checked yet";
  $("statusError").textContent = lastError ? `Last check had errors:\n${lastError}` : "";
}

$("search").addEventListener("input", renderRows);
for (const chip of document.querySelectorAll("[data-show]")) {
  chip.addEventListener("click", () => {
    show = chip.dataset.show;
    for (const other of document.querySelectorAll("[data-show]")) {
      other.setAttribute("aria-pressed", other == chip);
    }
    renderRows();
  });
}

$("checkMinutes").addEventListener("change", async () => {
  const minutes = Math.round(Number($("checkMinutes").value));
  if (!(minutes >= 1 && minutes <= 1440)) {
    $("checkMinutes").value = (await getSettings()).checkMinutes;
    return;
  }
  await browser.storage.local.set({ [SETTINGS_KEY]: { ...(await getSettings()), checkMinutes: minutes } });
});

$("checkNow").addEventListener("click", async () => {
  $("checkNow").disabled = true;
  try {
    await browser.runtime.sendMessage({ type: "checkNow" });
  } finally {
    $("checkNow").disabled = false;
  }
});

new BroadcastChannel(CHANGES_CHANNEL).onmessage = ({ data: keys }) => {
  if (keys.includes(STATUS_KEY)) {
    renderStatus();
  }
  if (keys.some(key => key.startsWith(ITEM_PREFIX))) {
    renderRows();
  }
};

(async () => {
  $("checkMinutes").value = (await getSettings()).checkMinutes;
  await Promise.all([renderRows(), renderStatus()]);
})();
