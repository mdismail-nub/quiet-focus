# Security Specification — Focus Gamification & Leaderboard

## 1. Data Invariants

1. **Identity Integrity**: Every user-owned document (`users_private`, `user_profiles`, `focus_sessions`, `user_achievements`, `user_challenges`, `usernames`) must enforce `userId == request.auth.uid` and `request.auth.token.email_verified == true`.
2. **PII Isolation**: Email addresses live exclusively in `users_private/{userId}` with strict owner-only read/write (`request.auth.uid == userId`). Public/leaderboard documents (`user_profiles`, `leaderboard_entries`, `usernames`) never contain email or PII.
3. **Immutable Sessions & Duplicate Prevention**: `focus_sessions/{sessionId}` allows `create` only (`allow update, delete: if false`), requires valid duration (`1 <= minutes <= 240`), valid timestamps (`startedAt < endedAt`, `endedAt <= request.time.toMillis() + 300000`), and server timestamp `syncedAt == request.time`.
4. **Atomic Leaderboard & Profile Stat Progression**: Updating stats (`totalMinutes`, `totalSessions`, `xp`, `dailyMinutes`, `weeklyMinutes`) on `user_profiles/{userId}` and `leaderboard_entries/{userId}` requires atomically creating a new `focus_sessions/{sessionId}` document in the same batch (`!exists(...)` before commit and `existsAfter(...)` after commit), with `totalMinutes` increasing by exact session minutes, `totalSessions` increasing by `1`, and `xp` increase bounded (`<= session.minutes + 230`).
5. **Single-Grant Achievements & Daily Challenges**: `user_achievements/{docId}` and `user_challenges/{docId}` allow `create` only (`allow update, delete: if false`) with deterministic IDs (`{userId}_{achievementId}` and `{userId}_{dayKey}_{challengeId}`).
6. **Privacy Controls**: `leaderboard_entries` and `user_profiles` allow `list` queries ONLY when `resource.data.privacy == 'public' || resource.data.userId == request.auth.uid`. Friends with `privacy == 'friends'` are accessible via `allow get` when `exists(/databases/.../friendships/{min}_{max})` has `status == 'accepted'`. `private` profiles are readable only by the owner.
7. **Terminal & Action-Scoped Updates**: Friendship updates are restricted to the `recipientId` accepting or rejecting a `pending` request, with `requesterId`, `recipientId`, `users`, `id`, and `createdAt` immutable.

## 2. Adversarial "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)

1. **Impersonated Session**: `focus_sessions/s_1` created with `userId: "victim_uid"` while `auth.uid == "attacker_uid"`.
2. **Excessive Duration**: `focus_sessions/s_2` created with `minutes: 9999` (> 240 max).
3. **Future Timestamp**: `focus_sessions/s_3` created with `endedAt: request.time.toMillis() + 86400000`.
4. **Session Replay / Update**: Updating `focus_sessions/s_1` (`minutes: 240`) after creation.
5. **Arbitrary XP Injection**: Updating `user_profiles/attacker_uid` with `xp: 999999` without a matching `focus_sessions` batch creation.
6. **Shadow Field Injection**: Creating `user_profiles/attacker_uid` with extra ghost field `isAdmin: true`.
7. **PII Read Scrape**: Reading `users_private/victim_uid` while `auth.uid == "attacker_uid"`.
8. **Private Profile Leak**: Listing `leaderboard_entries` without `privacy == 'public'` filter or reading a `privacy == 'private'` profile as another user.
9. **Username Hijack**: Creating `usernames/alice` with `userId: "attacker_uid"` when `usernames/alice` already exists.
10. **Self-Accepted Friendship**: Creating `friendships/a__b` with `status: "accepted"` directly instead of `"pending"`.
11. **Duplicate Achievement Grant**: Updating or re-creating `user_achievements/attacker_uid_first_focus`.
12. **Unverified Email Write**: Any write operation when `request.auth.token.email_verified == false`.
