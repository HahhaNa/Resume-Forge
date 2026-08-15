import type { DB, Entry, Bullet, Variant } from "./types";

// Demo content. Everything here is fictional and exists only so a fresh browser
// has something to look at. Replace it from the Data tab (import a JSON export)
// or just edit the entries in place — your own copy lives in localStorage and is
// never written back to this file.

let n = 0;
const b = (text: string, tags: string[]): Bullet => ({ id: `b${++n}`, text, tags });

const entries: Entry[] = [
  {
    id: "edu-grad",
    kind: "education",
    org: "Northgate Institute of Technology",
    title: "M.S. in Computer Science and Engineering",
    location: "Portland, OR",
    period: "Sep 2026 -- Jun 2028 (expected)",
    tags: ["hw", "ml", "sw"],
    bullets: [b("Incoming graduate student, Computer Science and Engineering.", [])],
  },
  {
    id: "edu-undergrad",
    kind: "education",
    org: "Lakeside University",
    title: "B.S. in Computer Science, GPA 3.7/4.0",
    location: "Madison, WI",
    period: "Sep 2022 -- Jun 2026",
    tags: ["hw", "ml", "sw"],
    bullets: [
      b(
        "Coursework: Advanced Computer Architecture, VLSI Physical Design Automation, IC Design, Verilog/FPGA Lab, Logic Design.",
        ["hw"]
      ),
      b(
        "Coursework: Deep Learning, Machine Learning, AI Computing Architecture and Systems, Advanced Computer Architecture.",
        ["ml"]
      ),
      b(
        "Coursework: Operating Systems, Data Structures, Algorithms, Database Systems, Computer Architecture.",
        ["sw"]
      ),
      b("Exchange semester at Riverbend Tech, School of Computing, Spring 2026.", ["hw", "ml", "sw"]),
    ],
  },
  {
    id: "edu-exchange",
    kind: "education",
    org: "Riverbend Institute of Technology",
    title: "Exchange Student, School of Computing",
    location: "Vancouver, BC",
    period: "Jan 2026 -- Jun 2026",
    tags: [],
    bullets: [b("Selected for a one-semester exchange; concurrent research in the systems lab.", [])],
  },

  {
    id: "exp-lab-ml",
    kind: "experience",
    org: "Efficient Systems Lab, Riverbend Tech",
    title: "Research Intern",
    location: "Vancouver, BC",
    period: "Jan 2026 -- Jun 2026",
    tags: ["ml", "sw"],
    bullets: [
      b(
        "Co-author on a workshop paper under review on training-free structural pruning for language models.",
        ["ml", "sw"]
      ),
      b(
        "Ran the full experimental evaluation across two open model families and two public benchmarks on a 4-GPU node.",
        ["ml"]
      ),
      b("Contributed the pruning method's ablation study and the reported baselines.", ["ml"]),
      b(
        "Built the evaluation harness on top of an open-source framework, cutting a full benchmark sweep from days to hours.",
        ["ml", "sw"]
      ),
    ],
  },
  {
    id: "exp-lab-hw",
    kind: "experience",
    org: "VLSI/CAD Laboratory, Lakeside University",
    title: "Undergraduate Researcher",
    location: "Madison, WI",
    period: "Feb 2025 -- Nov 2025",
    tags: ["hw", "ml"],
    bullets: [
      b(
        "Independently developed a bidirectional GraphSAGE-LSTM detector for hardware Trojans in gate-level netlists -- 21-dim structural features, circuit-level augmentation, and class-weighted loss for the ~1:50 imbalance; **87.8% F1 and 90% recall** on the contest benchmark.",
        ["hw", "ml"]
      ),
      b(
        "Ran synthesis and feature-extraction flows with commercial and open-source synthesis tools over standard public benchmark suites.",
        ["hw"]
      ),
      b("Team write-up won **First Prize at the department capstone competition**.", ["hw", "ml", "sw"]),
      b(
        "Designed a data-augmentation pipeline generating 9,000+ synthetic netlists via gate substitution and Trojan pattern injection.",
        ["hw"]
      ),
      b(
        "Engineered circuit-level features (controllability/observability, rare-signal probability < 0.01, fan-in/out, reconvergent paths, PageRank), lifting F1 by 8%.",
        ["hw"]
      ),
      b(
        "Built a reproducible Docker pipeline for preprocessing and evaluation; cut training from ~16 min on CPU to ~1 min on GPU (~15x).",
        ["ml", "sw"]
      ),
      b(
        "Ran systematic ablations showing the bidirectional message passing accounted for a 15% accuracy gain over the baseline GNN.",
        []
      ),
    ],
  },
  {
    id: "exp-industry",
    kind: "experience",
    org: "Meridian Robotics Research Institute",
    title: "Autonomous Mobile Robot Navigation Intern",
    location: "Madison, WI",
    period: "May 2025 -- Oct 2025",
    tags: ["hw", "ml", "sw"],
    bullets: [
      b(
        "Tuned ROS2 (Nav2) obstacle-avoidance and costmap parameters over remote access for a medical-logistics robot deployed at a regional hospital.",
        ["sw", "ml"]
      ),
      b(
        "Wrote and ran **30+ scenario test cases** against the deployed fleet (85% pass rate), turning field failures into reproducible regressions.",
        ["sw", "hw"]
      ),
      b(
        "Built an MQTT-based order-dispatch module letting staff request transports from a web interface.",
        ["sw"]
      ),
      b(
        "Analyzed field deployment logs and proposed costmap adjustments that reduced collision warnings by 20%.",
        ["sw", "ml"]
      ),
      b("Designed and tested a bed-yielding behavior for crowded corridors.", ["sw"]),
    ],
  },

  {
    id: "proj-riscv-cpu",
    kind: "project",
    org: "RISC-V Five-Stage Pipelined CPU",
    title: "Chisel, C++",
    location: "",
    period: "2025",
    tags: ["hw", "sw"],
    bullets: [
      b(
        "Designed an RV32I five-stage pipeline with hazard detection, data forwarding, and branch prediction; **~3.7x speedup** over the single-cycle baseline in CPI analysis.",
        ["hw", "sw", "ml"]
      ),
      b(
        "Added B-extension bit-manipulation instructions (~3.07x on crypto workloads) and verified against C++ testbenches with a 100% pass rate on the rv32ui suite.",
        ["hw"]
      ),
      b("Measured 1.3 average CPI at 85% pipeline utilization across benchmark programs.", []),
    ],
  },
  {
    id: "proj-riscv-emu",
    kind: "project",
    org: "RISC-V ISA Emulator Extension",
    title: "C++",
    location: "",
    period: "2025",
    tags: ["hw", "sw"],
    bullets: [
      b(
        "Extended a base emulator with M-extension (MUL/DIV/REM) and bit-manipulation instructions, including corner-case handling; validated against a reference simulator on 1,000+ random tests.",
        ["hw", "sw"]
      ),
      b("Replaced switch-case decode with jump-table dispatch, improving runtime by 3--4%.", ["hw", "sw"]),
    ],
  },
  {
    id: "proj-analog",
    kind: "project",
    org: "Symmetry-Constrained Analog Placement",
    title: "C++, EDA",
    location: "",
    period: "2025",
    tags: ["hw"],
    bullets: [
      b("Built a placer using HB*-tree and ASF-B*-tree representations to honor analog symmetry groups.", ["hw"]),
      b(
        "Two-stage simulated annealing (group optimization, then global refinement) with rotation, subtree-swap, and symmetry-type perturbations -- **18% area reduction** vs. manual placement.",
        ["hw"]
      ),
    ],
  },
  {
    id: "proj-floorplan",
    kind: "project",
    org: "Fixed-Outline Floorplanning with Simulated Annealing",
    title: "C++, EDA",
    location: "",
    period: "2025",
    tags: ["hw"],
    bullets: [
      b(
        "Implemented Wong--Liu SA for slicing floorplans under fixed-outline constraints, with a cost function balancing area, aspect ratio, HPWL, and outline violation.",
        ["hw"]
      ),
      b("Extended to B*-tree for non-slicing floorplans, improving solution quality by 20% on MCNC.", ["hw"]),
    ],
  },
  {
    id: "proj-fpga",
    kind: "project",
    org: "FPGA Interactive Music-Sheet Editor / Player",
    title: "Verilog, Xilinx Vivado",
    location: "",
    period: "2023--2024",
    tags: ["hw"],
    bullets: [
      b(
        "Two-person final project (~2.3K lines of RTL) on an Artix-7 board integrating VGA display, PS/2 keyboard input, and I2S audio; owned the audio/input path and overall architecture.",
        ["hw"]
      ),
      b(
        "Implemented cursor navigation over 256 notes at 16th-note resolution across four staff lines with boundary handling.",
        ["hw"]
      ),
      b("Optimized block memory by sharing 16 note sprites across the custom pixel-art renderer.", []),
    ],
  },
  {
    id: "proj-ann",
    kind: "project",
    org: "Approximate Nearest Neighbor Search for an Embedded DB",
    title: "Java, SIMD",
    location: "",
    period: "2025",
    tags: ["sw", "ml"],
    bullets: [
      b(
        "Implemented an IVF index with k-means clustering and dedicated centroid tables, cutting search space by **90% at 95% recall@10**.",
        ["sw", "ml"]
      ),
      b(
        "Vectorized Euclidean distance with the JDK vector API (4x), giving 12x end-to-end throughput over full scan on million-scale datasets.",
        ["sw", "ml"]
      ),
    ],
  },
  {
    id: "proj-yolo",
    kind: "project",
    org: "Object Detection: Post-Processing Analysis",
    title: "Python, PyTorch",
    location: "",
    period: "2025",
    tags: ["ml"],
    bullets: [
      b("Trained a YOLO detector on PASCAL VOC (5,011 images) for a course competition.", ["ml"]),
      b(
        "Systematically analyzed how confidence/IoU thresholds, checkpoint selection, and validation split affect AP, and used the analysis to pick the final configuration.",
        ["ml"]
      ),
    ],
  },
  {
    id: "proj-a11y",
    kind: "project",
    org: "Desktop Accessibility Agent",
    title: "Python, LLM, UI Automation API, OCR",
    location: "",
    period: "2025--2026",
    tags: ["sw", "ml"],
    bullets: [
      b(
        "Led a team building a desktop agent that drives a GUI from natural language by combining an LLM with the platform accessibility API and OCR fallback.",
        ["sw", "ml"]
      ),
      b("Reached 90% UI-element detection accuracy with end-to-end task completion under 20 s.", ["sw", "ml"]),
    ],
  },

  {
    id: "award-capstone",
    kind: "award",
    org: "First Prize, Department Capstone Competition",
    title: "1st of 98 teams",
    location: "",
    period: "2026",
    tags: ["hw", "ml", "sw"],
    bullets: [],
  },
  {
    id: "award-contest",
    kind: "award",
    org: "Honorable Mention, CAD Contest",
    title: "Hardware Trojan Detection track",
    location: "",
    period: "2025",
    tags: ["hw", "ml"],
    bullets: [],
  },

  {
    id: "act-devclub",
    kind: "activity",
    org: "Campus Developer Club",
    title: "Agile Lead",
    location: "Madison, WI",
    period: "Aug 2025 -- Jun 2026",
    tags: ["sw"],
    bullets: [
      b(
        "Ran sprint planning, prioritization, and standups for a multi-member team; shipped every milestone on schedule.",
        ["sw"]
      ),
      b("Organized AI/ML workshops and mentored first-time contributors.", ["sw"]),
    ],
  },
  {
    id: "act-hpc",
    kind: "activity",
    org: "Student Cluster Competition Training Camp",
    title: "Participant",
    location: "Madison, WI",
    period: "Summer 2022",
    tags: ["hw", "sw"],
    bullets: [
      b(
        "Intensive HPC training -- Linux administration, MPI programming, Slurm scheduling; built and tuned a small OpenMPI cluster.",
        ["hw", "sw"]
      ),
    ],
  },
];

