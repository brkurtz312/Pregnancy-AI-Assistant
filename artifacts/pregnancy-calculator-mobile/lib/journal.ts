import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";

export const JOURNAL_KEY = "@journal_entries_v1";
export const JOURNAL_MEDIA_DIR =
  (FileSystem.documentDirectory ?? "") + "journal-media/";

export type JournalMediaCategory = "general" | "bump" | "ultrasound";
export type JournalMood =
  | "happy"
  | "grateful"
  | "excited"
  | "tired"
  | "anxious"
  | "overwhelmed";

export interface JournalMedia {
  id: string;
  uri: string;
  type: "photo" | "video";
  category: JournalMediaCategory;
}

export interface JournalEntry {
  id: string;
  createdAt: string;
  updatedAt: string;
  text: string;
  mood?: JournalMood;
  media: JournalMedia[];
  gestationalWeeks?: number;
  gestationalDays?: number;
  postpartumDays?: number;
}

export const MOOD_OPTIONS: {
  value: JournalMood;
  emoji: string;
  label: string;
}[] = [
  { value: "happy", emoji: "😊", label: "Happy" },
  { value: "grateful", emoji: "🙏", label: "Grateful" },
  { value: "excited", emoji: "🤩", label: "Excited" },
  { value: "tired", emoji: "😴", label: "Tired" },
  { value: "anxious", emoji: "😰", label: "Anxious" },
  { value: "overwhelmed", emoji: "😩", label: "A Lot" },
];

export const MEDIA_CATEGORY_LABELS: Record<JournalMediaCategory, string> = {
  general: "Journal Photo",
  bump: "Baby Bump",
  ultrasound: "Ultrasound",
};

export async function loadEntries(): Promise<JournalEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(JOURNAL_KEY);
    return raw ? (JSON.parse(raw) as JournalEntry[]) : [];
  } catch {
    return [];
  }
}

async function persistEntries(entries: JournalEntry[]): Promise<void> {
  await AsyncStorage.setItem(JOURNAL_KEY, JSON.stringify(entries));
}

export async function upsertEntry(entry: JournalEntry): Promise<void> {
  const entries = await loadEntries();
  const idx = entries.findIndex((e) => e.id === entry.id);
  if (idx >= 0) {
    entries[idx] = entry;
  } else {
    entries.unshift(entry);
  }
  await persistEntries(entries);
}

export async function deleteEntry(id: string): Promise<void> {
  const entries = await loadEntries();
  const entry = entries.find((e) => e.id === id);
  if (entry) {
    for (const m of entry.media) {
      try {
        await FileSystem.deleteAsync(m.uri, { idempotent: true });
      } catch {
        // ignore missing files
      }
    }
  }
  await persistEntries(entries.filter((e) => e.id !== id));
}

export async function copyMediaToDocuments(
  sourceUri: string,
  mediaId: string,
  type: "photo" | "video",
): Promise<string> {
  const info = await FileSystem.getInfoAsync(JOURNAL_MEDIA_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(JOURNAL_MEDIA_DIR, {
      intermediates: true,
    });
  }
  const ext = type === "video" ? "mp4" : "jpg";
  const dest = JOURNAL_MEDIA_DIR + mediaId + "." + ext;
  await FileSystem.copyAsync({ from: sourceUri, to: dest });
  return dest;
}

export function getAgeLabel(entry: JournalEntry): string {
  if (entry.postpartumDays !== undefined) {
    if (entry.postpartumDays < 7) {
      return `Day ${entry.postpartumDays + 1} postpartum`;
    }
    const weeks = Math.floor(entry.postpartumDays / 7);
    const days = entry.postpartumDays % 7;
    return days > 0 ? `${weeks}w ${days}d postpartum` : `${weeks}w postpartum`;
  }
  if (entry.gestationalWeeks !== undefined) {
    const d = entry.gestationalDays ?? 0;
    return d > 0
      ? `Week ${entry.gestationalWeeks} + ${d}d`
      : `Week ${entry.gestationalWeeks}`;
  }
  return "";
}

