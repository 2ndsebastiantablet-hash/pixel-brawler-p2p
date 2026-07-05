import { describe, expect, it } from "vitest";
import { HostOfferCoordinator } from "../src/net/OfferCoordinator";

describe("host offer timing", () => {
  it("waits until a second peer is in the lobby before creating one host offer", () => {
    const coordinator = new HostOfferCoordinator();

    expect(coordinator.shouldCreateOffer(false, 2)).toBe(false);
    expect(coordinator.shouldCreateOffer(true, 1)).toBe(false);
    expect(coordinator.shouldCreateOffer(true, 2)).toBe(true);
    expect(coordinator.shouldCreateOffer(true, 2)).toBe(false);
  });

  it("can reset after a peer leaves so the next peer receives a fresh offer", () => {
    const coordinator = new HostOfferCoordinator();

    expect(coordinator.shouldCreateOffer(true, 2)).toBe(true);
    coordinator.reset();
    expect(coordinator.shouldCreateOffer(true, 2)).toBe(true);
  });
});
