import { createServer } from "node:http";
import { readFile, writeFile, mkdir, stat, unlink, copyFile } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const dataDir = process.env.BOOKMARK_DATA_DIR ? path.resolve(process.env.BOOKMARK_DATA_DIR) : path.join(__dirname, "data");
const previewDir = process.env.BOOKMARK_PREVIEW_DIR ? path.resolve(process.env.BOOKMARK_PREVIEW_DIR) : path.join(publicDir, "previews");
const bookmarksFile = path.join(dataDir, "bookmarks.json");
const tagsFile = path.join(dataDir, "tags.json");
const browserProfilesFile = path.join(dataDir, "browser-profiles.json");
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";
const PREVIEW_TIMEOUT_MS = Number(process.env.PREVIEW_TIMEOUT_MS || 25000);

const jobs = new Map();
let queue = Promise.resolve();
let backupPromise = null;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

await ensureStorage();

createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url || "/", `http://${req.headers.host}`);

    if (!applyCors(req, res)) {
      return sendJson(res, 403, { error: "请求来源不受信任" });
    }

    if (req.method === "OPTIONS") {
      return sendJson(res, 204, {});
    }

    if (requestUrl.pathname.startsWith("/api/")) {
      return await handleApi(req, res, requestUrl);
    }

    return await serveStatic(res, requestUrl.pathname);
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { error: "服务器处理失败", detail: error.message });
  }
}).listen(PORT, HOST, () => {
  console.log(`Bookmark Workbench is running at http://${HOST}:${PORT}`);
});

async function ensureStorage() {
  await mkdir(dataDir, { recursive: true });
  await mkdir(previewDir, { recursive: true });
  await ensureJsonFile(bookmarksFile, []);
  await ensureJsonFile(tagsFile, []);
  await ensureJsonFile(browserProfilesFile, []);
}

async function ensureJsonFile(filePath, fallback) {
  try {
    await stat(filePath);
  } catch {
    await writeFile(filePath, `${JSON.stringify(fallback, null, 2)}\n`, "utf8");
  }
}

