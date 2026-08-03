/**
 * Adds ResponsiveContainer wrapping to educational/detail screens.
 *
 * For each target file it:
 *  1. Adds `import { ResponsiveContainer } from "@/components/ResponsiveContainer";`
 *  2. Wraps the ScrollView's children with <ResponsiveContainer style={{ paddingHorizontal: 16 }}>
 *  3. Removes `paddingHorizontal: 16,` from styles.scroll (since it moves into the container)
 */

import fs from "node:fs";

const FILES = [
  "artifacts/pregnancy-calculator-mobile/app/hp-body-mechanics.tsx",
  "artifacts/pregnancy-calculator-mobile/app/hp-exercise.tsx",
  "artifacts/pregnancy-calculator-mobile/app/hp-intimacy.tsx",
  "artifacts/pregnancy-calculator-mobile/app/hp-medications.tsx",
  "artifacts/pregnancy-calculator-mobile/app/hp-nutrition.tsx",
  "artifacts/pregnancy-calculator-mobile/app/hp-travel.tsx",
  "artifacts/pregnancy-calculator-mobile/app/hp-warning-signs.tsx",
  "artifacts/pregnancy-calculator-mobile/app/hp-work-bedrest.tsx",
  "artifacts/pregnancy-calculator-mobile/app/prenatal-care.tsx",
  "artifacts/pregnancy-calculator-mobile/app/prenatal-testing.tsx",
  "artifacts/pregnancy-calculator-mobile/app/labor-delivery.tsx",
  "artifacts/pregnancy-calculator-mobile/app/postpartum.tsx",
  "artifacts/pregnancy-calculator-mobile/app/pregnancy-complications.tsx",
  "artifacts/pregnancy-calculator-mobile/app/postpartum-recovery.tsx",
  "artifacts/pregnancy-calculator-mobile/app/postpartum-depression.tsx",
  "artifacts/pregnancy-calculator-mobile/app/postpartum-contraception.tsx",
  "artifacts/pregnancy-calculator-mobile/app/postpartum-depression-summary.tsx",
  "artifacts/pregnancy-calculator-mobile/app/intimacy-after-delivery.tsx",
  "artifacts/pregnancy-calculator-mobile/app/hospital-bag.tsx",
  "artifacts/pregnancy-calculator-mobile/app/healthy-pregnancy.tsx",
  "artifacts/pregnancy-calculator-mobile/app/development.tsx",
  "artifacts/pregnancy-calculator-mobile/app/choose-ob-provider.tsx",
  "artifacts/pregnancy-calculator-mobile/app/breastfeeding.tsx",
  "artifacts/pregnancy-calculator-mobile/app/breastfeeding-summary.tsx",
  "artifacts/pregnancy-calculator-mobile/app/at-facility.tsx",
  "artifacts/pregnancy-calculator-mobile/app/birth-plan.tsx",
  "artifacts/pregnancy-calculator-mobile/app/birth-plan-summary.tsx",
  "artifacts/pregnancy-calculator-mobile/app/cesarean-birth.tsx",
  "artifacts/pregnancy-calculator-mobile/app/childbirth-preparation.tsx",
  "artifacts/pregnancy-calculator-mobile/app/labor-pain-management.tsx",
  "artifacts/pregnancy-calculator-mobile/app/labor-natural-induced.tsx",
  "artifacts/pregnancy-calculator-mobile/app/office-visit.tsx",
  "artifacts/pregnancy-calculator-mobile/app/in-office.tsx",
  "artifacts/pregnancy-calculator-mobile/app/visit-summary.tsx",
  "artifacts/pregnancy-calculator-mobile/app/support-person-vol1.tsx",
  "artifacts/pregnancy-calculator-mobile/app/support-person-vol2.tsx",
  "artifacts/pregnancy-calculator-mobile/app/support-person-vol3.tsx",
  "artifacts/pregnancy-calculator-mobile/app/video-vault.tsx",
  "artifacts/pregnancy-calculator-mobile/app/scribe.tsx",
];

const IMPORT_LINE = `import { ResponsiveContainer } from "@/components/ResponsiveContainer";`;

