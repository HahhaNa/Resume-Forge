import { describe, expect, it } from "vitest";
import { EMPTY_PERIOD, formatPeriod, parsePeriod, yearOptions } from "./period";

/** Parse then format: what the picker does every time you touch a dropdown. */
const round = (s: string) => {
  const p = parsePeriod(s);
  return p ? formatPeriod(p) : null;
};

describe("formatPeriod", () => {
  it("writes a full range in the one house style", () => {
    expect(
      formatPeriod({ ...EMPTY_PERIOD, startTerm: "Sep", startYear: "2022", endTerm: "Jun", endYear: "2026" })
    ).toBe("Sep 2022 -- Jun 2026");
  });

  it("drops the month when only a year is set", () => {
    expect(formatPeriod({ ...EMPTY_PERIOD, startYear: "2025" })).toBe("2025");
  });

  it("ignores a month with no year, rather than printing a bare month", () => {
    expect(formatPeriod({ ...EMPTY_PERIOD, startTerm: "Sep" })).toBe("");
  });

  it("renders an open range as Present and leaves the end date unused", () => {
    expect(
      formatPeriod({ ...EMPTY_PERIOD, startTerm: "Jan", startYear: "2025", present: true, endYear: "2030" })
    ).toBe("Jan 2025 -- Present");
  });

  it("appends (expected) last, after the range", () => {
    expect(
      formatPeriod({
        ...EMPTY_PERIOD,
        startTerm: "Sep",
        startYear: "2026",
        endTerm: "Jun",
        endYear: "2028",
        expected: true,
      })
    ).toBe("Sep 2026 -- Jun 2028 (expected)");
  });

  it("never emits a lone (expected) with no dates", () => {
    expect(formatPeriod({ ...EMPTY_PERIOD, expected: true })).toBe("");
  });

  it("keeps a term the picker offers instead of a month", () => {
    expect(formatPeriod({ ...EMPTY_PERIOD, startTerm: "Summer", startYear: "2022" })).toBe("Summer 2022");
  });
});

describe("parsePeriod", () => {
  it("round-trips what the picker itself writes", () => {
    for (const s of [
      "Sep 2026 -- Jun 2028 (expected)",
      "Sep 2022 -- Jun 2026",
      "Summer 2022",
      "2025",
      "Jan 2025 -- Present",
      "Fall 2020 -- Spring 2021",
      "",
    ]) {
      expect(round(s)).toBe(s);
    }
  });

  it("normalises the shapes a human or an import writes", () => {
    expect(round("Sept 2025")).toBe("Sep 2025");
    expect(round("September 2025 - Present")).toBe("Sep 2025 -- Present");
    expect(round("Jan 2025 to Mar 2025")).toBe("Jan 2025 -- Mar 2025");
    expect(round("May 2024 – Aug 2024")).toBe("May 2024 -- Aug 2024");
    expect(round("2023--2024")).toBe("2023 -- 2024");
    expect(round("Autumn 2019")).toBe("Fall 2019");
    expect(round("Jun 2026 (expected)")).toBe("Jun 2026 (expected)");
  });

  it("reads the parts back, not just the string", () => {
    expect(parsePeriod("Aug 2025 -- Present")).toEqual({
      startTerm: "Aug",
      startYear: "2025",
      endTerm: "",
      endYear: "",
      present: true,
      expected: false,
    });
  });

  it("treats every word for still-going as Present", () => {
    for (const w of ["Present", "present", "Now", "current", "ongoing"]) {
      expect(parsePeriod(`Jan 2025 -- ${w}`)?.present).toBe(true);
    }
  });

  it("gives back null for anything the pickers cannot say", () => {
    // null is the signal to keep the text exactly as written — see PeriodField
    for (const s of ["Summers 2022 & 2023", "Q3 2025", "Ongoing", "sometime in 2020", "2023-24"]) {
      expect(parsePeriod(s), s).toBeNull();
    }
  });

  it("does not mistake a year outside living memory for a date", () => {
    expect(parsePeriod("Jan 1899")).toBeNull();
  });
});

describe("yearOptions", () => {
  it("runs newest first and covers the current year", () => {
    const years = yearOptions();
    const now = new Date().getFullYear();
    expect(years[0]).toBe(String(now + 6));
    expect(years).toContain(String(now));
    expect([...years].sort((a, b) => Number(b) - Number(a))).toEqual(years);
  });

  it("keeps a stored year that falls outside the offered range", () => {
    // opening an old entry must never quietly drop its year
    expect(yearOptions("1972")).toContain("1972");
  });

  it("does not duplicate a stored year that is already offered", () => {
    const now = String(new Date().getFullYear());
    expect(yearOptions(now, now).filter((y) => y === now)).toHaveLength(1);
  });
});
