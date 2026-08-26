import { describe, expect, it } from "vitest";
import { daysSince, invitePending } from "./backup";

/**
 * The invitation is the one thing in the app that interrupts someone, so the
 * rule for when it may is worth pinning: it has to appear for a first-time
 * user, come back for someone who waved it away with nothing to lose, and
 * stay gone after that.
 */
describe("invitePending", () => {
  it("asks on a first run, before anything has been typed", () => {
    expect(invitePending("off", "", false)).toBe(true);
  });

  it("stays quiet for the rest of a session that already said not now", () => {
    expect(invitePending("off", "empty", false)).toBe(false);
  });

  it("asks again once there is work to lose, because 'not yet' was not 'no'", () => {
    expect(invitePending("off", "empty", true)).toBe(true);
  });

  it("never asks twice about real work", () => {
    expect(invitePending("off", "done", true)).toBe(false);
    expect(invitePending("off", "done", false)).toBe(false);
  });

  it("still asks on Safari and Firefox, where the answer is a manual export", () => {
    expect(invitePending("unsupported", "", true)).toBe(true);
  });

  /* Everything else means a file is already connected, or is a problem the
     header and the Data tab are already reporting in colour. Interrupting on
     top of that is noise. */
  it("says nothing while a file is connected or in trouble", () => {
    for (const status of ["on", "locked", "conflict", "error"] as const) {
      expect(invitePending(status, "", true)).toBe(false);
    }
  });
});

describe("daysSince", () => {
  it("reads a never-exported stamp as never, not as today", () => {
    expect(daysSince("")).toBeNull();
  });

  it("counts whole days", () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 86_400_000).toISOString();
    expect(daysSince(eightDaysAgo)).toBe(8);
  });

  it("treats an unparseable stamp as no stamp", () => {
    expect(daysSince("not a date")).toBeNull();
  });
});
