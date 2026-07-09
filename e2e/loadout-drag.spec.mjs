import { expect, test } from "@playwright/test";

const appUrl = process.env.APP_URL ?? "http://127.0.0.1:5173";

test.describe("character creator loadout drag and drop", () => {
  test.setTimeout(45_000);

  test("equips valid items with real pointer drag and rejects invalid slot drops", async ({ page }) => {
    await openSetup(page);
    await expect(page.locator("[data-loadout-drop-slot='rightHand']")).toContainText(/Hand|Pistol|Knife/);

    await expectHandSlotOnVisibleHand(page);

    await dragItemToSlot(page, "pistol", "Pistol", "rightHand");
    await expectSlot(page, "rightHand", "Pistol");

    await dragItemToSlot(page, "knife", "Knife", "rightHand");
    await expectSlot(page, "rightHand", "Knife");

    await dragItemToSlot(page, "rocket", "Rocket", "rightHand");
    await expectSlot(page, "rightHand", "Rocket");

    await dragItemToSlot(page, "holy-bazooka", "Holy Bazooka", "rightHand");
    await expectSlot(page, "rightHand", "Holy Bazooka");

    await dragItemToSlot(page, "death-aura", "Death Aura", "frontStrap");
    await expectSlot(page, "frontStrap", "Death Aura");

    await dragItemToSlot(page, "wings", "Wings", "backStrap");
    await expectSlot(page, "backStrap", "Wings");

    await dragItemToSlot(page, "virgin-blood", "Virgin Blood", "attachment");
    await expectSlot(page, "attachment", "Virgin Blood");

    await dragItemToSlot(page, "super-legs", "Super Legs", "legs");
    await expectSlot(page, "legs", "Super Legs");

    await dragItemToSlot(page, "death-aura", "Death Aura", "rightHand");
    await expectSlot(page, "rightHand", "Holy Bazooka");
    await expect(page.locator("[data-loadout-error]")).toContainText("Death Aura cannot attach");

    await dragItemToSlot(page, "wings", "Wings", "attachment");
    await expectSlot(page, "attachment", "Virgin Blood");
    await expect(page.locator("[data-loadout-error]")).toContainText("Wings cannot attach");

    await dragItemToSlot(page, "holy-bazooka", "Holy Bazooka", "attachment");
    await expectSlot(page, "attachment", "Virgin Blood");
    await expect(page.locator("[data-loadout-error]")).toContainText("Holy Bazooka cannot attach");

    await dragItemToSlot(page, "super-legs", "Super Legs", "rightHand");
    await expectSlot(page, "rightHand", "Holy Bazooka");
    await expect(page.locator("[data-loadout-error]")).toContainText("Super Legs cannot attach");

    await page.locator("[data-offline]").click();
    await expect(page.locator(".loadout-strip")).toContainText("Q Front Strap: Death Aura");
    await expect(page.locator(".loadout-strip")).toContainText("E Back Strap: Wings");
    await expect(page.locator(".loadout-strip")).toContainText("Left Mouse: Holy Bazooka");
    await expect(page.locator(".loadout-strip")).toContainText("Right Mouse: Holy Bazooka");
    await expect(page.locator(".loadout-strip")).toContainText("F Attachment: Virgin Blood");
    await expect(page.locator(".loadout-strip")).toContainText("Legs: Super Legs");
  });
});

async function openSetup(page) {
  await page.addInitScript(() => localStorage.clear());
  await page.goto(appUrl, { waitUntil: "domcontentloaded" });
  await dismissControls(page);
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.locator("[data-loadout-preview]")).toBeVisible();
}

async function dismissControls(page) {
  const continueButton = page.locator("[data-continue]");
  if (await continueButton.isVisible()) {
    await continueButton.click();
  }
}

async function dragItemToSlot(page, itemId, itemName, slot) {
  const search = page.locator("[data-loadout-search]");
  await search.fill(itemName);
  const source = page.locator(`[data-loadout-item='${itemId}']`);
  const target = page.locator(`[data-loadout-drop-slot='${slot}']`);
  await expect(source).toBeVisible();
  await expect(target).toBeVisible();
  await source.scrollIntoViewIfNeeded();

  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) {
    throw new Error(`Missing drag geometry for ${itemName} -> ${slot}`);
  }

  const startX = sourceBox.x + sourceBox.width / 2;
  const startY = sourceBox.y + sourceBox.height / 2;
  const endX = targetBox.x + targetBox.width / 2;
  const endY = targetBox.y + targetBox.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 14, startY + 8, { steps: 4 });
  await page.mouse.move(endX, endY, { steps: 16 });
  await page.mouse.up();
}

async function expectSlot(page, slot, itemName) {
  await expect(page.locator(`[data-loadout-drop-slot='${slot}']`)).toContainText(itemName);
}

async function expectHandSlotOnVisibleHand(page) {
  const hand = await page.locator("[data-loadout-drop-slot='rightHand']").boundingBox();
  const leftArm = await page.locator(".loadout-view.front .loadout-figure-left-arm").boundingBox();
  const rightArm = await page.locator(".loadout-view.front .loadout-figure-right-arm").boundingBox();
  const string = await page.locator(".loadout-view.front .loadout-attachment-string").boundingBox();
  const legs = await page.locator("[data-loadout-drop-slot='legs']").boundingBox();
  if (!hand || !leftArm || !rightArm || !string || !legs) {
    throw new Error("Missing loadout preview geometry");
  }

  const handCenterX = hand.x + hand.width / 2;
  const leftArmCenterX = leftArm.x + leftArm.width / 2;
  const armCenterX = rightArm.x + rightArm.width / 2;
  const nearestArmDistance = Math.min(Math.abs(handCenterX - leftArmCenterX), Math.abs(handCenterX - armCenterX));
  expect(nearestArmDistance).toBeLessThan(22);
  expect(hand.y).toBeLessThan(legs.y - 18);
  expect(rectsOverlap(hand, string)).toBe(false);
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}
