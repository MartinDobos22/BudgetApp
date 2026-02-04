import Jimp from "jimp";
import QrCode from "qrcode-reader";
import jsQR from "jsqr";
import { fetchWithTimeout } from "../utils/http.js";

function decodeWithQrReader(jimpImage) {
  return new Promise((resolve, reject) => {
    const qr = new QrCode();
    qr.callback = (err, value) => {
      if (err) return reject(err);
      resolve(value?.result || null);
    };
    qr.decode(jimpImage.bitmap);
  });
}

function decodeWithJsQr(jimpImage) {
  const { data, width, height } = jimpImage.bitmap;
  const clamped = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
  const result = jsQR(clamped, width, height);
  return result?.data ? String(result.data) : null;
}

function applyThreshold(jimpImage, threshold = 170) {
  const { data, width, height } = jimpImage.bitmap;
  jimpImage.scan(0, 0, width, height, (x, y, idx) => {
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const v = (r + g + b) / 3;
    const t = v >= threshold ? 255 : 0;
    data[idx] = t;
    data[idx + 1] = t;
    data[idx + 2] = t;
  });
  return jimpImage;
}

function applyOtsuThreshold(jimpImage) {
  const { data, width, height } = jimpImage.bitmap;
  const histogram = new Array(256).fill(0);

  for (let idx = 0; idx < data.length; idx += 4) {
    const v = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
    histogram[Math.round(v)] += 1;
  }

  const total = width * height;
  let sumAll = 0;
  for (let i = 0; i < 256; i += 1) {
    sumAll += i * histogram[i];
  }

  let sumB = 0;
  let wB = 0;
  let maxVariance = 0;
  let threshold = 127;

  for (let i = 0; i < 256; i += 1) {
    wB += histogram[i];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;

    sumB += i * histogram[i];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const betweenVar = wB * wF * (mB - mF) * (mB - mF);

    if (betweenVar > maxVariance) {
      maxVariance = betweenVar;
      threshold = i;
    }
  }

  return applyThreshold(jimpImage, threshold);
}

function applyAdaptiveThreshold(jimpImage, windowSize = 25, c = 6) {
  const { data, width, height } = jimpImage.bitmap;
  const size = Math.max(3, windowSize | 0);
  const window = size % 2 === 0 ? size + 1 : size;
  const half = Math.floor(window / 2);
  const integral = new Uint32Array((width + 1) * (height + 1));

  for (let y = 1; y <= height; y += 1) {
    let rowSum = 0;
    for (let x = 1; x <= width; x += 1) {
      const idx = ((y - 1) * width + (x - 1)) * 4;
      const v = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      rowSum += v;
      const integralIndex = y * (width + 1) + x;
      integral[integralIndex] = integral[integralIndex - (width + 1)] + rowSum;
    }
  }

  for (let y = 0; y < height; y += 1) {
    const y1 = Math.max(0, y - half);
    const y2 = Math.min(height - 1, y + half);
    const y1i = y1;
    const y2i = y2 + 1;

    for (let x = 0; x < width; x += 1) {
      const x1 = Math.max(0, x - half);
      const x2 = Math.min(width - 1, x + half);
      const x1i = x1;
      const x2i = x2 + 1;
      const area = (x2 - x1 + 1) * (y2 - y1 + 1);
      const sum =
        integral[y2i * (width + 1) + x2i] -
        integral[y1i * (width + 1) + x2i] -
        integral[y2i * (width + 1) + x1i] +
        integral[y1i * (width + 1) + x1i];
      const mean = sum / area;
      const idx = (y * width + x) * 4;
      const v = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      const t = v >= mean - c ? 255 : 0;
      data[idx] = t;
      data[idx + 1] = t;
      data[idx + 2] = t;
    }
  }

  return jimpImage;
}

