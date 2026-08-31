const API_BASE = location.protocol === "chrome-extension:" ? "http://127.0.0.1:4173" : "";
const UNCATEGORIZED = "__uncategorized__";
const INTERNAL_DRAG = "application/x-dachui-bookmark";

const state = {
  bookmarks: [],
  tags: [],
  profiles: [],
  detectedBrowsers: [],
  health: null,
  selectedTag: localStorage.getItem("bookmarkSelectedTag") || "",
  search: "",
  density: localStorage.getItem("bookmarkDensity") || "compact",
  dragDepth: 0
};

const $ = (selector) => document.querySelector(selector);
const elements = {
  status: $("#statusLine"),
  search: $("#searchInput"),
  tagFilter: $("#tagFilter"),
  allTag: $("#allTagButton"),
  count: $("#bookmarkCount"),
  viewTitle: $("#viewTitle"),
  grid: $("#bookmarkGrid"),
  empty: $("#emptyState"),
  service: $("#serviceState"),
  template: $("#bookmarkTemplate"),
  dropOverlay: $("#dropOverlay"),
  dropTarget: $("#dropTargetText"),
  bookmarkModal: $("#bookmarkModal"),
  bookmarkForm: $("#bookmarkForm"),
  bookmarkModalTitle: $("#bookmarkModalTitle"),
  bookmarkId: $("#bookmarkIdInput"),
  targetLabel: $("#targetInputLabel"),
  url: $("#urlInput"),
  localLaunchField: $("#localLaunchUrlField"),
  localLaunchUrl: $("#localLaunchUrlInput"),
  title: $("#titleInput"),
  tags: $("#tagInput"),
  description: $("#descriptionInput"),
  profileTargets: $("#profileTargets"),
  profileTargetList: $("#profileTargetList"),
  deleteBookmark: $("#deleteBookmarkButton"),
  save: $("#saveButton"),
  profileModal: $("#profileModal"),
  profileList: $("#profileList"),
  profileForm: $("#profileForm"),
  profileName: $("#profileNameInput"),
  browserSelect: $("#browserSelect"),
  profileDirectory: $("#profileDirectoryInput"),
  userDataDirectory: $("#userDataDirectoryInput"),
  importFile: $("#importFileInput")
};

document.body.dataset.density = state.density;
bindEvents();
await loadAll();

function bindEvents() {
  $("#addButton").addEventListener("click", () => openBookmarkModal());
  $("#emptyAddButton").addEventListener("click", () => openBookmarkModal());
  $("#profileButton").addEventListener("click", openProfileModal);
  $("#addTagButton").addEventListener("click", addTag);
  $("#reloadButton").addEventListener("click", loadAll);
  $("#captureMissingButton").addEventListener("click", captureMissingPreviews);
  $("#exportButton").addEventListener("click", exportBookmarks);
  $("#importButton").addEventListener("click", () => elements.importFile.click());
  elements.importFile.addEventListener("change", importBookmarks);
  elements.search.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    render();
  });
  elements.allTag.addEventListener("click", () => selectTag(""));
  elements.tagFilter.addEventListener("click", (event) => {
    const button = event.target.closest("[data-tag]");
    if (button) selectTag(button.dataset.tag);
  });
  elements.tagFilter.addEventListener("dblclick", renameTag);
  document.querySelectorAll("[data-density]").forEach((button) => button.addEventListener("click", () => setDensity(button.dataset.density)));
  document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => closeModal(button.dataset.close)));
  document.querySelectorAll('input[name="itemType"]').forEach((input) => input.addEventListener("change", syncBookmarkType));
  elements.bookmarkForm.addEventListener("submit", saveBookmark);
  elements.deleteBookmark.addEventListener("click", deleteBookmark);
  elements.profileForm.addEventListener("submit", addProfile);
  elements.profileList.addEventListener("click", removeProfile);
  elements.grid.addEventListener("click", handleCardAction);
  elements.grid.addEventListener("dragstart", handleCardDragStart);
  elements.grid.addEventListener("dragover", handleCardDragOver);
  elements.grid.addEventListener("drop", handleGridDrop);
  elements.grid.addEventListener("dragend", clearCardDrag);
  document.addEventListener("dragenter", handleExternalDragEnter);
  document.addEventListener("dragover", handleExternalDragOver);
  document.addEventListener("dragleave", handleExternalDragLeave);
  document.addEventListener("drop", handleExternalDrop);
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeModal("bookmarkModal");
    closeModal("profileModal");
  });
}

