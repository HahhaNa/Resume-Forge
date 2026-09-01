/**
 * Mostly a test of one function saying no.
 *
 * `target()` is the entire defence for the only route in this app that takes a
 * URL from a user, so the cases below are the ways that shape is normally got
 * wrong: the metadata address, the private ranges, the userinfo trick that puts
 * a trusted-looking host in front of an `@`, and the allowlisted string
 * appearing somewhere in the URL other than the host.
 */
import { describe, expect, it } from "vitest";
import { readable, target } from "./jd";

const refusal = (raw: string) => {
  const t = target(raw);
  return "refusal" in t ? t.refusal : `ALLOWED:${t.url.hostname}`;
};

describe("target", () => {
  it("takes a real posting", () => {
    expect(refusal("https://boards.greenhouse.io/acme/jobs/123")).toBe("ALLOWED:boards.greenhouse.io");
    expect(refusal("https://jobs.lever.co/acme/abc-def")).toBe("ALLOWED:jobs.lever.co");
    expect(refusal("https://acme.recruitee.com/o/engineer")).toBe("ALLOWED:acme.recruitee.com");
  });

  it("refuses what is not a URL", () => {
    expect(refusal("greenhouse")).toBe("not-a-url");
    expect(refusal("")).toBe("not-a-url");
  });

  it("refuses plaintext http", () => {
    expect(refusal("http://boards.greenhouse.io/acme/jobs/1")).toBe("not-https");
  });

  /* the reason this is an allowlist */
  it("refuses the addresses an SSRF is aimed at", () => {
    for (const u of [
      "https://169.254.169.254/latest/meta-data/",
      "https://metadata.google.internal/computeMetadata/v1/",
      "https://localhost/admin",
      "https://127.0.0.1:8080/",
      "https://[::1]/",
      "https://10.0.0.1/",
      "https://192.168.1.1/",
      "https://169.254.170.2/v2/credentials",
    ])
      expect(refusal(u)).toBe("not-allowed");
  });

  /* everything before the @ is userinfo, not a host — a check reading the
     string rather than parsing it lets this straight through */
  it("is not fooled by an allowlisted host in the userinfo", () => {
    expect(refusal("https://boards.greenhouse.io@evil.example/x")).toBe("not-allowed");
    expect(refusal("https://user:boards.greenhouse.io@169.254.169.254/")).toBe("not-allowed");
  });

  it("is not fooled by the name appearing elsewhere in the URL", () => {
    expect(refusal("https://evil.example/boards.greenhouse.io/jobs/1")).toBe("not-allowed");
    expect(refusal("https://evil.example/?x=https://boards.greenhouse.io")).toBe("not-allowed");
    expect(refusal("https://boards.greenhouse.io.evil.example/x")).toBe("not-allowed");
  });

  it("matches the host however it is cased", () => {
    expect(refusal("https://BOARDS.GREENHOUSE.IO/acme/jobs/1")).toBe("ALLOWED:boards.greenhouse.io");
  });

  /* deliberate: these render with JavaScript and block server-side requests, so
     allowing them would trade a clear "paste it instead" for a login wall
     parsed as a job advert */
  it("refuses the aggregators on purpose", () => {
    for (const u of [
      "https://www.linkedin.com/jobs/view/123",
      "https://www.indeed.com/viewjob?jk=1",
      "https://www.glassdoor.com/job-listing/1",
      "https://www.104.com.tw/job/abc",
    ])
      expect(refusal(u)).toBe("not-allowed");
  });
});

describe("readable", () => {
  it("drops script and style content rather than reading it as prose", () => {
    const out = readable(`<style>.a{color:red}</style><script>var x=1</script><p>Real text</p>`);
    expect(out).toBe("Real text");
  });

  it("keeps a requirements list as lines", () => {
    const out = readable(`<h2>Requirements</h2><ul><li>CUDA</li><li>Python</li></ul>`);
    expect(out).toContain("- CUDA");
    expect(out).toContain("- Python");
  });

  it("turns block ends into breaks so paragraphs do not run together", () => {
    expect(readable("<p>One</p><p>Two</p>").split("\n").filter(Boolean)).toEqual(["One", "Two"]);
  });

  it("decodes the entities an advert actually contains", () => {
    expect(readable("<p>R&amp;D, 40&#37; faster, &quot;fast&quot;&nbsp;work</p>")).toBe(
      'R&D, 40% faster, "fast" work'
    );
  });

  it("collapses the whitespace a stripped tag leaves behind", () => {
    expect(readable("<div>  a   <span>b</span>   c  </div>")).toBe("a b c");
  });
});