function applyAutoLevels(jimpImage, lowPercent = 0.01, highPercent = 0.99) {
  const { data, width, height } = jimpImage.bitmap;
  const histogram = new Array(256).fill(0);

  for (let idx = 0; idx < data.length; idx += 4) {
    const v = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
    histogram[Math.round(v)] += 1;
  }

  const total = width * height;
  const lowTarget = total * lowPercent;
  const highTarget = total * highPercent;
  let cumulative = 0;
  let low = 0;

  for (let i = 0; i < 256; i += 1) {
    cumulative += histogram[i];
    if (cumulative >= lowTarget) {
      low = i;
      break;
    }
  }

  cumulative = 0;
  let high = 255;
  for (let i = 255; i >= 0; i -= 1) {
    cumulative += histogram[i];
    if (cumulative >= total - highTarget) {
      high = i;
      break;
    }
  }

  if (high <= low) return jimpImage;

  const scale = 255 / (high - low);
  jimpImage.scan(0, 0, width, height, (x, y, idx) => {
    const v = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
    const stretched = Math.max(0, Math.min(255, Math.round((v - low) * scale)));
    data[idx] = stretched;
    data[idx + 1] = stretched;
    data[idx + 2] = stretched;
  });

  return jimpImage;
}

function applySharpen(jimpImage) {
  return jimpImage.convolute([
    [0, -1, 0],
    [-1, 5, -1],
    [0, -1, 0],
  ]);
}

function applyBlur(jimpImage, radius = 1) {
  const size = Math.max(1, radius | 0);
  return jimpImage.blur(size);
}

function applyMedianFilter(jimpImage, radius = 1) {
  const { data, width, height } = jimpImage.bitmap;
  const source = new Uint8ClampedArray(data);
  const size = Math.max(1, radius | 0);
  const window = size * 2 + 1;
  const windowArea = window * window;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const samples = new Array(windowArea);
      let i = 0;

      for (let dy = -size; dy <= size; dy += 1) {
        const yy = Math.max(0, Math.min(height - 1, y + dy));
        for (let dx = -size; dx <= size; dx += 1) {
          const xx = Math.max(0, Math.min(width - 1, x + dx));
          const idx = (yy * width + xx) * 4;
          const v = (source[idx] + source[idx + 1] + source[idx + 2]) / 3;
          samples[i] = v;
          i += 1;
        }
      }

      samples.sort((a, b) => a - b);
      const median = samples[Math.floor(samples.length / 2)];
      const idx = (y * width + x) * 4;
      data[idx] = median;
      data[idx + 1] = median;
      data[idx + 2] = median;
    }
  }

  return jimpImage;
}

function applyDilation(jimpImage, radius = 1, threshold = 128) {
  const { data, width, height } = jimpImage.bitmap;
  const source = new Uint8ClampedArray(data);
  const size = Math.max(1, radius | 0);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let hasBlack = false;
      for (let dy = -size; dy <= size && !hasBlack; dy += 1) {
        const yy = Math.max(0, Math.min(height - 1, y + dy));
        for (let dx = -size; dx <= size; dx += 1) {
          const xx = Math.max(0, Math.min(width - 1, x + dx));
          const idx = (yy * width + xx) * 4;
          if (source[idx] < threshold) {
            hasBlack = true;
            break;
          }
        }
      }
      const idx = (y * width + x) * 4;
      const value = hasBlack ? 0 : 255;
      data[idx] = value;
      data[idx + 1] = value;
      data[idx + 2] = value;
    }
  }

  return jimpImage;
}

function applyErosion(jimpImage, radius = 1, threshold = 128) {
  const { data, width, height } = jimpImage.bitmap;
  const source = new Uint8ClampedArray(data);
  const size = Math.max(1, radius | 0);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let hasWhite = false;
      for (let dy = -size; dy <= size && !hasWhite; dy += 1) {
        const yy = Math.max(0, Math.min(height - 1, y + dy));
        for (let dx = -size; dx <= size; dx += 1) {
          const xx = Math.max(0, Math.min(width - 1, x + dx));
          const idx = (yy * width + xx) * 4;
          if (source[idx] >= threshold) {
            hasWhite = true;
            break;
          }
        }
      }
      const idx = (y * width + x) * 4;
      const value = hasWhite ? 255 : 0;
      data[idx] = value;
      data[idx + 1] = value;
      data[idx + 2] = value;
    }
  }

  return jimpImage;
}

function applyMorphClose(jimpImage, radius = 1, threshold = 128) {
  applyDilation(jimpImage, radius, threshold);
  return applyErosion(jimpImage, radius, threshold);
}

