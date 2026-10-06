import { test, expect } from "@playwright/test";
import { FACE_MODEL } from "../../lib/face-policy";

test.use({
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  },
});

test("o botão de acesso facial inicia a câmera e cancelar encerra a captura", async ({
  page,
}) => {
  await page.route("**/api/login/face", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ model: FACE_MODEL, poses: ["center", "left", "center", "right", "center"] }),
    });
  });
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    const state = window as typeof window & { faceTracks: MediaStreamTrack[] };
    state.faceTracks = [];
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      state.faceTracks.push(...stream.getTracks());
      return stream;
    };
  });
  await page.goto("/login");
  await page.getByLabel("E-mail ou matrícula").fill("teste@marcon.demo");
  await page.getByLabel("Senha", { exact: true }).fill("CameraTestPassword@123");
  await page
    .getByRole("button", { name: "Entrar com reconhecimento facial" })
    .click();
  await expect(page.getByLabel("Prévia da câmera")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { faceTracks: MediaStreamTrack[] })
            .faceTracks.length,
      ),
    )
    .toBeGreaterThan(0);
  await expect(
    page.getByRole("button", { name: "Iniciar captura" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect(
    await page.evaluate(() =>
      (
        window as typeof window & { faceTracks: MediaStreamTrack[] }
      ).faceTracks.every((track) => track.readyState === "ended"),
    ),
  ).toBe(true);
});
