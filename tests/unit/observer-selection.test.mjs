import assert from "node:assert/strict";
import test from "node:test";
import { candidateMeetings, courseHistoryLabel, matchState, proposedMeetingsLabel, signupCourseLabel } from "../../src/lib/observer-selection.ts";

const meeting = { id: "meeting-1", sectionId: "section-1", date: "2026-11-09", startsAt: "2026-11-09T16:00:00Z", endsAt: "2026-11-09T17:15:00Z", timeZone: "America/Chicago" };
const signup = { signupId: "signup-1", observationId: "observation-1", observee: { id: "user-1" },
  section: { id: "section-1", sectionNumber: "001", course: { code: "CS 4348" } }, proposedMeetings: [meeting], signedUpAt: "2026-10-01T00:00:00Z" };

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

