/**
 * Mobile sync-api device-switch tests
 *
 * Validates that the three sync-api.ts functions — journal, hospital bag, and
 * birth plan — correctly serialize data to the server and deserialize it on a
 * subsequent load, simulating a device switch or fresh app install.
 *
 * Strategy: mock global.fetch so no real network or server is needed. Each
 * test drives save → load through the actual sync-api code (no mocking of
 * sync-api itself) and asserts the round-trip is lossless.
 *
 * This is intentionally a unit/integration test of the sync-api module, not
 * of any UI component.  The fallback-path (AsyncStorage when the API fails)
 * is covered separately in syncApiFallback.test.tsx.
 */

import {
  apiUpsertJournalEntry,
  apiLoadJournalEntries,
  apiDeleteJournalEntry,
  apiSaveHospitalBag,
  apiLoadHospitalBag,
  apiSaveBirthPlanAnswers,
  apiLoadBirthPlanAnswers,
  isServerUuid,
} from "@/lib/sync-api";

// ─── Auth stub ────────────────────────────────────────────────────────────────

const getToken = jest.fn(async () => "test-token");

// ─── fetch helper ─────────────────────────────────────────────────────────────

function mockFetch(body: unknown, status = 200): jest.SpyInstance {
  return jest.spyOn(global, "fetch").mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response);
}

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

// ─── isServerUuid ─────────────────────────────────────────────────────────────

describe("isServerUuid", () => {
  it("returns true for a valid UUID v4", () => {
    expect(isServerUuid("00000000-0000-4000-8000-000000000001")).toBe(true);
  });

  it("returns false for a local base36 id", () => {
    expect(isServerUuid("local-abc123")).toBe(false);
    expect(isServerUuid("lyrwj0abc")).toBe(false);
  });
});

// ─── Journal — device switch ───────────────────────────────────────────────────

describe("Journal — device switch (sync survival)", () => {
  const SERVER_UUID = "11111111-2222-4333-8444-555555555555";

  it("serialises a new (local-id) entry correctly and gets back a server UUID", async () => {
    const serverEntry = {
      id: SERVER_UUID,
      text: "Feeling great at 20 weeks!",
      mood: "happy",
      gestationalWeeks: 20,
      gestationalDays: 3,
      postpartumDays: null,
      createdAt: "2026-01-15T10:00:00.000Z",
      updatedAt: "2026-01-15T10:00:00.000Z",
    };

    const fetchSpy = mockFetch(serverEntry, 201);

    const localEntry = {
      id: "lyrwj0abc", // local id — not a UUID
      text: "Feeling great at 20 weeks!",
      mood: "happy" as const,
      gestationalWeeks: 20,
      gestationalDays: 3,
      postpartumDays: undefined,
      createdAt: "2026-01-15T10:00:00.000Z",
      updatedAt: "2026-01-15T10:00:00.000Z",
      media: [],
    };

    const result = await apiUpsertJournalEntry(localEntry, getToken);

    // The returned entry should carry the server UUID, not the local id.
    expect(result.id).toBe(SERVER_UUID);
    expect(isServerUuid(result.id)).toBe(true);
    expect(result.text).toBe("Feeling great at 20 weeks!");
    expect(result.mood).toBe("happy");
    expect(result.gestationalWeeks).toBe(20);
    expect(result.gestationalDays).toBe(3);

    // The POST body must NOT include the local id (so server creates a new row).
    const body = JSON.parse(
      (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.id).toBeUndefined();
    expect(body.text).toBe("Feeling great at 20 weeks!");
  });

  it("sends the server UUID on update so the server upserts the same row", async () => {
    const updatedEntry = {
      id: SERVER_UUID,
      text: "Updated text",
      mood: "grateful" as const,
      gestationalWeeks: 21,
      gestationalDays: 0,
      postpartumDays: undefined,
      createdAt: "2026-01-15T10:00:00.000Z",
      updatedAt: "2026-01-16T10:00:00.000Z",
    };
    const fetchSpy = mockFetch(updatedEntry);

    const entry = {
      id: SERVER_UUID,
      text: "Updated text",
      mood: "grateful" as const,
      gestationalWeeks: 21,
      gestationalDays: 0,
      postpartumDays: undefined,
      createdAt: "2026-01-15T10:00:00.000Z",
      updatedAt: "2026-01-16T10:00:00.000Z",
      media: [],
    };

    const result = await apiUpsertJournalEntry(entry, getToken);
    expect(result.id).toBe(SERVER_UUID);
    expect(result.text).toBe("Updated text");

    const body = JSON.parse(
      (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.id).toBe(SERVER_UUID);
  });

  it("loads entries on a fresh device and the text/mood/timing survive the round-trip", async () => {
    mockFetch({
      entries: [
        {
          id: SERVER_UUID,
          text: "Feeling great at 20 weeks!",
          mood: "happy",
          gestationalWeeks: 20,
          gestationalDays: 3,
          postpartumDays: null,
          createdAt: "2026-01-15T10:00:00.000Z",
          updatedAt: "2026-01-15T10:00:00.000Z",
        },
        {
          id: "22222222-3333-4444-5555-666666666666",
          text: "Nursery is ready!",
          mood: "excited",
          gestationalWeeks: 36,
          gestationalDays: 2,
          postpartumDays: null,
          createdAt: "2026-03-01T08:00:00.000Z",
          updatedAt: "2026-03-01T08:00:00.000Z",
        },
      ],
    });

    const entries = await apiLoadJournalEntries(getToken);

    expect(entries).toHaveLength(2);
    expect(entries[0].id).toBe(SERVER_UUID);
    expect(entries[0].text).toBe("Feeling great at 20 weeks!");
    expect(entries[0].mood).toBe("happy");
    expect(entries[0].gestationalWeeks).toBe(20);
    expect(entries[0].gestationalDays).toBe(3);
    // media is always initialised to [] by serverToLocal
    expect(entries[0].media).toEqual([]);

    expect(entries[1].text).toBe("Nursery is ready!");
    expect(entries[1].mood).toBe("excited");
  });

  it("returns an empty array when the server has no entries (brand-new account)", async () => {
    mockFetch({ entries: [] });

    const entries = await apiLoadJournalEntries(getToken);
    expect(entries).toHaveLength(0);
  });

  it("sends DELETE for a server-UUID entry and skips it for local-id entries", async () => {
    // Local-id entry → no network call (test this first, before any spy is set up)
    const fetchSpy = jest.spyOn(global, "fetch");
    await apiDeleteJournalEntry("local-abc", getToken);
    expect(fetchSpy).not.toHaveBeenCalled();

    // Server-UUID entry → DELETE request must be sent
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 204,
      json: async () => undefined,
      text: async () => "",
    } as Response);
    await apiDeleteJournalEntry(SERVER_UUID, getToken);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("attaches the Authorization header with the token on every request", async () => {
    const spy = mockFetch({ entries: [] });
    await apiLoadJournalEntries(getToken);

    const headers = spy.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers?.Authorization).toBe("Bearer test-token");
  });

  it("throws when the server returns a non-OK status", async () => {
    jest.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    } as Response);

    await expect(apiLoadJournalEntries(getToken)).rejects.toThrow("500");
  });
});

