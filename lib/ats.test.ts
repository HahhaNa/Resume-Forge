import { describe, expect, it } from "vitest";
import { parseJdUrl } from "./ats";

describe("parseJdUrl, recognised ATS", () => {
  it("reads the company out of the path", () => {
    expect(parseJdUrl("https://boards.greenhouse.io/acmelabs/jobs/4012345")).toMatchObject({
      company: "Acmelabs",
      portal: "Greenhouse",
    });
    expect(parseJdUrl("https://jobs.lever.co/acme-labs/1a2b3c")).toMatchObject({
      company: "Acme Labs",
      portal: "Lever",
    });
    expect(parseJdUrl("https://jobs.ashbyhq.com/acme/1234")).toMatchObject({ portal: "Ashby" });
  });

  it("reads the company out of the subdomain", () => {
    expect(parseJdUrl("https://acme.wd1.myworkdayjobs.com/en-US/careers/job/123")).toMatchObject({
      company: "Acme",
      portal: "Workday",
    });
    expect(parseJdUrl("https://acme.recruitee.com/o/ml-engineer")).toMatchObject({
      portal: "Recruitee",
    });
  });
});

describe("parseJdUrl, aggregators", () => {
  it("keeps the source and leaves the company blank", () => {
    // the URL genuinely does not name the company — guessing would be worse than empty
    expect(parseJdUrl("https://www.linkedin.com/jobs/view/4012345678")).toMatchObject({
      company: "",
      portal: "",
      source: "LinkedIn",
    });
    expect(parseJdUrl("https://www.104.com.tw/job/abcdef")).toMatchObject({ source: "104" });
    expect(parseJdUrl("https://simplify.jobs/p/xyz")).toMatchObject({ source: "Simplify" });
  });

  it("takes the company from a Cake company page, but not from a bare listing", () => {
    expect(parseJdUrl("https://www.cake.me/companies/acme/jobs/ml-engineer")).toMatchObject({
      company: "Acme",
      source: "Cake",
    });
    expect(parseJdUrl("https://www.cake.me/jobs/ml-engineer")).toMatchObject({ company: "" });
  });
});

describe("parseJdUrl, the company's own site", () => {
  it("falls back to the registrable domain", () => {
    expect(parseJdUrl("https://careers.acme.com/openings/senior-ml-engineer")).toMatchObject({
      company: "Acme",
      portal: "",
    });
  });

  it("skips subdomain labels that name a function rather than a company", () => {
    expect(parseJdUrl("https://jobs.acme.co.uk/roles/ml-engineer")?.company).toBe("Acme");
  });
});

describe("parseJdUrl, the role slug", () => {
  it("reads a title that reads like words", () => {
    expect(parseJdUrl("https://jobs.lever.co/acme/x/senior-ml-engineer")?.role).toBe(
      "Senior ML Engineer"
    );
  });

  it("keeps acronyms as acronyms rather than title-casing them", () => {
    expect(parseJdUrl("https://careers.acme.com/jobs/gpu-kernel-engineer")?.role).toBe(
      "GPU Kernel Engineer"
    );
  });

  it("does not mistake an id for a job title", () => {
    expect(parseJdUrl("https://boards.greenhouse.io/acme/jobs/4012345")?.role).toBe("");
    expect(parseJdUrl("https://acme.com/jobs/8f14e45f-ceea-167a-5a36-dedd4bea2543")?.role).toBe("");
  });
});

describe("parseJdUrl, non-URLs", () => {
  it("returns null rather than guessing", () => {
    expect(parseJdUrl("")).toBeNull();
    expect(parseJdUrl("Acme Labs ML Engineer")).toBeNull();
    expect(parseJdUrl("localhost")).toBeNull();
  });

  it("accepts a URL with no scheme, the way it arrives from a paste", () => {
    expect(parseJdUrl("boards.greenhouse.io/acme/jobs/4012345")).toMatchObject({
      portal: "Greenhouse",
    });
  });
});