const skills = [
  {
    id: "sk-rtl",
    label: "RTL / Verification",
    items: "Verilog, Chisel, testbench design, FPGA bring-up (Artix-7, Vivado)",
    tags: ["hw"],
  },
  {
    id: "sk-eda",
    label: "EDA & Architecture",
    items:
      "Commercial and open-source synthesis flows, gate-level netlist analysis; RISC-V RV32I/M/B, pipelining, CPI analysis",
    tags: ["hw"],
  },
  {
    id: "sk-ml",
    label: "ML / DL",
    items: "PyTorch, GNN (GraphSAGE/GCN), LLM evaluation & structural pruning, YOLO, multi-GPU training",
    tags: ["ml"],
  },
  {
    id: "sk-mlsys",
    label: "Systems for ML",
    items: "CUDA basics, mixed-precision training, profiling & throughput analysis, Docker, Slurm",
    tags: ["ml"],
  },
  {
    id: "sk-hwbg",
    label: "Hardware background",
    items: "Verilog, Chisel, RISC-V pipelines, FPGA, synthesis flows",
    tags: ["ml", "sw"],
  },
  {
    id: "sk-sys",
    label: "Systems",
    items: "Operating systems, concurrency, database internals, SIMD optimization, ROS2, MQTT",
    tags: ["sw"],
  },
  {
    id: "sk-lang",
    label: "Languages & Tools",
    items: "C/C++, Python, Java, Bash, SQL; Linux, Git, Docker, Make",
    tags: ["hw", "ml", "sw"],
  },
];

