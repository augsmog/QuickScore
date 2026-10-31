const { execFileSync } = require("node:child_process");
const path = require("node:path");

jest.setTimeout(60000);

test("stripe webhook accepts a valid signature and rejects missing, invalid, and stale ones", () => {
  execFileSync(process.execPath, ["--import", "tsx", "tests/stripe-webhook.scenario.ts"], {
    cwd: path.join(__dirname, ".."),
    stdio: "inherit",
  });
});
