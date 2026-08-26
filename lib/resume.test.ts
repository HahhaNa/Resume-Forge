import { describe, expect, it } from "vitest";
import {
  boldRuns,
  buildPlainText,
  buildTex,
  contactHref,
  contactText,
  display,
  resolve,
  richTex,
  tex,
} from "./resume";
import type { Bullet, DB, Entry, Variant } from "./types";

/* ---- a two-entry résumé, small enough to reason about ---- */

const bullet = (id: string, text: string): Bullet => ({ id, text, tags: [] });

const entry = (e: Partial<Entry> & { id: string }): Entry => ({
  kind: "experience",
  org: "",
  title: "",
  location: "",
  period: "",
  bullets: [],
  tags: [],
  ...e,
});

const variant = (v: Partial<Variant> & { id: string }): Variant => ({
  name: "hw",
  label: "Hardware",
  note: "",
  sections: [],
  bulletIds: [],
  header: { phone: true, linkedin: true, github: true, site: true },
  density: "normal",
  fontSize: 11,
  pageTarget: 1,
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...v,
});

function fixture() {
  const db: DB = {
    version: 2,
    tags: ["hw"],
    profile: {
      name: "Jane Doe",
      headline: "",
      email: "jane@example.com",
      phone: "(555) 010-0100",
      linkedin: "linkedin.com/in/jane-doe",
      github: "",
      site: "",
      location: "Portland, OR",
    },
    entries: [
      entry({
        id: "e-school",
        kind: "education",
        org: "Northgate Institute",
        title: "M.S. Computer Science",
        location: "Portland, OR",
        period: "Sep 2026 -- Jun 2028 (expected)",
      }),
      entry({
        id: "e-job",
        org: "Acme R&D",
        title: "Research Intern",
        period: "Jan 2026 -- Jun 2026",
        bullets: [bullet("b1", "Cut **latency** by 40%"), bullet("b2", "Wrote the thing nobody wanted")],
      }),
      entry({ id: "e-quiet", org: "Quiet Corp", bullets: [bullet("b3", "Never ticked")] }),
    ],
    skills: [{ id: "s1", label: "Languages", items: "C++, Python", tags: [] }],
    variants: [
      variant({
        id: "v1",
        sections: [
          { id: "sec-edu", title: "Education", type: "entries", ids: ["e-school"] },
          { id: "sec-exp", title: "Experience", type: "entries", ids: ["e-job", "e-quiet"] },
          { id: "sec-skill", title: "Skills", type: "skills", ids: ["s1"] },
        ],
        bulletIds: ["b1"],
      }),
    ],
    applications: [],
    platforms: [],
    problems: [],
  };
  return { db, v: db.variants[0] };
}

describe("tex", () => {
  it("escapes the characters that would otherwise be markup", () => {
    expect(tex("R&D 100% #1 $5 a_b {x} ^2")).toBe(
      "R\\&D 100\\% \\#1 \\$5 a\\_b \\{x\\} \\^{}2"
    );
  });

  it("turns the symbols people paste into maths mode", () => {
    expect(tex("~5x faster, ≥3 GPUs, 2×, a→b")).toBe(
      "$\\sim$5x faster, $\\geq$3 GPUs, 2$\\times$, a$\\rightarrow$b"
    );
  });

  it("escapes a backslash rather than emitting a command", () => {
    expect(tex("a\\b")).toBe("a\\textbackslash{}b");
  });
});

describe("boldRuns", () => {
  it("splits a line into its plain and bold runs", () => {
    expect(boldRuns("Cut **latency** by 40%")).toEqual([
      { text: "Cut ", bold: false },
      { text: "latency", bold: true },
      { text: " by 40%", bold: false },
    ]);
  });

  it("lets a lone asterisk live inside a bold", () => {
    // "A* search" must not end the bold early
    expect(boldRuns("**A* search**")).toEqual([{ text: "A* search", bold: true }]);
  });

  it("leaves arithmetic alone", () => {
    expect(boldRuns("3 ** 4")).toEqual([{ text: "3 ** 4", bold: false }]);
  });

  it("prints an unclosed delimiter instead of bolding the rest of the line", () => {
    // the author is still mid-word; nothing should visibly change yet
    expect(boldRuns("half **written")).toEqual([{ text: "half **written", bold: false }]);
  });

  it("bolds the inside of a triple run rather than leaving stray asterisks", () => {
    expect(boldRuns("***x***")).toEqual([{ text: "x", bold: true }]);
  });

  it("prints a line of nothing but asterisks as typed", () => {
    // there is nothing for the delimiter to open onto, so it is not a delimiter
    expect(boldRuns("****")).toEqual([{ text: "****", bold: false }]);
  });

  it("emits no empty runs around a bold that fills the line", () => {
    expect(boldRuns("**all of it**")).toEqual([{ text: "all of it", bold: true }]);
  });
});

describe("richTex", () => {
  it("bolds and escapes in one pass", () => {
    expect(richTex("Cut **R&D** cost by 40%")).toBe("Cut \\textbf{R\\&D} cost by 40\\%");
  });
});