function findQrRoi(jimpImage) {
  const { data, width, height } = jimpImage.bitmap;
  const clamped = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
  const result = jsQR(clamped, width, height);
  if (!result?.location) return null;

  const points = [
    result.location.topLeftCorner,
    result.location.topRightCorner,
    result.location.bottomRightCorner,
    result.location.bottomLeftCorner,
  ];

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.max(0, Math.floor(Math.min(...xs)));
  const minY = Math.max(0, Math.floor(Math.min(...ys)));
  const maxX = Math.min(width, Math.ceil(Math.max(...xs)));
  const maxY = Math.min(height, Math.ceil(Math.max(...ys)));

  let x = minX;
  let y = minY;
  let w = maxX - minX;
  let h = maxY - minY;

  if (w <= 0 || h <= 0) return null;

  const padX = Math.round(w * 0.12);
  const padY = Math.round(h * 0.12);

  x = Math.max(0, x - padX);
  y = Math.max(0, y - padY);
  w = Math.min(width - x, w + padX * 2);
  h = Math.min(height - y, h + padY * 2);

  if (w <= 0 || h <= 0) return null;

  return { x, y, w, h };
}

async function buildOcrVariants(buffer) {
  const img = await Jimp.read(buffer);
  const width = img.bitmap.width;
  const height = img.bitmap.height;

  const variants = [
    { label: "orig", image: img.clone() },
    { label: "denoise", image: applyMedianFilter(img.clone().greyscale()) },
    {
      label: "upscale",
      image: applyMedianFilter(img.clone().greyscale()).resize(width * 2, height * 2, Jimp.RESIZE_BICUBIC),
    },
  ];

  const buffers = [];
  for (const variant of variants) {
    const content = await variant.image.getBufferAsync(Jimp.MIME_PNG);
    buffers.push({ label: variant.label, buffer: content });
  }

  return buffers;
}

