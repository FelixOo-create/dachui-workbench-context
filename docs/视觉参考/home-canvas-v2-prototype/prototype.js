const body = document.body;
const query = new URLSearchParams(location.search);

function setEditing(enabled) {
  body.classList.toggle("is-editing", enabled);
  query.set("mode", enabled ? "edit" : "default");
  history.replaceState({}, "", `${location.pathname}?${query}`);
}

function setModal(enabled) {
  body.classList.toggle("show-modal", enabled);
}

document.querySelectorAll('[data-action="edit"], [data-action="settings"]').forEach((button) => {
  button.addEventListener("click", () => setEditing(!body.classList.contains("is-editing")));
});
document.querySelectorAll('[data-action="close-editor"]').forEach((button) => button.addEventListener("click", () => setEditing(false)));
document.querySelectorAll('[data-action="add"]').forEach((button) => button.addEventListener("click", () => setModal(true)));
document.querySelectorAll('[data-action="close-modal"]').forEach((button) => button.addEventListener("click", () => setModal(false)));
document.querySelector(".component-modal").addEventListener("click", (event) => { if (event.target.classList.contains("component-modal")) setModal(false); });
document.addEventListener("keydown", (event) => { if (event.key === "Escape") { setModal(false); setEditing(false); } });
document.querySelectorAll(".scene-button").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll(".scene-button").forEach((item) => item.classList.remove("active"));
  button.classList.add("active");
}));
document.querySelectorAll(".preset").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll(".preset").forEach((item) => item.classList.remove("active"));
  button.classList.add("active");
}));

if (query.get("mode") === "edit") setEditing(true);
