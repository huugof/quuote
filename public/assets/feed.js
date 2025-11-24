const TOKEN_KEY = "quoteCardsToken";

function getToken() {
  return localStorage.getItem(TOKEN_KEY) ?? "";
}

function requireToken() {
  const token = getToken();
  if (token) return token;
  alert("Enter your API token on the home page before editing or deleting items.");
  window.location.href = "/";
  return null;
}

function findQuoteItem(element) {
  return element.closest?.(".quote-item") ?? null;
}

function openEditForm(item) {
  if (!item) return;
  item.classList.add("editing");
  const firstInput = item.querySelector(".quote-edit-form input, .quote-edit-form textarea");
  if (firstInput instanceof HTMLElement) {
    firstInput.focus();
  }
}

function closeEditForm(item) {
  if (!item) return;
  item.classList.remove("editing");
  const form = item.querySelector(".quote-edit-form");
  if (form instanceof HTMLFormElement) {
    form.reset();
    const statusEl = form.querySelector(".quote-edit-status");
    if (statusEl) statusEl.textContent = "";
  }
}

function safeHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function renderSourceLinkElement(url) {
  if (url) {
    const link = document.createElement("a");
    link.className = "source-link";
    link.href = url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = url;
    return link;
  }
  const span = document.createElement("span");
  span.className = "source-link muted";
  span.textContent = "no source";
  return span;
}

function computeSecondary(attributes, sourceUrl) {
  const articleTitle = typeof attributes?.article_title === "string" ? attributes.article_title : "";
  const author = typeof attributes?.author === "string" ? attributes.author : "";
  const domain = sourceUrl ? safeHostname(sourceUrl) : "";
  const primary = articleTitle || domain;
  return author ? `${primary ? `${primary}, ` : ""}${author}` : (primary || "Collected quote");
}

function updateQuoteView(item, updated) {
  if (!item || !updated) return;
  const quoteView = item.querySelector(".quote-view");
  const blockquote = quoteView?.querySelector("blockquote");
  if (blockquote) {
    const quote = updated.attributes?.quote_text ?? "";
    blockquote.textContent = `“${quote}”`;
  }
  const secondaryEl = quoteView?.querySelector(".quote-source");
  const secondary = computeSecondary(updated.attributes, updated.sourceUrl ?? updated.attributes?.url ?? "");
  if (secondaryEl) secondaryEl.textContent = secondary;

  const linksEl = item.querySelector(".quote-links");
  if (linksEl) {
    const existingLink = linksEl.querySelector(".source-link");
    const newSourceEl = renderSourceLinkElement(updated.sourceUrl ?? updated.attributes?.url ?? "");
    if (existingLink) {
      existingLink.replaceWith(newSourceEl);
    } else {
      linksEl.prepend(newSourceEl);
    }
  }

  const form = item.querySelector(".quote-edit-form");
  if (form instanceof HTMLFormElement) {
    const articleInput = form.elements.namedItem("article_title");
    const authorInput = form.elements.namedItem("author");
    const urlInput = form.elements.namedItem("url");
    const quoteInput = form.elements.namedItem("quote_text");
    const articleValue = updated.attributes?.article_title ?? "";
    const authorValue = updated.attributes?.author ?? "";
    const urlValue = updated.sourceUrl ?? updated.attributes?.url ?? "";
    const quoteValue = updated.attributes?.quote_text ?? "";
    if (articleInput instanceof HTMLInputElement) {
      articleInput.value = articleValue;
      articleInput.defaultValue = articleValue;
    }
    if (authorInput instanceof HTMLInputElement) {
      authorInput.value = authorValue;
      authorInput.defaultValue = authorValue;
    }
    if (urlInput instanceof HTMLInputElement) {
      urlInput.value = urlValue;
      urlInput.defaultValue = urlValue;
    }
    if (quoteInput instanceof HTMLTextAreaElement) {
      quoteInput.value = quoteValue;
      quoteInput.defaultValue = quoteValue;
    }
  }
}

function handleEditClick(button) {
  const token = requireToken();
  if (!token) return;
  const item = findQuoteItem(button);
  openEditForm(item);
}

function handleCancelClick(event) {
  const button = event.currentTarget;
  if (!(button instanceof HTMLElement)) return;
  const item = findQuoteItem(button);
  closeEditForm(item);
}