async function handleApi(req, res, requestUrl) {
  const pathname = requestUrl.pathname;

  if (req.method === "GET" && pathname === "/api/browser-profiles") {
    return sendJson(res, 200, {
      profiles: await readBrowserProfiles(),
      detectedBrowsers: detectChromiumBrowsers()
    });
  }

  if (req.method === "PUT" && pathname === "/api/browser-profiles") {
    const body = await readJsonBody(req);
    if (!Array.isArray(body.profiles)) {
      return sendJson(res, 400, { error: "浏览器配置格式不正确" });
    }
    const profiles = body.profiles.map((profile) => normalizeBrowserProfile(profile, { strict: true }));
    const ids = new Set();
    for (const profile of profiles) {
      if (ids.has(profile.id)) return sendJson(res, 400, { error: "浏览器配置 ID 重复" });
      ids.add(profile.id);
    }
    await writeBrowserProfiles(profiles);
    return sendJson(res, 200, { profiles, detectedBrowsers: detectChromiumBrowsers() });
  }

  if (req.method === "GET" && pathname === "/api/health") {
    const bookmarks = await readBookmarks();
    const webBookmarks = bookmarks.filter(isWebBookmark);
    const chromePath = findChromeExecutable();
    return sendJson(res, 200, {
      ok: true,
      serviceId: "dachui-workbench-bookmarks",
      port: PORT,
      chromeAvailable: Boolean(chromePath),
      chromePath,
      bookmarkCount: bookmarks.length,
      localCount: bookmarks.filter(isLocalBookmark).length,
      previewCount: bookmarks.filter((bookmark) => bookmark.image).length,
      missingPreviewCount: webBookmarks.filter((bookmark) => !bookmark.image && !bookmark.previewAttemptedAt).length,
      failedPreviewCount: webBookmarks.filter((bookmark) => !bookmark.image && bookmark.previewAttemptedAt).length,
      runningJobs: [...jobs.values()].filter((job) => job.status === "queued" || job.status === "running").length,
      browserProfileCount: (await readBrowserProfiles()).length,
      startedAt: processStartTime
    });
  }

  if (req.method === "GET" && pathname === "/api/bookmarks") {
    return sendJson(res, 200, { bookmarks: await readBookmarks() });
  }

  if (req.method === "GET" && pathname === "/api/tags") {
    const bookmarks = await readBookmarks();
    const customTags = await readTags();
    return sendJson(res, 200, { tags: buildTagSummary(bookmarks, customTags) });
  }

  if (req.method === "POST" && pathname === "/api/tags") {
    const body = await readJsonBody(req);
    const [tag] = normalizeTags(body.tag);
    if (!tag) {
      return sendJson(res, 400, { error: "请输入标签名称" });
    }

    const customTags = await readTags();
    if (!customTags.includes(tag)) {
      customTags.push(tag);
      await writeTags(customTags);
    }

    const bookmarks = await readBookmarks();
    return sendJson(res, 201, { tags: buildTagSummary(bookmarks, customTags) });
  }

  if (req.method === "POST" && pathname === "/api/tags/order") {
    const body = await readJsonBody(req);
    const orderedTags = Array.isArray(body.tags) ? body.tags.map(String).map((tag) => tag.trim()).filter(Boolean) : [];
    const bookmarks = await readBookmarks();
    const summary = buildTagSummary(bookmarks, await readTags());
    const knownTags = new Set(summary.map((tag) => tag.name));
    const nextTags = [
      ...orderedTags.filter((tag) => knownTags.has(tag)),
      ...summary.map((tag) => tag.name).filter((tag) => !orderedTags.includes(tag))
    ];

    await writeTags(nextTags);
    return sendJson(res, 200, { tags: buildTagSummary(bookmarks, nextTags) });
  }

  const tagMatch = pathname.match(/^\/api\/tags\/(.+)$/);
  if (tagMatch && req.method === "PUT") {
    const oldTag = decodeURIComponent(tagMatch[1]);
    const body = await readJsonBody(req);
    const [newTag] = normalizeTags(body.tag || body.name);
    if (!newTag) {
      return sendJson(res, 400, { error: "请输入新的标签名称" });
    }
    if (oldTag === newTag) {
      const bookmarks = await readBookmarks();
      const customTags = await readTags();
      return sendJson(res, 200, { tags: buildTagSummary(bookmarks, customTags), bookmarks });
    }

    const rawBookmarks = await readBookmarks();
    const rawTags = await readTags();
    const tagExists = rawTags.includes(oldTag) || rawBookmarks.some((bookmark) => (bookmark.tags || []).includes(oldTag));
    if (!tagExists) {
      return sendJson(res, 404, { error: "找不到这个标签" });
    }

    const now = new Date().toISOString();
    const bookmarks = rawBookmarks.map((bookmark) => {
      if (!(bookmark.tags || []).includes(oldTag)) return bookmark;
      return {
        ...bookmark,
        tags: [...new Set((bookmark.tags || []).map((tag) => tag === oldTag ? newTag : tag))],
        updatedAt: now
      };
    });

    const customTags = rawTags.map((tag) => tag === oldTag ? newTag : tag);
    if (!customTags.includes(newTag)) customTags.push(newTag);

    await writeTags(customTags);
    await writeBookmarks(bookmarks);
    return sendJson(res, 200, { tags: buildTagSummary(bookmarks, customTags), bookmarks });
  }

  if (tagMatch && req.method === "DELETE") {
    const tag = decodeURIComponent(tagMatch[1]);
    const customTags = (await readTags()).filter((item) => item !== tag);
    const now = new Date().toISOString();
    const bookmarks = (await readBookmarks()).map((bookmark) => {
      const nextTags = (bookmark.tags || []).filter((item) => item !== tag);
      return {
        ...bookmark,
        tags: nextTags,
        updatedAt: nextTags.length === (bookmark.tags || []).length ? bookmark.updatedAt : now
      };
    });

    await writeTags(customTags);
    await writeBookmarks(bookmarks);
    return sendJson(res, 200, { tags: buildTagSummary(bookmarks, customTags), bookmarks });
  }

  if (req.method === "GET" && pathname === "/api/export") {
    return sendJson(res, 200, {
      version: 2,
      exportedAt: new Date().toISOString(),
      bookmarks: await readBookmarks(),
      tags: await readTags()
    });
  }

  if (req.method === "POST" && pathname === "/api/bookmarks/order") {
    const body = await readJsonBody(req);
    const orderedIds = Array.isArray(body.ids) ? body.ids.map(String) : [];
    const bookmarks = await readBookmarks();
    const byId = new Map(bookmarks.map((bookmark) => [bookmark.id, bookmark]));
    const nextBookmarks = [
      ...orderedIds.map((id) => byId.get(id)).filter(Boolean),
      ...bookmarks.filter((bookmark) => !orderedIds.includes(bookmark.id))
    ];

    await writeBookmarks(nextBookmarks);
    return sendJson(res, 200, { bookmarks: nextBookmarks });
  }

  const clickMatch = pathname.match(/^\/api\/bookmarks\/([^/]+)\/click$/);
  if (clickMatch && req.method === "POST") {
    const id = clickMatch[1];
    const body = await readJsonBody(req);
    const bookmarks = await readBookmarks();
    const index = bookmarks.findIndex((item) => item.id === id);

    if (index === -1) {
      return sendJson(res, 404, { error: "找不到这个收藏" });
    }

    const now = new Date().toISOString();
    const current = bookmarks[index];
    const clickCountsByTag = sanitizeClickCounts(current.clickCountsByTag);
    for (const tag of getClickContextTags(current, body.contextTag)) {
      clickCountsByTag[tag] = (clickCountsByTag[tag] || 0) + 1;
    }

    bookmarks[index] = {
      ...current,
      clickCount: normalizeCount(current.clickCount) + 1,
      clickCountsByTag,
      lastClickedAt: now,
      updatedAt: now
    };

    await writeBookmarks(bookmarks);
    return sendJson(res, 200, { bookmark: bookmarks[index] });
  }

  if (req.method === "POST" && pathname === "/api/import") {
    const body = await readJsonBody(req);
    const incoming = typeof body.html === "string" ? parseBookmarksHtml(body.html) : Array.isArray(body) ? body : body.bookmarks;
    if (!Array.isArray(incoming)) {
      return sendJson(res, 400, { error: "导入文件格式不正确" });
    }

    const current = await readBookmarks();
    const seenUrls = new Set(current.filter(isWebBookmark).map((item) => item.url));
    const seenLocalPaths = new Set(current.filter(isLocalBookmark).map((item) => normalizeLocalPathForCompare(item.localPath)));
    const imported = [];

    for (const raw of incoming) {
      const now = new Date().toISOString();
      if (raw?.type === "local" || raw?.localPath) {
      let localPath;
      let launchUrl;
      try {
        localPath = await normalizeLocalPath(raw.localPath || raw.path);
        launchUrl = normalizeOptionalLaunchUrl(raw.launchUrl || raw.localUrl, { strict: false });
      } catch {
        continue;
      }
        const localKey = normalizeLocalPathForCompare(localPath);
        if (seenLocalPaths.has(localKey)) continue;

      const bookmark = createLocalBookmark({ ...raw, launchUrl }, localPath, now, current);
        seenLocalPaths.add(localKey);
        imported.push(bookmark);
        continue;
      }

      if (!raw?.url) continue;
      let url;
      try {
        url = normalizeUrl(raw.url);
      } catch {
        continue;
      }
      if (seenUrls.has(url)) continue;

      const parsed = new URL(url);
      const bookmark = createUrlBookmarkFromImport(raw, url, parsed, now, current);

      seenUrls.add(url);
      imported.push(bookmark);
    }

    const bookmarks = [...imported, ...current];
    await writeBookmarks(bookmarks);
    return sendJson(res, 200, { imported: imported.length, bookmarks });
  }

  if (req.method === "POST" && pathname === "/api/metadata") {
    const body = await readJsonBody(req);
    const url = normalizeUrl(body.url);
    return sendJson(res, 200, await fetchMetadata(url));
  }

  if (req.method === "POST" && pathname === "/api/bookmarks") {
    const body = await readJsonBody(req);
    const bookmarks = await readBookmarks();

    if (body.type === "local") {
      let localPath;
      let launchUrl;
      try {
        localPath = await normalizeLocalPath(body.localPath || body.path);
        launchUrl = normalizeOptionalLaunchUrl(body.launchUrl || body.localUrl, { strict: true });
      } catch (error) {
        return sendJson(res, 400, { error: error.message });
      }
      const localKey = normalizeLocalPathForCompare(localPath);
      const duplicate = bookmarks.find((item) => isLocalBookmark(item) && normalizeLocalPathForCompare(item.localPath) === localKey);

      if (duplicate) {
        return sendJson(res, 409, { error: "这个本地项目已经收藏过了", bookmark: duplicate });
      }

      const now = new Date().toISOString();
      const bookmark = createLocalBookmark({ ...body, launchUrl }, localPath, now, bookmarks);
      bookmarks.unshift(bookmark);
      await writeBookmarks(bookmarks);
      return sendJson(res, 201, { bookmark, previewJob: null });
    }

    const url = normalizeUrl(body.url);
    const duplicate = bookmarks.find((item) => isWebBookmark(item) && item.url === url);

    if (duplicate) {
      return sendJson(res, 409, { error: "这个网址已经收藏过了", bookmark: duplicate });
    }

    const metadata = await fetchMetadata(url);
    const now = new Date().toISOString();
    const bookmark = {
      id: crypto.randomUUID(),
      url,
      title: body.title?.trim() || metadata.title || url,
      description: body.description?.trim() || metadata.description || "",
      image: metadata.image || "",
      imageSource: metadata.image ? "metadata" : "",
      previewAttemptedAt: "",
      favicon: metadata.favicon || "",
      siteName: metadata.siteName || "",
      host: metadata.host,
      tags: normalizeTags(body.tags),
      note: body.note?.trim() || "",
      clickCount: 0,
      clickCountsByTag: {},
      lastClickedAt: "",
      launchTargets: normalizeLaunchTargets(body.launchTargets),
      createdAt: now,
      updatedAt: now
    };

    bookmarks.unshift(bookmark);
    await writeBookmarks(bookmarks);

    const job = createPreviewJob({
      title: `抓取 ${bookmark.title}`,
      ids: [bookmark.id],
      force: true
    });
    enqueuePreviewJob(job.id);

    return sendJson(res, 201, { bookmark, previewJob: publicJob(job) });
  }

  if (req.method === "POST" && pathname === "/api/previews/missing") {
    const body = await readJsonBody(req);
    const result = await captureMissingPreviews({
      limit: Math.min(Math.max(Number(body.limit || 5), 1), 20),
      force: Boolean(body.force)
    });
    return sendJson(res, 200, result);
  }

  if (req.method === "POST" && pathname === "/api/previews/jobs") {
    const body = await readJsonBody(req);
    const limit = Math.min(Math.max(Number(body.limit || 50), 1), 500);
    const bookmarks = await readBookmarks();
    const ids = Array.isArray(body.ids)
      ? body.ids.map(String)
      : bookmarks
        .filter(isWebBookmark)
        .filter((bookmark) => body.force ? true : !bookmark.image && !bookmark.previewAttemptedAt)
        .slice(0, limit)
        .map((bookmark) => bookmark.id);

    const job = createPreviewJob({
      title: body.force ? "重抓预览图" : "补全预览图",
      ids,
      force: Boolean(body.force)
    });
    enqueuePreviewJob(job.id);
    return sendJson(res, 202, { job: publicJob(job) });
  }

  const jobMatch = pathname.match(/^\/api\/previews\/jobs\/([^/]+)$/);
  if (jobMatch && req.method === "GET") {
    const job = jobs.get(jobMatch[1]);
    if (!job) {
      return sendJson(res, 404, { error: "找不到这个任务" });
    }
    return sendJson(res, 200, { job: publicJob(job), bookmarks: await readBookmarks() });
  }

  const previewMatch = pathname.match(/^\/api\/bookmarks\/([^/]+)\/preview$/);
  if (previewMatch && req.method === "POST") {
    const id = previewMatch[1];
    const bookmarks = await readBookmarks();
    const bookmark = bookmarks.find((item) => item.id === id);
    if (!bookmark) {
      return sendJson(res, 404, { error: "找不到这个书签" });
    }
    if (!isWebBookmark(bookmark)) {
      return sendJson(res, 400, { error: "本地项目不支持自动抓取网页预览" });
    }

    const job = createPreviewJob({
      title: "重抓单个预览图",
      ids: [id],
      force: true
    });
    enqueuePreviewJob(job.id);
    return sendJson(res, 202, { job: publicJob(job) });
  }

  const manualPreviewMatch = pathname.match(/^\/api\/bookmarks\/([^/]+)\/image$/);
  if (manualPreviewMatch && req.method === "POST") {
    const id = manualPreviewMatch[1];
    const body = await readJsonBody(req);
    const bookmarks = await readBookmarks();
    const index = bookmarks.findIndex((item) => item.id === id);

    if (index === -1) {
      return sendJson(res, 404, { error: "找不到这个书签" });
    }

    const previousImage = bookmarks[index].image;
    const imagePath = await saveManualPreview(id, body.dataUrl || body.image);
    if (previousImage !== imagePath) {
      await removeLocalPreview(previousImage);
    }

    const now = new Date().toISOString();
    bookmarks[index] = {
      ...bookmarks[index],
      image: imagePath,
      imageSource: "manual",
      previewAttemptedAt: now,
      updatedAt: now
    };
    await writeBookmarks(bookmarks);

    return sendJson(res, 200, { bookmark: bookmarks[index] });
  }

  const bookmarkMatch = pathname.match(/^\/api\/bookmarks\/([^/]+)$/);
  const openMatch = pathname.match(/^\/api\/bookmarks\/([^/]+)\/open$/);
  const openTargetMatch = pathname.match(/^\/api\/bookmarks\/([^/]+)\/open-target$/);
  if (openTargetMatch && req.method === "POST") {
    const body = await readJsonBody(req);
    const bookmarks = await readBookmarks();
    const bookmark = bookmarks.find((item) => item.id === openTargetMatch[1]);
    if (!bookmark || !isWebBookmark(bookmark)) {
      return sendJson(res, 404, { error: "找不到这个网站收藏" });
    }
    const target = normalizeLaunchTargets(bookmark.launchTargets).find((item) => item.id === body.targetId);
    if (!target) return sendJson(res, 404, { error: "找不到这个打开方式" });
    const profile = (await readBrowserProfiles()).find((item) => item.id === target.profileId);
    if (!profile) return sendJson(res, 404, { error: "关联的浏览器 Profile 已不存在" });

    try {
      await launchInBrowserProfile(profile, bookmark.url);
      return sendJson(res, 200, { ok: true, profile: { id: profile.id, name: profile.name } });
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }
  if (openMatch && req.method === "POST") {
    const id = openMatch[1];
    const bookmarks = await readBookmarks();
    const bookmark = bookmarks.find((item) => item.id === id);

    if (!bookmark) {
      return sendJson(res, 404, { error: "找不到这个书签" });
    }

    if (isLocalBookmark(bookmark)) {
      const launchUrl = bookmark.launchUrl || "";
      try {
        if (launchUrl && await isUrlReachable(launchUrl)) {
          return sendJson(res, 200, { ok: true, type: "local-url", url: launchUrl, started: false });
        }
        await openLocalPath(bookmark.localPath);
        if (launchUrl) {
          const ready = await waitForUrl(launchUrl, { timeoutMs: 25000, intervalMs: 1000 });
          return sendJson(res, 200, { ok: true, type: "local-url", url: launchUrl, started: true, ready });
        }
      } catch (error) {
        return sendJson(res, 400, { error: error.message });
      }
      return sendJson(res, 200, { ok: true, type: "local" });
    }

    return sendJson(res, 200, { ok: true, type: "url", url: bookmark.url });
  }

  if (bookmarkMatch && req.method === "PUT") {
    const id = bookmarkMatch[1];
    const body = await readJsonBody(req);
    const bookmarks = await readBookmarks();
    const index = bookmarks.findIndex((item) => item.id === id);

    if (index === -1) {
      return sendJson(res, 404, { error: "找不到这个书签" });
    }

    const current = bookmarks[index];
    const nextType = body.type === "local" ? "local" : body.type === "url" ? "url" : getBookmarkType(current);
    let nextUrl = current.url || "";
    let nextLocalPath = current.localPath || "";
    let nextLaunchUrl = current.launchUrl || "";
    let metadata = {};
    let needsPreview = false;

    if (nextType === "local") {
      try {
        nextLocalPath = await normalizeLocalPath(body.localPath || body.path || current.localPath);
        nextLaunchUrl = normalizeOptionalLaunchUrl(
          body.launchUrl === undefined ? current.launchUrl : body.launchUrl,
          { strict: true }
        );
      } catch (error) {
        return sendJson(res, 400, { error: error.message });
      }
      nextUrl = "";
      if (isWebBookmark(current) && current.imageSource !== "manual") {
        await removeLocalPreview(current.image);
      }
    } else {
      let normalizedUrl = nextUrl;
      try {
        normalizedUrl = normalizeUrl(body.url || current.url);
      } catch (error) {
        return sendJson(res, 400, { error: error.message });
      }

      if (normalizedUrl !== current.url) {
        nextUrl = normalizedUrl;
        metadata = await fetchMetadata(nextUrl);
        await removeLocalPreview(current.image);
        needsPreview = true;
      }
    }

    const nextBookmark = nextType === "local" ? {
      ...current,
      type: "local",
      url: "",
      localPath: nextLocalPath,
      launchUrl: nextLaunchUrl,
      title: body.title?.trim() || current.title || localTitleFromPath(nextLocalPath),
      description: body.description === undefined ? current.description || "" : body.description.trim(),
      image: current.imageSource === "manual" ? current.image : "",
      imageSource: current.imageSource === "manual" ? "manual" : "",
      previewAttemptedAt: "",
      favicon: "",
      siteName: "本地项目",
      host: localHostFromPath(nextLocalPath),
      tags: body.tags === undefined ? current.tags : normalizeTags(body.tags),
      note: body.note === undefined ? current.note : body.note.trim(),
      launchTargets: body.launchTargets === undefined ? normalizeLaunchTargets(current.launchTargets) : normalizeLaunchTargets(body.launchTargets),
      updatedAt: new Date().toISOString()
    } : {
      ...current,
      type: "url",
      localPath: "",
      launchUrl: "",
      url: nextUrl,
      title: body.title?.trim() || metadata.title || current.title,
      description: body.description === undefined ? metadata.description || current.description : body.description.trim(),
      image: needsPreview ? metadata.image || "" : current.image || metadata.image || "",
      imageSource: needsPreview ? metadata.image ? "metadata" : "" : current.imageSource || "",
      previewAttemptedAt: needsPreview ? "" : current.previewAttemptedAt || "",
      favicon: metadata.favicon || current.favicon,
      siteName: metadata.siteName || current.siteName,
      host: metadata.host || current.host,
      tags: body.tags === undefined ? current.tags : normalizeTags(body.tags),
      note: body.note === undefined ? current.note : body.note.trim(),
      launchTargets: body.launchTargets === undefined ? normalizeLaunchTargets(current.launchTargets) : normalizeLaunchTargets(body.launchTargets),
      updatedAt: new Date().toISOString()
    };

    bookmarks[index] = nextBookmark;
    await writeBookmarks(bookmarks);

    let previewJob = null;
    if (needsPreview) {
      previewJob = createPreviewJob({ title: `抓取 ${nextBookmark.title}`, ids: [id], force: true });
      enqueuePreviewJob(previewJob.id);
    }

    return sendJson(res, 200, { bookmark: nextBookmark, previewJob: previewJob ? publicJob(previewJob) : null });
  }

  if (bookmarkMatch && req.method === "DELETE") {
    const id = bookmarkMatch[1];
    const bookmarks = await readBookmarks();
    const target = bookmarks.find((item) => item.id === id);
    const nextBookmarks = bookmarks.filter((item) => item.id !== id);

    if (nextBookmarks.length === bookmarks.length) {
      return sendJson(res, 404, { error: "找不到这个书签" });
    }

    await removeLocalPreview(target.image);
    await writeBookmarks(nextBookmarks);
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 404, { error: "接口不存在" });
}

const processStartTime = new Date().toISOString();

function createPreviewJob({ title, ids, force = false }) {
  const job = {
    id: crypto.randomUUID(),
    title,
    ids: [...new Set(ids)].filter(Boolean),
    force,
    status: "queued",
    total: [...new Set(ids)].filter(Boolean).length,
    attempted: 0,
    updated: 0,
    failed: 0,
    current: "",
    errors: [],
    createdAt: new Date().toISOString(),
    startedAt: "",
    finishedAt: ""
  };
  jobs.set(job.id, job);
  return job;
}

function publicJob(job) {
  return {
    id: job.id,
    title: job.title,
    status: job.status,
    total: job.total,
    attempted: job.attempted,
    updated: job.updated,
    failed: job.failed,
    current: job.current,
    errors: job.errors.slice(-10),
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt
  };
}

function enqueuePreviewJob(jobId) {
  queue = queue
    .catch(() => undefined)
    .then(() => runPreviewJob(jobId));
}

async function runPreviewJob(jobId) {
  const job = jobs.get(jobId);
  if (!job) return;

  job.status = "running";
  job.startedAt = new Date().toISOString();

  try {
    for (const id of job.ids) {
      const bookmarks = await readBookmarks();
      const bookmark = bookmarks.find((item) => item.id === id);
      if (!bookmark) continue;
      if (!isWebBookmark(bookmark)) continue;
      if (!job.force && (bookmark.image || bookmark.previewAttemptedAt)) continue;

      job.current = bookmark.title || bookmark.url;
      const result = await captureBookmarkPreview(bookmark, { force: job.force });
      job.attempted += 1;
      if (result.updated) {
        job.updated += 1;
      } else {
        job.failed += 1;
        job.errors.push({ title: bookmark.title, url: bookmark.url, error: result.error || "截图失败" });
      }
    }

    job.status = "done";
  } catch (error) {
    job.status = "failed";
    job.errors.push({ error: error.message });
  } finally {
    job.current = "";
    job.finishedAt = new Date().toISOString();
  }
}

async function captureMissingPreviews({ limit, force = false }) {
  const bookmarks = await readBookmarks();
  const targets = bookmarks
    .filter(isWebBookmark)
    .filter((bookmark) => force ? true : !bookmark.image && !bookmark.previewAttemptedAt)
    .slice(0, limit);
  let attempted = 0;
  let updated = 0;

  for (const bookmark of targets) {
    const result = await captureBookmarkPreview(bookmark, { force });
    attempted += 1;
    if (result.updated) updated += 1;
  }

  return { attempted, updated, bookmarks: await readBookmarks() };
}

async function captureBookmarkPreview(bookmark, { force = false } = {}) {
  if (!isWebBookmark(bookmark)) {
    return { updated: false, skipped: true };
  }

  if (!force && (bookmark.image || bookmark.previewAttemptedAt)) {
    return { updated: false, skipped: true };
  }

  await removeLocalPreview(bookmark.image);
  const preview = await capturePreview(bookmark.url, bookmark.id);
  const bookmarks = await readBookmarks();
  const index = bookmarks.findIndex((item) => item.id === bookmark.id);
  if (index === -1) {
    return { updated: false, error: "书签已不存在" };
  }

  const now = new Date().toISOString();
  bookmarks[index] = {
    ...bookmarks[index],
    image: preview || "",
    imageSource: preview ? "screenshot" : "",
    previewAttemptedAt: now,
    updatedAt: now
  };
  await writeBookmarks(bookmarks);
  return { updated: Boolean(preview), error: preview ? "" : "截图失败或网页不可达" };
}

async function serveStatic(res, pathname) {
  const safePath = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const root = safePath.startsWith("/previews/") ? previewDir : publicDir;
  const relativePath = safePath.startsWith("/previews/") ? safePath.slice("/previews/".length) : safePath.replace(/^\/+/, "");
  const filePath = path.resolve(root, relativePath);
  const relativeToRoot = path.relative(root, filePath);

  if (relativeToRoot.startsWith(`..${path.sep}`) || relativeToRoot === ".." || path.isAbsolute(relativeToRoot)) {
    return sendText(res, 403, "Forbidden");
  }

  try {
    await stat(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": contentTypes[ext] || "application/octet-stream" });
    createReadStream(filePath).pipe(res);
  } catch {
    return sendText(res, 404, "Not found");
  }
}

function getBookmarkType(bookmark) {
  return bookmark?.type === "local" || bookmark?.localPath ? "local" : "url";
}

function isLocalBookmark(bookmark) {
  return getBookmarkType(bookmark) === "local";
}

function isWebBookmark(bookmark) {
  return getBookmarkType(bookmark) === "url";
}

function createUrlBookmarkFromImport(raw, url, parsed, now, current) {
  return {
    id: raw.id && !current.some((item) => item.id === raw.id) ? String(raw.id) : crypto.randomUUID(),
    type: "url",
    url,
    localPath: "",
    launchUrl: "",
    title: String(raw.title || parsed.hostname.replace(/^www\./, "")),
    description: String(raw.description || ""),
    image: String(raw.image || ""),
    imageSource: raw.imageSource || "",
    previewAttemptedAt: raw.previewAttemptedAt || "",
    favicon: String(raw.favicon || `https://${parsed.hostname}/favicon.ico`),
    siteName: String(raw.siteName || parsed.hostname.replace(/^www\./, "")),
    host: String(raw.host || parsed.hostname.replace(/^www\./, "")),
    tags: normalizeTags(raw.tags),
    note: String(raw.note || ""),
    clickCount: normalizeCount(raw.clickCount),
    clickCountsByTag: sanitizeClickCounts(raw.clickCountsByTag),
    lastClickedAt: raw.lastClickedAt || "",
    launchTargets: normalizeLaunchTargets(raw.launchTargets),
    createdAt: raw.createdAt || now,
    updatedAt: now
  };
}

function createLocalBookmark(raw, localPath, now, current) {
  const title = String(raw.title || "").trim() || localTitleFromPath(localPath);
  const manualImage = raw.imageSource === "manual" ? String(raw.image || "") : "";

  return {
    id: raw.id && !current.some((item) => item.id === raw.id) ? String(raw.id) : crypto.randomUUID(),
    type: "local",
    url: "",
    localPath,
    launchUrl: normalizeOptionalLaunchUrl(raw.launchUrl || raw.localUrl, { strict: false }),
    title,
    description: String(raw.description || ""),
    image: manualImage,
    imageSource: manualImage ? "manual" : "",
    previewAttemptedAt: "",
    favicon: "",
    siteName: "本地项目",
    host: localHostFromPath(localPath),
    tags: normalizeTags(raw.tags),
    note: String(raw.note || ""),
    clickCount: normalizeCount(raw.clickCount),
    clickCountsByTag: sanitizeClickCounts(raw.clickCountsByTag),
    lastClickedAt: raw.lastClickedAt || "",
    launchTargets: [],
    createdAt: raw.createdAt || now,
    updatedAt: now
  };
}

function normalizeCount(value) {
  const count = Number(value || 0);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

function sanitizeClickCounts(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value)
      .map(([tag, count]) => [String(tag).trim(), normalizeCount(count)])
      .filter(([tag, count]) => tag && count > 0)
  );
}

function getClickContextTags(bookmark, contextTag) {
  const tags = Array.isArray(bookmark.tags) ? bookmark.tags.filter(Boolean) : [];
  const selectedTag = String(contextTag || "").trim();

  if (selectedTag === "__uncategorized__") {
    return tags.length ? [] : ["__uncategorized__"];
  }
  if (selectedTag && tags.includes(selectedTag)) {
    return [selectedTag];
  }

  return tags.length ? tags : ["__uncategorized__"];
}

async function normalizeLocalPath(value) {
  if (!value || typeof value !== "string") {
    throw new Error("请输入本地路径");
  }

  const trimmed = value.trim().replace(/^["']|["']$/g, "");
  if (!trimmed) {
    throw new Error("请输入本地路径");
  }
  if (/^(https?:|javascript:|data:|file:)/i.test(trimmed)) {
    throw new Error("本地项目请填写 Windows 文件、文件夹或快捷方式路径");
  }

  const normalized = path.normalize(trimmed);
  if (!path.isAbsolute(normalized)) {
    throw new Error("请填写绝对路径，例如 C:\\Users\\...\\App.lnk");
  }

  await stat(normalized);
  return normalized;
}

function normalizeLocalPathForCompare(value) {
  return path.normalize(String(value || "")).toLowerCase();
}

function normalizeOptionalLaunchUrl(value, { strict = false } = {}) {
  if (value === undefined || value === null || String(value).trim() === "") return "";

  try {
    const raw = String(value).trim();
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
    const parsed = new URL(withProtocol);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("本地网址只支持 http 或 https");
    }
    parsed.hash = "";
    return parsed.toString();
  } catch {
    if (!strict) return "";
    throw new Error("本地网址格式不正确，例如 http://localhost:3000");
  }
}

function localTitleFromPath(localPath) {
  const parsed = path.parse(localPath);
  return parsed.name || parsed.base || localPath;
}

function localHostFromPath(localPath) {
  const ext = path.extname(localPath).replace(".", "").toLowerCase();
  if (!ext) return "folder";
  if (ext === "lnk") return "shortcut";
  if (ext === "exe") return "app";
  return ext;
}

async function openLocalPath(localPath) {
  const normalized = await normalizeLocalPath(localPath);
  await new Promise((resolve, reject) => {
    const openerScript = path.join(__dirname, "scripts", "open-local.ps1");
    let stdout = "";
    let stderr = "";
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", openerScript],
      {
        env: { ...process.env, BOOKMARK_OPEN_PATH: normalized },
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"]
      }
    );

    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("打开本地项目超时"));
    }, 15000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("error", reject);
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve();
        return;
      }

      const message = [stderr.trim(), stdout.trim()].filter(Boolean).join("\n") || `打开本地项目失败，退出码 ${code}`;
      reject(new Error(message));
    });
  });
}

