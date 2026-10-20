/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

function snooze(messageId, item, dueAt) {
  return putItem(messageId, { ...item, dueAt, fired: false });
}

const actions = {
  open: (messageId, item) => openMessage(messageId, item).catch(e => alert(e.message)),
  hour: (messageId, item) => snooze(messageId, item, inHours(1)),
  tomorrow: (messageId, item) => snooze(messageId, item, tomorrowAt(9)),
  // Clears the reminder but keeps the note. putItem removes the item if no note is left.
  done: (messageId, item) => putItem(messageId, { ...item, dueAt: null, fired: false }),
};

async function render() {
  const list = document.getElementById("list");
  const template = document.getElementById("reminder");
  const due = [...(await getAllItems())].filter(([, item]) => item.fired);
  if (!due.length) {
    window.close();
    return;
  }
  list.replaceChildren();
  for (const [messageId, item] of due) {
    const row = template.content.cloneNode(true);
    row.querySelector(".subject").textContent = item.subject || "(no subject)";
    row.querySelector(".due").textContent = `Due ${formatDue(item.dueAt)}`;
    row.querySelector(".note").textContent = item.note || "";
    for (const button of row.querySelectorAll("[data-action]")) {
      button.addEventListener("click", () => actions[button.dataset.action](messageId, item));
    }
    list.append(row);
  }
}

new BroadcastChannel(CHANGES_CHANNEL).onmessage = ({ data: keys }) => {
  if (keys.some(key => key.startsWith(ITEM_PREFIX))) {
    render();
  }
};

render();