describe("display", () => {
  it("makes the same substitutions pdflatex does", () => {
    expect(display("2023--2024")).toBe("2023–2024");
    expect(display("Acme --- the good one")).toBe("Acme — the good one");
    expect(display("``quoted''")).toBe("“quoted”");
    expect(display("it's")).toBe("it’s");
    expect(display("~5x")).toBe("∼5x");
  });

  it("consumes the longest dash run first", () => {
    // otherwise "---" would come out as an en dash plus a hyphen
    expect(display("a---b")).not.toContain("-");
  });
});

describe("contact", () => {
  it("links an email, a bare domain and a full URL", () => {
    expect(contactHref("jane@example.com")).toBe("mailto:jane@example.com");
    expect(contactHref("github.com/jane")).toBe("https://github.com/jane");
    expect(contactHref("https://jane.dev")).toBe("https://jane.dev");
    expect(contactHref("(555) 010-0100")).toBeNull();
  });

  it("collapses a profile URL only in short style", () => {
    expect(contactText("linkedin", "linkedin.com/in/jane", "short")).toBe("LinkedIn");
    expect(contactText("linkedin", "linkedin.com/in/jane", "full")).toBe("linkedin.com/in/jane");
  });
});

describe("resolve", () => {
  it("keeps only the ticked bullets", () => {
    const { db, v } = fixture();
    const r = resolve(db, v);
    const job = r.sections[1].blocks[0];
    expect(job.bullets.map((b) => b.id)).toEqual(["b1"]);
    expect(r.bulletCount).toBe(1);
  });

  it("drops an experience whose every bullet is switched off", () => {
    const { db, v } = fixture();
    const ids = resolve(db, v).sections[1].blocks.map((b) => b.id);
    expect(ids).toEqual(["e-job"]);
    expect(ids).not.toContain("e-quiet");
  });

  it("keeps an education entry that has no bullets at all", () => {
    const { db, v } = fixture();
    expect(resolve(db, v).sections[0].blocks.map((b) => b.id)).toEqual(["e-school"]);
  });

  it("drops a section that ends up with nothing in it", () => {
    const { db, v } = fixture();
    v.sections[1].ids = ["e-quiet"];
    expect(resolve(db, v).sections.map((s) => s.id)).toEqual(["sec-edu", "sec-skill"]);
  });

  it("always shows the email and honours the per-variant opt-outs", () => {
    const { db, v } = fixture();
    v.header.phone = false;
    const fields = resolve(db, v).contact.map((c) => c.field);
    expect(fields).toContain("email");
    expect(fields).not.toContain("phone");
    expect(fields).toContain("linkedin");
  });

  it("lets a variant carry its own contact value, and falls back when it is blank", () => {
    const { db, v } = fixture();
    v.contact = { phone: "(555) 999-9999", linkedin: "" };
    const by = Object.fromEntries(resolve(db, v).contact.map((c) => [c.field, c.text]));
    expect(by.phone).toBe("(555) 999-9999");
    expect(by.linkedin).toBe("linkedin.com/in/jane-doe");
  });

  it("leaves out a contact field nobody filled in", () => {
    const { db, v } = fixture();
    expect(resolve(db, v).contact.map((c) => c.field)).not.toContain("github");
  });
});

describe("buildTex", () => {
  it("produces a document with the résumé in it", () => {
    const { db, v } = fixture();
    const out = buildTex(db, v);
    expect(out).toContain("\\documentclass");
    expect(out).toContain("\\begin{document}");
    expect(out.trimEnd().endsWith("\\end{document}")).toBe(true);
    expect(out).toContain("\\section{Education}");
    expect(out).toContain("Northgate Institute");
  });

  it("escapes user text on the way in", () => {
    const { db, v } = fixture();
    expect(buildTex(db, v)).toContain("Acme R\\&D");
  });

  it("records which bullets it was built from", () => {
    // the header comment is what makes an old .tex traceable to a selection
    const { db, v } = fixture();
    expect(buildTex(db, v)).toContain("b1");
  });

  it("asks for the fontsize package only at 10.5pt", () => {
    const { db, v } = fixture();
    expect(buildTex(db, v)).not.toContain("{fontsize}");
    v.fontSize = 10.5;
    expect(buildTex(db, v)).toContain("{fontsize}");
  });
});

describe("buildPlainText", () => {
  it("gives a parser nothing to trip on", () => {
    const { db, v } = fixture();
    const out = buildPlainText(db, v);
    expect(out).toContain("EDUCATION");
    expect(out).toContain("- Cut latency by 40%");
    expect(out).not.toContain("**");
    expect(out).not.toContain("\\");
    expect(out).not.toContain("\t");
    expect(out).not.toContain("•");
  });

  it("puts the date behind its heading instead of off to the right", () => {
    const { db, v } = fixture();
    expect(buildPlainText(db, v)).toContain("Research Intern");
    expect(buildPlainText(db, v)).toContain("Jan 2026");
  });
});