async function isUrlReachable(url, timeoutMs = 1500) {
  if (!url) return false;

  try {
    await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "manual"
    });
    return true;
  } catch {
    return false;
  }
}

async function waitForUrl(url, { timeoutMs = 25000, intervalMs = 1000 } = {}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isUrlReachable(url, intervalMs)) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

async function readBookmarks() {
  return JSON.parse(await readFile(bookmarksFile, "utf8"));
}

async function writeBookmarks(bookmarks) {
  await ensureDailyBackup();
  await writeFile(bookmarksFile, `${JSON.stringify(bookmarks, null, 2)}\n`, "utf8");
}

async function readTags() {
  return JSON.parse(await readFile(tagsFile, "utf8"));
}

async function writeTags(tags) {
  await ensureDailyBackup();
  await writeFile(tagsFile, `${JSON.stringify([...new Set(tags)], null, 2)}\n`, "utf8");
}

async function readBrowserProfiles() {
  const raw = JSON.parse(await readFile(browserProfilesFile, "utf8"));
  return Array.isArray(raw) ? raw.map(normalizeBrowserProfile) : [];
}

async function writeBrowserProfiles(profiles) {
  await ensureDailyBackup();
  await writeFile(browserProfilesFile, `${JSON.stringify(profiles, null, 2)}\n`, "utf8");
}

