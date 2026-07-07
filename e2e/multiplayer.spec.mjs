import { expect, test } from "@playwright/test";

const appUrl = process.env.APP_URL ?? "http://127.0.0.1:5173";

test.describe("multiplayer visibility", () => {
  test.setTimeout(60_000);

  test("private room creates remote players and streams movement in two browsers", async ({ browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();

    try {
      await startPrivateHost(host, "Host");
      const roomCodeHandle = await waitForDebugValue(host, (debug) => debug.roomCode);
      const roomCode = await roomCodeHandle.jsonValue();

      await joinPrivateRoom(guest, "Guest", roomCode);

      await expect.poll(() => debugValue(host, (debug) => debug.remotePlayers.count), { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
      await expect.poll(() => debugValue(guest, (debug) => debug.remotePlayers.count), { timeout: 15_000 }).toBeGreaterThanOrEqual(1);

      const guestInitialHostX = await waitForRemoteX(guest);
      await host.keyboard.down("KeyD");
      await host.waitForTimeout(700);
      await host.keyboard.up("KeyD");
      await expect.poll(async () => Math.abs((await waitForRemoteX(guest)) - guestInitialHostX), { timeout: 10_000 }).toBeGreaterThan(4);

      const hostInitialGuestX = await waitForRemoteX(host);
      await guest.keyboard.down("KeyA");
      await guest.waitForTimeout(700);
      await guest.keyboard.up("KeyA");
      await expect.poll(async () => Math.abs((await waitForRemoteX(host)) - hostInitialGuestX), { timeout: 10_000 }).toBeGreaterThan(4);

      await expect.poll(() => debugValue(host, (debug) => debug.connectionStatus), { timeout: 10_000 }).toBe("Connected");
      await expect.poll(() => debugValue(guest, (debug) => debug.connectionStatus), { timeout: 10_000 }).toBe("Connected");
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });

  test("public room appears and creates remote players", async ({ browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();
    const serverName = `Public ${Date.now()}`;

    try {
      await startPublicHost(host, "Host", serverName);
      await joinPublicRoom(guest, "Guest", serverName);

      await expect.poll(() => debugValue(host, (debug) => debug.remotePlayers.count), { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
      await expect.poll(() => debugValue(guest, (debug) => debug.remotePlayers.count), { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });

  test("host close returns guest to the main menu with a clear message", async ({ browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();

    try {
      await startPrivateHost(host, "Host");
      const roomCodeHandle = await waitForDebugValue(host, (debug) => debug.roomCode);
      const roomCode = await roomCodeHandle.jsonValue();
      await joinPrivateRoom(guest, "Guest", roomCode);
      await expect.poll(() => debugValue(guest, (debug) => debug.remotePlayers.count), { timeout: 15_000 }).toBeGreaterThanOrEqual(1);

      await host.keyboard.press("Escape");
      await host.getByRole("button", { name: "Leave / End Server" }).click();

      await expect(guest.locator("[data-status]")).toHaveText("Host left. Server closed.", { timeout: 10_000 });
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });

  test("kick returns guest to the main menu with a clear message", async ({ browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();

    try {
      await startPrivateHost(host, "Host");
      const roomCodeHandle = await waitForDebugValue(host, (debug) => debug.roomCode);
      const roomCode = await roomCodeHandle.jsonValue();
      await joinPrivateRoom(guest, "Guest", roomCode);
      await expect.poll(() => debugValue(host, (debug) => debug.remotePlayers.count), { timeout: 15_000 }).toBeGreaterThanOrEqual(1);

      await host.keyboard.press("Escape");
      await host.getByRole("button", { name: "Kick" }).click();

      await expect(guest.locator("[data-status]")).toHaveText("You were kicked from the server.", { timeout: 10_000 });
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });
});

async function startPrivateHost(page, name) {
  await page.goto(appUrl, { waitUntil: "domcontentloaded" });
  await dismissControls(page);
  await page.getByRole("button", { name: "Play" }).click();
  await page.locator("[data-player-name]").fill(name);
  await page.locator("[data-host]").click();
  await page.locator("[data-host-private]").click();
  await waitForDebugValue(page, (debug) => debug.roomCode);
}

async function joinPrivateRoom(page, name, roomCode) {
  await page.goto(appUrl, { waitUntil: "domcontentloaded" });
  await dismissControls(page);
  await page.getByRole("button", { name: "Play" }).click();
  await page.locator("[data-player-name]").fill(name);
  await page.locator("[data-join]").click();
  await page.locator("[data-join-code]").fill(roomCode);
  await page.locator("[data-join-form]").evaluate((form) => form.requestSubmit());
}

async function startPublicHost(page, name, serverName) {
  await page.goto(appUrl, { waitUntil: "domcontentloaded" });
  await dismissControls(page);
  await page.getByRole("button", { name: "Play" }).click();
  await page.locator("[data-player-name]").fill(name);
  await page.locator("[data-host]").click();
  await page.locator("[data-server-name]").fill(serverName);
  await page.locator("[data-host-public]").click();
  await waitForDebugValue(page, (debug) => debug.roomCode);
}

async function joinPublicRoom(page, name, serverName) {
  await page.goto(appUrl, { waitUntil: "domcontentloaded" });
  await dismissControls(page);
  await page.getByRole("button", { name: "Play" }).click();
  await page.locator("[data-player-name]").fill(name);
  await page.locator("[data-join]").click();
  const row = page.locator(".public-room").filter({ hasText: serverName }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByRole("button", { name: "Join" }).click();
}

async function dismissControls(page) {
  const continueButton = page.locator("[data-continue]");
  if (await continueButton.isVisible()) {
    await continueButton.click();
  }
}

async function waitForDebugValue(page, selector) {
  return page.waitForFunction((source) => {
    const debug = window.__PIXEL_BRAWLER_DEBUG__;
    if (!debug) {
      return undefined;
    }
    const value = Function("debug", `return (${source})(debug);`)(debug);
    return value === undefined || value === null || value === "" ? undefined : value;
  }, selector.toString(), { timeout: 15_000 });
}

async function debugValue(page, selector) {
  return page.evaluate((source) => {
    const debug = window.__PIXEL_BRAWLER_DEBUG__;
    if (!debug) {
      return undefined;
    }
    return Function("debug", `return (${source})(debug);`)(debug);
  }, selector.toString());
}

async function waitForRemoteX(page) {
  return page.evaluate(() => {
    const firstRemote = window.__PIXEL_BRAWLER_DEBUG__?.remotePlayers.players[0];
    return firstRemote?.x;
  });
}
