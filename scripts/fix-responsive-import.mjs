/**
 * Fixes files where the ResponsiveContainer import was inserted in the middle of
 * a multi-line import statement (e.g., `import {\nimport { ResponsiveContainer }...\n  FOO`).
 *
 * Moves the import to after the last complete import block.
 */
import fs from "node:fs";
import path from "node:path";

const DIR = "artifacts/pregnancy-calculator-mobile/app";
const RC_IMPORT = `import { ResponsiveContainer } from "@/components/ResponsiveContainer";`;

// Find all .tsx files that have the broken pattern
const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".tsx"));

let fixed = 0;
let skipped = 0;

for (const filename of files) {
  const filePath = path.join(DIR, filename);
  let src = fs.readFileSync(filePath, "utf8");

  // Detect broken pattern: `import {\n` immediately followed by the RC import line
  const brokenPattern =
    /^(import \{)\n(import \{ ResponsiveContainer \} from "@\/components\/ResponsiveContainer";)/m;

  if (!brokenPattern.test(src)) {
    skipped++;
    continue;
  }

  // Step 1: Remove the misplaced RC import line
  src = src.replace(
    /^import \{ ResponsiveContainer \} from "@\/components\/ResponsiveContainer";\n/m,
    "",
  );

  // Step 2: Find the correct insertion point — after the last complete import statement.
  // "Complete" means a line that is exactly `} from "...";` or a single-line `import ... from "...";`
  // We walk through looking for all `} from "...";` endings and single-line imports.
  const lines = src.split("\n");
  let lastImportEnd = -1;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    // Single-line import: import ... from "...";
    if (/^import .+ from ['"][^'"]+['"];$/.test(trimmed)) {
      lastImportEnd = i;
    }
    // Closing line of a multi-line import: } from "...";
    if (/^\} from ['"][^'"]+['"];$/.test(trimmed)) {
      lastImportEnd = i;
    }
  }

  if (lastImportEnd === -1) {
    console.log(`❌  ${filename} — could not find last import end`);
    continue;
  }

  // Insert after lastImportEnd
  lines.splice(lastImportEnd + 1, 0, RC_IMPORT);
  src = lines.join("\n");

  fs.writeFileSync(filePath, src, "utf8");
  console.log(`✅  ${filename}`);
  fixed++;
}

console.log(`\nDone: ${fixed} fixed, ${skipped} skipped (already clean).`);