async function ensureDailyBackup() {
  if (backupPromise) return backupPromise;
  backupPromise = (async () => {
    const day = new Date().toISOString().slice(0, 10);
    const backupDir = path.join(dataDir, "backups", day);
    await mkdir(backupDir, { recursive: true });
    for (const source of [bookmarksFile, tagsFile, browserProfilesFile]) {
      if (!existsSync(source)) continue;
      const destination = path.join(backupDir, path.basename(source));
      if (!existsSync(destination)) await copyFile(source, destination);
    }
  })();
  return backupPromise;
}

function buildTagSummary(bookmarks, customTags) {
  const counts = new Map();
  for (const bookmark of bookmarks) {
    for (const tag of bookmark.tags || []) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }

  const ordered = [...new Set(customTags.filter(Boolean))];
  const rest = [...counts.keys()]
    .filter((tag) => !ordered.includes(tag))
    .sort((a, b) => a.localeCompare(b, "zh-CN"));

  return [...ordered, ...rest].map((name) => ({ name, count: counts.get(name) || 0 }));
}

async function readJsonBody(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1024 * 1024 * 20) {
      throw new Error("请求体过大");
    }
  }
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(status === 204 ? "" : JSON.stringify(payload));
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function normalizeUrl(value) {
  if (!value || typeof value !== "string") {
    throw new Error("请输入网址");
  }

  const trimmed = value.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withProtocol);
  parsed.hash = "";
  return parsed.toString();
}

