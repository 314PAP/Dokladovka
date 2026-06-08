import { Area } from 'react-easy-crop';

export async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<string> {
  const image = new Image();
  image.src = imageSrc;
  await new Promise((resolve) => (image.onload = resolve));

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('No 2d context');
  }

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  return canvas.toDataURL('image/jpeg');
}

export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().slice(0, 9).toUpperCase();
  }
  return Math.random().toString(36).substring(2, 11).toUpperCase();
}

export function mergeReceipts<T extends { id: string }>(local: T[], server: T[]): T[] {
  const map = new Map<string, T>();
  local.forEach(item => map.set(item.id, item));
  server.forEach(item => map.set(item.id, item));
  return Array.from(map.values());
}

export function mergeDocuments<T extends { id: string }>(local: T[], server: T[]): T[] {
  const map = new Map<string, T>();
  local.forEach(item => map.set(item.id, item));
  server.forEach(item => map.set(item.id, item));
  return Array.from(map.values());
}