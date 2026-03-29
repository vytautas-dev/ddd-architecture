# BidFlow — Auction Platform

## Project Goal

BidFlow is an educational auction platform built step by step to teach:
- **DDD (Domain-Driven Design)** — aggregates, entities, value objects, bounded contexts, domain events
- **Event Sourcing** — aggregate state reconstructed from a stream of events
- **CQRS** — separating the write model (commands) from the read model (queries)
- **Read Models / Projections** — denormalized views built from domain events

---

## Domain Description

Users can list items for auction and place bids on other users' items. Each auction has a defined end time. The highest bid placed before the auction closes wins.

---

## Bounded Contexts

### 1. Auction (Core Domain)
The heart of the system. All business logic lives here.

**Aggregate: Auction**
- Created with a title, description, starting price, and end date
- Accepts bids — only higher than the current highest bid
- Can be cancelled by the seller (only before the first bid)
- Closes automatically when time runs out

**Domain Events:**
- `AuctionCreated`
- `BidPlaced`
- `AuctionCancelled`
- `AuctionClosed` (with a winner or no bids)

### 2. Identity (Generic Subdomain)
User registration and login. Intentionally simple — not the focus of learning.

### 3. Notification (Generic Subdomain)
Notifications for outbid events and auction wins. Consumes events from the Auction context.

---

## Architecture — Layers

```
src/
├── auction/                    # Bounded Context: Auction
│   ├── domain/                 # Pure domain logic (no framework dependencies)
│   │   ├── Auction.ts          # Aggregate
│   │   ├── AuctionEvents.ts    # Domain Events
│   │   ├── Bid.ts              # Value Object
│   │   └── IAuctionRepository.ts  # Repository interface
│   ├── application/            # Use cases (Commands & Queries)
│   │   ├── commands/
│   │   │   ├── CreateAuction.ts
│   │   │   ├── PlaceBid.ts
│   │   │   └── CancelAuction.ts
│   │   └── queries/
│   │       ├── GetAuctionDetail.ts
│   │       └── GetActiveAuctions.ts
│   ├── infrastructure/         # Technical implementations
│   │   ├── EventStore.ts       # Save/load events from PostgreSQL
│   │   ├── PrismaAuctionRepository.ts
│   │   └── projections/        # Read models built from events
│   │       ├── ActiveAuctionsProjection.ts
│   │       └── AuctionDetailProjection.ts
│   └── api/                    # Express routes
│       └── auctionRouter.ts
├── identity/
│   ├── domain/
│   ├── application/
│   ├── infrastructure/
│   └── api/
└── shared/                     # Code shared across bounded contexts
    ├── domain/
    │   └── DomainEvent.ts      # Base interface for all domain events
    └── infrastructure/
        └── EventBus.ts         # In-process event bus
```

---

## Read Models (Projections)

| Projection | Source Events | Purpose |
|------------|--------------|---------|
| `active_auctions` | AuctionCreated, AuctionClosed, AuctionCancelled | Homepage auction list |
| `auction_detail` | All Auction events | Auction detail page with bid history |
| `user_bids` | BidPlaced | User's bidding history |
| `user_won_auctions` | AuctionClosed | Auctions won by a user |

---

## Database Schema (key tables)

```sql
-- Event Store — the heart of Event Sourcing
event_store (
  id          UUID PRIMARY KEY,
  stream_id   UUID NOT NULL,         -- Aggregate ID (auction_id)
  stream_type VARCHAR(50) NOT NULL,  -- 'auction'
  event_type  VARCHAR(100) NOT NULL, -- 'AuctionCreated', 'BidPlaced', ...
  payload     JSONB NOT NULL,
  version     INT NOT NULL,          -- for Optimistic Concurrency
  created_at  TIMESTAMP NOT NULL
)

-- Read Models (denormalized, optimized for reads)
active_auctions_view (...)
auction_detail_view (...)
user_bids_view (...)
```

---

## Learning Stages

### Stage 1: DDD Fundamentals
- Value Objects, Entities, Aggregates
- Build the Auction domain with no database (pure TypeScript classes)
- Unit tests for domain logic

### Stage 2: Event Sourcing
- What is an Event Store
- Saving and loading an aggregate via events
- Optimistic concurrency (stream versioning)

### Stage 3: CQRS — Write Side
- Command Handlers
- Command validation with Zod
- Separating command model from query model

### Stage 4: Read Models / Projections
- Building projections from events
- Synchronous vs asynchronous projections
- Rebuilding a projection from scratch (event replay)

### Stage 5: Bounded Contexts & Communication
- How contexts communicate via Domain Events
- In-process Event Bus
- Context Mapping

### Stage 6: API Layer
- Express routes as a thin layer over the application layer
- Domain error handling

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js + TypeScript (strict) |
| HTTP Framework | Express.js |
| Database | PostgreSQL |
| ORM | Prisma |
| Validation | Zod |
| Testing | Jest + ts-jest |
| IDs | uuid |