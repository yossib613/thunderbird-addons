/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const $ = id => document.getElementById(id);

// Message-ID -> <tr> with unsaved edits. A storage change redraws the table,
// so these rows are kept as they are to not lose what is being typed.
const dirtyRows = new Map();

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
  const show = $("show").value;
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
  q(".author").textContent = item.author || "";
  q(".state").textContent = item.fired ? `DUE since ${formatDue(item.dueAt)}` : "";
  q("textarea").value = item.note || "";
  q(".dueAt").value = item.dueAt ? toInputValue(item.dueAt) : "";
  // Items saved without these fields default to the editor's defaults.
  q(".markUnread").checked = item.markUnread ?? true;
  q(".flag").checked = item.flag ?? true;
  q(".done").hidden = !item.dueAt;
  tr.classList.toggle("due", !!item.fired);

  const markDirty = () => {
    dirtyRows.set(messageId, tr);
    tr.classList.add("dirty");
    q(".save").disabled = false;
  };
  for (const input of tr.querySelectorAll("textarea, input")) {
    input.addEventListener("input", markDirty);
    input.addEventListener("change", markDirty);
  }

  q(".subject").addEventListener("click", () =>
    openMessage(messageId, item).catch(e => {
      q(".rowError").textContent = `Could not open the message: ${e.message}`;
    })
  );

  q(".save").addEventListener("click", async () => {
    const value = q(".dueAt").value;
    const dueAt = fromInputValue(value);
    if (value && !dueAt) {
      q(".rowError").textContent = "Enter the full date and time, or clear it.";
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
}

async function renderStatus() {
  const { lastCheck, lastError } = await getStatus();
  $("status").textContent = lastCheck ? `Last check: ${formatDue(lastCheck)}` : "Not checked yet";
  $("statusError").textContent = lastError ? `Last check had errors:\n${lastError}` : "";
}

$("search").addEventListener("input", renderRows);
$("show").addEventListener("change", renderRows);

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
