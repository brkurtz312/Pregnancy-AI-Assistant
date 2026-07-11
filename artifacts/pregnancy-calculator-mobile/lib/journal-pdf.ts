import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { JournalEntry, MOOD_OPTIONS, getAgeLabel } from "./journal";

async function uriToDataUri(uri: string): Promise<string | null> {
  try {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return `data:image/jpeg;base64,${base64}`;
  } catch {
    return null;
  }
}

function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function getMoodLabel(mood?: JournalEntry["mood"]): string {
  if (!mood) return "";
  const m = MOOD_OPTIONS.find((o) => o.value === mood);
  return m ? `${m.emoji} ${m.label}` : "";
}

async function buildEntryHtml(entry: JournalEntry): Promise<string> {
  const ageLabel = getAgeLabel(entry);
  const moodLabel = getMoodLabel(entry.mood);

  const mediaHtml = (
    await Promise.all(
      entry.media.map(async (m) => {
        if (m.type === "photo") {
          const src = await uriToDataUri(m.uri);
          if (!src) return "";
          const catLabel =
            m.category === "bump"
              ? "Baby Bump"
              : m.category === "ultrasound"
                ? "Ultrasound"
                : "";
          return `
            <div class="media-item">
              <img src="${src}" alt="${catLabel || "Journal photo"}" />
              ${catLabel ? `<div class="media-label">${catLabel}</div>` : ""}
            </div>`;
        } else {
          const catLabel =
            m.category === "bump"
              ? "Baby Bump Video"
              : m.category === "ultrasound"
                ? "Ultrasound Video"
                : "Video";
          return `
            <div class="media-item">
              <div class="video-placeholder">
                <div class="video-icon">🎥</div>
                <div class="video-text">${catLabel}</div>
              </div>
            </div>`;
        }
      }),
    )
  ).filter(Boolean);

  return `
    <div class="entry">
      <div class="entry-header">
        <div class="entry-date">${formatLongDate(entry.createdAt)}</div>
        <div class="entry-meta">
          ${ageLabel ? `<span class="age-pill">${ageLabel}</span>` : ""}
          ${moodLabel ? `<span class="mood">${moodLabel}</span>` : ""}
        </div>
      </div>
      ${entry.text ? `<div class="entry-text">${entry.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>")}</div>` : ""}
      ${mediaHtml.length > 0 ? `<div class="media-grid">${mediaHtml.join("")}</div>` : ""}
    </div>`;
}

const PDF_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Georgia, "Times New Roman", serif;
    background: #fff;
    color: #2d1f1a;
    padding: 48px 52px;
  }
  .cover {
    text-align: center;
    padding: 64px 0 72px;
    border-bottom: 2px solid #f0d8d0;
    margin-bottom: 56px;
  }
  .cover-title {
    font-size: 38px;
    color: #c96b6b;
    letter-spacing: 3px;
    margin-bottom: 10px;
  }
  .cover-sub {
    font-size: 14px;
    color: #9a7070;
    letter-spacing: 2px;
    text-transform: uppercase;
    font-family: Arial, sans-serif;
  }
  .cover-count {
    font-size: 13px;
    color: #c0a8a8;
    margin-top: 22px;
    font-family: Arial, sans-serif;
  }
  .entry {
    margin-bottom: 52px;
    padding-bottom: 44px;
    border-bottom: 1px solid #f0e8e4;
    page-break-inside: avoid;
  }
  .entry:last-child { border-bottom: none; }
  .entry-header { margin-bottom: 14px; }
  .entry-date {
    font-size: 16px;
    font-weight: bold;
    color: #c96b6b;
    margin-bottom: 8px;
    font-family: Georgia, serif;
  }
  .entry-meta {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }
  .age-pill {
    background: #fce8e0;
    color: #c96b6b;
    font-size: 11px;
    padding: 3px 10px;
    border-radius: 20px;
    font-family: Arial, sans-serif;
  }
  .mood {
    font-size: 13px;
    color: #9a7070;
    font-family: Arial, sans-serif;
  }
  .entry-text {
    font-size: 14px;
    line-height: 2;
    color: #3d2a2a;
    font-family: Georgia, serif;
    margin-top: 12px;
  }
  .media-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    margin-top: 20px;
  }
  .media-item { flex: 0 0 auto; }
  .media-item img {
    width: 230px;
    height: 190px;
    object-fit: cover;
    border-radius: 10px;
    border: 1px solid #f0d8d0;
    display: block;
  }
  .media-label {
    font-size: 10px;
    color: #c0a8a8;
    text-align: center;
    margin-top: 5px;
    font-family: Arial, sans-serif;
    letter-spacing: 1px;
    text-transform: uppercase;
  }
  .video-placeholder {
    width: 230px;
    height: 190px;
    background: #fdf0ec;
    border-radius: 10px;
    border: 1px solid #f0d8d0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
  .video-icon { font-size: 40px; }
  .video-text {
    font-size: 11px;
    color: #c0a8a8;
    font-family: Arial, sans-serif;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
`;

export async function exportJournalPdf(entries: JournalEntry[]): Promise<void> {
  const sorted = [...entries].reverse();

  const entrySections = await Promise.all(sorted.map(buildEntryHtml));

  const exportDate = new Date().toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <style>${PDF_CSS}</style>
</head>
<body>
  <div class="cover">
    <div class="cover-title">My Pregnancy Journal</div>
    <div class="cover-sub">A record of this beautiful journey</div>
    <div class="cover-count">
      Exported ${exportDate} &nbsp;·&nbsp;
      ${entries.length} ${entries.length === 1 ? "entry" : "entries"}
    </div>
  </div>
  ${entrySections.join("")}
</body>
</html>`;

  const { uri } = await Print.printToFileAsync({ html, base64: false });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle: "My Pregnancy Journal",
      UTI: "com.adobe.pdf",
    });
  }
}