async function loadAll() {
  setStatus("正在同步网页收藏...");
  try {
    const [bookmarksData, tagsData, profileData, health] = await Promise.all([
      requestJson("/api/bookmarks"),
      requestJson("/api/tags"),
      requestJson("/api/browser-profiles"),
      requestJson("/api/health")
    ]);
    state.bookmarks = bookmarksData.bookmarks || [];
    state.tags = tagsData.tags || [];
    state.profiles = profileData.profiles || [];
    state.detectedBrowsers = profileData.detectedBrowsers || [];
    state.health = health;
    const knownTags = new Set(state.tags.map((tag) => tag.name));
    if (state.selectedTag && state.selectedTag !== UNCATEGORIZED && !knownTags.has(state.selectedTag)) selectTag("");
    setStatus(`已同步 ${state.bookmarks.length} 个收藏`);
  } catch (error) {
    state.health = null;
    setStatus(`本地服务未连接：${error.message}`, true);
  }
  render();
}

function render() {
  renderTags();
  renderCards();
  renderService();
  document.querySelectorAll("[data-density]").forEach((button) => button.classList.toggle("active", button.dataset.density === state.density));
}

function renderTags() {
  elements.count.textContent = state.bookmarks.length;
  elements.allTag.classList.toggle("active", !state.selectedTag);
  elements.tagFilter.textContent = "";
  const uncategorizedCount = state.bookmarks.filter((item) => !(item.tags || []).length).length;
  elements.tagFilter.append(createTagButton("未分类", UNCATEGORIZED, uncategorizedCount));
  state.tags.forEach((tag) => elements.tagFilter.append(createTagButton(tag.name, tag.name, tag.count)));
  elements.viewTitle.textContent = !state.selectedTag ? "全部收藏" : state.selectedTag === UNCATEGORIZED ? "未分类" : state.selectedTag;
  elements.dropTarget.textContent = state.selectedTag && state.selectedTag !== UNCATEGORIZED ? `保存到「${state.selectedTag}」` : "保存到未分类";
}

function createTagButton(label, value, count) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "tag-tab";
  button.dataset.tag = value;
  button.classList.toggle("active", state.selectedTag === value);
  button.innerHTML = `<span>${escapeHtml(label)}</span><strong>${count}</strong>`;
  return button;
}

function renderCards() {
  const bookmarks = filteredBookmarks();
  elements.grid.textContent = "";
  for (const bookmark of bookmarks) elements.grid.append(renderCard(bookmark));
  elements.grid.classList.toggle("hidden", bookmarks.length === 0);
  elements.empty.classList.toggle("hidden", bookmarks.length > 0);
}

