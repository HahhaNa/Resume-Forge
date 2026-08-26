import { describe, expect, it } from "vitest";
import { isSkillsSection, kindForSection, parsePlainText, parseTex, unTex } from "./import";
import { buildTex, resolve } from "./resume";
import { SEED } from "./seed";

describe("unTex", () => {
  it("gives back the characters LaTeX had to escape", () => {
    expect(unTex("R\\&D 100\\% \\#1 \\$5 a\\_b")).toBe("R&D 100% #1 $5 a_b");
  });

  it("keeps bold as the app's own markup", () => {
    expect(unTex("Cut \\textbf{latency} by 40\\%")).toBe("Cut **latency** by 40%");
  });

  it("drops grouping braces without dropping what is inside them", () => {
    expect(unTex("{\\small Verilog}")).toContain("Verilog");
  });

  it("reads a non-breaking space as a space", () => {
    expect(unTex("Section~4")).toBe("Section 4");
  });
});

describe("section titles", () => {
  it("maps a heading to the kind of entry underneath it", () => {
    expect(kindForSection("Education")).toBe("education");
    expect(kindForSection("Research Experience")).toBe("experience");
    expect(kindForSection("Selected Projects")).toBe("project");
    expect(kindForSection("Awards & Honors")).toBe("award");
    expect(kindForSection("Leadership & Activities")).toBe("activity");
    expect(kindForSection("學歷")).toBe("education");
  });

  it("falls back to experience for a heading it does not know", () => {
    expect(kindForSection("Other Things I Did")).toBe("experience");
  });

  it("recognises a skills heading in either language", () => {
    expect(isSkillsSection("Technical Skills")).toBe(true);
    expect(isSkillsSection("技能")).toBe(true);
    expect(isSkillsSection("Education")).toBe(false);
  });
});

/**
 * The two halves of the app, checked against each other.
 *
 * `buildTex` is what a user hands to Overleaf; `parseTex` is what reads a .tex back in
 * when they return with it, or arrive from someone else's résumé. If the two ever drift,
 * importing your own export quietly loses rows — and nothing else in the app would say so.
 */
describe("buildTex -> parseTex round trip", () => {
  const v = SEED.variants[0];
  const expected = resolve(SEED, v);
  const draft = parseTex(buildTex(SEED, v));

  it("comes back with no warnings", () => {
    expect(draft.warnings).toEqual([]);
  });

  it("recovers the profile from the header", () => {
    expect(draft.profile.name).toBe(SEED.profile.name);
    expect(draft.profile.email).toBe(SEED.profile.email);
    expect(draft.profile.linkedin).toBe(SEED.profile.linkedin);
  });

  it("keeps every section, in order", () => {
    expect(draft.sections.map((s) => s.title)).toEqual(expected.sections.map((s) => s.title));
  });

  it("keeps a skills section a skills section", () => {
    const kinds = Object.fromEntries(draft.sections.map((s) => [s.title, s.type]));
    for (const s of expected.sections) expect(kinds[s.title]).toBe(s.type);
  });

  it("keeps every entry, in order, with its dates and location", () => {
    const before = expected.sections.flatMap((s) => s.blocks);
    const after = draft.sections.flatMap((s) => s.entries);
    expect(after.map((e) => e.org)).toEqual(before.map((b) => b.org));
    expect(after.map((e) => e.title)).toEqual(before.map((b) => b.title));
    expect(after.map((e) => e.period)).toEqual(before.map((b) => b.period));
    expect(after.map((e) => e.location)).toEqual(before.map((b) => b.location));
  });

  it("keeps every bullet, word for word, bold included", () => {
    const before = expected.sections.flatMap((s) => s.blocks).flatMap((b) => b.bullets);
    const after = draft.sections.flatMap((s) => s.entries).flatMap((e) => e.bullets);
    expect(after).toEqual(before.map((b) => b.text));
  });

  it("keeps the skill rows", () => {
    const before = expected.sections.flatMap((s) => s.skills);
    const after = draft.sections.flatMap((s) => s.skills);
    expect(after.map((s) => s.label)).toEqual(before.map((s) => s.label));
    expect(after.map((s) => s.items)).toEqual(before.map((s) => s.items));
  });
});

describe("parsePlainText", () => {
  const src = `Jane Doe
jane@example.com | linkedin.com/in/jane-doe

EDUCATION
Northgate Institute of Technology                        Portland, OR
M.S. in Computer Science                    Sep 2026 -- Jun 2028

EXPERIENCE
Acme Labs                                                 Remote
Research Intern                             Jan 2026 -- Jun 2026
- Cut inference latency by 40%
- Shipped the thing
`;

  it("finds the person", () => {
    expect(parsePlainText(src).profile.name).toBe("Jane Doe");
    expect(parsePlainText(src).profile.email).toBe("jane@example.com");
  });

  it("finds the sections and gives each one the right kind", () => {
    const d = parsePlainText(src);
    expect(d.sections.map((s) => s.title)).toEqual(["EDUCATION", "EXPERIENCE"]);
    expect(d.sections[0].entries[0].kind).toBe("education");
    expect(d.sections[1].entries[0].kind).toBe("experience");
  });

  it("puts the bullets under the entry they belong to", () => {
    const job = parsePlainText(src).sections[1].entries[0];
    expect(job.org).toContain("Acme Labs");
    expect(job.bullets).toEqual(["Cut inference latency by 40%", "Shipped the thing"]);
  });

  it("cannot pull the right-hand column apart, and keeps the text rather than dropping it", () => {
    // A PDF gives every fragment an x-coordinate, and `linesFromPieces` splits the
    // columns on that. Pasted text has no coordinates — only runs of spaces, which a
    // proportional font makes unreliable — so location and dates stay on the line they
    // arrived on and the user separates them by hand. Losing them would be worse.
    const job = parsePlainText(src).sections[1].entries[0];
    expect(job.org).toBe("Acme Labs Remote");
    expect(job.title).toBe("Research Intern Jan 2026 -- Jun 2026");
    expect(job.location).toBe("");
    expect(job.period).toBe("");
  });
});