const now = new Date("2026-07-27").toISOString();

const variants: Variant[] = [
  {
    id: "v-hw",
    name: "hw",
    label: "Hardware / RTL / Architecture",
    note: "Silicon vendors, EDA companies",
    sections: [
      { id: "s1", title: "Education", type: "entries", ids: ["edu-grad", "edu-undergrad"] },
      { id: "s2", title: "Awards & Honors", type: "entries", ids: ["award-capstone", "award-contest"] },
      { id: "s3", title: "Research Experience", type: "entries", ids: ["exp-lab-hw", "exp-lab-ml"] },
      { id: "s4", title: "Industry Experience", type: "entries", ids: ["exp-industry"] },
      {
        id: "s5",
        title: "Selected Projects",
        type: "entries",
        ids: ["proj-riscv-cpu", "proj-analog", "proj-fpga"],
      },
      { id: "s6", title: "Technical Skills", type: "skills", ids: ["sk-rtl", "sk-eda", "sk-lang"] },
    ],
    bulletIds: [],
    header: { phone: true, linkedin: true, github: true, site: false },
    density: "tight",
    fontSize: 10,
    pageTarget: 1,
    updatedAt: now,
  },
  {
    id: "v-ml",
    name: "ml",
    label: "ML Systems / AI Infrastructure",
    note: "AI infra, training platforms, accelerator software",
    sections: [
      { id: "s1", title: "Education", type: "entries", ids: ["edu-grad", "edu-undergrad"] },
      { id: "s2", title: "Awards & Honors", type: "entries", ids: ["award-capstone", "award-contest"] },
      { id: "s3", title: "Research Experience", type: "entries", ids: ["exp-lab-ml", "exp-lab-hw"] },
      { id: "s4", title: "Industry Experience", type: "entries", ids: ["exp-industry"] },
      {
        id: "s5",
        title: "Selected Projects",
        type: "entries",
        ids: ["proj-yolo", "proj-ann", "proj-riscv-cpu"],
      },
      { id: "s6", title: "Technical Skills", type: "skills", ids: ["sk-ml", "sk-mlsys", "sk-hwbg", "sk-lang"] },
    ],
    bulletIds: [],
    header: { phone: true, linkedin: true, github: true, site: false },
    density: "tight",
    fontSize: 10,
    pageTarget: 1,
    updatedAt: now,
  },
  {
    id: "v-sw",
    name: "sw",
    label: "Software Engineering / Systems",
    note: "General SWE, infra, backend",
    sections: [
      { id: "s1", title: "Education", type: "entries", ids: ["edu-grad", "edu-undergrad"] },
      { id: "s2", title: "Awards & Honors", type: "entries", ids: ["award-capstone", "award-contest"] },
      { id: "s3", title: "Experience", type: "entries", ids: ["exp-industry", "exp-lab-ml", "exp-lab-hw"] },
      {
        id: "s4",
        title: "Selected Projects",
        type: "entries",
        ids: ["proj-ann", "proj-a11y", "proj-riscv-emu"],
      },
      { id: "s5", title: "Technical Skills", type: "skills", ids: ["sk-lang", "sk-sys", "sk-ml"] },
    ],
    bulletIds: [],
    header: { phone: true, linkedin: true, github: true, site: false },
    density: "tight",
    fontSize: 10,
    pageTarget: 1,
    updatedAt: now,
  },
];

