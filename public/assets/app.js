const TOKEN_KEY = "quoteCardsToken";

function getToken() {
  return localStorage.getItem(TOKEN_KEY) ?? "";
}

function setStatus(statusEl, message, type) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = type ? `status ${type}` : "status";
  statusEl.style.display = message ? "block" : "none";
}

function setSubmitButtonLabel(submitButton, form) {
  if (!(submitButton instanceof HTMLButtonElement)) return;
  if (form instanceof HTMLFormElement && form.dataset.editingId) {
    submitButton.textContent = "update quote";
  } else if (!submitButton.dataset.mode) {
    submitButton.textContent = "save quote";
  }
}

function hideSavedNote(noteEl, timerRef) {
  if (!noteEl) return null;
  if (timerRef.value) {
    clearTimeout(timerRef.value);
    timerRef.value = null;
  }
  noteEl.classList.remove("visible", "success", "error");
  noteEl.textContent = "";
  return timerRef;
}

function showSavedNote(noteEl, message, type, timerRef) {
  if (!noteEl) return timerRef;
  hideSavedNote(noteEl, timerRef);
  noteEl.textContent = message;
  noteEl.classList.add("visible", type);
  timerRef.value = setTimeout(() => {
    noteEl.classList.remove("visible", type);
    noteEl.textContent = "";
    timerRef.value = null;
  }, 10_000);
  return timerRef;
}

