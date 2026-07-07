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

  test("private room connects three real browser pages in one mesh", async ({ browser }) => {
    const hostContext = await browser.newContext();
    const guestOneContext = await browser.newContext();
    const guestTwoContext = await browser.newContext();
    const host = await hostContext.newPage();
    const guestOne = await guestOneContext.newPage();
    const guestTwo = await guestTwoContext.newPage();

    try {
      await startPrivateHost(host, "Host");
      const roomCodeHandle = await waitForDebugValue(host, (debug) => debug.roomCode);
      const roomCode = await roomCodeHandle.jsonValue();

      await joinPrivateRoom(guestOne, "GuestOne", roomCode);
      await waitForRoomPlayerCount([host, guestOne], 2);
      await joinPrivateRoom(guestTwo, "GuestTwo", roomCode);

      await waitForRoomPlayerCount([host, guestOne, guestTwo], 3);
      await waitForRemoteCount([host, guestOne, guestTwo], 2);
      await expect.poll(() => debugValue(guestTwo, (debug) => debug.connectionStatus), { timeout: 15_000 }).not.toBe("Disconnected / failed");

      const guestOneInitialHostX = await remoteXForPeerName(guestOne, "Host");
      const guestTwoInitialHostX = await remoteXForPeerName(guestTwo, "Host");
      await host.keyboard.down("KeyD");
      await host.waitForTimeout(700);
      await host.keyboard.up("KeyD");

      await expect.poll(async () => Math.abs((await remoteXForPeerName(guestOne, "Host")) - guestOneInitialHostX), { timeout: 10_000 }).toBeGreaterThan(4);
      await expect.poll(async () => Math.abs((await remoteXForPeerName(guestTwo, "Host")) - guestTwoInitialHostX), { timeout: 10_000 }).toBeGreaterThan(4);
    } finally {
      await hostContext.close();
      await guestOneContext.close();
      await guestTwoContext.close();
    }
  });

  test("public room supports five pages and reports 5/10 in the server list", async ({ browser }) => {
    test.setTimeout(90_000);
    const contexts = [];
    const pages = [];
    const serverName = `Five ${Date.now()}`;

    try {
      for (let index = 0; index < 5; index += 1) {
        const context = await browser.newContext();
        contexts.push(context);
        pages.push(await context.newPage());
      }

      await startPublicHost(pages[0], "Host", serverName);
      const roomCodeHandle = await waitForDebugValue(pages[0], (debug) => debug.roomCode);
      const roomCode = await roomCodeHandle.jsonValue();
      for (let index = 1; index < pages.length; index += 1) {
        await joinPrivateRoom(pages[index], `Guest${index}`, roomCode);
        await waitForRoomPlayerCount(pages.slice(0, index + 1), index + 1);
      }

      await waitForRemoteCount(pages, 4);

      const listContext = await browser.newContext();
      contexts.push(listContext);
      const listPage = await listContext.newPage();
      await listPage.goto(appUrl, { waitUntil: "domcontentloaded" });
      await dismissControls(listPage);
      await listPage.getByRole("button", { name: "Play" }).click();
      await listPage.locator("[data-join]").click();
      const row = listPage.locator(".public-room").filter({ hasText: serverName }).first();
      await expect(row).toContainText("5/10 players", { timeout: 15_000 });
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
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

async function waitForRemoteCount(pages, expectedCount) {
  await Promise.all(pages.map((page) => expect.poll(
    () => debugValue(page, (debug) => debug.remotePlayers.count),
    { timeout: 20_000 },
  ).toBeGreaterThanOrEqual(expectedCount)));
}

async function waitForRoomPlayerCount(pages, expectedCount) {
  await Promise.all(pages.map((page) => expect.poll(
    () => debugValue(page, (debug) => debug.roomPlayerCount),
    { timeout: 20_000 },
  ).toBeGreaterThanOrEqual(expectedCount)));
}

async function remoteXForPeerName(page, name) {
  return page.evaluate((peerName) => {
    const player = window.__PIXEL_BRAWLER_DEBUG__?.remotePlayers.players.find((remote) => remote.name === peerName);
    return player?.x;
  }, name);
}
