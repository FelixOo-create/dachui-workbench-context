import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");

test("local service preserves bookmarks and browser profile contracts", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "bookmark-workbench-test-"));
  const dataDir = path.join(root, "data");
  const previewDir = path.join(root, "previews");
  const port = 41973;
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["server.js"], {
    cwd: projectRoot,
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", BOOKMARK_DATA_DIR: dataDir, BOOKMARK_PREVIEW_DIR: previewDir },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  context.after(() => child.kill());
  await waitForHealth(base, child);

  const health = await json(base, "/api/health");
  assert.equal(health.ok, true);
  assert.equal(health.serviceId, "dachui-workbench-bookmarks");
  assert.equal(health.bookmarkCount, 0);

  const blocked = await fetch(`${base}/api/health`, { headers: { Origin: "https://example.org" } });
  assert.equal(blocked.status, 403);

  const tagData = await json(base, "/api/tags", { method: "POST", body: JSON.stringify({ tag: "工具" }) }, 201);
  assert.equal(tagData.tags[0].name, "工具");

  const created = await json(base, "/api/bookmarks", {
    method: "POST",
    body: JSON.stringify({ url: `${base}/`, title: "本地测试站点", tags: "工具" })
  }, 201);
  assert.deepEqual(created.bookmark.launchTargets, []);

  const duplicate = await fetch(`${base}/api/bookmarks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: `${base}/` })
  });
  assert.equal(duplicate.status, 409);

  const profileData = await json(base, "/api/browser-profiles");
  if (profileData.detectedBrowsers.length) {
    const browser = profileData.detectedBrowsers[0];
    const profiles = [{
      id: "profile-main",
      name: "主账号",
      browser: browser.browser,
      executablePath: browser.executablePath,
      profileDirectory: "Default",
      userDataDirectory: ""
    }];
    const saved = await json(base, "/api/browser-profiles", { method: "PUT", body: JSON.stringify({ profiles }) });
    assert.equal(saved.profiles[0].id, "profile-main");
    const updated = await json(base, `/api/bookmarks/${created.bookmark.id}`, {
      method: "PUT",
      body: JSON.stringify({ launchTargets: [{ id: "main", profileId: "profile-main", label: "主账号" }] })
    });
    assert.equal(updated.bookmark.launchTargets[0].profileId, "profile-main");

    await writeFile(path.join(dataDir, "browser-profiles.json"), JSON.stringify([
      { ...profiles[0], executablePath: "C:\\Missing\\chrome.exe" }
    ]), "utf8");
    const staleProfiles = await json(base, "/api/browser-profiles");
    assert.equal(staleProfiles.profiles[0].available, false);
    assert.equal((await json(base, "/api/health")).ok, true);
  }

  const exported = await json(base, "/api/export");
  assert.equal(exported.bookmarks.length, 1);
  assert.equal(exported.tags[0], "工具");
  const stored = JSON.parse(await readFile(path.join(dataDir, "bookmarks.json"), "utf8"));
  assert.equal(stored[0].title, "本地测试站点");
});

async function json(base, pathname, options = {}, expected = 200) {
  const response = await fetch(`${base}${pathname}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const data = await response.json();
  assert.equal(response.status, expected, JSON.stringify(data));
  return data;
}

async function waitForHealth(base, child) {
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  for (let index = 0; index < 50; index += 1) {
    if (child.exitCode !== null) throw new Error(`server exited early: ${stderr}`);
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`server did not become healthy: ${stderr}`);
}
