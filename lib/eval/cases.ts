/* ------------------------------------------------------------------ *
 * The answer key.
 *
 * Each case is a posting's requirements, hand-labelled against
 * `EVAL_DB` with two lists per requirement:
 *
 *   answers — lines that genuinely are evidence. Missing one is a
 *             recall failure, and recall failures are the worst kind:
 *             nothing downstream can recover a line that never made
 *             the shortlist.
 *
 *   traps   — lines on the same topic that are *not* evidence.
 *             Crediting one is a precision failure, and precision
 *             failures are the ones that put a claim on a résumé that
 *             the interview will then test. Every trap here is one a
 *             purely lexical matcher is likely to fall for.
 *
 * A requirement with an empty `answers` list is a deliberate gap: the
 * library has nothing for it, and the right behaviour is to say so.
 *
 * Labels are a judgement call, so the rule used throughout is: a line
 * is an answer if a hiring manager reading it alone would accept it as
 * having done the thing. "Adjacent and might come up in conversation"
 * is not enough — that is what makes a trap.
 * ------------------------------------------------------------------ */

import type { Requirement } from "../agent";

export interface Labelled extends Requirement {
  answers: string[];
  traps?: string[];
}

export interface Case {
  name: string;
  /** what this case is here to catch */
  probes: string;
  requirements: Labelled[];
}

const must = (text: string, keywords: string[], answers: string[], traps: string[] = []): Labelled => ({
  text,
  kind: "must",
  keywords,
  answers,
  traps,
});

const nice = (text: string, keywords: string[], answers: string[], traps: string[] = []): Labelled => ({
  ...must(text, keywords, answers, traps),
  kind: "nice",
});

export const CASES: Case[] = [
  {
    name: "ml-inference",
    probes:
      "Training and serving share almost all of their vocabulary while answering opposite requirements. This is the case that fails if topic overlap is mistaken for evidence.",
    requirements: [
      must(
        "CUDA kernel programming",
        ["cuda", "kernel", "gpu", "triton"],
        ["ml-cuda", "sk-ml"],
        /* GPUs and profiling, but neither line writes a kernel */
        ["ml-train", "ml-profile"]
      ),
      must(
        "Reduce inference latency in production serving",
        ["inference", "latency", "serving", "throughput", "p99"],
        ["ml-serving", "ml-cuda"],
        /* training speed is not inference latency; web LCP is not model serving */
        ["ml-train", "web-perf"]
      ),
      must(
        "Distributed training across many GPUs",
        ["distributed", "training", "fsdp", "multi-node", "cluster"],
        ["ml-train", "sk-ml"],
        ["ml-serving"]
      ),
      nice("React and TypeScript", ["react", "typescript", "frontend"], ["web-react", "sk-web", "sk-lang"]),
    ],
  },
  {
    name: "frontend",
    probes:
      "A role the library genuinely fits, with a large body of off-topic ML text sitting next to it. Catches a matcher that has drifted towards whatever the corpus has most of.",
    requirements: [
      must("Building production React interfaces", ["react", "typescript", "checkout", "ui"], ["web-react", "sk-web"]),
      must(
        "Web performance optimisation",
        ["performance", "bundle", "lcp", "code-splitting"],
        ["web-perf"],
        /* both are about making something faster, and neither is about the web */
        ["ml-cuda", "ml-serving"]
      ),
      must("Accessibility to WCAG standards", ["accessibility", "wcag", "a11y", "screen reader"], ["web-a11y"]),
      must("End-to-end testing in CI", ["playwright", "end-to-end", "testing", "ci"], ["web-test", "sk-web"], ["hw-verif"]),
    ],
  },
  {
    name: "hardware",
    probes: "RTL work, where the giveaway terms are rare and exact. Lexical matching should be at its best here.",
    requirements: [
      must("RTL design in Verilog", ["verilog", "rtl", "pipeline", "risc-v"], ["hw-rtl", "sk-lang"]),
      must("FPGA bring-up and timing closure", ["fpga", "artix", "timing", "synthesis"], ["hw-fpga"]),
      must("Functional verification", ["testbench", "coverage", "constrained-random"], ["hw-verif"], ["web-test"]),
    ],
  },
  {
    name: "vocabulary-gap",
    probes:
      "The known weakness, kept in the report rather than hidden from it: the posting and the library describe the same work in different words. Retrieval alone is expected to score badly here — this case is the measurement of what connecting a model actually buys.",
    requirements: [
      must(
        "Optimising large language model serving throughput",
        ["llm", "serving", "throughput", "optimisation"],
        ["ml-serving", "ml-cuda"],
        ["ml-train"]
      ),
      must(
        "Silicon design verification methodology",
        ["silicon", "verification", "methodology"],
        ["hw-verif"],
        ["web-test"]
      ),
    ],
  },
  {
    name: "off-domain",
    probes:
      "A posting from another profession entirely. Every requirement must be reported as a gap; anything credited here is the system inventing evidence.",
    requirements: [
      must("Administering chemotherapy and managing infusion reactions", ["chemotherapy", "infusion", "oncology"], []),
      must("Paediatric palliative care", ["paediatric", "palliative", "counselling"], []),
      must("Phlebotomy and cannulation", ["phlebotomy", "cannulation", "venepuncture"], []),
      nice("Electronic health records and HIPAA documentation", ["hipaa", "ehr", "records"], []),
    ],
  },
];

/** Every (requirement, line) pair the key says is evidence, across every case. */
export const totalAnswers = (cases: Case[] = CASES) =>
  cases.reduce((n, c) => n + c.requirements.reduce((m, r) => m + r.answers.length, 0), 0);