async function verifyToken(token) {
  const response = await fetch("/items", {
    method: "HEAD",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.status !== 401;
}

function revealTokenSection(tokenSection, tokenInput, submitButton, noteEl, timerRef) {
  if (!tokenSection || !tokenInput || !submitButton) return;
  hideSavedNote(noteEl, timerRef);
  tokenSection.classList.add("active");
  tokenInput.focus();
  submitButton.textContent = "save token";
  submitButton.dataset.mode = "token";
}

function hideTokenSection(tokenSection, tokenInput, submitButton, form) {
  if (!tokenSection || !tokenInput || !submitButton) return;
  tokenSection.classList.remove("active");
  tokenInput.value = "";
  delete submitButton.dataset.mode;
  setSubmitButtonLabel(submitButton, form);
}

function updateEditUrl(id) {
  const params = new URLSearchParams(window.location.search);
  if (id) {
    params.set("edit", id);
  } else {
    params.delete("edit");
  }
  const basePath = window.location.pathname || "/";
  const query = params.toString();
  const newUrl = query ? `${basePath}?${query}` : basePath;
  window.history.replaceState({}, "", newUrl);
}

function setEditState(form, submitButton, editBanner, editBannerText, id) {
  if (!(form instanceof HTMLFormElement)) return;
  if (id) {
    form.dataset.editingId = id;
  } else {
    delete form.dataset.editingId;
  }
  setSubmitButtonLabel(submitButton, form);
  if (editBanner && editBannerText) {
    if (id) {
      editBannerText.textContent = `Editing quote ${id}`;
      editBanner.hidden = false;
      editBanner.classList.add("active");
    } else {
      editBanner.hidden = true;
      editBanner.classList.remove("active");
      editBannerText.textContent = "";
    }
  }
  updateEditUrl(id ?? "");
}

function clearEditState(form, submitButton, editBanner, editBannerText) {
  setEditState(form, submitButton, editBanner, editBannerText, null);
}

function populateFormFromItem(form, item) {
  if (!(form instanceof HTMLFormElement) || !item) return;
  const articleInput = form.querySelector("#article_title");
  const siteInput = form.querySelector("#site");
  const urlInput = form.querySelector("#url");
  const quoteInput = form.querySelector("#quote_text");

  if (articleInput instanceof HTMLInputElement) {
    articleInput.value = item.attributes?.article_title ?? "";
  }
  if (siteInput instanceof HTMLInputElement) {
    siteInput.value = item.attributes?.author ?? "";
  }
  if (urlInput instanceof HTMLInputElement) {
    urlInput.value = item.sourceUrl ?? item.attributes?.url ?? "";
  }
  if (quoteInput instanceof HTMLTextAreaElement) {
    quoteInput.value = item.attributes?.quote_text ?? "";
  }
}

async function loadEditQuote(id, form, statusEl, submitButton, editBanner, editBannerText) {
  setStatus(statusEl, "Loading quote…", "");
  try {
    const response = await fetch(`/items/${encodeURIComponent(id)}`);
    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`);
    }
    const data = await response.json();
    if (!data || typeof data !== "object" || !data.item) {
      throw new Error("Unable to load quote");
    }
    populateFormFromItem(form, data.item);
    setEditState(form, submitButton, editBanner, editBannerText, id);
    setStatus(statusEl, "", "");
  } catch (error) {
    setStatus(statusEl, `Unable to load quote: ${error instanceof Error ? error.message : String(error)}`, "error");
    console.error("load_edit_error", error);
  }
}

async function handleSubmit(event) {
  event.preventDefault();

  const form = event.currentTarget;
  if (!(form instanceof HTMLFormElement)) return;

  const statusEl = form.querySelector("#status");
  const tokenSection = form.querySelector("#token-section");
  const tokenInput = form.querySelector("#token");
  const submitButton = form.querySelector("#submit-button");
  const quoteSavedNote = form.querySelector("#quote-saved-note");
  const editBanner = document.getElementById("edit-banner");
  const editBannerText = document.getElementById("edit-banner-text");

  const timerRef = { value: null };

  setStatus(statusEl, "", "");
  hideSavedNote(quoteSavedNote, timerRef);

  if (!(submitButton instanceof HTMLButtonElement)) {
    return;
  }

  if (submitButton.dataset.mode === "token") {
    const newToken = (tokenInput?.value ?? "").trim();
    if (!newToken) {
      setStatus(statusEl, "Token is required.", "error");
      tokenInput?.focus();
      return;
    }

    submitButton.disabled = true;

    try {
      const isValid = await verifyToken(newToken);
      setStatus(statusEl, "", "");

      if (!isValid) {
        localStorage.removeItem(TOKEN_KEY);
        showSavedNote(quoteSavedNote, "authorization failed", "error", timerRef);
        tokenInput?.focus();
        return;
      }

      localStorage.setItem(TOKEN_KEY, newToken);
      hideTokenSection(tokenSection, tokenInput, submitButton, form);
      showSavedNote(quoteSavedNote, "token saved", "success", timerRef);
    } catch (error) {
      setStatus(statusEl, "Unable to verify token. Please try again.", "error");
      console.error("verify_token_error", error);
      tokenInput?.focus();
    } finally {
      submitButton.disabled = false;
    }

    return;
  }

  const token = getToken();
  if (!token) {
    revealTokenSection(tokenSection, tokenInput, submitButton, quoteSavedNote, timerRef);
    return;
  }

  const articleTitle = (form.querySelector("#article_title")?.value ?? "").trim();
  const site = (form.querySelector("#site")?.value ?? "").trim();
  const url = (form.querySelector("#url")?.value ?? "").trim();
  const quoteText = (form.querySelector("#quote_text")?.value ?? "").trim();

  if (!quoteText || !url) {
    setStatus(statusEl, "Quote and URL are required.", "error");
    return;
  }

  const attributes = {
    quote_text: quoteText,
    url,
  };

  if (articleTitle) {
    attributes.article_title = articleTitle;
  }
  if (site) {
    attributes.author = site;
  }

  const editingId = form.dataset.editingId ?? "";
  const body = editingId
    ? { attributes }
    : { type: "quote", attributes };
  const endpoint = editingId ? `/items/${encodeURIComponent(editingId)}` : "/items";
  const method = editingId ? "PATCH" : "POST";

  submitButton.disabled = true;

  try {
    const response = await fetch(endpoint, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        revealTokenSection(tokenSection, tokenInput, submitButton, quoteSavedNote, timerRef);
      } else {
        const message =
          (result && typeof result.error === "string" && result.error) ||
          `Request failed (${response.status})`;
        setStatus(statusEl, message, "error");
      }
      return;
    }

    form.reset();
    if (editingId) {
      clearEditState(form, submitButton, editBanner, editBannerText);
      showSavedNote(quoteSavedNote, "quote updated", "success", timerRef);
    } else {
      showSavedNote(quoteSavedNote, "quote saved", "success", timerRef);
    }
  } catch (error) {
    setStatus(statusEl, `Network error: ${error instanceof Error ? error.message : String(error)}`, "error");
    console.error("submit_quote_error", error);
  } finally {
    submitButton.disabled = false;
  }
}

function init() {
  const form = document.getElementById("quote-form");
  const tokenSection = document.getElementById("token-section");
  const tokenInput = document.getElementById("token");
  const submitButton = document.getElementById("submit-button");
  const quoteSavedNote = document.getElementById("quote-saved-note");
  const statusEl = document.getElementById("status");
  const editBanner = document.getElementById("edit-banner");
  const editBannerText = document.getElementById("edit-banner-text");
  const cancelEditButton = document.getElementById("cancel-edit-button");

  if (form instanceof HTMLFormElement) {
    form.addEventListener("submit", handleSubmit);
  }

  setStatus(statusEl, "", "");
  setSubmitButtonLabel(submitButton, form instanceof HTMLFormElement ? form : null);

  if (cancelEditButton instanceof HTMLButtonElement && form instanceof HTMLFormElement) {
    cancelEditButton.addEventListener("click", () => {
      form.reset();
      clearEditState(form, submitButton, editBanner, editBannerText);
      setStatus(statusEl, "", "");
    });
  }

  if (getToken()) {
    hideTokenSection(tokenSection, tokenInput, submitButton, form instanceof HTMLFormElement ? form : null);
  } else {
    setStatus(statusEl, "", "");
    hideSavedNote(quoteSavedNote, { value: null });
    revealTokenSection(tokenSection, tokenInput, submitButton, quoteSavedNote, { value: null });
  }

  if (form instanceof HTMLFormElement) {
    const params = new URLSearchParams(window.location.search);
    const editId = params.get("edit");
    if (editId) {
      loadEditQuote(editId, form, statusEl, submitButton, editBanner, editBannerText);
    }
  }
}

document.addEventListener("DOMContentLoaded", init);
