const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"]);

export function findClipboardImageType(types: readonly string[]): string | null {
  return types.find((type) => type.toLocaleLowerCase().startsWith("image/")) ?? null;
}

export function validateClipboardImage(type: string, size: number): void {
  if (!SUPPORTED_IMAGE_TYPES.has(type.toLocaleLowerCase())) throw new Error("剪贴板图片格式不受支持");
  if (size <= 0) throw new Error("剪贴板中没有图片");
  if (size > MAX_IMAGE_BYTES) throw new Error("剪贴板图片超过 8MB");
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("无法读取剪贴板图片"));
    reader.onerror = () => reject(new Error("无法读取剪贴板图片"));
    reader.readAsDataURL(blob);
  });
}
