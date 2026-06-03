/**
 * Client-Side Image Resizer & Compressor
 * Resizes images to reasonable web-dimensions (e.g. max 1200px) and compresses them to JPEG
 * dramatically reducing memory footprints, local storage limits issues, and upload speeds.
 */
export function resizeAndCompressImage(
  base64Str: string,
  maxWidth = 1200,
  maxHeight = 1200,
  quality = 0.75
): Promise<string> {
  // If the string is empty or not a data URL, return as-is
  if (!base64Str || !base64Str.startsWith("data:image")) {
    return Promise.resolve(base64Str);
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      // Keep original dimensions if they are already smaller than coordinates
      if (width > maxWidth || height > maxHeight) {
        if (width > height) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(base64Str); // fallback to original
        return;
      }

      // Fill with transparent or white background if jpg conversion needs (avoid black backgrounds in transparency)
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, width, height);

      ctx.drawImage(img, 0, 0, width, height);
      
      // Convert to JPEG format with chosen quality
      try {
        const compressed = canvas.toDataURL("image/jpeg", quality);
        resolve(compressed);
      } catch (err) {
        console.warn("Canvas export failed, using generic base64", err);
        resolve(base64Str); // Fallback to original
      }
    };

    img.onerror = (err) => {
      console.warn("Failed to load image for compression, falling back to original", err);
      resolve(base64Str); // Fail-safe: fallback to original to prevent user stuck-state
    };
  });
}
