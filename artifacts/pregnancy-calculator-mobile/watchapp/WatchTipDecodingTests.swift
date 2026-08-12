import XCTest
import Foundation

// NOTE: This test bundle compiles the production Watch sources (Models.swift
// et al.) directly — no TEST_HOST, no @testable import — so `WatchTip` below
// is the real Codable implementation shipped in the Watch app.

/// Regression guard: Watch tips must still decode when the incoming JSON
/// (produced by JavaScript) does not carry every field a future developer
/// might add to `WatchTip`'s `CodingKeys`.
///
/// Swift's `JSONDecoder` throws `keyNotFound` for any `CodingKeys` field that
/// is absent from the JSON — UNLESS the property is declared Optional
/// (decodes as nil) or is decoded with `decodeIfPresent` / a custom
/// `init(from:)` default. Therefore any NEW field added to `WatchTip`'s
/// `CodingKeys` MUST be Optional or carry a decode-time default until every
/// JS client sends it, or tips stop appearing on the Watch entirely.
///
/// These tests exercise the real `WatchTip` Codable implementation with the
/// exact JSON shape JavaScript sends today (week / emoji / text only).
final class WatchTipDecodingTests: XCTestCase {
    private let decoder = JSONDecoder()

    /// The minimal payload JS sends today. If a new field is ever added to
    /// Swift's CodingKeys without a default, this decode throws and the test
    /// fails — the explicit signal that the JS payload and CodingKeys drifted.
    func testMinimalPayloadMissingAnyFutureOptionalFieldDecodes() throws {
        let json = Data("""
        {"week": 24, "emoji": "🎃", "text": "No future field sent yet."}
        """.utf8)

        let tip = try decoder.decode(WatchTip.self, from: json)

        XCTAssertEqual(tip.week, 24)
        XCTAssertEqual(tip.emoji, "🎃")
        XCTAssertEqual(tip.text, "No future field sent yet.")
    }

    /// `id` is intentionally excluded from CodingKeys; the UUID default must
    /// be assigned even though JS never sends it.
    func testIdDefaultsToFreshUUIDWhenAbsentFromJSON() throws {
        let json = Data("""
        {"week": 12, "emoji": "🍋", "text": "Baby is lemon-sized."}
        """.utf8)

        let tip = try decoder.decode(WatchTip.self, from: json)

        XCTAssertNotNil(tip.id)
    }

    /// A whole tips array — the shape the phone sends over WCSession — must
    /// decode when items carry only the three current CodingKeys fields.
    func testTipsArrayWithoutFutureFieldDecodes() throws {
        let json = Data("""
        [
          {"week": 24, "emoji": "🎃", "text": "First tip."},
          {"week": 24, "emoji": "💪", "text": "Second tip."}
        ]
        """.utf8)

        let tips = try decoder.decode([WatchTip].self, from: json)

        XCTAssertEqual(tips.count, 2)
        XCTAssertEqual(tips[0].week, 24)
        XCTAssertEqual(tips[0].emoji, "🎃")
        XCTAssertEqual(tips[0].text, "First tip.")
        XCTAssertEqual(tips[1].text, "Second tip.")
    }

    /// Complement of the "missing field" case: extra JSON keys unknown to
    /// CodingKeys are ignored by JSONDecoder, so newer JS payloads remain
    /// backwards compatible with older Watch binaries.
    func testExtraUnknownJSONKeyIsIgnored() throws {
        let json = Data("""
        {"week": 32, "emoji": "⭐", "text": "Extra field present.", "priority": 1}
        """.utf8)

        let tip = try decoder.decode(WatchTip.self, from: json)

        XCTAssertEqual(tip.week, 32)
        XCTAssertEqual(tip.emoji, "⭐")
        XCTAssertEqual(tip.text, "Extra field present.")
    }

    /// Round-trip: encoding a WatchTip must emit only the CodingKeys fields
    /// (never `id`), matching what JS expects if the Watch ever echoes tips.
    func testEncodeEmitsOnlyCodingKeysFields() throws {
        let tip = WatchTip(week: 8, emoji: "🌱", text: "Week 8 tip.")
        let data = try JSONEncoder().encode(tip)
        let object = try XCTUnwrap(
            JSONSerialization.jsonObject(with: data) as? [String: Any]
        )

        XCTAssertEqual(Set(object.keys), Set(["week", "emoji", "text"]))
    }
}
