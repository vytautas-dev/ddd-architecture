import { auctionEventSchema } from "../../../../auction/infrastructure/messaging/auctionEventSchemas";
import { MalformedEnvelopeError, parseEnvelope } from "../EventEnvelope";

// What arrives from Pulsar: JSON bytes, so every Date is an ISO string.
function raw(
  overrides: Record<string, unknown> = {},
  payload: Record<string, unknown> = {},
) {
  return Buffer.from(
    JSON.stringify({
      streamType: "auction",
      streamId: "a1",
      version: 1,
      eventType: "AuctionCreated",
      payload: {
        eventType: "AuctionCreated",
        occurredAt: "2026-10-11T10:00:00.000Z",
        auctionId: "a1",
        sellerId: "s1",
        title: "Rower",
        startingPrice: { amount: 100, currency: "PLN" },
        startsAt: "2026-10-12T10:00:00.000Z",
        endsAt: "2026-10-18T10:00:00.000Z",
        status: "SCHEDULED",
        ...payload,
      },
      ...overrides,
    }),
  );
}

describe("parseEnvelope", () => {
  it("returns the envelope with Date fields revived from ISO strings", () => {
    const envelope = parseEnvelope(raw(), auctionEventSchema);

    expect(envelope).toMatchObject({ streamId: "a1", version: 1 });
    expect(envelope.payload.occurredAt).toEqual(
      new Date("2026-10-11T10:00:00.000Z"),
    );
    expect(envelope.payload).toMatchObject({
      startsAt: expect.any(Date),
      endsAt: expect.any(Date),
    });
  });

  it("accepts timestamps with an explicit UTC offset", () => {
    const envelope = parseEnvelope(
      raw({}, { occurredAt: "2026-10-11T12:00:00+02:00" }),
      auctionEventSchema,
    );

    expect(envelope.payload.occurredAt).toEqual(
      new Date("2026-10-11T10:00:00.000Z"),
    );
  });

  it("rejects a payload with a missing field", () => {
    expect(() =>
      parseEnvelope(raw({}, { title: undefined }), auctionEventSchema),
    ).toThrow(MalformedEnvelopeError);
  });

  it("rejects a payload with a field of the wrong type", () => {
    expect(() =>
      parseEnvelope(
        raw({}, { startingPrice: { amount: "100", currency: "PLN" } }),
        auctionEventSchema,
      ),
    ).toThrow(MalformedEnvelopeError);
  });

  it("rejects an event type the schema does not know", () => {
    expect(() =>
      parseEnvelope(
        raw({ eventType: "AuctionRenamed" }, { eventType: "AuctionRenamed" }),
        auctionEventSchema,
      ),
    ).toThrow(MalformedEnvelopeError);
  });

  it("rejects an envelope whose eventType disagrees with its payload", () => {
    expect(() =>
      parseEnvelope(raw({ eventType: "BidPlaced" }), auctionEventSchema),
    ).toThrow(MalformedEnvelopeError);
  });

  it("rejects bytes that are not JSON", () => {
    expect(() =>
      parseEnvelope(Buffer.from("not json"), auctionEventSchema),
    ).toThrow(MalformedEnvelopeError);
  });
});
