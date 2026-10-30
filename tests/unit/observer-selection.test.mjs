import assert from "node:assert/strict";
import test from "node:test";
import { candidateMeetings, courseHistoryLabel, currentSemesterCycle, hasGeneratedList, matchState, proposedMeetingsLabel, signupCourseLabel, signupWindow } from "../../src/lib/observer-selection.ts";

test("Observer Selection always resolves the current configured semester, independent of list order", () => {
  const fall = { id: "fall", semester: { startsOn: "2026-08-31", endsOn: "2026-12-16", timeZone: "America/Chicago" } };
  const spring = { id: "spring", semester: { startsOn: "2027-01-11", endsOn: "2027-05-15", timeZone: "America/Chicago" } };
  const now = Date.parse("2026-10-29T12:00:00Z");
  assert.equal(currentSemesterCycle([spring, fall], now), fall);
  assert.equal(currentSemesterCycle([fall, spring], now), fall);
  assert.equal(currentSemesterCycle([spring], now), null);
  assert.equal(currentSemesterCycle([fall, { ...fall, id: "overlap" }], now), null);
  assert.equal(currentSemesterCycle([{ id: "missing" }], now), null);
  assert.equal(currentSemesterCycle([fall], null), null);
  assert.equal(currentSemesterCycle([fall], Date.parse("2026-12-17T05:59:00Z")), fall);
  assert.equal(currentSemesterCycle([fall], Date.parse("2026-12-17T06:00:00Z")), null);
});

test("signup status follows the configured instant, including the Chicago deadline boundary", () => {
  const deadline = "2026-10-31T23:59:00-05:00";
  assert.equal(signupWindow(deadline, Date.parse("2026-10-29T12:00:00Z")), "open");
  assert.equal(signupWindow(deadline, Date.parse(deadline)), "open");
  assert.equal(signupWindow(deadline, Date.parse(deadline) + 1), "closed");
  assert.equal(signupWindow(null, Date.now()), "unknown");
  assert.equal(signupWindow("invalid", Date.now()), "unknown");
  assert.equal(signupWindow(deadline, null), "unknown");
});

const meeting = { id: "meeting-1", sectionId: "section-1", date: "2026-11-09", startsAt: "2026-11-09T16:00:00Z", endsAt: "2026-11-09T17:15:00Z", timeZone: "America/Chicago" };
const signup = { signupId: "signup-1", observationId: "observation-1", observee: { id: "user-1" },
  section: { id: "section-1", sectionNumber: "001", course: { code: "CS 4348" } }, proposedMeetings: [meeting], signedUpAt: "2026-10-01T00:00:00Z" };

test("empty candidate reads distinguish untouched signups from generated no-match lists", () => {
  const empty = { items: [], releasedAt: null };
  assert.equal(hasGeneratedList(null), false);
  assert.equal(hasGeneratedList(empty), false);
  assert.equal(hasGeneratedList({ ...empty, generationId: "generation-1" }), true);
  assert.equal(hasGeneratedList({ ...empty, releasedAt: "2026-10-29T12:00:00Z" }), true);
  assert.equal(hasGeneratedList({ ...empty, items: [{ id: "candidate-1" }] }), true);
});

test("observer-selection labels use API records without inventing missing values", () => {
  assert.equal(signupCourseLabel(signup), "CS 4348 · Section 001");
  assert.match(proposedMeetingsLabel([meeting]), /Nov 9.*10:00 AM.*11:15 AM/);
  assert.equal(proposedMeetingsLabel([]), "No proposed meetings");
  assert.equal(courseHistoryLabel({ courseHistory: null }), "—");
  assert.equal(courseHistoryLabel({ courseHistory: { courseCode: "CS 4348", semester: "Fall 2025" } }), "CS 4348 · Fall 2025");
});

test("candidate availability and match states reflect returned records", () => {
  assert.deepEqual(candidateMeetings({ availableMeetingOptionIds: ["meeting-1"] }, [meeting, { ...meeting, id: "meeting-2" }]), [meeting]);
  assert.deepEqual(matchState(false, 0), { label: "Not generated", tone: "neutral" });
  assert.deepEqual(matchState(true, 0), { label: "No matches", tone: "danger" });
  assert.deepEqual(matchState(true, 2), { label: "2 matches", tone: "warning" });
  assert.deepEqual(matchState(true, 5), { label: "5 matches", tone: "neutral" });
});

