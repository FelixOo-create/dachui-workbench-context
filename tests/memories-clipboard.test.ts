import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findClipboardImageType, validateClipboardImage } from "../src/renderer/memories/coverClipboard";

const projectRoot = path.resolve(__dirname, "..");
const editorSource = () => fs.readFileSync(path.join(projectRoot, "src/renderer/memories/MemoryJournal.tsx"), "utf8");
const coverStyles = () => fs.readFileSync(path.join(projectRoot, "src/renderer/memories/MemoryJournal.css"), "utf8");

describe("memory cover clipboard flow", () => {
  it("accepts supported clipboard images and rejects empty, unsupported, or oversized input", () => {
    expect(findClipboardImageType(["text/plain", "image/png"])).toBe("image/png");
    expect(findClipboardImageType(["text/plain"])).toBeNull();
    expect(() => validateClipboardImage("image/png", 128)).not.toThrow();
    expect(() => validateClipboardImage("image/bmp", 128)).toThrow("格式不受支持");
    expect(() => validateClipboardImage("image/png", 0)).toThrow("剪贴板中没有图片");
    expect(() => validateClipboardImage("image/png", 8 * 1024 * 1024 + 1)).toThrow("超过 8MB");
  });

  it("keeps explicit click and Ctrl+V entry points while removing online cover UI", () => {
    const source = editorSource();
    expect(source).toContain("onClick={() => void pasteFromClipboard()}");
    expect(source).toContain("粘贴剪贴板图片");
    expect(source).toContain("onPaste={pasteCover}");
    expect(source).toContain("复制图片后点击粘贴，或按 Ctrl+V");
    expect(source).not.toContain("搜索封面");
    expect(source).not.toContain("TMDB Token");
    expect(source).not.toContain("Open Library");
  });

  it("does not let plain text clipboard input enter the image paste flow", () => {
    const source = editorSource();
    const returnIndex = source.indexOf("if (!imageType) return;");
    const preventDefaultIndex = source.indexOf("event.preventDefault();", returnIndex);
    expect(findClipboardImageType(["text/plain"])).toBeNull();
    expect(findClipboardImageType(["image/png"])).toBe("image/png");
    expect(returnIndex).toBeGreaterThanOrEqual(0);
    expect(preventDefaultIndex).toBeGreaterThan(returnIndex);
  });

  it("keeps cover changes in draft state until save and supports saving without a cover", () => {
    const source = editorSource();
    expect(source).toContain("coverDataUrl: dataUrl");
    expect(source).toContain("await memoriesApi.save(input)");
    expect(source).toContain("没有封面也可以保存");
    expect(source).toContain("removeCover: true");
  });

  it("keeps loaded card thumbnails visible even when the load state arrives late", () => {
    const styles = coverStyles();
    expect(styles).toContain(".memory-v2-cover img {");
    expect(styles).toContain(".memory-v2-cover img.loaded { opacity: 1; }");
  });

  it("syncs an already-complete image before the first paint", () => {
    const source = editorSource();
    expect(source).toContain("useLayoutEffect");
    expect(source).toContain("image?.complete && image.naturalWidth > 0");
    expect(source).toContain("ref={imageRef}");
  });
});
