const MAX_BYTES = 2 * 1024 * 1024;
const MAX_DIMENSION = 1200;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export async function prepareTokenImage(file: File): Promise<File> {
  if (!ACCEPTED.includes(file.type)) {
    throw new Error("Use a PNG, JPG, WebP, or GIF image");
  }

  if (file.type === "image/gif") {
    if (file.size > MAX_BYTES) throw new Error("GIF must be 2MB or smaller");
    return file;
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image compression is unavailable");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.84),
  );
  if (!blob) throw new Error("Could not compress image");
  if (blob.size > MAX_BYTES) {
    throw new Error("Compressed image is still larger than 2MB");
  }
  return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.webp`, {
    type: "image/webp",
  });
}
