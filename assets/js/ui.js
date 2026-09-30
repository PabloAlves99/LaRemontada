export const $ = (selector, root = document) => root.querySelector(selector);

export const $$ = (selector, root = document) => [
  ...root.querySelectorAll(selector),
];

export function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );
}

export function formatNumber(value) {
  if (value == null) return "—";
  return Number(value).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

export function formatDay(date) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
  });
}

export function actionButton(label, action, className = "") {
  return `<button class="button ${className}" data-action="${escapeHtml(action)}">${escapeHtml(label)}</button>`;
}

export function emptyState(title, description, action = "") {
  return `<div class="empty"><div class="big">◇</div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p>${action}</div>`;
}

export function selectOptions(values, selected, blank = "Não informada") {
  return [
    `<option value="">${escapeHtml(blank)}</option>`,
    ...values.map(
      (value) =>
        `<option ${value === selected ? "selected" : ""}>${escapeHtml(value)}</option>`,
    ),
  ].join("");
}