function renderCard(bookmark) {
  const fragment = elements.template.content.cloneNode(true);
  const card = fragment.querySelector(".bookmark-card");
  card.dataset.id = bookmark.id;
  const preview = fragment.querySelector(".preview");
  const fallback = fragment.querySelector(".preview-fallback");
  const siteBadge = fragment.querySelector(".site-badge");
  const favicon = siteBadge.querySelector("img");
  const siteName = siteBadge.querySelector("span");
  const title = fragment.querySelector(".card-title");
  const description = fragment.querySelector(".card-description");
  const tags = fragment.querySelector(".card-tags");
  const launches = fragment.querySelector(".profile-launches");
  const type = bookmarkType(bookmark);
  const host = bookmark.host || (type === "url" ? hostname(bookmark.url) : "本地入口");

  fallback.style.background = fallbackGradient(host);
  if (bookmark.image) {
    preview.style.backgroundImage = `url("${cssUrl(resolveAsset(bookmark.image))}")`;
    preview.classList.add("has-image");
  }
  favicon.src = type === "url" ? resolveAsset(bookmark.favicon || "/favicon.ico") : "";
  favicon.onerror = () => favicon.classList.add("hidden");
  siteName.textContent = bookmark.siteName || host;
  title.textContent = bookmark.title || bookmark.url || bookmark.localPath;
  description.textContent = bookmark.description || (type === "url" ? bookmark.url : bookmark.localPath);
  (bookmark.tags || []).slice(0, 3).forEach((tag) => {
    const chip = document.createElement("span");
    chip.textContent = tag;
    tags.append(chip);
  });
  for (const target of bookmark.launchTargets || []) {
    const profile = state.profiles.find((item) => item.id === target.profileId);
    if (!profile) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.action = "open-profile";
    button.dataset.targetId = target.id;
    button.textContent = target.label || profile.name;
    launches.append(button);
  }
  launches.classList.toggle("hidden", !launches.children.length);
  return fragment;
}

function renderService() {
  elements.service.className = `service-state ${state.health ? "online" : "offline"}`;
  elements.service.textContent = state.health
    ? `服务正常 · ${state.health.browserProfileCount || 0} 个账号入口`
    : "本地服务未连接";
}

function filteredBookmarks() {
  return state.bookmarks.filter((bookmark) => {
    const tags = bookmark.tags || [];
    const matchesTag = !state.selectedTag || (state.selectedTag === UNCATEGORIZED ? tags.length === 0 : tags.includes(state.selectedTag));
    const haystack = [bookmark.title, bookmark.description, bookmark.url, bookmark.localPath, bookmark.siteName, ...tags].join(" ").toLowerCase();
    return matchesTag && (!state.search || haystack.includes(state.search));
  });
}

function selectTag(tag) {
  state.selectedTag = tag;
  localStorage.setItem("bookmarkSelectedTag", tag);
  render();
}

function setDensity(density) {
  state.density = density === "visual" ? "visual" : "compact";
  localStorage.setItem("bookmarkDensity", state.density);
  document.body.dataset.density = state.density;
  render();
}

