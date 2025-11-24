const TOKEN_KEY = "quoteCardsToken";

function getToken() {
  return localStorage.getItem(TOKEN_KEY) ?? "";
}

function requireToken() {
  const token = getToken();
  if (token) return token;
  alert("Add your API token on the home page before editing or deleting items.");
  window.location.href = "/";
  return null;
}

function handleEdit(id) {
  window.location.href = `/?edit=${encodeURIComponent(id)}`;
}

async function handleDelete(id, button) {
  const token = requireToken();
  if (!token) return;
  const confirmed = window.confirm("Delete this quote? This cannot be undone.");
  if (!confirmed) return;

  button.disabled = true;
  try {
    const response = await fetch(`/items/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(errorText || `Request failed (${response.status})`);
    }

    window.location.reload();
  } catch (error) {
    alert(`Unable to delete quote: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    button.disabled = false;
  }
}

function onActionClick(event) {
  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) return;
  const action = target.dataset.action;
  const id = target.dataset.itemId;
  if (!action || !id) return;

  if (action === "edit") {
    handleEdit(id);
  } else if (action === "delete") {
    if (target instanceof HTMLButtonElement) {
      handleDelete(id, target);
    }
  }
}

function init() {
  const buttons = document.querySelectorAll(".quote-actions [data-action]");
  buttons.forEach((button) => button.addEventListener("click", onActionClick));
}

document.addEventListener("DOMContentLoaded", init);
