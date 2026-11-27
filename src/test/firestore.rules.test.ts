import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const rootDir = process.cwd();
const rulesText = fs.readFileSync(path.join(rootDir, "firestore.rules"), "utf8");
const blueprintText = fs.readFileSync(path.join(rootDir, "firebase-blueprint.json"), "utf8");
const serverText = fs.readFileSync(path.join(rootDir, "src/server.ts"), "utf8");

describe("Firestore Security Rules & Blueprint Dirty-Dozen Invariants", () => {
  it("declares global default-deny catch-all and requires verified authentication", () => {
    expect(rulesText).toMatch(/match \/\{document=\*\*\} \{\s*allow read, write: if false;/);
    expect(rulesText).toContain(
      "request.auth != null && request.auth.token.email_verified == true",
    );
  });

  it("isolates private PII in users_private and prevents email fields on public collections", () => {
    expect(rulesText).toContain("match /users_private/{userId}");
    expect(rulesText).toMatch(
      /match \/users_private\/\{userId\}[\s\S]*?allow get: if isValidId\(userId\) && isOwner\(userId\)/,
    );
    expect(blueprintText).toContain('"/users_private/{userId}"');

    // user_profiles & leaderboard_entries must strictly whitelist keys without email
    const profileFn = rulesText.match(/function isValidUserProfile[\s\S]*?\n {4}\}/)?.[0] ?? "";
    const lbFn = rulesText.match(/function isValidLeaderboardEntry[\s\S]*?\n {4}\}/)?.[0] ?? "";
    expect(profileFn).toContain("data.keys().hasOnly(");
    expect(lbFn).toContain("data.keys().hasOnly(");
    expect(profileFn).not.toContain("'email'");
    expect(lbFn).not.toContain("'email'");
  });

  it("enforces immutable verified focus_sessions and atomic sessionExistsAfter on stats & leaderboard updates", () => {
    expect(rulesText).toMatch(
      /match \/focus_sessions\/\{sessionId\}[\s\S]*?allow update, delete: if false;/,
    );
    expect(rulesText).toContain("function sessionExistsAfter(sessionId)");
    expect(rulesText).toContain(
      "existsAfter(/databases/$(database)/documents/focus_sessions/$(sessionId))",
    );
    expect(rulesText).toMatch(/data\.minutes is int && data\.minutes >= 1 && data\.minutes <= 240/);
    expect(rulesText).toMatch(
      /data\.xpAwarded is int && data\.xpAwarded >= 0 && data\.xpAwarded <= \(data\.minutes \+ 230\)/,
    );
    expect(rulesText).toContain(
      "incoming().totalMinutes == existing().totalMinutes + getAfter(/databases/$(database)/documents/focus_sessions/$(incoming().lastSessionId)).data.minutes",
    );
  });

  it("enforces single-grant immutability on achievements and daily challenges", () => {
    expect(rulesText).toMatch(
      /match \/user_achievements\/\{docId\}[\s\S]*?allow update, delete: if false;/,
    );
    expect(rulesText).toMatch(
      /match \/user_challenges\/\{docId\}[\s\S]*?allow update, delete: if false;/,
    );
  });

  it("enforces friendship state transitions and competition membership boundaries", () => {
    expect(rulesText).toMatch(
      /match \/friendships\/\{friendshipId\}[\s\S]*?incoming\(\)\.status == 'pending'/,
    );
    expect(rulesText).toMatch(
      /match \/friendships\/\{friendshipId\}[\s\S]*?request\.auth\.uid == existing\(\)\.recipientId/,
    );
    expect(rulesText).toMatch(/match \/competitions\/\{competitionId\}[\s\S]*?exists\(/);
  });

  it("enforces server-side rate limiting and bearer token validation on /api/sessions/validate", () => {
    expect(serverText).toContain("/api/health");
    expect(serverText).toContain("/api/sessions/validate");
    expect(serverText).toContain("checkRateLimit");
    expect(serverText).toContain("validateSessionSubmission");
  });
});
