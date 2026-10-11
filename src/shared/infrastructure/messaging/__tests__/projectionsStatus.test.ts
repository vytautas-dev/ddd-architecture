import { laggingStreams, markFrozen } from "../projectionsStatus";

// `heads` is max(version) per stream in the event store; `applied` is what one
// projection's ledger holds (no row = the projection has never seen it).
describe("laggingStreams", () => {
  it("lists streams whose ledger lags the event store, with the gap", () => {
    expect(
      laggingStreams(
        [
          { streamId: "a1", version: 3 },
          { streamId: "a2", version: 2 },
        ],
        [
          { streamId: "a1", version: 1 },
          { streamId: "a2", version: 2 },
        ],
      ),
    ).toEqual([{ streamId: "a1", applied: 1, head: 3, gap: 2 }]);
  });

  it("treats a stream missing from the ledger as applied up to 0", () => {
    expect(laggingStreams([{ streamId: "a1", version: 2 }], [])).toEqual([
      { streamId: "a1", applied: 0, head: 2, gap: 2 },
    ]);
  });

  it("reports nothing when every stream has caught up", () => {
    expect(
      laggingStreams(
        [{ streamId: "a1", version: 3 }],
        [{ streamId: "a1", version: 3 }],
      ),
    ).toEqual([]);
  });

  it("ignores ledger rows for streams the event store does not have", () => {
    expect(laggingStreams([], [{ streamId: "ghost", version: 4 }])).toEqual([]);
  });
});

describe("markFrozen", () => {
  const now = new Date("2026-10-11T12:00:00.000Z");
  const lagging = [{ streamId: "a1", applied: 1, head: 3, gap: 2 }];
  const waitingSince = (iso: string) => new Map([["a1", new Date(iso)]]);

  it("flags a stream waiting at least the threshold as frozen", () => {
    expect(
      markFrozen(
        lagging,
        waitingSince("2026-10-11T11:59:00.000Z"),
        now,
        60_000,
      ),
    ).toEqual([{ ...lagging[0], waitingMs: 60_000, frozen: true }]);
  });

  it("keeps a stream waiting less than the threshold as merely lagging", () => {
    expect(
      markFrozen(
        lagging,
        waitingSince("2026-10-11T11:59:30.000Z"),
        now,
        60_000,
      ),
    ).toEqual([{ ...lagging[0], waitingMs: 30_000, frozen: false }]);
  });
});
