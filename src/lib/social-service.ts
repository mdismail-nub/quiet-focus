import type { User } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  where,
  writeBatch,
  type DocumentSnapshot,
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "./firebase";
import {
  defaultUsernameFromUser,
  isValidUsernameFormat,
  isoDayKey,
  isoWeekKey,
  type AvatarId,
  type PrivacySetting,
} from "./gamification";

export interface UserProfileData {
  userId: string;
  username: string;
  usernameLower: string;
  avatarId: AvatarId;
  privacy: PrivacySetting;
  dailyGoal: number;
  totalMinutes: number;
  totalSessions: number;
  xp: number;
  level: number;
  currentStreak: number;
  longestStreak: number;
  lastGoalDayKey: string;
  dailyKey: string;
  dailyMinutes: number;
  weeklyKey: string;
  weeklyMinutes: number;
  lastSessionId: string;
  unlockedAchievementIds: string[];
  createdAtMs: number;
}

export interface LeaderboardRow {
  userId: string;
  username: string;
  avatarId: AvatarId;
  privacy: PrivacySetting;
  level: number;
  currentStreak: number;
  minutes: number;
  totalMinutes: number;
  dailyMinutes: number;
  weeklyMinutes: number;
  totalSessions: number;
}

export type LeaderboardPeriod = "daily" | "weekly" | "allTime" | "friends";

export interface FriendItem {
  friendshipId: string;
  status: "pending" | "accepted" | "rejected";
  requesterId: string;
  recipientId: string;
  otherUserId: string;
  profile: LeaderboardRow | null;
}

export interface CompetitionSummary {
  id: string;
  title: string;
  description: string;
  inviteCode: string;
  creatorId: string;
  startDayKey: string;
  endDayKey: string;
  memberCount: number;
}

export interface CompetitionMemberRow {
  userId: string;
  username: string;
  avatarId: AvatarId;
  totalMinutes: number;
  sessionsCount: number;
}

const LEADERBOARD_CACHE_PREFIX = "focus.leaderboardCache.";

function tsToMs(val: unknown): number {
  if (
    val &&
    typeof val === "object" &&
    "toMillis" in val &&
    typeof (val as { toMillis: () => number }).toMillis === "function"
  ) {
    return (val as { toMillis: () => number }).toMillis();
  }
  if (typeof val === "number") return val;
  return Date.now();
}

