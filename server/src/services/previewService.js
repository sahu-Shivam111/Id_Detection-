import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";

ffmpeg.setFfmpegPath(ffmpegPath);

const STYLE = {
  visible: { color: "#10B981", text: "ID visible" },
  suspected: { color: "#F59E0B", text: "No ID?" },
  missing: { color: "#EF4444", text: "NO ID" },
  uncertain: { color: "#94A3B8", text: "?" },
};
const BADGE_STYLE = { color: "#06B6D4" };
const LANYARD_STYLE = { color: "#A855F7" };
const TEXT_STATUS_LABELS = {
  company_text_match: "MATCH",
  partial_match: "PARTIAL",
  company_text_unmatched: "NO MATCH",
  text_unreadable: "UNREADABLE",
};

const r = (n) => Math.round(n);
const escapeXml = (value) =>
  String(value).replace(/[<>&"']/g, (character) => {
    const entities = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      '"': "&quot;",
      "'": "&apos;",
    };
    return entities[character];
  });

const buildOverlaySvg = (
  entries,
  width,
  height,
  counts,
  badges = [],
  lanyardColorAssessments = [],
  companyTextAssessments = []
) => {
  const stroke = Math.max(3, r(width / 320));
  const fontSize = Math.max(14, r(width / 50));
  const pad = r(fontSize * 0.35);
  const headerFontSize = Math.max(12, r(width / 52));
  const headerText =
    `People ${counts.totalPeople} | ID ${counts.idVisible} | ` +
    `No ID ${counts.idNotVisible} | Uncertain ${counts.unknown}`;
  const headerHeight = headerFontSize + pad * 2;
  let shapes = "";

  for (const e of entries) {
    const s = STYLE[e.state] || STYLE.uncertain;
    const w = e.box.width;
    const h = e.box.height;
    const left = Math.max(0, e.box.x - w / 2);
    const top = Math.max(0, e.box.y - h / 2);

    const label = `Track #${e.trackId} ${s.text}`;
    const labelW = Math.min(
      width - left,
      r(label.length * fontSize * 0.62 + pad * 2)
    );
    const labelH = r(fontSize + pad * 2);
    const preferredLabelY = top - labelH;
    const labelY =
      preferredLabelY >= headerHeight
        ? preferredLabelY
        : Math.max(headerHeight, top);

    shapes += `<rect x="${r(left)}" y="${r(top)}" width="${r(w)}" height="${r(h)}" fill="none" stroke="${s.color}" stroke-width="${stroke}"/>`;
    shapes += `<rect x="${r(left)}" y="${r(labelY)}" width="${labelW}" height="${labelH}" fill="${s.color}"/>`;
    shapes += `<text x="${r(left + pad)}" y="${r(labelY + pad + fontSize * 0.85)}" textLength="${Math.max(1, labelW - pad * 2)}" lengthAdjust="spacingAndGlyphs" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="bold" fill="#ffffff">${escapeXml(label)}</text>`;

  }

  for (const badge of badges) {
    const { x, y, width: boxWidth, height: boxHeight } = badge.boundingBox;
    const left = Math.max(0, x - boxWidth / 2);
    const top = Math.max(0, y - boxHeight / 2);
    shapes += `<rect x="${r(left)}" y="${r(top)}" width="${r(boxWidth)}" height="${r(boxHeight)}" fill="none" stroke="${BADGE_STYLE.color}" stroke-width="${stroke}"/>`;
  }

  for (const assessment of lanyardColorAssessments) {
    const box = assessment?.box;
    if (
      !Array.isArray(box) ||
      box.length !== 4 ||
      !box.every(Number.isFinite)
    ) {
      continue;
    }

    const left = Math.max(0, Math.min(width, box[0]));
    const top = Math.max(0, Math.min(height, box[1]));
    const right = Math.max(0, Math.min(width, box[2]));
    const bottom = Math.max(0, Math.min(height, box[3]));
    const boxWidth = right - left;
    const boxHeight = bottom - top;
    if (boxWidth <= 0 || boxHeight <= 0) continue;

    const textAssessment = companyTextAssessments.find(
      (item) => item?.lanyard_index === assessment.lanyard_index
    );
    const colorStatus =
      typeof assessment.status === "string"
        ? assessment.status.replace(/_/g, " ").toUpperCase()
        : "UNKNOWN";
    const textStatus =
      TEXT_STATUS_LABELS[textAssessment?.status] ||
      (typeof textAssessment?.status === "string"
        ? textAssessment.status.replace(/_/g, " ").toUpperCase()
        : "UNKNOWN");
    const readableText =
      ["company_text_match", "partial_match"].includes(textAssessment?.status) &&
      typeof textAssessment.read_text === "string"
        ? textAssessment.read_text.trim()
        : "";
    const lanyardLabel = `LANYARD | ${colorStatus}`;
    const textLabel = readableText
      ? `TEXT | ${textStatus}: ${readableText}`
      : `TEXT | ${textStatus}`;
    const lanyardFontSize = Math.max(7, r(fontSize * 0.35));
    const lanyardPad = Math.max(3, r(lanyardFontSize * 0.3));
    const labelHeight = r(lanyardFontSize + lanyardPad * 2);
    const labelGap = Math.max(2, r(stroke / 2));
    const labelStackHeight = labelHeight * 2 + labelGap;
    let lanyardLabelY = bottom + labelGap;
    if (lanyardLabelY + labelStackHeight > height) {
      lanyardLabelY = Math.max(
        headerHeight,
        top - labelStackHeight - labelGap
      );
    }

    const drawLanyardTag = (label, y, color) => {
      const labelWidth = Math.min(
        width,
        r(label.length * lanyardFontSize * 0.62 + lanyardPad * 2)
      );
      const labelX = Math.max(
        0,
        Math.min(
          width - labelWidth,
          r(left + boxWidth / 2 - labelWidth / 2)
        )
      );
      shapes += `<rect x="${labelX}" y="${r(y)}" width="${labelWidth}" height="${labelHeight}" fill="${color}"/>`;
      shapes += `<text x="${r(labelX + lanyardPad)}" y="${r(y + lanyardPad + lanyardFontSize * 0.85)}" textLength="${Math.max(1, labelWidth - lanyardPad * 2)}" lengthAdjust="spacingAndGlyphs" font-family="Arial, Helvetica, sans-serif" font-size="${lanyardFontSize}" font-weight="bold" fill="#ffffff">${escapeXml(label)}</text>`;
    };

    shapes += `<rect x="${r(left)}" y="${r(top)}" width="${r(boxWidth)}" height="${r(boxHeight)}" fill="none" stroke="${LANYARD_STYLE.color}" stroke-width="${stroke}"/>`;
    drawLanyardTag(lanyardLabel, lanyardLabelY, LANYARD_STYLE.color);
    drawLanyardTag(
      textLabel,
      lanyardLabelY + labelHeight + labelGap,
      "#0F766E"
    );
  }

  // Draw an opaque, full-width status strip last so track boxes cannot cover it.
  shapes += `
    <rect x="0" y="0" width="${width}" height="${headerHeight}" fill="#111827"/>
    <text x="${pad}" y="${pad + headerFontSize * 0.82}" textLength="${Math.max(1, width - pad * 2)}" lengthAdjust="spacingAndGlyphs" font-family="Arial, Helvetica, sans-serif" font-size="${headerFontSize}" fill="#ffffff">${escapeXml(headerText)}</text>
  `;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${shapes}</svg>`;
};

const createAnnotatedFrame = async ({
  framePath,
  entries,
  badges = [],
  lanyardColorAssessments = [],
  companyTextAssessments = [],
  width,
  height,
  counts,
}) => {
  const svg = buildOverlaySvg(
    entries,
    width,
    height,
    counts,
    badges,
    lanyardColorAssessments,
    companyTextAssessments
  );
  return sharp(framePath)
    .resize(width, height, { fit: "fill" })
    .composite([{ input: Buffer.from(svg) }])
    .jpeg({ quality: 88 })
    .toBuffer();
};

/**
 * timeline: Map<frameNumber, { detections, counts, lanyardColorAssessments, companyTextAssessments }>
 * detections contain [{ trackId, state, box: {x,y,width,height} }].
 * Frame n is shown from second (n-1)*interval until the next frame.
 * Returns the local path of the finished MP4 (caller deletes it).
 */
const renderPreviewVideo = async ({
  videoUrl,
  inspectionId,
  timeline,
  totalFrames,
  width,
  height,
  interval = 1,
}) => {
  const overlayDir = path.resolve("uploads", "overlays", String(inspectionId));
  const outDir = path.resolve("uploads", "previews");
  const outPath = path.join(outDir, `${inspectionId}.mp4`);

  await fs.mkdir(overlayDir, { recursive: true });
  await fs.mkdir(outDir, { recursive: true });

  try {
    // One PNG per frame, including empty ones, so the sequence has no gaps
    for (let n = 1; n <= totalFrames; n++) {
      const frameData = timeline.get(n) || {};
      const counts = frameData.counts || {
        totalPeople: 0,
        idVisible: 0,
        idNotVisible: 0,
        unknown: 0,
      };
      const svg = buildOverlaySvg(
        frameData.detections || [],
        width,
        height,
        counts,
        frameData.badges || [],
        frameData.lanyardColorAssessments || [],
        frameData.companyTextAssessments || []
      );
      await sharp(Buffer.from(svg))
        .png()
        .toFile(path.join(overlayDir, `overlay-${String(n).padStart(5, "0")}.png`));
    }

    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(videoUrl)
        .input(path.join(overlayDir, "overlay-%05d.png"))
        .inputOptions(["-framerate", `1/${interval}`])
        .complexFilter([
          "[0:v]scale='min(1280,iw)':-2[base]",
          "[1:v][base]scale2ref[overlay][baseSized]",
          "[baseSized][overlay]overlay=0:0:format=auto,format=yuv420p[out]",
        ])
        .outputOptions([
          "-map", "[out]",
          "-an",
          "-c:v", "libx264",
          "-preset", "veryfast",
          "-crf", "28",
          "-movflags", "+faststart",
        ])
        .output(outPath)
        .on("end", resolve)
       .on("error", (err, stdout, stderr) =>
  reject(new Error(`${err.message}\n${stderr || ""}`))
)
        .run();
    });

    return outPath;
  } catch (error) {
    await fs.rm(outPath, { force: true }).catch(() => {});
    throw error;
  } finally {
    await fs.rm(overlayDir, { recursive: true, force: true }).catch(() => {});
  }
};

export { buildOverlaySvg, createAnnotatedFrame, renderPreviewVideo };