import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
async function load(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`
  );
}
const {
  getDemoObservationHistory: get,
  getDemoHistorySource,
  projectPersonalObservations: project,
  queryPersonalObservations: query,
} = await load("../../src/server/queries/demo-observation-history.ts");
const { parseObservationHistoryResponse: parse } = await load(
  "../../src/lib/observation-history-response.ts",
);
const enabled = { NODE_ENV: "development", AUTH_DEMO_ENABLED: "true" };
const user = { id: "demo:faculty", name: "Demo faculty", permissions: ["observations.read.own"] };

test("dummy reads require opted-in development and recognized authorized identities", () => {
  for (const env of [
    {},
    { ...enabled, NODE_ENV: "production" },
    { ...enabled, NODE_ENV: "test" },
    { ...enabled, AUTH_DEMO_ENABLED: "false" },
  ])
    assert.throws(() => get(user, env));
  assert.throws(() => get({ ...user, id: "other-user" }, enabled));
  assert.throws(() => get({ ...user, permissions: [] }, enabled));
  assert.throws(() => get({ ...user, permissions: ["test:faculty"] }, enabled));
});

test("current database account shape can receive isolated dummy data without database writes", () => {
  const account = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Seeded faculty",
    permissions: ["observations.read.own"],
  };
  const rows = get(account, enabled);
  assert.equal(rows.length, 4);
  assert.equal(rows[0].observee.name, account.name);
  assert.notEqual(rows[0].observee.id, account.id);
  const otherIds = new Set(get(user, enabled).map((item) => item.id));
  assert.ok(rows.every((item) => !otherIds.has(item.id)));
});
test("fixtures preserve Prisma relations and separate AppUser/Professor UUIDs", () => {
  const source = getDemoHistorySource(user, enabled);
  const item = source.observations[0];
  assert.equal(item.signup.professorId, source.professorId);
  assert.notEqual(item.signup.professorId, item.signup.professor.user.userId);
  assert.match(
    item.observationId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  const ids = new Set(get(user, enabled).map((record) => record.id));
  for (const role of ["ac", "admin"])
    assert.ok(get({ ...user, id: `demo:${role}` }, enabled).every((item) => !ids.has(item.id)));
  item.signup.professor.user.fullName = "Changed copy";
  assert.equal(get(user, enabled)[0].observee.name, "Demo faculty");
});
test("personal scope includes only actual observee/selected observer; user IDs are not professor IDs", () => {
  const source = getDemoHistorySource(user, enabled);
  assert.equal(project(source.professorId, source.observations).length, 4);
  assert.deepEqual(
    project(source.observations[0].signup.professor.userId, source.observations),
    [],
  );
  assert.deepEqual(project("unrelated-professor", source.observations), []);
  const item = source.observations[0];
  item.cycleId = "wrong-cycle";
  assert.throws(() => project(source.professorId, [item]), /relations/);
});
test("shared DTO projects the same UI without leaking raw professor IDs", () => {
  const items = get(user, enabled),
    result = parse({ items });
  assert.equal(result[0].courseSection, "CS 4485.001");
  assert.equal(result[0].otherProfessor, "Professor A");
  assert.equal(result[1].otherProfessor, "Professor B");
  assert.deepEqual(
    result.map((item) => item.participation),
    ["observee", "observer", "observee", "observer"],
  );
  assert.equal(result[0].statusLabel, "Completed");
  assert.ok(!("professorId" in items[0].observee));
  assert.deepEqual(parse({ items: [] }), []);
});
test("query filters intersect and pagination cursors remain scoped to the result", () => {
  const items = get(user, enabled);
  assert.equal(
    query(items, new URLSearchParams("participation=observer&status=COMPLETED")).items.length,
    2,
  );
  assert.equal(
    query(items, new URLSearchParams({ semesterId: items[0].section.semesterId })).items.length,
    1,
  );
  assert.equal(query(items, new URLSearchParams({ cycleId: items[0].cycleId })).items.length, 1);
  assert.equal(query(items, new URLSearchParams("assessmentStatus=completed")).items.length, 0);
  const first = query(items, new URLSearchParams("limit=2"));
  const second = query(
    items,
    new URLSearchParams({ limit: "2", cursor: first.pageInfo.nextCursor }),
  );
  assert.deepEqual([...first.items, ...second.items], items);
  assert.deepEqual(second.pageInfo, { hasMore: false, nextCursor: null });
  for (const params of [
    "userId=other",
    "limit=0",
    "limit=101",
    "limit=1.5",
    "participation=admin",
    "status=",
    "limit=1&limit=2",
    "cursor=foreign",
    `participation=observer&cursor=${items[0].id}`,
  ])
    assert.throws(() => query(items, new URLSearchParams(params)));
});
test("invalid/duplicate observations and inconsistent semester labels fail closed", () => {
  const record = get(user, enabled)[0];
  for (const value of [
    null,
    [],
    {},
    { items: "bad" },
    { items: [null] },
    { items: [{ ...record, participation: ["admin"] }] },
    { items: [record, record] },
    {
      items: [
        { ...record, section: { ...record.section, semester: { id: "wrong", name: "Fall 2026" } } },
      ],
    },
  ])
    assert.throws(() => parse(value));
});

test("current backend observation shape accepts the nested semester without a redundant semesterId", () => {
  const record = structuredClone(get(user, enabled)[0]);
  delete record.section.semesterId;
  assert.equal(parse({ items: [record] })[0].semester, record.section.semester.name);
});
