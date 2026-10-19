import { test } from "node:test";
import assert from "node:assert/strict";
import { authenticateDemo, canAccess, demoEnabled, resolveDemoUser } from "../../src/server/demo-auth.ts";

const env = { NODE_ENV: "development", AUTH_DEMO_ENABLED: "true" };

test("demo authentication requires explicit development opt-in", () => {
  for (const config of [{}, { NODE_ENV: "development" }, { ...env, NODE_ENV: "production" }, { ...env, NODE_ENV: "test" }]) {
    assert.equal(demoEnabled(config), false);
    assert.equal(authenticateDemo({ username: "anyone", password: "anything" }, config), null);
  }
});

test("reserved accounts inherit permissions while keeping their assigned role", () => {
  const expected = { faculty: ["faculty"], ac: ["faculty", "ac"], admin: ["faculty", "ac", "admin"] };
  for (const role of ["faculty", "ac", "admin"]) {
    const user = authenticateDemo({ username: role, password: "123" }, env);
    assert.deepEqual(user.roles, [role]);
    assert.deepEqual(user.permissions, expected[role].map((area) => `test:${area}`));
    for (const area of ["faculty", "ac", "admin"]) assert.equal(canAccess(user, `test:${area}`), expected[role].includes(area));
  }
});

test("reserved wrong passwords never fall through to unrestricted access", () => {
  for (const username of ["faculty", "ac", "admin", " FACULTY "]) {
    assert.equal(authenticateDemo({ username, password: "wrong" }, env), null);
  }
});

test("unknown usernames are rejected including identities from old fallback sessions", () => {
  for (const password of ["anything", "123"]) {
    assert.equal(authenticateDemo({ username: " Aaron ", password }, env), null);
  }
  assert.equal(resolveDemoUser("aaron"), null);
  assert.equal(authenticateDemo({ username: " FACULTY ", password: "123" }, env).username, "faculty");
});

test("malformed and blank credentials are rejected", () => {
  for (const credentials of [{}, { username: 12, password: "123" }, { username: " ", password: "123" }, { username: "x", password: " " }, { username: "x", password: {} }, { username: "x".repeat(101), password: "123" }]) {
    assert.equal(authenticateDemo(credentials, env), null);
  }
  assert.equal(canAccess(null, "test:faculty"), false);
});
