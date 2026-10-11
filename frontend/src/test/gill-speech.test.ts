import { expect, it } from "vitest";
import { mouthCues } from "@/lib/gill-speech";
it("uses provider timestamps for vowel groups and closes between them", () => {
  expect(
    mouthCues({
      characters: ["b", "o", "a", "t", " ", "a"],
      character_start_times_seconds: [0, 0.1, 0.2, 0.3, 0.4, 1],
      character_end_times_seconds: [0.1, 0.2, 0.3, 0.4, 0.6, 1.2],
    }),
  ).toEqual([
    { start: 0.1, end: 0.3 },
    { start: 1, end: 1.2 },
  ]);
});
it("rejects mismatched alignment arrays", () => {
  expect(() =>
    mouthCues({
      characters: ["a"],
      character_start_times_seconds: [],
      character_end_times_seconds: [0.2],
    }),
  ).toThrow("incomplete");
});