export function loadCachedLeaderboard(period: LeaderboardPeriod): LeaderboardRow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(`${LEADERBOARD_CACHE_PREFIX}${period}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCachedLeaderboard(period: LeaderboardPeriod, rows: LeaderboardRow[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      `${LEADERBOARD_CACHE_PREFIX}${period}`,
      JSON.stringify(rows.slice(0, 100)),
    );
  } catch {
    // Ignore storage limit errors
  }
}

function mapProfileSnap(data: Record<string, unknown>): UserProfileData {
  return {
    userId: String(data["userId"] ?? ""),
    username: String(data["username"] ?? "focus_user"),
    usernameLower: String(data["usernameLower"] ?? "focus_user"),
    avatarId: (data["avatarId"] as AvatarId) ?? "amber",
    privacy: (data["privacy"] as PrivacySetting) ?? "public",
    dailyGoal: Number(data["dailyGoal"] ?? 60),
    totalMinutes: Number(data["totalMinutes"] ?? 0),
    totalSessions: Number(data["totalSessions"] ?? 0),
    xp: Number(data["xp"] ?? 0),
    level: Number(data["level"] ?? 1),
    currentStreak: Number(data["currentStreak"] ?? 0),
    longestStreak: Number(data["longestStreak"] ?? 0),
    lastGoalDayKey: String(data["lastGoalDayKey"] ?? ""),
    dailyKey: String(data["dailyKey"] ?? isoDayKey(Date.now())),
    dailyMinutes: Number(data["dailyMinutes"] ?? 0),
    weeklyKey: String(data["weeklyKey"] ?? isoWeekKey(Date.now())),
    weeklyMinutes: Number(data["weeklyMinutes"] ?? 0),
    lastSessionId: String(data["lastSessionId"] ?? ""),
    unlockedAchievementIds: Array.isArray(data["unlockedAchievementIds"])
      ? (data["unlockedAchievementIds"] as string[])
      : [],
    createdAtMs: tsToMs(data["createdAt"]),
  };
}

function mapLeaderboardDoc(
  data: Record<string, unknown>,
  period: "daily" | "weekly" | "allTime",
  currentDay: string,
  currentWeek: string,
): LeaderboardRow {
  const dailyMinutes =
    String(data["dailyKey"] ?? "") === currentDay ? Number(data["dailyMinutes"] ?? 0) : 0;
  const weeklyMinutes =
    String(data["weeklyKey"] ?? "") === currentWeek ? Number(data["weeklyMinutes"] ?? 0) : 0;
  const totalMinutes = Number(data["totalMinutes"] ?? 0);

  const minutes =
    period === "daily" ? dailyMinutes : period === "weekly" ? weeklyMinutes : totalMinutes;

  return {
    userId: String(data["userId"] ?? ""),
    username: String(data["username"] ?? "focus_user"),
    avatarId: (data["avatarId"] as AvatarId) ?? "amber",
    privacy: (data["privacy"] as PrivacySetting) ?? "public",
    level: Number(data["level"] ?? 1),
    currentStreak: Number(data["currentStreak"] ?? 0),
    minutes,
    totalMinutes,
    dailyMinutes,
    weeklyMinutes,
    totalSessions: Number(data["totalSessions"] ?? 0),
  };
}

export async function ensureUserProfile(
  user: User,
  defaultDailyGoal = 60,
): Promise<UserProfileData> {
  const profilePath = `user_profiles/${user.uid}`;
  let existingSnap;
  try {
    existingSnap = await getDoc(doc(db, "user_profiles", user.uid));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, profilePath);
  }

  if (existingSnap.exists()) {
    return mapProfileSnap(existingSnap.data() as Record<string, unknown>);
  }

  // Pick a unique username
  const base = defaultUsernameFromUser(user.displayName, user.email, user.uid);
  let chosen = base;
  for (let i = 0; i < 6; i++) {
    const candidate =
      i === 0 ? base : `${base.slice(0, 18)}_${Math.floor(100 + Math.random() * 899)}`;
    const claimSnap = await getDoc(doc(db, "usernames", candidate.toLowerCase()));
    if (!claimSnap.exists() || claimSnap.data()?.["userId"] === user.uid) {
      chosen = candidate;
      break;
    }
    if (i === 5) {
      chosen = `focus_${user.uid.slice(0, 8)}`.slice(0, 24);
    }
  }

  const chosenLower = chosen.toLowerCase();
  const now = Date.now();
  const day = isoDayKey(now);
  const week = isoWeekKey(now);

  const batch = writeBatch(db);
  batch.set(doc(db, "users_private", user.uid), {
    userId: user.uid,
    email: (user.email ?? `${user.uid}@focus.local`).slice(0, 254),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, "usernames", chosenLower), {
    userId: user.uid,
    username: chosen,
    usernameLower: chosenLower,
    createdAt: serverTimestamp(),
  });
  batch.set(doc(db, "user_profiles", user.uid), {
    userId: user.uid,
    username: chosen,
    usernameLower: chosenLower,
    avatarId: "amber",
    privacy: "public",
    dailyGoal: defaultDailyGoal,
    totalMinutes: 0,
    totalSessions: 0,
    xp: 0,
    level: 1,
    currentStreak: 0,
    longestStreak: 0,
    lastGoalDayKey: "",
    dailyKey: day,
    dailyMinutes: 0,
    weeklyKey: week,
    weeklyMinutes: 0,
    lastSessionId: "",
    unlockedAchievementIds: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, "leaderboard_entries", user.uid), {
    userId: user.uid,
    username: chosen,
    usernameLower: chosenLower,
    avatarId: "amber",
    privacy: "public",
    level: 1,
    currentStreak: 0,
    totalMinutes: 0,
    totalSessions: 0,
    dailyKey: day,
    dailyMinutes: 0,
    weeklyKey: week,
    weeklyMinutes: 0,
    lastSessionId: "",
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, profilePath);
  }

  const createdSnap = await getDoc(doc(db, "user_profiles", user.uid));
  return mapProfileSnap(createdSnap.data() as Record<string, unknown>);
}

export async function updateUserProfile(
  uid: string,
  currentProfile: UserProfileData,
  updates: {
    username?: string;
    avatarId?: AvatarId;
    privacy?: PrivacySetting;
    dailyGoal?: number;
  },
): Promise<UserProfileData> {
  const nextUsername =
    updates.username !== undefined ? updates.username.trim() : currentProfile.username;
  if (!isValidUsernameFormat(nextUsername)) {
    throw new Error("Username must be 3-24 characters using letters, numbers, or underscores.");
  }

  const nextLower = nextUsername.toLowerCase();
  const usernameChanged = nextLower !== currentProfile.usernameLower;

  if (usernameChanged) {
    const existingClaim = await getDoc(doc(db, "usernames", nextLower));
    if (existingClaim.exists() && existingClaim.data()?.["userId"] !== uid) {
      throw new Error("That username is already taken.");
    }
  }

  const nextAvatar = updates.avatarId ?? currentProfile.avatarId;
  const nextPrivacy = updates.privacy ?? currentProfile.privacy;
  const nextDailyGoal =
    updates.dailyGoal !== undefined
      ? Math.max(0, Math.min(600, Math.round(updates.dailyGoal)))
      : currentProfile.dailyGoal;

  const batch = writeBatch(db);
  if (usernameChanged) {
    batch.delete(doc(db, "usernames", currentProfile.usernameLower));
    batch.set(doc(db, "usernames", nextLower), {
      userId: uid,
      username: nextUsername,
      usernameLower: nextLower,
      createdAt: serverTimestamp(),
    });
  }

  batch.update(doc(db, "user_profiles", uid), {
    username: nextUsername,
    usernameLower: nextLower,
    avatarId: nextAvatar,
    privacy: nextPrivacy,
    dailyGoal: nextDailyGoal,
    updatedAt: serverTimestamp(),
  });

  batch.update(doc(db, "leaderboard_entries", uid), {
    username: nextUsername,
    usernameLower: nextLower,
    avatarId: nextAvatar,
    privacy: nextPrivacy,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `user_profiles/${uid}`);
  }

  return {
    ...currentProfile,
    username: nextUsername,
    usernameLower: nextLower,
    avatarId: nextAvatar,
    privacy: nextPrivacy,
    dailyGoal: nextDailyGoal,
  };
}

export async function fetchLeaderboard(
  period: "daily" | "weekly" | "allTime",
  pageSize = 25,
  cursorDoc: DocumentSnapshot | null = null,
): Promise<{
  rows: LeaderboardRow[];
  lastDoc: DocumentSnapshot | null;
  hasMore: boolean;
}> {
  const now = Date.now();
  const currentDay = isoDayKey(now);
  const currentWeek = isoWeekKey(now);

  const orderField =
    period === "daily" ? "dailyMinutes" : period === "weekly" ? "weeklyMinutes" : "totalMinutes";

  const constraints = [
    where("privacy", "==", "public"),
    orderBy(orderField, "desc"),
    limit(pageSize),
  ];

  const q = cursorDoc
    ? query(
        collection(db, "leaderboard_entries"),
        where("privacy", "==", "public"),
        orderBy(orderField, "desc"),
        startAfter(cursorDoc),
        limit(pageSize),
      )
    : query(collection(db, "leaderboard_entries"), ...constraints);

  let snap;
  try {
    snap = await getDocs(q);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, "leaderboard_entries");
  }

  const rows = snap.docs
    .map((d) =>
      mapLeaderboardDoc(d.data() as Record<string, unknown>, period, currentDay, currentWeek),
    )
    .sort((a, b) => b.minutes - a.minutes || b.totalMinutes - a.totalMinutes);

  if (!cursorDoc) {
    saveCachedLeaderboard(period, rows);
  }

  return {
    rows,
    lastDoc: snap.docs.at(-1) ?? null,
    hasMore: snap.docs.length === pageSize,
  };
}

export async function fetchFriendsLeaderboard(
  currentUid: string,
  subPeriod: "daily" | "weekly" | "allTime" = "daily",
): Promise<LeaderboardRow[]> {
  const now = Date.now();
  const currentDay = isoDayKey(now);
  const currentWeek = isoWeekKey(now);

  const friends = await fetchFriendships(currentUid);
  const acceptedUids = friends.filter((f) => f.status === "accepted").map((f) => f.otherUserId);

  const uids = Array.from(new Set([currentUid, ...acceptedUids]));
  const rows: LeaderboardRow[] = [];

  for (const uid of uids) {
    try {
      const snap = await getDoc(doc(db, "leaderboard_entries", uid));
      if (!snap.exists()) continue;
      const data = snap.data() as Record<string, unknown>;
      if (uid !== currentUid && data["privacy"] === "private") continue;
      rows.push(mapLeaderboardDoc(data, subPeriod, currentDay, currentWeek));
    } catch {
      // Skip friends who switched to private
    }
  }

  rows.sort((a, b) => b.minutes - a.minutes || b.totalMinutes - a.totalMinutes);
  saveCachedLeaderboard("friends", rows);
  return rows;
}

export async function searchUsersByUsername(
  rawQuery: string,
  currentUid: string,
): Promise<{ userId: string; username: string; avatarId: AvatarId; privacy: PrivacySetting }[]> {
  const qLower = rawQuery
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
  if (qLower.length < 2) return [];

  let snap;
  try {
    snap = await getDocs(
      query(
        collection(db, "usernames"),
        where("usernameLower", ">=", qLower),
        where("usernameLower", "<=", `${qLower}\uf8ff`),
        limit(10),
      ),
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, "usernames");
  }

  const results: {
    userId: string;
    username: string;
    avatarId: AvatarId;
    privacy: PrivacySetting;
  }[] = [];
  for (const d of snap.docs) {
    const uid = String(d.data()["userId"] ?? "");
    const username = String(d.data()["username"] ?? "");
    if (!uid || uid === currentUid) continue;
    try {
      const entrySnap = await getDoc(doc(db, "leaderboard_entries", uid));
      if (entrySnap.exists()) {
        const entry = entrySnap.data() as Record<string, unknown>;
        if (entry["privacy"] === "private") continue;
        results.push({
          userId: uid,
          username,
          avatarId: (entry["avatarId"] as AvatarId) ?? "amber",
          privacy: (entry["privacy"] as PrivacySetting) ?? "public",
        });
      }
    } catch {
      // Friends-only or private profile cannot be peeked before friendship; still allow request via username
      results.push({
        userId: uid,
        username,
        avatarId: "slate",
        privacy: "friends",
      });
    }
  }

  return results;
}

export function makeFriendshipId(uidA: string, uidB: string): string {
  return uidA < uidB ? `${uidA}__${uidB}` : `${uidB}__${uidA}`;
}

export async function fetchFriendships(currentUid: string): Promise<FriendItem[]> {
  let snap;
  try {
    snap = await getDocs(
      query(collection(db, "friendships"), where("users", "array-contains", currentUid)),
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, "friendships");
  }

  const now = Date.now();
  const currentDay = isoDayKey(now);
  const currentWeek = isoWeekKey(now);

  const items: FriendItem[] = [];
  for (const d of snap.docs) {
    const data = d.data() as {
      id: string;
      users: string[];
      requesterId: string;
      recipientId: string;
      status: "pending" | "accepted" | "rejected";
    };
    if (data.status === "rejected") continue;
    const otherUserId = data.users.find((u) => u !== currentUid) ?? "";
    if (!otherUserId) continue;

    let profile: LeaderboardRow | null = null;
    try {
      const entrySnap = await getDoc(doc(db, "leaderboard_entries", otherUserId));
      if (entrySnap.exists()) {
        const eData = entrySnap.data() as Record<string, unknown>;
        if (eData["privacy"] !== "private") {
          profile = mapLeaderboardDoc(eData, "allTime", currentDay, currentWeek);
        }
      }
    } catch {
      profile = null;
    }

    items.push({
      friendshipId: data.id,
      status: data.status,
      requesterId: data.requesterId,
      recipientId: data.recipientId,
      otherUserId,
      profile,
    });
  }

  return items;
}

export async function sendFriendRequest(currentUid: string, targetUid: string): Promise<void> {
  if (currentUid === targetUid) throw new Error("You cannot add yourself as a friend.");
  const friendshipId = makeFriendshipId(currentUid, targetUid);
  const existing = await getDoc(doc(db, "friendships", friendshipId));
  if (existing.exists()) {
    const st = existing.data()?.["status"];
    if (st === "accepted") throw new Error("Already friends.");
    if (st === "pending") throw new Error("Friend request already pending.");
  }

  const users = currentUid < targetUid ? [currentUid, targetUid] : [targetUid, currentUid];
  const batch = writeBatch(db);
  batch.set(doc(db, "friendships", friendshipId), {
    id: friendshipId,
    users,
    requesterId: currentUid,
    recipientId: targetUid,
    status: "pending",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `friendships/${friendshipId}`);
  }
}

export async function respondFriendRequest(friendshipId: string, accept: boolean): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, "friendships", friendshipId), {
    status: accept ? "accepted" : "rejected",
    updatedAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `friendships/${friendshipId}`);
  }
}

export async function removeFriendship(friendshipId: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, "friendships", friendshipId));
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `friendships/${friendshipId}`);
  }
}

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]!;
  }
  return code;
}

export async function createCompetition(params: {
  profile: UserProfileData;
  title: string;
  description: string;
  durationDays: number;
}): Promise<CompetitionSummary> {
  const title = params.title.trim();
  if (title.length < 3 || title.length > 60) {
    throw new Error("Competition title must be between 3 and 60 characters.");
  }

  const now = Date.now();
  const days = Math.max(1, Math.min(90, Math.round(params.durationDays || 7)));
  const startDayKey = isoDayKey(now);
  const endDayKey = isoDayKey(now + (days - 1) * 86400000);
  const id = `comp_${now}_${Math.random().toString(36).slice(2, 8)}`;
  const inviteCode = generateInviteCode();

  const batch = writeBatch(db);
  batch.set(doc(db, "competitions", id), {
    id,
    title,
    description: params.description.trim().slice(0, 160),
    inviteCode,
    creatorId: params.profile.userId,
    startDayKey,
    endDayKey,
    memberCount: 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, "competitions", id, "members", params.profile.userId), {
    competitionId: id,
    userId: params.profile.userId,
    username: params.profile.username,
    avatarId: params.profile.avatarId,
    totalMinutes: 0,
    sessionsCount: 0,
    lastSessionId: "",
    joinedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, "competition_invites", inviteCode), {
    inviteCode,
    competitionId: id,
    title,
    creatorId: params.profile.userId,
    startDayKey,
    endDayKey,
    createdAt: serverTimestamp(),
  });
  batch.set(doc(db, "user_competitions", `${params.profile.userId}_${id}`), {
    userId: params.profile.userId,
    competitionId: id,
    title,
    inviteCode,
    joinedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `competitions/${id}`);
  }

  return {
    id,
    title,
    description: params.description.trim().slice(0, 160),
    inviteCode,
    creatorId: params.profile.userId,
    startDayKey,
    endDayKey,
    memberCount: 1,
  };
}

export async function joinCompetitionByCode(
  profile: UserProfileData,
  rawCode: string,
): Promise<CompetitionSummary> {
  const code = rawCode
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (code.length < 6 || code.length > 16) {
    throw new Error("Enter a valid 6–16 character invite code.");
  }

  const inviteSnap = await getDoc(doc(db, "competition_invites", code));
  if (!inviteSnap.exists()) {
    throw new Error("No competition found for that invite code.");
  }

  const invite = inviteSnap.data() as {
    competitionId: string;
    title: string;
    creatorId: string;
    startDayKey: string;
    endDayKey: string;
  };

  const existingMember = await getDoc(
    doc(db, "competitions", invite.competitionId, "members", profile.userId),
  );
  if (!existingMember.exists()) {
    const batch = writeBatch(db);
    batch.update(doc(db, "competitions", invite.competitionId), {
      memberCount: increment(1),
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, "competitions", invite.competitionId, "members", profile.userId), {
      competitionId: invite.competitionId,
      userId: profile.userId,
      username: profile.username,
      avatarId: profile.avatarId,
      totalMinutes: 0,
      sessionsCount: 0,
      lastSessionId: "",
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, "user_competitions", `${profile.userId}_${invite.competitionId}`), {
      userId: profile.userId,
      competitionId: invite.competitionId,
      title: invite.title,
      inviteCode: code,
      joinedAt: serverTimestamp(),
    });

    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `competitions/${invite.competitionId}`);
    }
  }

  const compSnap = await getDoc(doc(db, "competitions", invite.competitionId));
  const compData = compSnap.data() as CompetitionSummary;
  return compData;
}

export async function fetchUserCompetitions(uid: string): Promise<CompetitionSummary[]> {
  let snap;
  try {
    snap = await getDocs(query(collection(db, "user_competitions"), where("userId", "==", uid)));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, "user_competitions");
  }

  const results: CompetitionSummary[] = [];
  for (const d of snap.docs) {
    const compId = String(d.data()["competitionId"] ?? "");
    if (!compId) continue;
    try {
      const compSnap = await getDoc(doc(db, "competitions", compId));
      if (compSnap.exists()) {
        results.push(compSnap.data() as CompetitionSummary);
      }
    } catch {
      // Skip inaccessible competition
    }
  }
  return results;
}

export async function fetchCompetitionMembers(
  competitionId: string,
): Promise<CompetitionMemberRow[]> {
  let snap;
  try {
    snap = await getDocs(
      query(
        collection(db, "competitions", competitionId, "members"),
        orderBy("totalMinutes", "desc"),
        limit(50),
      ),
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `competitions/${competitionId}/members`);
  }

  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      userId: String(data["userId"] ?? ""),
      username: String(data["username"] ?? "Member"),
      avatarId: (data["avatarId"] as AvatarId) ?? "amber",
      totalMinutes: Number(data["totalMinutes"] ?? 0),
      sessionsCount: Number(data["sessionsCount"] ?? 0),
    };
  });
}
