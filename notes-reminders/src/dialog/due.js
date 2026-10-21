/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// How long a reminder shows what happened (e.g. "Snoozed until …") before it leaves.
const CONFIRM_MS = matchMedia("(prefers-reduced-motion: reduce)").matches ? 900 : 1400;

// Message-ID -> { li, json }. Kept between redraws, so a reminder that did not
// change keeps its state, e.g. an open time picker.
const rows = new Map();

// Shows the confirmation, then saves. The save redraws the list without this
// reminder, and closes the window if it was the last one.
function resolve(li, message, save) {
  li.classList.add("resolved");
  li.querySelector(".error").textContent = "";
  li.querySelector(".confirm").textContent = message;
  setTimeout(() => li.classList.add("leaving"), CONFIRM_MS - 200);
  setTimeout(save, CONFIRM_MS);
}

function snoozeUntil(li, messageId, item, dueAt) {
  resolve(li, `Snoozed until ${formatDue(dueAt)}`, () =>
    putItem(messageId, { ...item, dueAt, fired: false })
  );
}

function createRow(messageId, item) {
  const li = $("reminder").content.firstElementChild.cloneNode(true);
  const q = selector => li.querySelector(selector);
  const showError = text => (q(".error").textContent = text);

  fillStub(q(".stub"), item.dueAt, "due");
  q(".due-text").textContent = `Due ${formatDue(item.dueAt)}`;
  q(".subject").textContent = item.subject || "(no subject)";
  // The name shows; the full address is the tooltip.
  q(".author").textContent = authorName(item.author);
  q(".author").title = item.author || "";
  q(".note").textContent = item.note || "";
  q(".snooze").setAttribute("aria-label", `Remind me again about ${item.subject || "this email"}`);

  q('[data-action="open"]').addEventListener("click", () =>
    openMessage(messageId, item).catch(e => showError(e.message))
  );

  // Clears the reminder but keeps the note. putItem removes the item if no note is left.
  q('[data-action="done"]').addEventListener("click", () =>
    resolve(li, item.note ? "Marked as done. The note stays on the email." : "Marked as done.", () =>
      putItem(messageId, { ...item, dueAt: null, fired: false })
    )
  );

  for (const chip of li.querySelectorAll("[data-minutes]")) {
    chip.addEventListener("click", () => snoozeUntil(li, messageId, item, inHours(chip.dataset.minutes / 60)));
  }

  const pick = q('[data-action="pick"]');
  const input = q(".picker-input");
  pick.addEventListener("click", () => {
    const open = q(".picker").hidden;
    q(".picker").hidden = !open;
    pick.setAttribute("aria-expanded", open);
    if (open) {
      input.min = toInputValue(Date.now());
      input.value ||= toInputValue(inHours(1));
      input.focus();
    }
  });

  input.addEventListener("input", () => showError(""));

  q('[data-action="snooze-until"]').addEventListener("click", () => {
    const dueAt = fromInputValue(input.value);
    if (!dueAt) {
      showError("Enter the full date and time.");
    } else if (dueAt <= Date.now()) {
      showError("Pick a time in the future.");
    } else {
      snoozeUntil(li, messageId, item, dueAt);
    }
  });

  return li;
}

function $(id) {
  return document.getElementById(id);
}

async function render() {
  const due = [...(await getAllItems())].filter(([, item]) => item.fired).sort(([, a], [, b]) => a.dueAt - b.dueAt);
  if (!due.length) {
    window.close();
    return;
  }
  $("heading").textContent = due.length == 1 ? "1 reminder due" : `${due.length} reminders due`;

  const items = [];
  for (const [messageId, item] of due) {
    const json = JSON.stringify(item);
    let row = rows.get(messageId);
    if (!row || row.json != json) {
      row = { li: createRow(messageId, item), json };
      rows.set(messageId, row);
    }
    items.push(row.li);
  }
  for (const messageId of rows.keys()) {
    if (!due.some(([id]) => id == messageId)) {
      rows.delete(messageId);
    }
  }
  $("list").replaceChildren(...items);
}

new BroadcastChannel(CHANGES_CHANNEL).onmessage = ({ data: keys }) => {
  if (keys.some(key => key.startsWith(ITEM_PREFIX))) {
    render();
  }
};

render().then(() => document.querySelector(".btn-primary")?.focus());
