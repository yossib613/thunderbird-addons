/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const $ = id => document.getElementById(id);

// Returns the Message-IDs (no angle brackets) of the earlier messages in the
// thread, from the References and In-Reply-To headers. The column uses them to
// show this note on those messages' rows, e.g. on a collapsed thread.
async function getReferences(id) {
  try {
    const { headers } = await browser.messages.getFull(id);
    const raw = [...(headers.references || []), ...(headers["in-reply-to"] || [])].join(" ");
    return [...new Set([...raw.matchAll(/<([^>]+)>/g)].map(m => normalizeMessageId(m[1])))];
  } catch (e) {
    console.error("Notes & Reminders: could not read References", e);
    return [];
  }
}

// The stub shows the reminder as it is set right now.
function updateStub() {
  const dueAt = $("remind").checked ? fromInputValue($("dueAt").value) : null;
  fillStub($("stub"), dueAt, !dueAt ? "none" : dueAt > Date.now() ? "upcoming" : "due");
}

function setDue(ms) {
  $("dueAt").value = toInputValue(ms);
  $("remind").checked = true;
  $("error").textContent = "";
  updateStub();
}

(async () => {
  const id = Number(new URLSearchParams(location.search).get("id"));
  const message = await browser.messages.get(id);
  const messageId = message.headerMessageId;
  const item = await getItem(messageId);

  $("subject").textContent = message.subject || "(no subject)";
  $("author").textContent = authorName(message.author);
  $("author").title = message.author || "";
  if (item) {
    $("note").value = item.note || "";
    $("markUnread").checked = item.markUnread ?? true;
    $("flag").checked = item.flag ?? true;
    if (item.dueAt) {
      setDue(item.dueAt);
    }
  }
  updateStub();
  $("remove").hidden = !item;
  $("note").focus();

  const quick = {
    hour: () => inHours(1),
    day: () => inHours(24),
    tomorrow: () => tomorrowAt(9),
    monday: () => nextMondayAt(9),
  };
  for (const button of document.querySelectorAll("[data-quick]")) {
    button.addEventListener("click", () => setDue(quick[button.dataset.quick]()));
  }
  $("dueAt").addEventListener("input", () => {
    $("remind").checked = !!$("dueAt").value;
    $("error").textContent = "";
    updateStub();
  });
  $("remind").addEventListener("change", () => {
    if ($("remind").checked && !$("dueAt").value) {
      $("dueAt").value = toInputValue(inHours(1));
    }
    updateStub();
  });

  $("save").addEventListener("click", async () => {
    let dueAt = null;
    if ($("remind").checked) {
      dueAt = fromInputValue($("dueAt").value);
      if (!dueAt) {
        $("error").textContent = "Enter the full reminder date and time, or clear 'Remind me'.";
        return;
      }
    }
    await putItem(messageId, {
      subject: message.subject,
      author: message.author,
      note: $("note").value.trim(),
      dueAt,
      // A changed time re-arms a reminder that already fired.
      fired: !!(item?.fired && dueAt == item.dueAt),
      markUnread: $("markUnread").checked,
      flag: $("flag").checked,
      folders: [...new Set([...(item?.folders || []), message.folder?.id].filter(Boolean))],
      refs: await getReferences(id),
    });
    window.close();
  });

  $("remove").addEventListener("click", async () => {
    await putItem(messageId, null);
    window.close();
  });

  $("cancel").addEventListener("click", () => window.close());
})();
