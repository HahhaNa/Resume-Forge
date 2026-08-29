/* ------------------------------------------------------------------ *
 * The library the eval measures against.
 *
 * Deliberately not `seed.ts`. The starter content is there to make the
 * app look alive on first run, it gets edited whenever that goal
 * changes, and an answer key pinned to it would rot silently — every
 * score in the report would move and none of them would mean anything.
 * This corpus exists only to be measured, so it can be held still.
 *
 * It is built to be *hard* in the two ways this system can fail:
 *
 *   Vocabulary mismatch — `ml-cuda` says "decode latency on a 7B
 *   model" and never says "LLM inference", which is how a posting will
 *   ask for it.
 *
 *   Topical near-misses — `ml-train` and `ml-serving` share most of
 *   their words while answering opposite requirements, and `web-perf`
 *   is about latency and is not about model serving. These are the
 *   traps in `cases.ts`, and they are the reason the report measures
 *   precision rather than only recall: a matcher that returns
 *   everything on the right topic scores perfectly on recall and is
 *   useless.
 * ------------------------------------------------------------------ */

import type { Bullet, DB, Entry } from "../types";

const b = (id: string, text: string, tags: string[] = []): Bullet => ({ id, text, tags });

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

export const EVAL_DB: DB = {
  version: 2,
  tags: ["ml", "web", "hw"],
  profile: {
    name: "Ada Reyes",
    headline: "",
    email: "ada@example.com",
    phone: "",
    linkedin: "",
    github: "",
    site: "",
    location: "",
  },
  entries: [
    entry({
      id: "e-school",
      kind: "education",
      org: "Northgate Institute",
      title: "M.S. Computer Science",
      period: "Sep 2024 -- Jun 2026",
    }),
    entry({
      id: "e-ml",
      org: "Vector Labs",
      title: "ML Systems Intern",
      tags: ["ml"],
      bullets: [
        b("ml-cuda", "Wrote fused CUDA kernels for attention, cutting decode latency on a 7B model by 38%"),
        b("ml-serving", "Rebuilt the inference server to batch requests, holding p99 under 80 ms at 4x throughput"),
        b("ml-train", "Trained a 1.3B model across 32 GPUs with FSDP, recovering from node failures without a restart"),
        b("ml-profile", "Profiled the training loop with Nsight and removed three host-device synchronisations"),
        b("ml-data", "Built the pipeline that deduplicated 400M documents before pretraining"),
      ],
    }),
    entry({
      id: "e-web",
      org: "Bellwether",
      title: "Frontend Engineer",
      tags: ["web"],
      bullets: [
        b("web-react", "Built the checkout flow in React and TypeScript, cutting abandonment by 12%"),
        b("web-perf", "Cut largest contentful paint from 4.1s to 1.3s by code-splitting the bundle"),
        b("web-a11y", "Took the product to WCAG 2.1 AA across forty screens"),
        b("web-test", "Set up Playwright end-to-end tests that run on every pull request"),
      ],
    }),
    entry({
      id: "e-hw",
      org: "Northgate",
      title: "Digital Design Intern",
      tags: ["hw"],
      bullets: [
        b("hw-rtl", "Designed a five-stage RISC-V pipeline in Verilog with hazard detection and forwarding"),
        b("hw-fpga", "Brought the design up on an Artix-7 FPGA and closed timing at 100 MHz"),
        b("hw-verif", "Wrote a constrained-random testbench reaching 96% functional coverage"),
      ],
    }),
  ],
  skills: [
    { id: "sk-lang", label: "Languages", items: "C++, Python, TypeScript, Verilog", tags: [] },
    { id: "sk-ml", label: "ML", items: "PyTorch, CUDA, Triton, FSDP, TensorRT", tags: ["ml"] },
    { id: "sk-web", label: "Web", items: "React, Next.js, Tailwind, Playwright", tags: ["web"] },
  ],
  variants: [
    {
      id: "v-eval",
      name: "eval",
      label: "Eval",
      note: "",
      sections: [
        { id: "s-edu", title: "Education", type: "entries", ids: ["e-school"] },
        { id: "s-exp", title: "Experience", type: "entries", ids: ["e-ml", "e-web", "e-hw"] },
        { id: "s-sk", title: "Technical Skills", type: "skills", ids: ["sk-lang", "sk-ml", "sk-web"] },
      ],
      bulletIds: [],
      header: { phone: false, linkedin: false, github: false, site: false },
      density: "tight",
      fontSize: 10,
      pageTarget: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  applications: [],
  platforms: [],
  problems: [],
};

export const EVAL_VARIANT = EVAL_DB.variants[0];
