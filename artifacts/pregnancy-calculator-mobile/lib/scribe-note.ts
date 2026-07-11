import AsyncStorage from "@react-native-async-storage/async-storage";

export const SCRIBE_NOTE_KEY = "@scribe_note_v1";

export interface PatientSummary {
  headline: string;
  whatWasDiscussed: string;
  nextSteps: string[];
  rememberTo: string;
}

export interface StoredScribeNote {
  note: PatientSummary;
  savedAt: string;
}

export async function loadScribeNote(): Promise<StoredScribeNote | null> {
  try {
    const raw = await AsyncStorage.getItem(SCRIBE_NOTE_KEY);
    return raw ? (JSON.parse(raw) as StoredScribeNote) : null;
  } catch {
    return null;
  }
}

export async function saveScribeNote(note: PatientSummary): Promise<void> {
  const stored: StoredScribeNote = {
    note,
    savedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(SCRIBE_NOTE_KEY, JSON.stringify(stored));
}