async function decodeWithGoogleVision(buffer, { apiKey, logStep }) {
  if (!apiKey) return null;

  try {
    const variants = await buildOcrVariants(buffer);

    for (const variant of variants) {
      const resp = await fetchWithTimeout(
        `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requests: [
              {
                image: { content: variant.buffer.toString("base64") },
                features: [{ type: "BARCODE_DETECTION" }, { type: "DOCUMENT_TEXT_DETECTION" }],
              },
            ],
          }),
        },
        12000,
      );

      if (!resp.ok) {
        continue;
      }

      const payload = await resp.json();
      const barcodeAnnotation = payload?.responses?.[0]?.barcodeAnnotations?.[0]?.rawValue;
      if (barcodeAnnotation) {
        logStep?.("ocr", "Google Vision OCR succeeded", { variant: variant.label, source: "barcode" });
        return { text: String(barcodeAnnotation).trim(), source: "barcode", variant: variant.label };
      }

      const textAnnotation = payload?.responses?.[0]?.textAnnotations?.[0]?.description;
      if (textAnnotation) {
        logStep?.("ocr", "Google Vision OCR succeeded", { variant: variant.label, source: "text" });
        return { text: String(textAnnotation).trim(), source: "text", variant: variant.label };
      }
    }

    return null;
  } catch (err) {
    return null;
  }
}

export async function decodeQrFromBuffer(buffer, { googleVisionApiKey, logStep } = {}) {
  const img = await Jimp.read(buffer);
  const roiDetectionImage = img.clone().greyscale().normalize();
  const roi = findQrRoi(roiDetectionImage);

  if (roi) {
    logStep?.("qr", "ROI detected for QR decode", roi);
    const roiImg = img.clone().crop(roi.x, roi.y, roi.w, roi.h);
    const roiVariants = [
      { label: "roi-orig", make: () => roiImg.clone() },
      { label: "roi-auto-levels", make: () => applyAutoLevels(roiImg.clone().greyscale()) },
      { label: "roi-otsu", make: () => applyOtsuThreshold(roiImg.clone().greyscale()) },
      {
        label: "roi-otsu-close-1",
        make: () => applyMorphClose(applyOtsuThreshold(roiImg.clone().greyscale()), 1),
      },
      {
        label: "roi-otsu-close-2",
        make: () => applyMorphClose(applyOtsuThreshold(roiImg.clone().greyscale()), 2),
      },
      {
        label: "roi-otsu-dilate-2",
        make: () => applyDilation(applyOtsuThreshold(roiImg.clone().greyscale()), 2),
      },
      { label: "roi-adaptive-mean-25", make: () => applyAdaptiveThreshold(roiImg.clone().greyscale(), 25, 6) },
      {
        label: "roi-adaptive-mean-25-close-1",
        make: () => applyMorphClose(applyAdaptiveThreshold(roiImg.clone().greyscale(), 25, 6), 1),
      },
      { label: "roi-gray-contrast", make: () => roiImg.clone().greyscale().contrast(0.4).normalize() },
      { label: "roi-gray-sharpen", make: () => applySharpen(roiImg.clone().greyscale().normalize()) },
      {
        label: "roi-gray-blur-2-otsu",
        make: () => applyOtsuThreshold(applyBlur(roiImg.clone().greyscale().normalize(), 2)),
      },
      { label: "roi-threshold-170", make: () => applyThreshold(roiImg.clone().greyscale().normalize(), 170) },
      {
        label: "roi-threshold-170-close-1",
        make: () => applyMorphClose(applyThreshold(roiImg.clone().greyscale().normalize(), 170), 1),
      },
      {
        label: "roi-threshold-170-close-2",
        make: () => applyMorphClose(applyThreshold(roiImg.clone().greyscale().normalize(), 170), 2),
      },
      {
        label: "roi-threshold-170-dilate-2",
        make: () => applyDilation(applyThreshold(roiImg.clone().greyscale().normalize(), 170), 2),
      },
      {
        label: "roi-threshold-170-dilate-3",
        make: () => applyDilation(applyThreshold(roiImg.clone().greyscale().normalize(), 170), 3),
      },
    ];

    for (const variant of roiVariants) {
      try {
        const variantImage = variant.make();
        const jsQrText = decodeWithJsQr(variantImage);
        if (jsQrText) return { text: jsQrText, source: "qr-jsqr", variant: variant.label };
        const readerText = await decodeWithQrReader(variantImage);
        if (readerText) return { text: readerText, source: "qr-reader", variant: variant.label };
      } catch {}
    }
  } else {
    logStep?.("qr", "ROI not found for QR decode");
  }

  const variants = [
    { label: "orig", make: () => img.clone() },
    { label: "gray-auto-levels", make: () => applyAutoLevels(img.clone().greyscale()) },
    { label: "gray-auto-levels-invert", make: () => applyAutoLevels(img.clone().greyscale().invert()) },
    { label: "gray-otsu", make: () => applyOtsuThreshold(img.clone().greyscale()) },
    { label: "gray-otsu-close-1", make: () => applyMorphClose(applyOtsuThreshold(img.clone().greyscale()), 1) },
    { label: "gray-otsu-close-2", make: () => applyMorphClose(applyOtsuThreshold(img.clone().greyscale()), 2) },
    { label: "gray-otsu-dilate-2", make: () => applyDilation(applyOtsuThreshold(img.clone().greyscale()), 2) },
    { label: "gray-adaptive-mean-25", make: () => applyAdaptiveThreshold(img.clone().greyscale(), 25, 6) },
    {
      label: "gray-adaptive-mean-25-close-1",
      make: () => applyMorphClose(applyAdaptiveThreshold(img.clone().greyscale(), 25, 6), 1),
    },
    { label: "gray-adaptive-mean-45", make: () => applyAdaptiveThreshold(img.clone().greyscale(), 45, 8) },
    { label: "gray-contrast", make: () => img.clone().greyscale().contrast(0.4).normalize() },
    { label: "gray-invert", make: () => img.clone().greyscale().invert().contrast(0.4).normalize() },
    { label: "gray-autocrop", make: () => img.clone().greyscale().normalize().autocrop({ tolerance: 0.2 }) },
    {
      label: "gray-autocrop-contrast",
      make: () => img.clone().greyscale().normalize().autocrop({ tolerance: 0.2 }).contrast(0.5),
    },
    { label: "gray-sharpen", make: () => applySharpen(img.clone().greyscale().normalize()) },
    {
      label: "gray-blur-2-otsu",
      make: () => applyOtsuThreshold(applyBlur(img.clone().greyscale().normalize(), 2)),
    },
    { label: "threshold-140", make: () => applyThreshold(img.clone().greyscale().normalize(), 140) },
    { label: "threshold-160", make: () => applyThreshold(img.clone().greyscale().normalize(), 160) },
    { label: "threshold-200", make: () => applyThreshold(img.clone().greyscale().normalize(), 200) },
    {
      label: "threshold-160-close-1",
      make: () => applyMorphClose(applyThreshold(img.clone().greyscale().normalize(), 160), 1),
    },
    {
      label: "threshold-160-close-2",
      make: () => applyMorphClose(applyThreshold(img.clone().greyscale().normalize(), 160), 2),
    },
    {
      label: "threshold-160-dilate-2",
      make: () => applyDilation(applyThreshold(img.clone().greyscale().normalize(), 160), 2),
    },
    {
      label: "threshold-160-dilate-3",
      make: () => applyDilation(applyThreshold(img.clone().greyscale().normalize(), 160), 3),
    },
    {
      label: "gray-blur-2-threshold-160",
      make: () => applyThreshold(applyBlur(img.clone().greyscale().normalize(), 2), 160),
    },
    {
      label: "threshold-1600",
      make: () => applyThreshold(img.clone().greyscale().resize(1600, Jimp.AUTO).normalize(), 170),
    },
    {
      label: "threshold-2000",
      make: () => applyThreshold(img.clone().greyscale().resize(2000, Jimp.AUTO).normalize(), 190),
    },
    {
      label: "threshold-2000-sharpen",
      make: () => applySharpen(applyThreshold(img.clone().greyscale().resize(2000, Jimp.AUTO).normalize(), 180)),
    },
    { label: "resize-600", make: () => img.clone().greyscale().resize(600, Jimp.AUTO).contrast(0.3).normalize() },
    { label: "resize-900", make: () => img.clone().greyscale().resize(900, Jimp.AUTO).contrast(0.4).normalize() },
    {
      label: "resize-1200",
      make: () => img.clone().greyscale().resize(1200, Jimp.AUTO).contrast(0.5).normalize(),
    },
    {
      label: "resize-1400",
      make: () => img.clone().greyscale().resize(1400, Jimp.AUTO).contrast(0.6).normalize(),
    },
    {
      label: "resize-1800",
      make: () => img.clone().greyscale().resize(1800, Jimp.AUTO).contrast(0.8).normalize(),
    },
    {
      label: "resize-2400",
      make: () => img.clone().greyscale().resize(2400, Jimp.AUTO).contrast(0.8).normalize(),
    },
    {
      label: "resize-2400-sharpen",
      make: () => applySharpen(img.clone().greyscale().resize(2400, Jimp.AUTO).contrast(0.8).normalize()),
    },
    { label: "rotate-5", make: () => img.clone().rotate(5).greyscale().contrast(0.4).normalize() },
    { label: "rotate--5", make: () => img.clone().rotate(-5).greyscale().contrast(0.4).normalize() },
    { label: "rotate-90", make: () => img.clone().rotate(90).greyscale().contrast(0.4).normalize() },
    { label: "rotate-180", make: () => img.clone().rotate(180).greyscale().contrast(0.4).normalize() },
    { label: "rotate-270", make: () => img.clone().rotate(270).greyscale().contrast(0.4).normalize() },
  ];

  for (const variant of variants) {
    try {
      const variantImage = variant.make();
      const jsQrText = decodeWithJsQr(variantImage);
      if (jsQrText) return { text: jsQrText, source: "qr-jsqr", variant: variant.label };
      const readerText = await decodeWithQrReader(variantImage);
      if (readerText) return { text: readerText, source: "qr-reader", variant: variant.label };
    } catch {}
  }

  if (googleVisionApiKey) {
    const ocrResult = await decodeWithGoogleVision(buffer, { apiKey: googleVisionApiKey, logStep });
    if (ocrResult?.text) {
      const source = ocrResult.source === "barcode" ? "ocr-barcode" : "ocr-text";
      return { text: ocrResult.text, source, variant: ocrResult.variant || "google_vision" };
    }
  }

  return null;
}
