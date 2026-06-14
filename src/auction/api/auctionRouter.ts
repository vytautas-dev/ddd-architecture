import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  createAuctionHandler,
  getActiveAuctionsHandler,
  placeBidHandler,
  cancelAuctionHandler,
} from "../../index";
import { v4 as uuid } from "uuid";

export const auctionRouter = Router();

const CreateAuctionSchema = z.object({
  sellerId: z.uuid(),
  title: z.string().min(3).max(100),
  startingPrice: z.object({
    amount: z.number().positive(),
    currency: z.string().length(3),
  }),
  endsAt: z.iso.datetime().transform((val) => new Date(val)),
});

const PlaceBidSchema = z.object({
  bidderId: z.uuid(),
  amount: z.object({
    amount: z.number().positive(),
    currency: z.string().length(3),
  }),
});

auctionRouter.post("/auctions", async (req: Request, res: Response) => {
  const result = CreateAuctionSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ errors: result.error.flatten() });
    return;
  }
  await createAuctionHandler.execute({
    auctionId: uuid(),
    ...result.data,
  });

  res.status(201).json({ message: "Auction created" });
});

auctionRouter.get("/auctions", async (_req: Request, res: Response) => {
  const auctions = await getActiveAuctionsHandler.execute();
  res.json(auctions);
});

auctionRouter.post(
  "/auctions/:auctionId/bids",
  async (req: Request, res: Response) => {
    const auctionId = z.uuid().safeParse(req.params["auctionId"]);
    if (!auctionId.success) {
      res.status(400).json({ error: "Invalid auction id" });
      return;
    }

    const result = PlaceBidSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ errors: result.error.flatten() });
      return;
    }

    await placeBidHandler.execute({
      auctionId: auctionId.data,
      ...result.data,
    });
    res.status(201).json({ message: "Bid placed" });
  },
);

auctionRouter.post(
  "/auctions/:auctionId/cancellation",
  async (req: Request, res: Response) => {
    const auctionId = z.uuid().safeParse(req.params["auctionId"]);
    if (!auctionId.success) {
      res.status(400).json({ error: "Invalid auction id" });
      return;
    }

    await cancelAuctionHandler.execute({ auctionId: auctionId.data });
    res.status(200).json({ message: "Auction cancelled" });
  },
);