function transformFile(filePath) {
  let src = fs.readFileSync(filePath, "utf8");
  const original = src;
  const issues = [];

  // ── 1. Add import if not already present ──────────────────────────────────
  if (!src.includes("ResponsiveContainer")) {
    // Insert after the last import statement
    const lastImportMatch = [...src.matchAll(/^import .+$/gm)].at(-1);
    if (!lastImportMatch) {
      issues.push("Could not find import statements");
    } else {
      const insertPos = lastImportMatch.index + lastImportMatch[0].length;
      src = src.slice(0, insertPos) + "\n" + IMPORT_LINE + src.slice(insertPos);
    }
  }

  // ── 2. Find the ScrollView that references styles.scroll and wrap its children ──
  // We look for the closing `>` of the ScrollView tag, then insert the open wrapper.
  // Pattern: a ScrollView that has contentContainerStyle referencing styles.scroll.
  // The tag ends with `\n      >` (6-space indent close).
  // We need to find the specific ScrollView, not just any tag.

  // Strategy: find the line containing the first `contentContainerStyle={[` that is
  // followed by `styles.scroll` within ~4 lines, then find the closing `>` of that
  // opening JSX tag, and insert after it.

  const lines = src.split("\n");
  let scrollViewOpenClose = -1; // line index of the `      >` that closes the ScrollView tag
  let scrollViewClose = -1; // line index of `      </ScrollView>`

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith("<ScrollView")) {
      // Look ahead up to 10 lines for contentContainerStyle + styles.scroll
      let hasScrollStyle = false;
      for (let j = i; j < Math.min(i + 10, lines.length); j++) {
        if (lines[j].includes("styles.scroll")) {
          hasScrollStyle = true;
          break;
        }
        // If we hit the closing > of a different kind of JSX, stop
        if (j > i && /^\s+>$/.test(lines[j]) && !hasScrollStyle) break;
      }

      if (!hasScrollStyle) continue;

      // Find the closing `>` of this ScrollView's opening tag
      for (let j = i; j < Math.min(i + 15, lines.length); j++) {
        if (/^\s+>$/.test(lines[j])) {
          scrollViewOpenClose = j;
          break;
        }
      }

      // Find the matching </ScrollView>
      // Count open/close ScrollView tags from scrollViewOpenClose
      let depth = 1;
      for (let j = scrollViewOpenClose + 1; j < lines.length; j++) {
        if (/<ScrollView[\s>]/.test(lines[j])) depth++;
        if (lines[j].includes("</ScrollView>")) {
          depth--;
          if (depth === 0) {
            scrollViewClose = j;
            break;
          }
        }
      }
      break; // process first matching ScrollView only
    }
  }

  if (scrollViewOpenClose === -1) {
    issues.push(
      "Could not find ScrollView with styles.scroll contentContainerStyle",
    );
  } else if (scrollViewClose === -1) {
    issues.push("Could not find matching </ScrollView>");
  } else {
    // Determine indentation from the closing `>` line
    const closingGtLine = lines[scrollViewOpenClose];
    const indent = closingGtLine.match(/^(\s+)/)?.[1] ?? "      ";
    const childIndent = indent + "  ";

    // Insert <ResponsiveContainer> after the `>` line
    lines.splice(
      scrollViewOpenClose + 1,
      0,
      `${childIndent}<ResponsiveContainer style={{ paddingHorizontal: 16 }}>`,
    );

    // </ScrollView> line index shifted by 1 after splice
    const adjustedClose = scrollViewClose + 1;

    // Insert </ResponsiveContainer> before </ScrollView>
    // Find the indentation of </ScrollView>
    const svCloseLine = lines[adjustedClose];
    const svCloseIndent = svCloseLine.match(/^(\s+)/)?.[1] ?? "      ";
    lines.splice(adjustedClose, 0, `${svCloseIndent}  </ResponsiveContainer>`);

    src = lines.join("\n");
  }

  // ── 3. Remove paddingHorizontal: 16 from styles.scroll ────────────────────
  // Pattern: inside `scroll: {` block, remove `    paddingHorizontal: 16,` line
  // We look for the scroll style block and remove the paddingHorizontal line
  const scrollStyleRe =
    /(scroll:\s*\{[^}]*?)(\s*paddingHorizontal:\s*16,)([^}]*\})/s;
  if (scrollStyleRe.test(src)) {
    src = src.replace(scrollStyleRe, (_, before, _ph, after) => before + after);
  } else {
    // Try alternate: standalone paddingHorizontal: 16, line within scroll block
    // Find the scroll: { block and remove paddingHorizontal from it
    const scrollBlockRe = /scroll:\s*\{([\s\S]*?)\}/;
    const match = src.match(scrollBlockRe);
    if (match && match[1].includes("paddingHorizontal: 16")) {
      src = src.replace(scrollBlockRe, (full) =>
        full.replace(/[ \t]*paddingHorizontal:\s*16,?\n/, ""),
      );
    } else {
      issues.push("Could not find paddingHorizontal: 16 in styles.scroll");
    }
  }

  if (src !== original) {
    fs.writeFileSync(filePath, src, "utf8");
    return { changed: true, issues };
  }
  return { changed: false, issues: ["No changes made", ...issues] };
}

let changed = 0;
let failed = 0;
for (const file of FILES) {
  const result = transformFile(file);
  const label = file.split("/").pop();
  if (result.changed && result.issues.length === 0) {
    console.log(`✅  ${label}`);
    changed++;
  } else if (result.changed && result.issues.length > 0) {
    console.log(`⚠️  ${label} — changed but: ${result.issues.join("; ")}`);
    changed++;
  } else {
    console.log(`❌  ${label} — ${result.issues.join("; ")}`);
    failed++;
  }
}
console.log(`\nDone: ${changed} changed, ${failed} failed.`);
