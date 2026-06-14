import type { DomainEvent } from "./DomainEvent";

export interface IProjection {
  handle(event: DomainEvent): Promise<void>;
}