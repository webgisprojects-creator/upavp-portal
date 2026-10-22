import { describe, expect, it } from "vitest";
import { checkDemoLogin, loadDemoUsers } from "./demoAuth";

const raw = JSON.stringify([
  { username: "tester", password: "pw-1" },
  { username: "other", password: "pw-2" },
]);

describe("loadDemoUsers", () => {
  it("parses a valid list", () => {
    expect(loadDemoUsers(raw)).toHaveLength(2);
  });

  it("disables sign-in (empty list) when nothing is configured", () => {
    expect(loadDemoUsers(undefined)).toEqual([]);
    expect(loadDemoUsers("")).toEqual([]);
  });

  it("never throws on malformed input", () => {
    expect(loadDemoUsers("not json")).toEqual([]);
    expect(loadDemoUsers('{"username":"a"}')).toEqual([]);
  });

  it("drops entries that are not {username, password} strings", () => {
    expect(loadDemoUsers(JSON.stringify([{ username: "a" }, null, 5, { username: "b", password: "x" }]))).toEqual([
      { username: "b", password: "x" },
    ]);
  });
});

describe("checkDemoLogin", () => {
  const users = loadDemoUsers(raw);

  it("accepts the right user and password", () => {
    expect(checkDemoLogin(users, "tester", "pw-1")).toBeTruthy();
  });

  it("rejects a wrong password, an unknown user and a swapped pair", () => {
    expect(checkDemoLogin(users, "tester", "pw-2")).toBeUndefined();
    expect(checkDemoLogin(users, "nobody", "pw-1")).toBeUndefined();
    expect(checkDemoLogin(users, "pw-1", "tester")).toBeUndefined();
  });

  it("rejects everything when no users are configured", () => {
    expect(checkDemoLogin([], "tester", "pw-1")).toBeUndefined();
  });
});
