import { test, expect, type Page } from "@playwright/test";

async function waitForSignedIn(page: Page) {
  await expect(page.getByText(/auth: signed-in/)).toBeVisible({ timeout: 15_000 });
}

test.describe("lobby: create + join over a real WebSocket connection", () => {
  test("host creates a room, guest joins with the code, roster shows distinct auto-assigned names", async ({
    browser,
  }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();

    try {
      await host.goto("/");
      await waitForSignedIn(host);
      await host.getByRole("button", { name: "Create Room" }).click();

      const roomCode = await host.getByTestId("room-code").innerText();
      expect(roomCode).toMatch(/^[A-Z2-9]{6}$/);

      await guest.goto("/");
      await waitForSignedIn(guest);
      await guest.getByPlaceholder("ROOM CODE").fill(roomCode);
      await guest.getByRole("button", { name: "JOIN" }).click();

      // Both windows should converge on the same 2-player roster once the server broadcasts room-state.
      await expect(host.getByTestId("roster-player")).toHaveCount(2, { timeout: 10_000 });
      await expect(guest.getByTestId("roster-player")).toHaveCount(2, { timeout: 10_000 });

      // Strip the "(you)"/"(host)" suffixes — those are per-viewer labels, not part of the
      // room-wide roster, so the two windows legitimately render different text for the same row.
      const baseName = (text: string) => text.replace(/\s*\((you|host)\)/g, "").trim();
      const hostNames = (await host.getByTestId("roster-player").allInnerTexts()).map(baseName);
      const guestNames = (await guest.getByTestId("roster-player").allInnerTexts()).map(baseName);
      expect(new Set(hostNames).size).toBe(2); // color names are distinct within a room
      expect(hostNames.sort()).toEqual(guestNames.sort()); // both windows agree on the same roster

      // Host-only start authority: only the creator sees the Start button.
      await expect(host.getByTestId("start-match")).toBeVisible();
      await expect(guest.getByTestId("start-match")).toHaveCount(0);

      await host.getByTestId("start-match").click();

      // A started match renders the 3D canvas and the round HUD on every connected client.
      await expect(host.locator("canvas")).toBeVisible({ timeout: 10_000 });
      await expect(guest.locator("canvas")).toBeVisible({ timeout: 10_000 });
      await expect(host.getByText(/Round 1/)).toBeVisible({ timeout: 10_000 });
      await expect(guest.getByText(/Round 1/)).toBeVisible({ timeout: 10_000 });
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });

  test("rejects joining with an unknown room code", async ({ page }) => {
    await page.goto("/");
    await waitForSignedIn(page);
    await page.getByPlaceholder("ROOM CODE").fill("ZZZZZZ");
    await page.getByRole("button", { name: "JOIN" }).click();
    await expect(page.getByText(/net:.*—/)).toBeVisible({ timeout: 10_000 });
  });
});
