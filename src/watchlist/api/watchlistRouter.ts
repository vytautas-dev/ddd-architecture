import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  favoriteAuctionHandler,
  unfavoriteAuctionHandler,
  getMyFavoritesHandler,
} from "../../index";

export const watchlistRouter = Router();

// PLACEHOLDER: zastąpić kontekstem Identity / JWT (decyzja #10).
// Na razie tożsamość oferanta pochodzi z nagłówka X-User-Id.
function resolveBidderId(req: Request, res: Response): string | null {
  const result = z.uuid().safeParse(req.header("X-User-Id"));
  if (!result.success) {
    res.status(401).json({ error: "Missing or invalid X-User-Id header" });
    return null;
  }
  return result.data;
}

const FavoriteSchema = z.object({
  auctionId: z.uuid(),
});

const ListQuerySchema = z.object({
  status: z.enum(["SCHEDULED", "ACTIVE", "CLOSED", "CANCELLED"]).optional(),
});

watchlistRouter.post(
  "/watchlist/favorites",
  async (req: Request, res: Response) => {
    const bidderId = resolveBidderId(req, res);
    if (!bidderId) return;

    const result = FavoriteSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ errors: result.error.flatten() });
      return;
    }

    await favoriteAuctionHandler.execute({
      bidderId,
      auctionId: result.data.auctionId,
    });
    res.status(201).json({ message: "Auction favorited" });
  },
);

watchlistRouter.delete(
  "/watchlist/favorites/:auctionId",
  async (req: Request, res: Response) => {
    const bidderId = resolveBidderId(req, res);
    if (!bidderId) return;

    const auctionId = z.uuid().safeParse(req.params["auctionId"]);
    if (!auctionId.success) {
      res.status(400).json({ error: "Invalid auction id" });
      return;
    }

    await unfavoriteAuctionHandler.execute({
      bidderId,
      auctionId: auctionId.data,
    });
    res.status(204).send();
  },
);

watchlistRouter.get(
  "/watchlist/favorites",
  async (req: Request, res: Response) => {
    const bidderId = resolveBidderId(req, res);
    if (!bidderId) return;

    const result = ListQuerySchema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({ errors: result.error.flatten() });
      return;
    }

    const favorites = await getMyFavoritesHandler.execute({
      bidderId,
      ...result.data,
    });
    res.json(favorites);
  },
);