function normalizeTags(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((tag) => String(tag).trim()).filter(Boolean))];
  }

  if (typeof value === "string") {
    return [...new Set(value.split(/[,\s，、]+/).map((tag) => tag.trim()).filter(Boolean))];
  }

  return [];
}

function applyCors(req, res) {
  const origin = String(req.headers.origin || "");
  const allowed = !origin
    || origin === `http://127.0.0.1:${PORT}`
    || origin === `http://localhost:${PORT}`
    || /^chrome-extension:\/\/[a-p]{32}$/i.test(origin);
  if (!allowed) return false;
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  return true;
}

function normalizeLaunchTargets(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const targets = [];
  for (const raw of value.slice(0, 8)) {
    const profileId = String(raw?.profileId || "").trim();
    if (!profileId || seen.has(profileId)) continue;
    seen.add(profileId);
    targets.push({
      id: String(raw.id || profileId),
      profileId,
      label: String(raw.label || "").trim().slice(0, 24)
    });
  }
  return targets;
}

function normalizeBrowserProfile(raw, { strict = false } = {}) {
  const executablePath = path.normalize(String(raw?.executablePath || "").trim().replace(/^\"|\"$/g, ""));
  const executableName = path.basename(executablePath).toLowerCase();
  if (!path.isAbsolute(executablePath) || !["chrome.exe", "msedge.exe", "qqbrowser.exe"].includes(executableName)) {
    throw new Error("仅支持 Chrome、Edge 或 QQ 浏览器可执行文件");
  }
  const executableAvailable = existsSync(executablePath);
  if (strict && !executableAvailable) throw new Error("浏览器可执行文件不存在");

  const profileDirectory = String(raw?.profileDirectory || "Default").trim();
  if (!/^[^\\/:*?\"<>|]{1,80}$/.test(profileDirectory)) {
    throw new Error("Profile 目录名称不正确");
  }

  const userDataDirectory = String(raw?.userDataDirectory || "").trim().replace(/^\"|\"$/g, "");
  if (userDataDirectory && (!path.isAbsolute(userDataDirectory) || (strict && !existsSync(userDataDirectory)))) {
    throw new Error("用户数据目录不存在");
  }

  return {
    id: String(raw?.id || crypto.randomUUID()),
    name: String(raw?.name || profileDirectory).trim().slice(0, 32) || profileDirectory,
    browser: executableName === "msedge.exe" ? "edge" : executableName === "qqbrowser.exe" ? "qq" : "chrome",
    executablePath,
    profileDirectory,
    userDataDirectory,
    available: executableAvailable && (!userDataDirectory || existsSync(userDataDirectory))
  };
}

function parseBookmarksHtml(html) {
  const bookmarks = [];
  const folderStack = [];
  const tokenPattern = /<h3\b[^>]*>([\s\S]*?)<\/h3>|<a\b([^>]*)>([\s\S]*?)<\/a>|<\/dl\s*>/gi;
  const ignoredFolders = new Set(["书签栏", "其他书签", "移动设备书签", "Bookmarks Bar", "Other Bookmarks", "Mobile Bookmarks"]);

  for (const match of html.matchAll(tokenPattern)) {
    if (match[1] !== undefined) {
      const folder = cleanText(match[1]);
      if (folder) folderStack.push(folder);
      continue;
    }

    if (match[2] !== undefined) {
      const attrs = parseAttributes(`<a ${match[2]}>`);
      if (!attrs.href) continue;

      let createdAt = undefined;
      if (attrs.add_date && /^\d+$/.test(attrs.add_date)) {
        createdAt = new Date(Number(attrs.add_date) * 1000).toISOString();
      }

      bookmarks.push({
        url: attrs.href,
        title: cleanText(match[3]),
        favicon: attrs.icon || "",
        tags: folderStack.filter((folder) => !ignoredFolders.has(folder)),
        createdAt
      });
      continue;
    }

    if (folderStack.length > 0) folderStack.pop();
  }

  return bookmarks;
}

async function fetchMetadata(url) {
  const parsed = new URL(url);

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(12000),
      headers: {
        "User-Agent": "Mozilla/5.0 BookmarkMasonry/0.3 (+local preview fetcher)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      return metadataFallback(url, parsed, `非 HTML 页面: ${contentType || "未知类型"}`);
    }

    const html = await response.text();
    const metadata = parseHtmlMetadata(html, response.url || url);
    return {
      url,
      host: parsed.hostname.replace(/^www\./, ""),
      title: metadata.title || parsed.hostname,
      description: metadata.description || "",
      image: metadata.image || "",
      favicon: metadata.favicon || `https://${parsed.hostname}/favicon.ico`,
      siteName: metadata.siteName || parsed.hostname.replace(/^www\./, ""),
      fetchedAt: new Date().toISOString()
    };
  } catch (error) {
    return metadataFallback(url, parsed, error.message);
  }
}

function metadataFallback(url, parsed, error) {
  return {
    url,
    host: parsed.hostname.replace(/^www\./, ""),
    title: parsed.hostname.replace(/^www\./, ""),
    description: "",
    image: "",
    favicon: `https://${parsed.hostname}/favicon.ico`,
    siteName: parsed.hostname.replace(/^www\./, ""),
    fetchedAt: new Date().toISOString(),
    warning: error
  };
}

function parseHtmlMetadata(html, baseUrl) {
  const title = getMeta(html, ["og:title", "twitter:title"]) || getTitle(html);
  const description = getMeta(html, ["description", "og:description", "twitter:description"]);
  const siteName = getMeta(html, ["og:site_name", "application-name"]);
  const image = absolutize(
    getMeta(html, ["og:image", "og:image:url", "twitter:image", "twitter:image:src"]) || getLinkImage(html),
    baseUrl
  );
  const favicon = absolutize(getLink(html, ["icon", "shortcut icon", "apple-touch-icon", "mask-icon"]), baseUrl);

  return {
    title: cleanText(title),
    description: cleanText(description),
    siteName: cleanText(siteName),
    image,
    favicon
  };
}

function getTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeEntities(stripTags(match[1])) : "";
}

function getMeta(html, names) {
  const metaMatches = html.matchAll(/<meta\s+[^>]*>/gi);
  const wanted = new Set(names.map((name) => name.toLowerCase()));

  for (const match of metaMatches) {
    const attrs = parseAttributes(match[0]);
    const key = (attrs.property || attrs.name || attrs.itemprop || "").toLowerCase();
    if (wanted.has(key) && attrs.content) return decodeEntities(attrs.content);
  }

  return "";
}

function getLink(html, relNames) {
  const linkMatches = html.matchAll(/<link\s+[^>]*>/gi);
  const wanted = relNames.map((name) => name.toLowerCase());

  for (const match of linkMatches) {
    const attrs = parseAttributes(match[0]);
    const rel = (attrs.rel || "").toLowerCase();
    if (attrs.href && wanted.some((name) => rel.includes(name))) return decodeEntities(attrs.href);
  }

  return "";
}

function getLinkImage(html) {
  for (const match of html.matchAll(/<img\s+[^>]*>/gi)) {
    const attrs = parseAttributes(match[0]);
    const src = attrs.src || attrs["data-src"] || attrs["data-original"];
    if (src && !src.startsWith("data:")) return decodeEntities(src);
  }
  return "";
}

function parseAttributes(tag) {
  const attrs = {};
  const attrMatches = tag.matchAll(/([a-zA-Z_:.-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g);
  for (const match of attrMatches) {
    attrs[match[1].toLowerCase()] = match[3] ?? match[4] ?? match[5] ?? "";
  }
  return attrs;
}

function absolutize(value, baseUrl) {
  if (!value) return "";
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return "";
  }
}

function cleanText(value) {
  return decodeEntities(stripTags(value || "")).replace(/\s+/g, " ").trim();
}

function stripTags(value) {
  return String(value).replace(/<[^>]*>/g, "");
}

function decodeEntities(value) {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

async function capturePreview(url, id) {
  const chromePath = findChromeExecutable();
  if (!chromePath) return "";

  const fileName = `${id}.png`;
  const filePath = path.join(previewDir, fileName);
  const tempRoot = path.join(os.tmpdir(), "bookmark-masonry");
  const profileDir = path.join(tempRoot, "chrome-profile", id);
  const tempPreviewDir = path.join(tempRoot, "previews");
  const tempFilePath = path.join(tempPreviewDir, fileName);
  await mkdir(profileDir, { recursive: true });
  await mkdir(tempPreviewDir, { recursive: true });

  for (const headlessFlag of ["--headless=new", "--headless"]) {
    const args = [
      headlessFlag,
      "--disable-gpu",
      "--disable-extensions",
      "--disable-crash-reporter",
      "--disable-dev-shm-usage",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      "--no-sandbox",
      `--user-data-dir=${profileDir}`,
      "--window-size=1366,900",
      `--screenshot=${tempFilePath}`,
      url
    ];

    try {
      await removeFileIfExists(tempFilePath);
      await runProcess(chromePath, args, PREVIEW_TIMEOUT_MS);
      const info = await stat(tempFilePath);
      if (info.size <= 1024) continue;
      await copyFile(tempFilePath, filePath);
      return `/previews/${fileName}`;
    } catch (error) {
      console.warn(`Preview capture failed for ${url} with ${headlessFlag}: ${error.message}`);
    }
  }

  await removeFileIfExists(filePath);
  await removeFileIfExists(tempFilePath);
  return "";
}

async function saveManualPreview(id, dataUrl) {
  const match = String(dataUrl || "").match(/^data:(image\/png|image\/jpeg|image\/webp|image\/gif);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) {
    throw new Error("请上传 PNG、JPG、WEBP 或 GIF 图片");
  }

  const mime = match[1].toLowerCase();
  const ext = mime === "image/jpeg" ? "jpg" : mime.split("/")[1];
  const bytes = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (bytes.length < 100) {
    throw new Error("图片文件无效");
  }
  if (bytes.length > 8 * 1024 * 1024) {
    throw new Error("图片不能超过 8MB");
  }

  const fileName = `${id}-manual-${Date.now().toString(36)}.${ext}`;
  const filePath = path.join(previewDir, fileName);
  await writeFile(filePath, bytes);
  return `/previews/${fileName}`;
}

function findChromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe"),
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    path.join(process.env.LOCALAPPDATA || "", "Microsoft\\Edge\\Application\\msedge.exe")
  ].filter(Boolean);

  return candidates.find((candidate) => existsSync(candidate)) || "";
}

function detectChromiumBrowsers() {
  const candidates = [
    { browser: "chrome", name: "Google Chrome", paths: [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe")
    ] },
    { browser: "edge", name: "Microsoft Edge", paths: [
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      path.join(process.env.LOCALAPPDATA || "", "Microsoft\\Edge\\Application\\msedge.exe")
    ] },
    { browser: "qq", name: "QQ Browser", paths: [
      path.join(process.env.LOCALAPPDATA || "", "Tencent\\QQBrowser\\QQBrowser.exe"),
      "C:\\Program Files\\Tencent\\QQBrowser\\QQBrowser.exe",
      "C:\\Program Files (x86)\\Tencent\\QQBrowser\\QQBrowser.exe"
    ] }
  ];

  return candidates.flatMap((candidate) => {
    const executablePath = candidate.paths.filter(Boolean).find((item) => existsSync(item));
    return executablePath ? [{ browser: candidate.browser, name: candidate.name, executablePath }] : [];
  });
}

async function launchInBrowserProfile(profile, url) {
  const safeProfile = normalizeBrowserProfile(profile, { strict: true });
  const safeUrl = normalizeUrl(url);
  const args = [];
  if (safeProfile.userDataDirectory) args.push(`--user-data-dir=${safeProfile.userDataDirectory}`);
  args.push(`--profile-directory=${safeProfile.profileDirectory}`, safeUrl);

  await new Promise((resolve, reject) => {
    const child = spawn(safeProfile.executablePath, args, {
      detached: true,
      windowsHide: true,
      stdio: "ignore",
      shell: false
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

function runProcess(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "ignore" });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("截图超时"));
    }, timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`Chrome 退出码 ${code}`));
    });
  });
}

async function removeLocalPreview(image) {
  if (!image?.startsWith("/previews/")) return;
  await removeFileIfExists(path.join(previewDir, image.slice("/previews/".length)));
}

async function removeFileIfExists(filePath) {
  try {
    await unlink(filePath);
  } catch {
    // Nothing to remove.
  }
}
