import { decideStreamVersion } from "../streamVersionDecision";

// `lastApplied` is what the projection's ledger holds for one stream (0 when
// it has never seen the stream); `incoming` is the version of the message.
describe("decideStreamVersion", () => {
  it("applies the next version of the stream", () => {
    expect(decideStreamVersion(0, 1)).toBe("apply");
    expect(decideStreamVersion(4, 5)).toBe("apply");
  });

  it("treats a version already applied as a duplicate", () => {
    expect(decideStreamVersion(5, 5)).toBe("duplicate");
    expect(decideStreamVersion(5, 2)).toBe("duplicate");
  });

  it("reports a gap when an earlier version is still missing", () => {
    expect(decideStreamVersion(0, 2)).toBe("gap");
    expect(decideStreamVersion(1, 3)).toBe("gap");
  });
});
