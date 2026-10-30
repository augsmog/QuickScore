const { execFileSync } = require("node:child_process");
const path = require("node:path");

jest.setTimeout(60000);

function scenario(name) {
  execFileSync(process.execPath, ["--import", "tsx", "tests/account-deletion.scenario.ts", name], {
    cwd: path.join(__dirname, ".."),
    stdio: "inherit",
  });
}

test("purge removes a user's rows and anonymizes a shared round", () => scenario("purge"));
test("delete-account rejects anonymous calls and ignores a client-supplied user id", () => scenario("handler"));
test("local wipe clears every persisted key and does not rewrite them on sign-out", () => scenario("local"));
test("supabase deletes do not rewrite scores or touch contest_groups", () => scenario("shape"));
