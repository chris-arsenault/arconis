import { expect, it } from "vitest";
import { baseUrl, browser, errors, serveFixtures } from "../editor/browserHarness";
import { newProject, hostedActor } from "./hosted";
import { runDelivery } from "./actions";

it("opens the reviewed artifact and related work from a dataset without editing the board", async () => {
  const context = await browser.newContext({ viewport: { width: 1080, height: 860 } });
  await serveFixtures(context);
  const project = fixtureProject();
  const snapshot = `${baseUrl()}/delivery-fixture.json`;
  await context.route("**/api/delivery/**", (route) =>
    route.fulfill({
      json: {
        project: project.id,
        revision: "example",
        size: 200,
        title: project.title,
        url: snapshot,
      },
      headers: { "access-control-allow-origin": new URL(baseUrl()).origin },
    })
  );
  await context.route(snapshot, (route) => route.fulfill({ json: project }));
  const page = await context.newPage();
  await page.goto(`${baseUrl()}/#delivery=${project.id}`);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill("delivery-test@example.com");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("link", { name: "Districts in progress" }).click();
  await page.getByText("Full district coverage", { exact: false }).waitFor();
  await page.getByText("Accepted Road layout", { exact: true }).waitFor();
  await page.getByRole("link", { name: "Screenshot", exact: true }).last().click();
  await page.getByRole("img", { name: "Screenshot" }).waitFor();
  await page.getByRole("link", { name: "Back to Districts" }).click();
  await page.getByRole("link", { name: /District types ·/ }).click();
  await page.getByRole("cell", { name: "Grand Bazaar" }).waitFor();
  await page.getByRole("article").getByRole("link", { name: "Districts", exact: true }).click();
  await page.getByRole("heading", { name: "Districts", exact: true }).waitFor();
  await page.getByRole("link", { name: "Layout · bazaar" }).click();
  await page.getByRole("img", { name: "bazaar" }).waitFor();
  expect(await page.getByRole("button", { name: /save|edit|complete/i }).count()).toBe(0);
  expect(errors).toEqual([]);
});
function fixtureProject() {
  const actor = hostedActor("Editor");
  const project = newProject("City design", actor);
  const call = (operation: string, args: Record<string, unknown>) =>
    runDelivery(project, actor, { operation, args });
  call("entry_add", {
    target: "City design",
    kind: "boundary",
    text: "Full district coverage",
    fields: { attribution: "user_requirement" },
  });
  call("work_add", {
    title: "Districts",
    fields: { next: "Add interior parks", status: "in_progress" },
  });
  call("file_write", {
    kind: "dataset",
    path: "districts.dataset.json",
    title: "District types",
    body: JSON.stringify({
      schema: { keys: ["Name"], fields: { Name: { type: "string" } } },
      items: [{ Name: "Grand Bazaar" }],
    }),
  });
  call("link_add", {
    from: "work:Districts",
    to: 'districts.dataset.json#["Grand Bazaar"]',
    purpose: "basis",
  });
  call("file_write", {
    kind: "diagram",
    path: "layout.arconis",
    title: "Layout",
    body: 'arconis 1\nnode bazaar "Grand Bazaar" at 20,20\n',
  });
  call("link_add", { from: "work:Districts", to: "layout.arconis#bazaar", purpose: "illustrates" });
  const result = call("result_add", { target: "Districts", observation: "Example render" }) as {
    id: string;
  };
  call("review_add", { target: "Districts", accepted: "Road layout", remaining: "Interior parks" });
  call("file_write", {
    kind: "artifact",
    title: "Screenshot",
    path: "screenshot.png",
    format: "base64",
    body: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6eUAAAAASUVORK5CYII=",
  });
  call("link_add", { from: `result:${result.id}`, to: "screenshot.png", purpose: "evidence" });
  return project;
}
