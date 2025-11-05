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

function hideTokenSection(tokenSection, tokenInput, submitButton) {
  if (!tokenSection || !tokenInput || !submitButton) return;
  tokenSection.classList.remove("active");
  tokenInput.value = "";
  submitButton.textContent = "save quote";
  delete submitButton.dataset.mode;
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
      hideTokenSection(tokenSection, tokenInput, submitButton);
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
    setStatus(statusEl, "Quote and site are required.", "error");
    return;
  }

  const payload = {
    type: "quote",
    attributes: {
      quote_text: quoteText,
      url,
    },
  };

  if (articleTitle) {
    payload.attributes.article_title = articleTitle;
  }
  if (site) {
    payload.attributes.author = site;
  }

  submitButton.disabled = true;

  try {
    const response = await fetch("/items", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
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
    showSavedNote(quoteSavedNote, "quote saved", "success", timerRef);
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

  if (form instanceof HTMLFormElement) {
    form.addEventListener("submit", handleSubmit);
  }

  setStatus(statusEl, "", "");

  // Prefill token section state on load
  if (getToken()) {
    hideTokenSection(tokenSection, tokenInput, submitButton);
  } else {
    setStatus(statusEl, "", "");
    hideSavedNote(quoteSavedNote, { value: null });
    revealTokenSection(tokenSection, tokenInput, submitButton, quoteSavedNote, { value: null });
  }
}

document.addEventListener("DOMContentLoaded", init);
