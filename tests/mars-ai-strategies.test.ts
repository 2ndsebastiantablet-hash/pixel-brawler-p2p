import { describe, expect, it } from "vitest";
import { getMarsAiItemStrategy } from "../src/game/combat/MarsAiStrategies";

describe("Mars duplicate item AI strategies", () => {
  it("classifies current item families into reusable clone behavior strategies", () => {
    expect(getMarsAiItemStrategy("pistol")).toMatchObject({
      id: "gun",
      preferredRange: { min: 180, max: 520 },
      usesReload: true,
    });
    expect(getMarsAiItemStrategy("chainsaw")).toMatchObject({
      id: "chainsaw",
      preferredRange: { min: 0, max: 58 },
      movementStyle: "rush",
    });
    expect(getMarsAiItemStrategy("axe")).toMatchObject({
      id: "axe",
      preferredRange: { min: 52, max: 340 },
      allowSecondary: true,
    });
    expect(getMarsAiItemStrategy("wings")).toMatchObject({
      id: "mobility",
      movementStyle: "reposition",
    });
    expect(getMarsAiItemStrategy("moon")).toMatchObject({
      id: "space-passive",
      allowPrimary: false,
      allowSecondary: false,
    });
    expect(getMarsAiItemStrategy("future-item" as never)).toMatchObject({
      id: "fallback",
      preferredRange: { min: 24, max: 96 },
    });
  });
});