// ─── Hospital Bag — device switch ─────────────────────────────────────────────

describe("Hospital Bag — device switch (sync survival)", () => {
  const sampleCategories = [
    {
      id: "for-mom",
      title: "For Mom",
      items: [
        {
          id: "toiletries",
          label: "Toiletries",
          note: "Travel sizes",
          checked: true,
          custom: false,
        },
        { id: "robe", label: "Comfy robe", checked: false, custom: false },
        { id: "my-snacks", label: "Snacks", checked: false, custom: true },
      ],
    },
  ];

  it("sends the full categories payload to the server", async () => {
    const spy = mockFetch({ ok: true });
    await apiSaveHospitalBag(sampleCategories, getToken);

    const body = JSON.parse(
      (spy.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.categories).toHaveLength(1);
    expect(body.categories[0].id).toBe("for-mom");
    expect(body.categories[0].items).toHaveLength(3);
    expect(body.categories[0].items[0].checked).toBe(true);
  });

  it("returns null when the server has no saved data (new account on fresh device)", async () => {
    mockFetch({ categories: null });
    const result = await apiLoadHospitalBag(getToken);
    expect(result).toBeNull();
  });

  it("restores saved bag data on a fresh device load — checked state and custom items survive", async () => {
    mockFetch({ categories: sampleCategories });
    const result = await apiLoadHospitalBag(getToken);

    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    expect(result![0].id).toBe("for-mom");

    const toiletries = result![0].items.find((i) => i.id === "toiletries");
    expect(toiletries?.checked).toBe(true);

    const robe = result![0].items.find((i) => i.id === "robe");
    expect(robe?.checked).toBe(false);

    const snacks = result![0].items.find((i) => i.id === "my-snacks");
    expect(snacks?.custom).toBe(true);
  });

  it("device 1 saves, device 2 loads — full round-trip", async () => {
    // ── Device 1: save checked state ─────────────────────────────────────
    const saveSpy = mockFetch({ ok: true });
    await apiSaveHospitalBag(sampleCategories, getToken);

    // Capture what was POSTed to the server
    const postedBody = JSON.parse(
      (saveSpy.mock.calls[0][1] as RequestInit).body as string,
    );
    const savedCategories = postedBody.categories;

    // ── Device 2: GET returns what was stored ────────────────────────────
    mockFetch({ categories: savedCategories });
    const loaded = await apiLoadHospitalBag(getToken);

    expect(loaded).not.toBeNull();
    expect(loaded![0].items[0].checked).toBe(
      sampleCategories[0].items[0].checked,
    );
    expect(loaded![0].items[1].checked).toBe(
      sampleCategories[0].items[1].checked,
    );
    expect(loaded![0].items[2].custom).toBe(
      sampleCategories[0].items[2].custom,
    );
  });
});

// ─── Birth Plan — device switch ───────────────────────────────────────────────

describe("Birth Plan — device switch (sync survival)", () => {
  const sampleAnswers = {
    preferred_name: "Jane",
    pain_management: "epidural",
    labor_support: ["partner", "doula"],
    skin_to_skin: true,
    moveFreelyDuringLabour: false,
  };

  it("sends the full answers payload to the server", async () => {
    const spy = mockFetch({ ok: true });
    await apiSaveBirthPlanAnswers(sampleAnswers, getToken);

    const body = JSON.parse(
      (spy.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.answers.preferred_name).toBe("Jane");
    expect(body.answers.pain_management).toBe("epidural");
    expect(body.answers.labor_support).toEqual(["partner", "doula"]);
    expect(body.answers.skin_to_skin).toBe(true);
  });

  it("returns null when the server has no saved answers (new account on fresh device)", async () => {
    mockFetch({ answers: null });
    const result = await apiLoadBirthPlanAnswers(getToken);
    expect(result).toBeNull();
  });

  it("restores all field types on a fresh device load — strings, booleans, and arrays survive", async () => {
    mockFetch({ answers: sampleAnswers });
    const result = await apiLoadBirthPlanAnswers(getToken);

    expect(result).not.toBeNull();
    expect(result!.preferred_name).toBe("Jane");
    expect(result!.pain_management).toBe("epidural");
    expect(result!.labor_support).toEqual(["partner", "doula"]);
    expect(result!.skin_to_skin).toBe(true);
    expect(result!.moveFreelyDuringLabour).toBe(false);
  });

  it("device 1 saves, device 2 loads — full round-trip", async () => {
    // ── Device 1: fill in birth plan ──────────────────────────────────────
    const saveSpy = mockFetch({ ok: true });
    await apiSaveBirthPlanAnswers(sampleAnswers, getToken);

    const postedBody = JSON.parse(
      (saveSpy.mock.calls[0][1] as RequestInit).body as string,
    );
    const savedAnswers = postedBody.answers;

    // ── Device 2: GET returns what was stored ────────────────────────────
    mockFetch({ answers: savedAnswers });
    const loaded = await apiLoadBirthPlanAnswers(getToken);

    expect(loaded).not.toBeNull();
    expect(loaded!.preferred_name).toBe(sampleAnswers.preferred_name);
    expect(loaded!.pain_management).toBe(sampleAnswers.pain_management);
    expect(loaded!.labor_support).toEqual(sampleAnswers.labor_support);
    expect(loaded!.skin_to_skin).toBe(sampleAnswers.skin_to_skin);
  });

  it("overwrites existing answers — second save replaces the first on reload", async () => {
    const updatedAnswers = {
      ...sampleAnswers,
      preferred_name: "Jane (updated)",
    };

    // First save — set up two mockResolvedValueOnce calls on the same spy so
    // both apiSaveBirthPlanAnswers calls are serviced by the same spy instance.
    const spy = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
        text: async () => '{"ok":true}',
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
        text: async () => '{"ok":true}',
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ answers: updatedAnswers }),
        text: async () => JSON.stringify({ answers: updatedAnswers }),
      } as Response);

    await apiSaveBirthPlanAnswers(sampleAnswers, getToken);
    await apiSaveBirthPlanAnswers(updatedAnswers, getToken);

    // spy.mock.calls[1] is the second POST (the update)
    const updateBody = JSON.parse(
      (spy.mock.calls[1][1] as RequestInit).body as string,
    );
    expect(updateBody.answers.preferred_name).toBe("Jane (updated)");

    // Reload — server returns updated answers
    const loaded = await apiLoadBirthPlanAnswers(getToken);
    expect(loaded!.preferred_name).toBe("Jane (updated)");
  });
});