export function getJournalPrompts(opts: {
  gestationalWeeks?: number;
  postpartumDays?: number;
}): string[] {
  const { gestationalWeeks, postpartumDays } = opts;

  if (postpartumDays !== undefined) {
    if (postpartumDays <= 3)
      return [
        "Write your birth story while it's fresh — what do you most want to remember?",
        "Describe the moment you first held your baby.",
        "How are you feeling right now, physically and emotionally?",
      ];
    if (postpartumDays <= 7)
      return [
        "What has surprised you most about your first week at home?",
        "How is feeding going? What's working and what's challenging?",
        "What's one thing someone said or did that really helped you this week?",
      ];
    if (postpartumDays <= 14)
      return [
        "What has been the hardest moment so far? The most beautiful?",
        "What does a typical day look like for you right now?",
        "How has becoming a parent changed how you see yourself?",
      ];
    if (postpartumDays <= 30)
      return [
        "Your baby is almost a month old — how have you changed since birth?",
        "What are you most proud of in these first weeks?",
        "What do you wish you had known before becoming a parent?",
      ];
    if (postpartumDays <= 60)
      return [
        "What milestones have you noticed this month?",
        "How are you taking care of yourself right now?",
        "Describe your baby's personality as you're getting to know them.",
      ];
    if (postpartumDays <= 90)
      return [
        "Three months in — what feels easier now than it did at the start?",
        "What brings you the most joy in your daily routine with your baby?",
        "How is your relationship with your partner or support people going?",
      ];
    return [
      "What is your baby like? What makes them laugh, what calms them?",
      "How are you feeling about your postpartum journey so far?",
      "What do you most want to remember about these early months?",
    ];
  }

  if (gestationalWeeks === undefined)
    return [
      "What inspired you to start this journal?",
      "What are your hopes and dreams for this pregnancy?",
      "Write a note to your future self — to read after your baby arrives.",
    ];

  if (gestationalWeeks < 8)
    return [
      "How did you find out you were pregnant? What was your first reaction?",
      "Who have you told so far, and how did they react?",
      "How are you feeling physically? What symptoms are you experiencing?",
    ];
  if (gestationalWeeks < 12)
    return [
      "What has been the biggest adjustment in these first weeks?",
      "What are you most looking forward to in this pregnancy?",
      "What worries you, and how are you managing those feelings?",
    ];
  if (gestationalWeeks < 14)
    return [
      "Almost out of the first trimester — how does that feel?",
      "Have you had your first prenatal appointment? What was it like?",
      "What do you most want to remember about these early weeks?",
    ];
  if (gestationalWeeks < 20)
    return [
      "Your energy may be returning — how are you using it?",
      "Is your belly growing? How does it feel to see your body changing?",
      "Have you felt any movement yet? Describe what it was like.",
    ];
  if (gestationalWeeks < 24)
    return [
      "Halfway there! Write about where you are in this journey.",
      "What names are you considering? What do you imagine your baby will be like?",
      "What are you doing to prepare — the nursery, the baby's things, your own heart?",
    ];
  if (gestationalWeeks < 28)
    return [
      "What's your favorite thing about feeling your baby move?",
      "Write a letter to your baby about what's happening in your world right now.",
      "How are you taking care of yourself this trimester?",
    ];
  if (gestationalWeeks < 32)
    return [
      "You're in the third trimester! How does your body feel now?",
      "What are you most excited about? What are you most nervous about?",
      "What does your support system look like as you prepare for birth?",
    ];
  if (gestationalWeeks < 36)
    return [
      "The final stretch is beginning. Is your hospital bag packed?",
      "Write about your birth preferences — what matters most to you?",
      "What do you want your first moments with your baby to look like?",
    ];
  return [
    "Any day now — what are you feeling as you wait?",
    "Write a letter to your future self, to read after your baby arrives.",
    "What do you most want to remember about being pregnant?",
  ];
}
