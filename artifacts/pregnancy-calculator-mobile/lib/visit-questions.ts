import AsyncStorage from "@react-native-async-storage/async-storage";

export const QUESTIONS_STORAGE_KEY = "@visit_prep_questions_v2";

export const DEFAULT_QUESTIONS = [
  "How is the baby's growth and heart rate looking?",
  "Are my weight gain and blood pressure in a normal range?",
  "What symptoms should prompt me to call you right away?",
  "Do I need any additional tests or screenings before the next visit?",
  "Is my current exercise and activity level okay?",
  "What vitamins or supplements should I be taking?",
  "How are my iron, glucose, or anemia screening results?",
  "What early signs of labor should I watch for?",
  "Are there any restrictions on travel or activities?",
  "What's the plan for delivery, and when should I preregister at the hospital?",
];

export type QuestionItem = {
  id: string;
  text: string;
  selected: boolean;
  custom: boolean;
};

function defaultState(): QuestionItem[] {
  return DEFAULT_QUESTIONS.map((text, i) => ({
    id: `default-${i}`,
    text,
    selected: false,
    custom: false,
  }));
}

/**
 * Loads the saved question list, merging in any newly added default
 * questions (e.g. after an app update) that aren't yet present in storage.
 */
export async function loadQuestions(): Promise<QuestionItem[]> {
  const raw = await AsyncStorage.getItem(QUESTIONS_STORAGE_KEY);
  if (!raw) return defaultState();
  try {
    const parsed = JSON.parse(raw) as QuestionItem[];
    const existingTexts = new Set(parsed.map((q) => q.text));
    const missingDefaults = DEFAULT_QUESTIONS.filter(
      (t) => !existingTexts.has(t),
    ).map((text, i) => ({
      id: `default-new-${i}`,
      text,
      selected: false,
      custom: false,
    }));
    return [...parsed, ...missingDefaults];
  } catch {
    return defaultState();
  }
}

export async function saveQuestions(items: QuestionItem[]): Promise<void> {
  await AsyncStorage.setItem(QUESTIONS_STORAGE_KEY, JSON.stringify(items));
}

export async function clearVisitQuestionsCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(QUESTIONS_STORAGE_KEY);
  } catch {
    // best-effort
  }
}

export function getSelectedQuestions(items: QuestionItem[]): string[] {
  return items.filter((q) => q.selected).map((q) => q.text);
}