async function addTag() {
  const tag = window.prompt("新增标签名称");
  if (!tag?.trim()) return;
  try {
    const data = await requestJson("/api/tags", { method: "POST", body: JSON.stringify({ tag }) });
    state.tags = data.tags || state.tags;
    selectTag(tag.trim());
    setStatus(`已新增标签：${tag.trim()}`);
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function renameTag(event) {
  const button = event.target.closest("[data-tag]");
  const oldTag = button?.dataset.tag;
  if (!oldTag || oldTag === UNCATEGORIZED) return;
  const nextTag = window.prompt("重命名标签", oldTag);
  if (!nextTag?.trim() || nextTag.trim() === oldTag) return;
  try {
    const data = await requestJson(`/api/tags/${encodeURIComponent(oldTag)}`, { method: "PUT", body: JSON.stringify({ tag: nextTag }) });
    state.tags = data.tags || [];
    state.bookmarks = data.bookmarks || state.bookmarks;
    selectTag(nextTag.trim());
  } catch (error) {
    setStatus(error.message, true);
  }
}

function openBookmarkModal(bookmark = null) {
  elements.bookmarkForm.reset();
  elements.bookmarkId.value = bookmark?.id || "";
  elements.bookmarkModalTitle.textContent = bookmark ? "编辑收藏" : "新建收藏";
  const type = bookmarkType(bookmark);
  document.querySelector(`input[name="itemType"][value="${type}"]`).checked = true;
  elements.url.value = type === "local" ? bookmark?.localPath || "" : bookmark?.url || "";
  elements.localLaunchUrl.value = bookmark?.launchUrl || "";
  elements.title.value = bookmark?.title || "";
  elements.tags.value = bookmark ? (bookmark.tags || []).join(" ") : currentTagForNewBookmark();
  elements.description.value = bookmark?.description || "";
  elements.deleteBookmark.classList.toggle("hidden", !bookmark);
  syncBookmarkType();
  renderProfileTargets(bookmark?.launchTargets || []);
  showModal(elements.bookmarkModal);
  elements.url.focus();
}

function syncBookmarkType() {
  const type = selectedItemType();
  const local = type === "local";
  elements.targetLabel.textContent = local ? "本地路径" : "网址";
  elements.url.placeholder = local ? "E:\\Vibecoding\\工具\\启动.bat" : "https://example.com";
  elements.localLaunchField.classList.toggle("hidden", !local);
  elements.profileTargets.classList.toggle("hidden", local || state.profiles.length === 0);
}

function renderProfileTargets(selectedTargets) {
  const selected = new Map(selectedTargets.map((target) => [target.profileId, target]));
  elements.profileTargetList.textContent = "";
  for (const profile of state.profiles) {
    const target = selected.get(profile.id);
    const label = document.createElement("label");
    label.className = "profile-check";
    label.innerHTML = `<input type="checkbox" value="${escapeHtml(profile.id)}" ${target ? "checked" : ""} /><span><strong>${escapeHtml(profile.name)}</strong><small>${escapeHtml(profile.browser)} · ${escapeHtml(profile.profileDirectory)}</small></span><input class="target-label" type="text" value="${escapeHtml(target?.label || "")}" placeholder="按钮别名（可选）" />`;
    elements.profileTargetList.append(label);
  }
}

async function saveBookmark(event) {
  event.preventDefault();
  const id = elements.bookmarkId.value;
  const type = selectedItemType();
  const launchTargets = [...elements.profileTargetList.querySelectorAll(".profile-check")].flatMap((row) => {
    const checkbox = row.querySelector('input[type="checkbox"]');
    if (!checkbox.checked) return [];
    return [{ id: checkbox.value, profileId: checkbox.value, label: row.querySelector(".target-label").value.trim() }];
  });
  const payload = {
    type,
    url: type === "url" ? elements.url.value : "",
    localPath: type === "local" ? elements.url.value : "",
    launchUrl: type === "local" ? elements.localLaunchUrl.value : "",
    title: elements.title.value,
    tags: elements.tags.value,
    description: elements.description.value,
    launchTargets
  };
  elements.save.disabled = true;
  setStatus("正在保存收藏...");
  try {
    const data = await requestJson(id ? `/api/bookmarks/${id}` : "/api/bookmarks", { method: id ? "PUT" : "POST", body: JSON.stringify(payload) });
    state.bookmarks = id ? state.bookmarks.map((item) => item.id === id ? data.bookmark : item) : [data.bookmark, ...state.bookmarks];
    await refreshTags();
    closeModal("bookmarkModal");
    render();
    setStatus(`已保存：${data.bookmark.title}`);
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    elements.save.disabled = false;
  }
}

async function deleteBookmark() {
  const id = elements.bookmarkId.value;
  const bookmark = state.bookmarks.find((item) => item.id === id);
  if (!bookmark || !window.confirm(`删除「${bookmark.title}」？`)) return;
  try {
    await requestJson(`/api/bookmarks/${id}`, { method: "DELETE" });
    state.bookmarks = state.bookmarks.filter((item) => item.id !== id);
    await refreshTags();
    closeModal("bookmarkModal");
    render();
    setStatus("已删除收藏");
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function handleCardAction(event) {
  const action = event.target.closest("[data-action]");
  if (!action) return;
  const bookmark = state.bookmarks.find((item) => item.id === action.closest(".bookmark-card")?.dataset.id);
  if (!bookmark) return;
  if (action.dataset.action === "edit") return openBookmarkModal(bookmark);
  if (action.dataset.action === "open-profile") return openWithProfile(bookmark, action.dataset.targetId);
  if (action.dataset.action === "open") return openBookmark(bookmark);
}

async function openBookmark(bookmark) {
  if (bookmarkType(bookmark) === "url") {
    window.open(bookmark.url, "_blank", "noreferrer");
    recordClick(bookmark);
    return;
  }
  try {
    const data = await requestJson(`/api/bookmarks/${bookmark.id}/open`, { method: "POST" });
    if (data.url) window.open(data.url, "_blank", "noreferrer");
    recordClick(bookmark);
  } catch (error) {
    setStatus(`打开失败：${error.message}`, true);
  }
}

async function openWithProfile(bookmark, targetId) {
  setStatus(`正在用指定账号打开：${bookmark.title}`);
  try {
    const data = await requestJson(`/api/bookmarks/${bookmark.id}/open-target`, { method: "POST", body: JSON.stringify({ targetId }) });
    recordClick(bookmark);
    setStatus(`已交给 ${data.profile.name} 打开`);
  } catch (error) {
    setStatus(`打开失败：${error.message}`, true);
  }
}

async function recordClick(bookmark) {
  try {
    const data = await requestJson(`/api/bookmarks/${bookmark.id}/click`, { method: "POST", body: JSON.stringify({ contextTag: state.selectedTag }) });
    state.bookmarks = state.bookmarks.map((item) => item.id === bookmark.id ? data.bookmark : item);
  } catch {}
}

function handleCardDragStart(event) {
  const card = event.target.closest(".bookmark-card");
  if (!card) return;
  event.dataTransfer.setData(INTERNAL_DRAG, card.dataset.id);
  event.dataTransfer.effectAllowed = "move";
  card.classList.add("dragging");
}

function handleCardDragOver(event) {
  if (!event.dataTransfer.types.includes(INTERNAL_DRAG)) return;
  event.preventDefault();
  const card = event.target.closest(".bookmark-card");
  document.querySelectorAll(".bookmark-card.drop-target").forEach((item) => item.classList.remove("drop-target"));
  card?.classList.add("drop-target");
}

async function handleGridDrop(event) {
  const draggedId = event.dataTransfer.getData(INTERNAL_DRAG);
  if (!draggedId) return;
  event.preventDefault();
  event.stopPropagation();
  const targetId = event.target.closest(".bookmark-card")?.dataset.id;
  clearCardDrag();
  if (!targetId || targetId === draggedId) return;
  const next = [...state.bookmarks];
  const from = next.findIndex((item) => item.id === draggedId);
  const to = next.findIndex((item) => item.id === targetId);
  const [dragged] = next.splice(from, 1);
  next.splice(to, 0, dragged);
  state.bookmarks = next;
  render();
  try {
    await requestJson("/api/bookmarks/order", { method: "POST", body: JSON.stringify({ ids: next.map((item) => item.id) }) });
  } catch (error) {
    setStatus(error.message, true);
    loadAll();
  }
}

function clearCardDrag() {
  document.querySelectorAll(".bookmark-card.dragging,.bookmark-card.drop-target").forEach((item) => item.classList.remove("dragging", "drop-target"));
}

function isExternalUrlDrag(event) {
  return !event.dataTransfer.types.includes(INTERNAL_DRAG) && (event.dataTransfer.types.includes("text/uri-list") || event.dataTransfer.types.includes("text/plain") || event.dataTransfer.types.includes("text/html"));
}

function handleExternalDragEnter(event) {
  if (!isExternalUrlDrag(event)) return;
  state.dragDepth += 1;
  elements.dropOverlay.classList.remove("hidden");
}

function handleExternalDragOver(event) {
  if (!isExternalUrlDrag(event)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
}

function handleExternalDragLeave(event) {
  if (!isExternalUrlDrag(event)) return;
  state.dragDepth = Math.max(0, state.dragDepth - 1);
  if (!state.dragDepth) elements.dropOverlay.classList.add("hidden");
}

async function handleExternalDrop(event) {
  if (!isExternalUrlDrag(event)) return;
  event.preventDefault();
  state.dragDepth = 0;
  elements.dropOverlay.classList.add("hidden");
  const url = extractDroppedUrl(event.dataTransfer);
  if (!url) return setStatus("没有识别到 http 或 https 链接", true);
  await createDroppedBookmark(url);
}

function extractDroppedUrl(dataTransfer) {
  const uri = dataTransfer.getData("text/uri-list").split(/\r?\n/).find((line) => line && !line.startsWith("#"));
  if (isHttpUrl(uri)) return uri;
  const html = dataTransfer.getData("text/html");
  if (html) {
    const href = new DOMParser().parseFromString(html, "text/html").querySelector("a[href]")?.href;
    if (isHttpUrl(href)) return href;
  }
  const plain = dataTransfer.getData("text/plain").trim().split(/\s+/).find(isHttpUrl);
  return plain || "";
}

async function createDroppedBookmark(url) {
  const tags = currentTagForNewBookmark();
  setStatus(`正在收藏：${url}`);
  try {
    const data = await requestJson("/api/bookmarks", { method: "POST", body: JSON.stringify({ url, tags }) });
    state.bookmarks.unshift(data.bookmark);
    await refreshTags();
    render();
    setStatus(`已保存到${tags || "未分类"}：${data.bookmark.title}`);
  } catch (error) {
    if (error.status !== 409 || !error.bookmark) return setStatus(error.message, true);
    const bookmark = error.bookmark;
    const tag = currentTagForNewBookmark();
    if (tag && !(bookmark.tags || []).includes(tag)) {
      const data = await requestJson(`/api/bookmarks/${bookmark.id}`, { method: "PUT", body: JSON.stringify({ tags: [...(bookmark.tags || []), tag] }) });
      state.bookmarks = state.bookmarks.map((item) => item.id === bookmark.id ? data.bookmark : item);
      await refreshTags();
      render();
      return setStatus(`网址已存在，已加入「${tag}」`);
    }
    setStatus("这个网址已经收藏过了", true);
  }
}

function openProfileModal() {
  renderProfiles();
  showModal(elements.profileModal);
}

function renderProfiles() {
  elements.profileList.textContent = "";
  for (const profile of state.profiles) {
    const row = document.createElement("div");
    row.className = "profile-row";
    row.innerHTML = `<span class="browser-dot ${escapeHtml(profile.browser)}"></span><div><strong>${escapeHtml(profile.name)}</strong><small>${escapeHtml(profile.browser)} · ${escapeHtml(profile.profileDirectory)}</small></div><button type="button" data-remove-profile="${escapeHtml(profile.id)}">移除</button>`;
    elements.profileList.append(row);
  }
  if (!state.profiles.length) elements.profileList.innerHTML = '<p class="profile-empty">尚未配置账号入口。先选择已检测到的浏览器。</p>';
  elements.browserSelect.textContent = "";
  state.detectedBrowsers.forEach((browser, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = browser.name;
    elements.browserSelect.append(option);
  });
  if (!state.detectedBrowsers.length) {
    const option = document.createElement("option");
    option.textContent = "未检测到 Chrome / Edge / QQ 浏览器";
    option.value = "";
    elements.browserSelect.append(option);
  }
}

async function addProfile(event) {
  event.preventDefault();
  const browser = state.detectedBrowsers[Number(elements.browserSelect.value)];
  if (!browser) return setStatus("未检测到可用浏览器", true);
  const profile = {
    id: crypto.randomUUID(),
    name: elements.profileName.value.trim(),
    browser: browser.browser,
    executablePath: browser.executablePath,
    profileDirectory: elements.profileDirectory.value.trim(),
    userDataDirectory: elements.userDataDirectory.value.trim()
  };
  await saveProfiles([...state.profiles, profile]);
  elements.profileForm.reset();
  elements.profileDirectory.value = "Default";
}

async function removeProfile(event) {
  const button = event.target.closest("[data-remove-profile]");
  if (!button) return;
  await saveProfiles(state.profiles.filter((profile) => profile.id !== button.dataset.removeProfile));
}

async function saveProfiles(profiles) {
  try {
    const data = await requestJson("/api/browser-profiles", { method: "PUT", body: JSON.stringify({ profiles }) });
    state.profiles = data.profiles || [];
    state.detectedBrowsers = data.detectedBrowsers || state.detectedBrowsers;
    renderProfiles();
    render();
    setStatus("浏览器账号入口已更新");
  } catch (error) {
    setStatus(`保存浏览器入口失败：${error.message}`, true);
  }
}

async function captureMissingPreviews() {
  const missing = state.bookmarks.filter((item) => bookmarkType(item) === "url" && !item.image && !item.previewAttemptedAt).length;
  if (!missing) return setStatus("当前没有待补全的预览");
  try {
    const data = await requestJson("/api/previews/jobs", { method: "POST", body: JSON.stringify({ limit: missing }) });
    await pollJob(data.job.id);
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function pollJob(id) {
  while (true) {
    const data = await requestJson(`/api/previews/jobs/${id}`);
    state.bookmarks = data.bookmarks || state.bookmarks;
    render();
    if (data.job.status === "done") return setStatus(`预览补全完成：成功 ${data.job.updated}，失败 ${data.job.failed}`);
    if (data.job.status === "failed") return setStatus("预览任务失败", true);
    setStatus(`正在补全预览 ${data.job.attempted}/${data.job.total}`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

async function exportBookmarks() {
  try {
    const data = await requestJson("/api/export");
    const href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const link = Object.assign(document.createElement("a"), { href, download: `bookmarks-${new Date().toISOString().slice(0, 10)}.json` });
    link.click();
    URL.revokeObjectURL(href);
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function importBookmarks() {
  const file = elements.importFile.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const payload = /\.html?$/i.test(file.name) ? { html: text } : JSON.parse(text);
    const data = await requestJson("/api/import", { method: "POST", body: JSON.stringify(payload) });
    state.bookmarks = data.bookmarks || [];
    await refreshTags();
    render();
    setStatus(`已导入 ${data.imported} 个新收藏`);
  } catch (error) {
    setStatus(`导入失败：${error.message}`, true);
  } finally {
    elements.importFile.value = "";
  }
}

async function refreshTags() {
  const data = await requestJson("/api/tags");
  state.tags = data.tags || [];
}

function showModal(element) {
  element.classList.remove("hidden");
}

function closeModal(id) {
  document.getElementById(id)?.classList.add("hidden");
}

function selectedItemType() {
  return document.querySelector('input[name="itemType"]:checked')?.value || "url";
}

function currentTagForNewBookmark() {
  return state.selectedTag && state.selectedTag !== UNCATEGORIZED ? state.selectedTag : "";
}

function bookmarkType(bookmark) {
  return bookmark?.type === "local" || bookmark?.localPath ? "local" : "url";
}

function hostname(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

function isHttpUrl(value) {
  try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
}

function fallbackGradient(seed) {
  let hash = 0;
  for (const char of String(seed)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const hue = 190 + (hash % 80);
  return `linear-gradient(145deg, hsl(${hue} 24% 18%), hsl(${(hue + 26) % 360} 20% 9%))`;
}

function resolveAsset(value) {
  if (!value || /^(https?:|data:|chrome-extension:)/i.test(value)) return value;
  return `${API_BASE}${value.startsWith("/") ? "" : "/"}${value}`;
}

function cssUrl(value) {
  return String(value).replace(/[\\"\n\r]/g, (char) => `\\${char}`);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function setStatus(message, error = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle("error", error);
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `请求失败：${response.status}`);
    Object.assign(error, data, { status: response.status });
    throw error;
  }
  return data;
}
