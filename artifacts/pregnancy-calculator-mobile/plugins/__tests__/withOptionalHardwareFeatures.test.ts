/**
 * withOptionalHardwareFeatures marks implied hardware features as optional so
 * Play doesn't exclude landscape-only or Wi-Fi-less devices.
 */
import {
  markFeaturesOptional,
  OPTIONAL_FEATURES,
} from "../withOptionalHardwareFeatures";

type Feature = { $: Record<string, string> };

function manifest(features?: Feature[]) {
  return {
    manifest: {
      $: { "xmlns:android": "http://schemas.android.com/apk/res/android" },
      ...(features ? { "uses-feature": features } : {}),
    },
  } as { manifest: { "uses-feature"?: Feature[] } };
}

function required(m: ReturnType<typeof manifest>, name: string) {
  return m.manifest["uses-feature"]?.find((f) => f.$["android:name"] === name)
    ?.$["android:required"];
}

describe("withOptionalHardwareFeatures", () => {
  it("covers portrait screens and Wi-Fi", () => {
    expect(OPTIONAL_FEATURES).toEqual([
      "android.hardware.screen.portrait",
      "android.hardware.wifi",
    ]);
  });

  it("adds both features as optional to a manifest with none", () => {
    const m = markFeaturesOptional(manifest());
    expect(required(m, "android.hardware.screen.portrait")).toBe("false");
    expect(required(m, "android.hardware.wifi")).toBe("false");
  });

  it("turns an existing required declaration optional without duplicating it", () => {
    const m = markFeaturesOptional(
      manifest([
        {
          $: {
            "android:name": "android.hardware.wifi",
            "android:required": "true",
          },
        },
      ]),
    );
    const wifi = m.manifest["uses-feature"]!.filter(
      (f) => f.$["android:name"] === "android.hardware.wifi",
    );
    expect(wifi).toHaveLength(1);
    expect(wifi[0].$["android:required"]).toBe("false");
  });

  it("leaves other features alone", () => {
    const m = markFeaturesOptional(
      manifest([
        {
          $: {
            "android:name": "android.hardware.microphone",
            "android:required": "true",
          },
        },
      ]),
    );
    expect(required(m, "android.hardware.microphone")).toBe("true");
    expect(m.manifest["uses-feature"]).toHaveLength(3);
  });

  it("is idempotent across repeated prebuilds", () => {
    const m = markFeaturesOptional(markFeaturesOptional(manifest()));
    expect(m.manifest["uses-feature"]).toHaveLength(2);
  });
});
