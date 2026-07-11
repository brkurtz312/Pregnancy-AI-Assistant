export interface HospitalBagItem {
  id: string;
  label: string;
  note?: string;
  checked: boolean;
  custom: boolean;
}

export interface HospitalBagCategory {
  id: string;
  title: string;
  items: HospitalBagItem[];
}

const HOSPITAL_BAG_KEY = "pregnancy_hospital_bag_v1";

interface DefaultItem {
  label: string;
  note?: string;
}

const DEFAULT_CATEGORIES: {
  id: string;
  title: string;
  items: DefaultItem[];
}[] = [
  {
    id: "paperwork",
    title: "Paperwork & Essentials",
    items: [
      { label: "Photo ID and insurance card" },
      {
        label: "Hospital pre-registration paperwork",
        note: "If your hospital offers pre-registration",
      },
      { label: "Printed copy of your birth plan (if you made one)" },
      { label: "Pediatrician contact info" },
      { label: "Phone and charger (a long cord helps)" },
      {
        label: "Small amount of cash",
        note: "For vending machines or parking",
      },
    ],
  },
  {
    id: "for-you-labor",
    title: "For You — During Labor",
    items: [
      {
        label: "Glasses if you wear contacts",
        note: "You may need to remove contacts",
      },
      { label: "Comfortable robe or your own labor gown" },
      { label: "Non-slip socks" },
      { label: "Hair ties or a headband" },
      {
        label: "Lip balm",
        note: "Hospital air and mouth breathing dry lips out fast",
      },
      { label: "Phone charger and portable speaker for a playlist" },
      {
        label: "Massage tools or a comfort item",
        note: "Tennis ball, heating pad, or a favorite pillow",
      },
      {
        label: "Snacks for early labor",
        note: "Check with your care team on timing",
      },
    ],
  },
  {
    id: "for-you-after",
    title: "For You — After Delivery",
    items: [
      {
        label: "Toiletries",
        note: "Toothbrush, toothpaste, deodorant, shampoo",
      },
      { label: "2–3 pairs of comfortable, high-waisted underwear" },
      { label: "Nursing bra or soft, supportive bra" },
      { label: "Nursing pads" },
      {
        label: "Going-home outfit",
        note: "Loose and comfortable — you'll still look pregnant",
      },
      { label: "Flip-flops or slides for the shower" },
      {
        label: "Phone charger (pack two if you can — they get borrowed!)",
      },
    ],
  },
  {
    id: "for-baby",
    title: "For Baby",
    items: [
      { label: "Going-home outfit, weather-appropriate" },
      {
        label: "Extra outfit in a smaller size",
        note: "In case baby arrives small",
      },
      { label: "Swaddle blanket or receiving blankets" },
      { label: "Hat and socks or booties" },
      {
        label: "Rear-facing infant car seat, installed",
        note: "Hospitals typically won't discharge baby without one",
      },
    ],
  },
  {
    id: "for-partner",
    title: "For Your Partner or Support Person",
    items: [
      { label: "Change of clothes" },
      { label: "Toiletries" },
      { label: "Pillow and a light blanket for sleeping in the room" },
      { label: "Snacks and a refillable water bottle" },
      { label: "Phone charger" },
      { label: "Camera or fully charged phone for photos/video" },
    ],
  },
];

export function makeDefaultHospitalBag(): HospitalBagCategory[] {
  return DEFAULT_CATEGORIES.map((cat) => ({
    id: cat.id,
    title: cat.title,
    items: cat.items.map((item, i) => ({
      id: `${cat.id}-${i}`,
      label: item.label,
      note: item.note,
      checked: false,
      custom: false,
    })),
  }));
}

function defaultChecklist(): HospitalBagCategory[] {
  return makeDefaultHospitalBag();
}

export function loadHospitalBag(): HospitalBagCategory[] {
  try {
    const raw = localStorage.getItem(HOSPITAL_BAG_KEY);
    if (!raw) return defaultChecklist();
    const saved = JSON.parse(raw) as HospitalBagCategory[];
    const savedById = new Map(
      saved.flatMap((c) => c.items.map((item) => [item.id, item])),
    );
    return DEFAULT_CATEGORIES.map((cat) => {
      const savedCat = saved.find((c) => c.id === cat.id);
      const defaultItems = cat.items.map((item, i) => {
        const id = `${cat.id}-${i}`;
        const existing = savedById.get(id);
        return {
          id,
          label: item.label,
          note: item.note,
          checked: existing?.checked ?? false,
          custom: false,
        };
      });
      const customItems = (savedCat?.items ?? []).filter((i) => i.custom);
      return {
        id: cat.id,
        title: cat.title,
        items: [...defaultItems, ...customItems],
      };
    });
  } catch {
    return defaultChecklist();
  }
}

export function saveHospitalBag(categories: HospitalBagCategory[]): void {
  localStorage.setItem(HOSPITAL_BAG_KEY, JSON.stringify(categories));
}

export function countHospitalBagItems(categories: HospitalBagCategory[]): {
  checked: number;
  total: number;
} {
  const all = categories.flatMap((c) => c.items);
  return { checked: all.filter((i) => i.checked).length, total: all.length };
}

export function resetHospitalBag(): HospitalBagCategory[] {
  const fresh = defaultChecklist();
  saveHospitalBag(fresh);
  return fresh;
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildHospitalBagHtml(
  categories: HospitalBagCategory[],
): string {
  const { checked, total } = countHospitalBagItems(categories);
  const sectionsHtml = categories
    .map(
      (cat) =>
        `<h2>${escapeHtml(cat.title)}</h2>` +
        cat.items
          .map(
            (item) =>
              `<div class="row"><span class="box">${item.checked ? "&#9745;" : "&#9744;"}</span><span class="label">${escapeHtml(item.label)}${item.note ? `<span class="note"> — ${escapeHtml(item.note)}</span>` : ""}</span></div>`,
          )
          .join(""),
    )
    .join("");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Hospital Bag Checklist</title>
<style>
  body{font-family:-apple-system,Helvetica,Arial,sans-serif;padding:28px;color:#222;}
  h1{font-size:22px;margin-bottom:2px;}
  .sub{color:#666;font-size:12px;margin-bottom:20px;}
  h2{font-size:15px;margin-top:20px;margin-bottom:8px;border-bottom:1px solid #ddd;padding-bottom:4px;}
  .row{display:flex;align-items:flex-start;gap:8px;font-size:13px;line-height:1.6;padding:3px 0;}
  .box{font-size:15px;line-height:1.5;}
  .label{flex:1;}
  .note{color:#888;font-size:11.5px;}
  .footer{margin-top:28px;font-size:10px;color:#999;}
</style>
</head><body>
<h1>Hospital Bag Checklist</h1>
<p class="sub">${checked} of ${total} items packed. Pack around 36 weeks so you're ready whenever labor starts.</p>
${sectionsHtml}
<p class="footer">Generated in the Pregnancy Assistant app. Not medical advice — check with your hospital or birth center for any specific requirements.</p>
</body></html>`;
}
