export type AuctionSnapshot =
  | { exists: false }
  | {
      exists: true;
      status: "SCHEDULED" | "ACTIVE" | "CLOSED" | "CANCELLED";
    };

export interface IAuctionCatalog {
  getSnapshot(auctionId: string): Promise<AuctionSnapshot>;
}