async function handleDelete(id, button) {
  const token = requireToken();
  if (!token) return;
  if (!window.confirm("Delete this quote? This cannot be undone.")) return;
  button.disabled = true;
  try {
    const response = await fetch(`/items/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(text || `Request failed (${response.status})`);
    }
    window.location.reload();
  } catch (error) {
    alert(`Unable to delete quote: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    button.disabled = false;
  }
}

async function handleCopy(button) {
  const url = button.dataset.embedUrl;
  if (!url) return;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = url;
      textarea.style.position = "fixed";
      textarea.style.top = "-1000px";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    button.classList.add("copied");
    setTimeout(() => button.classList.remove("copied"), 1500);
  } catch (error) {
    console.error("copy_embed_failed", error);
    window.prompt("Copy embed URL", url);
  }
}

async function handleEditSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!(form instanceof HTMLFormElement)) return;
  const item = findQuoteItem(form);
  const id = item?.dataset.itemId;
  if (!id) return;
  const token = requireToken();
  if (!token) return;

  const articleInput = form.elements.namedItem("article_title");
  const authorInput = form.elements.namedItem("author");
  const urlInput = form.elements.namedItem("url");
  const quoteInput = form.elements.namedItem("quote_text");

  const articleTitle = articleInput instanceof HTMLInputElement ? articleInput.value.trim() : "";
  const author = authorInput instanceof HTMLInputElement ? authorInput.value.trim() : "";
  const url = urlInput instanceof HTMLInputElement ? urlInput.value.trim() : "";
  const quoteText = quoteInput instanceof HTMLTextAreaElement ? quoteInput.value.trim() : "";

  const statusEl = form.querySelector(".quote-edit-status");
  if (!quoteText || !url) {
    if (statusEl) statusEl.textContent = "Quote and URL are required.";
    return;
  }

  const payload = {
    attributes: {
      quote_text: quoteText,
      url,
    },
  };
  if (articleTitle) payload.attributes.article_title = articleTitle;
  if (author) payload.attributes.author = author;

  const submitButton = form.querySelector('button[type="submit"]');
  const cancelButton = form.querySelector('button[data-role="cancel-edit"]');
  if (submitButton instanceof HTMLButtonElement) submitButton.disabled = true;
  if (cancelButton instanceof HTMLButtonElement) cancelButton.disabled = true;
  if (statusEl) statusEl.textContent = "Saving…";

  try {
    const response = await fetch(`/items/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message =
        (result && typeof result.error === "string" && result.error) ||
        `Request failed (${response.status})`;
      throw new Error(message);
    }
    const updatedItem = result?.item;
    if (updatedItem) {
      updateQuoteView(item, updatedItem);
    }
    closeEditForm(item);
  } catch (error) {
    if (statusEl) {
      statusEl.textContent = `Unable to update quote: ${error instanceof Error ? error.message : String(error)}`;
    }
    console.error("quote_edit_failed", error);
  } finally {
    if (submitButton instanceof HTMLButtonElement) submitButton.disabled = false;
    if (cancelButton instanceof HTMLButtonElement) cancelButton.disabled = false;
  }
}

function handleActionClick(event) {
  const button = event.currentTarget;
  if (!(button instanceof HTMLElement)) return;
  const action = button.dataset.action;
  const id = button.dataset.itemId;
  if (!action) return;
  if (action === "edit") {
    if (!id) return;
    handleEditClick(button);
  } else if (action === "delete" && button instanceof HTMLButtonElement) {
    if (!id) return;
    handleDelete(id, button);
  } else if (action === "copy") {
    handleCopy(button);
  }
}

function init() {
  document.querySelectorAll(".quote-actions [data-action]").forEach((button) => {
    button.addEventListener("click", handleActionClick);
  });
  document.querySelectorAll(".quote-edit-form").forEach((form) => {
    if (form instanceof HTMLFormElement) {
      form.addEventListener("submit", handleEditSubmit);
    }
  });

  document.querySelectorAll('[data-role="cancel-edit"]').forEach((button) => {
    button.addEventListener("click", handleCancelClick);
  });
}

document.addEventListener("DOMContentLoaded", init);
