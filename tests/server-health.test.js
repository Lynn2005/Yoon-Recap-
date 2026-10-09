import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

test("Node server exposes health and serves the frontend", async (t) => {
  const port = 31871 + Math.floor(Math.random() * 1000);
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["server.js"], {
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore",
  });
  t.after(() => {
    if (!child.killed) child.kill("SIGTERM");
  });

  let healthResponse;
  let lastError;
  for (let i = 0; i < 40; i++) {
    if (child.exitCode !== null) throw new Error(`Server exited early: ${child.exitCode}`);
    try {
      healthResponse = await fetch(`${base}/api/health`);
      break;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  if (!healthResponse) throw lastError || new Error("Server did not start");
  assert.equal(healthResponse.status, 200);
  const health = await healthResponse.json();
  assert.equal(health.ok, true);
  assert.equal(health.name, "Yoon Recap");

  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Yoon Recap Studio/);
});