// preselect bullets whose tags include the variant name
for (const v of variants) {
  v.bulletIds = entries
    .flatMap((e) => e.bullets)
    .filter((bl) => bl.tags.includes(v.name))
    .map((bl) => bl.id);
}

export const SEED: DB = {
  version: 1,
  // The demo vocabulary — three target tracks plus one for a second language.
  // Rename, reorder or replace these from the Data tab; nothing is hardcoded.
  tags: ["hw", "ml", "sw", "tw"],
  profile: {
    name: "Jane Doe",
    headline: "MSCSE candidate | Hardware + ML Systems",
    email: "jane.doe@example.com",
    phone: "(555) 010-0100",
    linkedin: "linkedin.com/in/jane-doe",
    github: "github.com/jane-doe",
    site: "",
    location: "Portland, OR",
  },
  entries,
  skills,
  variants,
  applications: [],
  // Two placeholders so the tab is not empty. Point them at whatever you actually
  // practise on from the Practice tab; a platform served by deep-ml.com additionally
  // gets catalogue sync, which is detected from the URL rather than from this list.
  platforms: [
    { id: "p-algo", name: "Algorithms", url: "", kind: "algorithms", color: "s1", target: 150 },
    { id: "p-domain", name: "Domain practice", url: "", kind: "other", color: "s3", target: 60 },
  ],
  problems: [],
};
