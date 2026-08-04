import AsyncStorage from "@react-native-async-storage/async-storage";

const GEOCODE_CACHE_KEY = "@location_mode/geocode_cache_v1";
const DISMISSED_KEY = "@location_mode/dismissed_until_v1";
const DISMISS_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours

export type LocationModeType = "provider" | "facility";

export interface GeoCoords {
  lat: number;
  lon: number;
}

interface GeocodeCache {
  [address: string]: GeoCoords | null;
}

export async function geocodeAddress(
  address: string,
): Promise<GeoCoords | null> {
  const cache = await loadGeocodeCache();
  if (address in cache) return cache[address];

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
    const resp = await fetch(url, {
      headers: { "User-Agent": "PregnancyAssistantApp/1.0" },
    });
    if (!resp.ok) {
      await saveGeocodeCache({ ...cache, [address]: null });
      return null;
    }
    const data = (await resp.json()) as Array<{ lat: string; lon: string }>;
    if (!Array.isArray(data) || data.length === 0) {
      await saveGeocodeCache({ ...cache, [address]: null });
      return null;
    }
    const result: GeoCoords = {
      lat: parseFloat(data[0]!.lat),
      lon: parseFloat(data[0]!.lon),
    };
    await saveGeocodeCache({ ...cache, [address]: result });
    return result;
  } catch {
    return null;
  }
}

async function loadGeocodeCache(): Promise<GeocodeCache> {
  try {
    const raw = await AsyncStorage.getItem(GEOCODE_CACHE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as GeocodeCache;
  } catch {
    return {};
  }
}

async function saveGeocodeCache(cache: GeocodeCache): Promise<void> {
  await AsyncStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(cache));
}

export function haversineMeters(a: GeoCoords, b: GeoCoords): number {
  const R = 6371000;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dlat = ((b.lat - a.lat) * Math.PI) / 180;
  const dlon = ((b.lon - a.lon) * Math.PI) / 180;
  const x =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dlon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export const PROXIMITY_THRESHOLD_METERS = 500;

export async function checkDismissed(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(DISMISSED_KEY);
    if (!raw) return false;
    return Date.now() < parseInt(raw, 10);
  } catch {
    return false;
  }
}

export async function dismissForNow(): Promise<void> {
  await AsyncStorage.setItem(
    DISMISSED_KEY,
    String(Date.now() + DISMISS_DURATION_MS),
  );
}

export async function clearLocationModeDismissal(): Promise<void> {
  await AsyncStorage.removeItem(DISMISSED_KEY);
}

/**
 * Clears the user-entered location-mode data (baby names, facility/office
 * checklists, dismissed-until) on sign-out. The geocode cache is generic
 * (address → coordinates) and intentionally retained. Best-effort.
 */
export async function clearLocationModeUserData(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      DISMISSED_KEY,
      BABY_NAMES_KEY,
      FACILITY_CHECKLIST_KEY,
      OFFICE_CHECKLIST_KEY,
    ]);
  } catch {
    /* best-effort */
  }
}

const BABY_NAMES_KEY = "@location_mode/baby_names_v1";

export async function loadBabyNames(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(BABY_NAMES_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

export async function saveBabyNames(names: string[]): Promise<void> {
  await AsyncStorage.setItem(BABY_NAMES_KEY, JSON.stringify(names));
}

const FACILITY_CHECKLIST_KEY = "@location_mode/facility_checklist_v1";

export type ChecklistItem = { id: string; text: string; checked: boolean };

export const DEFAULT_FACILITY_CHECKLIST: ChecklistItem[] = [
  {
    id: "fc1",
    text: "Hospital bag packed and in the car",
    checked: false,
  },
  { id: "fc2", text: "Birth plan printed or on phone", checked: false },
  { id: "fc3", text: "Insurance card and photo ID", checked: false },
  {
    id: "fc4",
    text: "Phone charger and personal items",
    checked: false,
  },
  { id: "fc5", text: "Snacks and drinks for support person", checked: false },
  {
    id: "fc6",
    text: "Called provider / hospital to notify",
    checked: false,
  },
  { id: "fc7", text: "Arranged childcare / pet care", checked: false },
  { id: "fc8", text: "Support person notified and on the way", checked: false },
];

export async function loadFacilityChecklist(): Promise<ChecklistItem[]> {
  try {
    const raw = await AsyncStorage.getItem(FACILITY_CHECKLIST_KEY);
    if (!raw) return DEFAULT_FACILITY_CHECKLIST.map((i) => ({ ...i }));
    return JSON.parse(raw) as ChecklistItem[];
  } catch {
    return DEFAULT_FACILITY_CHECKLIST.map((i) => ({ ...i }));
  }
}

export async function saveFacilityChecklist(
  items: ChecklistItem[],
): Promise<void> {
  await AsyncStorage.setItem(FACILITY_CHECKLIST_KEY, JSON.stringify(items));
}

const OFFICE_CHECKLIST_KEY = "@location_mode/office_checklist_v1";

export const DEFAULT_OFFICE_CHECKLIST: ChecklistItem[] = [
  { id: "oc1", text: "Insurance card and photo ID", checked: false },
  { id: "oc2", text: "List of current medications", checked: false },
  { id: "oc3", text: "Previous lab results or records", checked: false },
  { id: "oc4", text: "Questions written down (see below)", checked: false },
  { id: "oc5", text: "Urine sample if requested", checked: false },
  { id: "oc6", text: "Support person arranged", checked: false },
];

export async function loadOfficeChecklist(): Promise<ChecklistItem[]> {
  try {
    const raw = await AsyncStorage.getItem(OFFICE_CHECKLIST_KEY);
    if (!raw) return DEFAULT_OFFICE_CHECKLIST.map((i) => ({ ...i }));
    return JSON.parse(raw) as ChecklistItem[];
  } catch {
    return DEFAULT_OFFICE_CHECKLIST.map((i) => ({ ...i }));
  }
}

export async function saveOfficeChecklist(
  items: ChecklistItem[],
): Promise<void> {
  await AsyncStorage.setItem(OFFICE_CHECKLIST_KEY, JSON.stringify(items));
}
