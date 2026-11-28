import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Copy,
  Flame,
  LogOut,
  Plus,
  Search,
  Shield,
  Sparkles,
  Trophy,
  UserCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useFocus } from "@/lib/focus-store";
import { formatUserErrorMessage } from "@/lib/firebase";
import { formatMinutes } from "@/lib/stats";
import {
  AVATAR_OPTIONS,
  isValidUsernameFormat,
  sanitizeUsernameInput,
  type AvatarId,
  type PrivacySetting,
} from "@/lib/gamification";
import { AvatarBadge, BottomNav, Card, Header, PillButton, Sheet } from "@/components/ui-kit";
import {
  createCompetition,
  fetchCompetitionMembers,
  fetchFriendships,
  fetchUserCompetitions,
  joinCompetitionByCode,
  removeFriendship,
  respondFriendRequest,
  searchUsersByUsername,
  sendFriendRequest,
  type CompetitionMemberRow,
  type CompetitionSummary,
  type FriendItem,
  type LeaderboardRow,
} from "@/lib/social-service";
import { createFocusRoomLobby, listPublicFocusRooms, type FocusRoom } from "@/lib/focus-rooms";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/social")({
  head: () => ({
    meta: [
      { title: "Social & Profile — Focus" },
      {
        name: "description",
        content:
          "Manage your focus profile, privacy, friends, private competitions and focus rooms.",
      },
      { property: "og:title", content: "Social & Profile — Focus" },
      {
        property: "og:description",
        content:
          "Manage your focus profile, privacy, friends, private competitions and focus rooms.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SocialScreen,
});

function SocialScreen() {
  const f = useFocus();
  const navigate = useNavigate();
  const { profile, user, gamification, analytics } = f;

  // Profile editor state
  const [editOpen, setEditOpen] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [avatarDraft, setAvatarDraft] = useState<AvatarId>("amber");
  const [privacyDraft, setPrivacyDraft] = useState<PrivacySetting>("public");
  const [goalDraft, setGoalDraft] = useState(60);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);

  // Friends state
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<
    { userId: string; username: string; avatarId: AvatarId; privacy: PrivacySetting }[]
  >([]);
  const [searching, setSearching] = useState(false);
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [selectedFriend, setSelectedFriend] = useState<LeaderboardRow | null>(null);
  const [socialNotice, setSocialNotice] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  // Private competitions state
  const [competitions, setCompetitions] = useState<CompetitionSummary[]>([]);
  const [createCompOpen, setCreateCompOpen] = useState(false);
  const [compTitle, setCompTitle] = useState("");
  const [compDesc, setCompDesc] = useState("");
  const [compDays, setCompDays] = useState(7);
  const [joinCode, setJoinCode] = useState("");
  const [activeComp, setActiveComp] = useState<CompetitionSummary | null>(null);
  const [activeCompMembers, setActiveCompMembers] = useState<CompetitionMemberRow[]>([]);
  const [loadingCompMembers, setLoadingCompMembers] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Future-ready Focus Rooms
  const [rooms, setRooms] = useState<FocusRoom[]>([]);
  const [roomName, setRoomName] = useState("");
  const [roomOpen, setRoomOpen] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<FocusRoom | null>(null);

  const loadSocialData = useCallback(async () => {
    if (!user || !f.serverOnline) return;
    try {
      const [fr, comps, roomList] = await Promise.all([
        fetchFriendships(user.uid),
        fetchUserCompetitions(user.uid),
        listPublicFocusRooms().catch(() => []),
      ]);
      setFriends(fr);
      setCompetitions(comps);
      setRooms(roomList);
    } catch {
      // Best-effort social refresh
    }
  }, [user, f.serverOnline]);

  useEffect(() => {
    if (f.authReady && user) {
      void loadSocialData();
    } else {
      setFriends([]);
      setCompetitions([]);
      setRooms([]);
    }
  }, [f.authReady, user, loadSocialData]);

  // Support ?join=INVITECODE link
  useEffect(() => {
    if (typeof window === "undefined") return;
    const code = new URLSearchParams(window.location.search).get("join");
    if (code) setJoinCode(code.toUpperCase());
  }, []);

  const openProfileEditor = () => {
    if (!profile) return;
    setUsernameDraft(profile.username);
    setAvatarDraft(profile.avatarId);
    setPrivacyDraft(profile.privacy);
    setGoalDraft(f.settings.dailyGoal);
    setProfileMsg(null);
    setEditOpen(true);
  };

  const handleSaveProfile = async () => {
    if (!isValidUsernameFormat(usernameDraft)) {
      setProfileMsg("Username must be 3–24 characters (letters, numbers, underscores).");
      return;
    }
    setProfileSaving(true);
    setProfileMsg(null);
    try {
      await f.saveProfileChanges({
        username: usernameDraft,
        avatarId: avatarDraft,
        privacy: privacyDraft,
        dailyGoal: goalDraft,
      });
      setEditOpen(false);
    } catch (err) {
      setProfileMsg(formatUserErrorMessage(err, "Could not save profile."));
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSearch = async () => {
    if (!user || searchTerm.trim().length < 2) return;
    if (!f.serverOnline) {
      setSocialNotice("You're offline. Connect to the internet to search users.");
      return;
    }
    setSearching(true);
    setSocialNotice(null);
    try {
      const res = await searchUsersByUsername(searchTerm, user.uid);
      setSearchResults(res);
      if (res.length === 0) setSocialNotice("No matching public users found.");
    } catch (err) {
      setSocialNotice(formatUserErrorMessage(err, "Search failed."));
    } finally {
      setSearching(false);
    }
  };

  const handleSendRequest = async (targetUid: string) => {
    if (!user || busyAction) return;
    if (!f.serverOnline) {
      setSocialNotice("You're offline. Connect to the internet to send friend requests.");
      return;
    }
    setSocialNotice(null);
    setBusyAction(`send:${targetUid}`);
    try {
      await sendFriendRequest(user.uid, targetUid);
      setSocialNotice("Friend request sent.");
      await loadSocialData();
    } catch (err) {
      setSocialNotice(formatUserErrorMessage(err, "Could not send friend request."));
    } finally {
      setBusyAction(null);
    }
  };

  const handleRespondRequest = async (friendshipId: string, accept: boolean) => {
    if (busyAction) return;
    if (!f.serverOnline) {
      setSocialNotice("You're offline. Connect to the internet to update requests.");
      return;
    }
    setSocialNotice(null);
    setBusyAction(`respond:${friendshipId}`);
    try {
      await respondFriendRequest(friendshipId, accept);
      await loadSocialData();
    } catch (err) {
      setSocialNotice(formatUserErrorMessage(err, "Could not update friend request."));
    } finally {
      setBusyAction(null);
    }
  };

  const handleRemoveFriend = async (friendshipId: string) => {
    if (busyAction) return;
    if (!f.serverOnline) {
      setSocialNotice("You're offline. Connect to the internet to remove a friend.");
      return;
    }
    setSocialNotice(null);
    setBusyAction(`remove:${friendshipId}`);
    try {
      await removeFriendship(friendshipId);
      await loadSocialData();
    } catch (err) {
      setSocialNotice(formatUserErrorMessage(err, "Could not remove friend."));
    } finally {
      setBusyAction(null);
    }
  };

  const handleCreateCompetition = async () => {
    if (!profile || busyAction) return;
    if (!f.serverOnline) {
      setSocialNotice("You're offline. Connect to the internet to create a competition.");
      return;
    }
    setSocialNotice(null);
    setBusyAction("createComp");
    try {
      const created = await createCompetition({
        profile,
        title: compTitle,
        description: compDesc,
        durationDays: compDays,
      });
      setCompTitle("");
      setCompDesc("");
      setCreateCompOpen(false);
      setCompetitions((prev) => [created, ...prev]);
      setSocialNotice(`Competition "${created.title}" created. Invite code: ${created.inviteCode}`);
    } catch (err) {
      setSocialNotice(formatUserErrorMessage(err, "Could not create competition."));
    } finally {
      setBusyAction(null);
    }
  };

  const handleJoinCompetition = async () => {
    if (!profile || !joinCode.trim() || busyAction) return;
    if (!f.serverOnline) {
      setSocialNotice("You're offline. Connect to the internet to join a competition.");
      return;
    }
    setSocialNotice(null);
    setBusyAction("joinComp");
    try {
      const joined = await joinCompetitionByCode(profile, joinCode);
      setJoinCode("");
      await loadSocialData();
      setSocialNotice(`Joined "${joined.title}".`);
    } catch (err) {
      setSocialNotice(formatUserErrorMessage(err, "Invalid invite code."));
    } finally {
      setBusyAction(null);
    }
  };

  const openCompetitionDetail = async (comp: CompetitionSummary) => {
    setActiveComp(comp);
    setActiveCompMembers([]);
    setLoadingCompMembers(true);
    try {
      const members = await fetchCompetitionMembers(comp.id);
      setActiveCompMembers(members);
    } catch (err) {
      setActiveCompMembers([]);
      setSocialNotice(formatUserErrorMessage(err, "Could not load competition standings."));
    } finally {
      setLoadingCompMembers(false);
    }
  };

  const copyInvite = async (code: string) => {
    const shareText = `${window.location.origin}/social?join=${code}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareText);
        setCopiedCode(code);
        window.setTimeout(() => setCopiedCode(null), 2000);
        return;
      }
      setSocialNotice(`Invite code: ${code}`);
    } catch {
      setSocialNotice(`Invite code: ${code}`);
    }
  };

  const handleCreateRoom = async () => {
    if (!user || busyAction) return;
    if (!f.serverOnline) {
      setSocialNotice("You're offline. Connect to the internet to create a room.");
      return;
    }
    setBusyAction("createRoom");
    try {
      const created = await createFocusRoomLobby({
        hostId: user.uid,
        name: roomName,
        sessionMinutes: f.settings.defaultMinutes,
      });
      setRooms((prev) => [created, ...prev]);
      setRoomName("");
      setRoomOpen(false);
    } catch (err) {
      setSocialNotice(formatUserErrorMessage(err, "Could not create room."));
    } finally {
      setBusyAction(null);
    }
  };

  const incomingRequests = friends.filter(
    (fr) => fr.status === "pending" && fr.recipientId === user?.uid,
  );
  const outgoingRequests = friends.filter(
    (fr) => fr.status === "pending" && fr.requesterId === user?.uid,
  );
  const acceptedFriends = friends.filter((fr) => fr.status === "accepted");

  const unlockedCount = gamification.achievements.filter((a) => a.unlocked).length;

  return (
    <div className="screen-in flex min-h-dvh flex-col pb-28">
      <Header />

      <div className="mt-2 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight">Profile &amp; Social</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Account, privacy, friends and private challenges.
          </p>
        </div>
        {user && (
          <button
            type="button"
            onClick={() => void f.signOutAccount()}
            aria-label="Sign out"
            className="press flex min-h-10 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <LogOut className="size-3.5" />
            Sign out
          </button>
        )}
      </div>

      {/* Sign in or Profile Summary */}
      {!user ? (
        <Card className="mt-6">
          <div className="flex items-start gap-3.5">
            <AvatarBadge username="Focus" avatarId="amber" size="lg" />
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold">Sign in to sync &amp; compete</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Create your unique username, customize your avatar, set privacy preferences, add
                friends, and join verified leaderboards.
              </p>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground tabular-nums">
                <span>Local total: {formatMinutes(analytics.lifetimeMinutes)}</span>
                <span>·</span>
                <span>
                  Lv.{gamification.levelInfo.level} {gamification.levelInfo.title}
                </span>
                <span>·</span>
                <span>{unlockedCount}/8 badges</span>
              </div>
              {f.authError && <p className="mt-2 text-xs text-coral">{f.authError}</p>}
              <div className="mt-4 max-w-xs">
                <PillButton
                  className="h-11 text-sm"
                  disabled={f.signingIn}
                  onClick={() => void f.signInWithGoogle()}
                >
                  {f.signingIn ? "Signing in..." : "Sign in with Google"}
                </PillButton>
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="mt-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3.5">
              <AvatarBadge
                username={profile?.username ?? "Focus"}
                avatarId={profile?.avatarId ?? "amber"}
                size="lg"
              />
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold">@{profile?.username ?? "loading"}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 capitalize text-foreground">
                    <Shield className="size-3 text-primary" />
                    {profile?.privacy ?? "public"}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Sparkles className="size-3 text-primary" />
                    Lv.{gamification.levelInfo.level} {gamification.levelInfo.title}
                  </span>
                </div>
                {profile?.createdAtMs && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Member since{" "}
                    {new Date(profile.createdAtMs).toLocaleDateString(undefined, {
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={openProfileEditor}
              className="press shrink-0 rounded-full border border-border bg-secondary px-3.5 py-1.5 text-xs font-medium text-foreground"
            >
              Edit profile
            </button>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2 border-t border-border pt-4 text-center">
            <div>
              <p className="text-xs text-muted-foreground">Total focus</p>
              <p className="mt-0.5 text-base font-bold tabular-nums">
                {formatMinutes(Math.max(profile?.totalMinutes ?? 0, analytics.lifetimeMinutes))}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">XP</p>
              <p className="mt-0.5 text-base font-bold tabular-nums">
                {Math.max(profile?.xp ?? 0, gamification.totalXp)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Streak / Best</p>
              <p className="mt-0.5 inline-flex items-center justify-center gap-1 text-base font-bold tabular-nums">
                <Flame className="size-3.5 text-primary" />
                {gamification.streak.currentStreak}/{gamification.streak.longestStreak}d
              </p>
            </div>
          </div>
        </Card>
      )}

      {socialNotice && (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-2xl border border-border bg-card px-4 py-2.5 text-xs text-foreground">
          <span>{socialNotice}</span>
          <button
            type="button"
            onClick={() => setSocialNotice(null)}
            aria-label="Dismiss notice"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Friends & Requests */}
      {user && (
        <section aria-labelledby="friends-heading" className="mt-6 space-y-3">
          <h2 id="friends-heading" className="px-1 text-xs font-medium text-muted-foreground">
            Friends ({acceptedFriends.length})
          </h2>

          <Card>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleSearch();
                  }}
                  aria-label="Search username"
                  placeholder="Search by username…"
                  className="h-10 w-full rounded-full border border-border bg-background pr-3 pl-9 text-sm outline-hidden focus:border-primary"
                />
              </div>
              <button
                type="button"
                onClick={() => void handleSearch()}
                disabled={searching || searchTerm.trim().length < 2}
                className="press h-10 rounded-full bg-ink px-4 text-xs font-semibold text-ink-foreground disabled:opacity-40"
              >
                {searching ? "..." : "Find"}
              </button>
            </div>

            {searchResults.length > 0 && (
              <div className="mt-3 divide-y divide-border border-t border-border pt-2">
                {searchResults.map((res) => {
                  const already = friends.find((fr) => fr.otherUserId === res.userId);
                  return (
                    <div
                      key={res.userId}
                      className="flex items-center justify-between gap-3 py-2.5"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <AvatarBadge username={res.username} avatarId={res.avatarId} size="sm" />
                        <span className="truncate text-sm font-medium">@{res.username}</span>
                      </div>
                      {already ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <UserCheck className="size-3.5 text-primary" />
                          {already.status === "accepted" ? "Friends" : "Pending"}
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={Boolean(busyAction)}
                          onClick={() => void handleSendRequest(res.userId)}
                          className="press flex items-center gap-1 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-foreground disabled:opacity-40"
                        >
                          <UserPlus className="size-3.5" />
                          {busyAction === `send:${res.userId}` ? "Sending..." : "Add"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {incomingRequests.length > 0 && (
              <div className="mt-4 border-t border-border pt-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Incoming requests</p>
                <div className="space-y-2">
                  {incomingRequests.map((req) => (
                    <div
                      key={req.friendshipId}
                      className="flex items-center justify-between gap-2 rounded-2xl bg-secondary/50 px-3 py-2"
                    >
                      <span className="truncate text-sm font-medium">
                        @{req.profile?.username ?? req.otherUserId.slice(0, 8)}
                      </span>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          disabled={Boolean(busyAction)}
                          onClick={() => void handleRespondRequest(req.friendshipId, true)}
                          className="press rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-40"
                        >
                          {busyAction === `respond:${req.friendshipId}` ? "..." : "Accept"}
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(busyAction)}
                          onClick={() => void handleRespondRequest(req.friendshipId, false)}
                          className="press rounded-full bg-card px-3 py-1 text-xs font-medium text-muted-foreground disabled:opacity-40"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {outgoingRequests.length > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                {outgoingRequests.length} outgoing friend{" "}
                {outgoingRequests.length === 1 ? "request" : "requests"} pending.
              </p>
            )}

            {acceptedFriends.length > 0 ? (
              <div className="mt-4 divide-y divide-border border-t border-border pt-2">
                {acceptedFriends.map((fr) => (
                  <div
                    key={fr.friendshipId}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        fr.profile
                          ? setSelectedFriend(fr.profile)
                          : setSocialNotice("This friend's profile stats are currently private.")
                      }
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                    >
                      <AvatarBadge
                        username={fr.profile?.username ?? "Friend"}
                        avatarId={fr.profile?.avatarId ?? "slate"}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          @{fr.profile?.username ?? "Private friend"}
                        </p>
                        <p className="text-[11px] text-muted-foreground tabular-nums">
                          {fr.profile
                            ? `${formatMinutes(fr.profile.totalMinutes)} total · Lv.${fr.profile.level}`
                            : "Profile set to private"}
                        </p>
                      </div>
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(busyAction)}
                      onClick={() => void handleRemoveFriend(fr.friendshipId)}
                      aria-label={`Remove ${fr.profile?.username ?? "friend"}`}
                      className="press rounded-full px-2.5 py-1 text-xs text-muted-foreground hover:text-coral disabled:opacity-40"
                    >
                      {busyAction === `remove:${fr.friendshipId}` ? "Removing..." : "Remove"}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">
                Search for a friend&apos;s username to connect and compare daily progress.
              </p>
            )}
          </Card>
        </section>
      )}

      {/* Private Focus Competitions */}
      {user && (
        <section aria-labelledby="competitions-heading" className="mt-6 space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 id="competitions-heading" className="text-xs font-medium text-muted-foreground">
              Private competitions
            </h2>
            <button
              type="button"
              onClick={() => setCreateCompOpen(true)}
              className="press inline-flex items-center gap-1 text-xs font-semibold text-primary"
            >
              <Plus className="size-3.5" />
              New challenge
            </button>
          </div>

          <Card>
            <div className="flex gap-2">
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                aria-label="Competition invite code"
                placeholder="Enter invite code (e.g. A7K9P2QX)"
                className="h-10 flex-1 rounded-full border border-border bg-background px-4 text-sm uppercase outline-hidden focus:border-primary"
              />
              <button
                type="button"
                onClick={() => void handleJoinCompetition()}
                disabled={!joinCode.trim() || busyAction === "joinComp"}
                className="press h-10 rounded-full bg-secondary px-4 text-xs font-semibold text-foreground disabled:opacity-40"
              >
                {busyAction === "joinComp" ? "Joining..." : "Join"}
              </button>
            </div>

            {competitions.length > 0 ? (
              <div className="mt-4 divide-y divide-border border-t border-border pt-2">
                {competitions.map((comp) => (
                  <div key={comp.id} className="flex items-center justify-between gap-3 py-3">
                    <button
                      type="button"
                      onClick={() => void openCompetitionDetail(comp)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate text-sm font-semibold">{comp.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                        {comp.startDayKey} → {comp.endDayKey} · {comp.memberCount}{" "}
                        {comp.memberCount === 1 ? "member" : "members"}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => void copyInvite(comp.inviteCode)}
                      className="press flex shrink-0 items-center gap-1 rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-medium"
                    >
                      {copiedCode === comp.inviteCode ? (
                        <>
                          <Check className="size-3 text-primary" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="size-3" />
                          {comp.inviteCode}
                        </>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">
                Create a private challenge (like a 7-Day University Focus Challenge) and invite
                friends with a code.
              </p>
            )}
          </Card>
        </section>
      )}

      {/* Future-Ready Focus Rooms Architecture Preview */}
      <section aria-labelledby="rooms-heading" className="mt-6 space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 id="rooms-heading" className="text-xs font-medium text-muted-foreground">
            Focus rooms (lobby preview)
          </h2>
          {user && (
            <button
              type="button"
              onClick={() => setRoomOpen(true)}
              className="press inline-flex items-center gap-1 text-xs font-semibold text-primary"
            >
              <Plus className="size-3.5" />
              Create room
            </button>
          )}
        </div>
        <Card>
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
              <Users className="size-4" strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Shared Focus Rooms</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Room schemas and lobby controls are prepared for upcoming synchronized group
                sessions and live presence.
              </p>
            </div>
          </div>
          {rooms.length > 0 && (
            <div className="mt-3 divide-y divide-border border-t border-border pt-2">
              {rooms.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedRoom(r)}
                  className="press flex w-full items-center justify-between gap-2 py-2.5 text-left text-xs transition-colors hover:text-primary"
                >
                  <span className="truncate font-medium">{r.name}</span>
                  <span className="shrink-0 text-muted-foreground tabular-nums">
                    {r.sessionMinutes}m · {r.status}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Card>
      </section>

      {/* Edit Profile Sheet */}
      <Sheet open={editOpen} onClose={() => setEditOpen(false)} ariaLabel="Edit profile">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl font-semibold">Edit profile</h2>
          <button
            type="button"
            onClick={() => setEditOpen(false)}
            aria-label="Close profile editor"
            className="press flex min-h-10 min-w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Username</span>
            <input
              type="text"
              value={usernameDraft}
              onChange={(e) => setUsernameDraft(sanitizeUsernameInput(e.target.value))}
              maxLength={24}
              className="mt-1.5 h-11 w-full rounded-2xl border border-border bg-background px-3.5 text-sm outline-hidden focus:border-primary"
            />
          </label>

          <div>
            <span className="text-xs font-medium text-muted-foreground">Avatar color</span>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {AVATAR_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setAvatarDraft(opt.id)}
                  className={cn(
                    "press flex items-center justify-center rounded-2xl border py-2.5 transition-colors",
                    avatarDraft === opt.id
                      ? "border-primary bg-primary-soft"
                      : "border-border bg-secondary/40",
                  )}
                >
                  <AvatarBadge username={usernameDraft || "F"} avatarId={opt.id} size="sm" />
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="text-xs font-medium text-muted-foreground">Profile privacy</span>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(
                [
                  { id: "public", label: "Public" },
                  { id: "friends", label: "Friends" },
                  { id: "private", label: "Private" },
                ] as const
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPrivacyDraft(p.id)}
                  className={cn(
                    "press rounded-2xl border py-2.5 text-xs font-medium transition-colors",
                    privacyDraft === p.id
                      ? "border-primary bg-primary-soft text-foreground"
                      : "border-border bg-secondary/40 text-muted-foreground",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="text-xs font-medium text-muted-foreground">Daily focus goal</span>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {[0, 60, 120, 180].map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGoalDraft(g)}
                  className={cn(
                    "press rounded-2xl border py-2 text-xs font-medium transition-colors",
                    goalDraft === g
                      ? "border-primary bg-primary-soft text-foreground"
                      : "border-border bg-secondary/40 text-muted-foreground",
                  )}
                >
                  {g === 0 ? "Off" : formatMinutes(g)}
                </button>
              ))}
            </div>
          </div>

          {profileMsg && <p className="text-xs text-coral">{profileMsg}</p>}

          <PillButton onClick={() => void handleSaveProfile()} disabled={profileSaving}>
            {profileSaving ? "Saving..." : "Save changes"}
          </PillButton>
        </div>
      </Sheet>

      {/* Friend Stats Sheet */}
      <Sheet open={Boolean(selectedFriend)} onClose={() => setSelectedFriend(null)}>
        {selectedFriend && (
          <div>
            <div className="flex items-center gap-3">
              <AvatarBadge
                username={selectedFriend.username}
                avatarId={selectedFriend.avatarId}
                size="lg"
              />
              <div>
                <h2 className="text-xl font-semibold">@{selectedFriend.username}</h2>
                <p className="text-xs text-muted-foreground">
                  Level {selectedFriend.level} · {selectedFriend.currentStreak}d streak
                </p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Card className="p-3.5">
                <p className="text-xs text-muted-foreground">Today</p>
                <p className="mt-0.5 text-xl font-bold tabular-nums">
                  {formatMinutes(selectedFriend.dailyMinutes)}
                </p>
              </Card>
              <Card className="p-3.5">
                <p className="text-xs text-muted-foreground">This week</p>
                <p className="mt-0.5 text-xl font-bold tabular-nums">
                  {formatMinutes(selectedFriend.weeklyMinutes)}
                </p>
              </Card>
              <Card className="p-3.5">
                <p className="text-xs text-muted-foreground">Lifetime</p>
                <p className="mt-0.5 text-xl font-bold tabular-nums">
                  {formatMinutes(selectedFriend.totalMinutes)}
                </p>
              </Card>
              <Card className="p-3.5">
                <p className="text-xs text-muted-foreground">Sessions</p>
                <p className="mt-0.5 text-xl font-bold tabular-nums">
                  {selectedFriend.totalSessions}
                </p>
              </Card>
            </div>
            <div className="mt-5">
              <PillButton variant="ghost" onClick={() => setSelectedFriend(null)}>
                Close
              </PillButton>
            </div>
          </div>
        )}
      </Sheet>

      {/* Create Private Competition Sheet */}
      <Sheet
        open={createCompOpen}
        onClose={() => setCreateCompOpen(false)}
        ariaLabel="Create private competition"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl font-semibold">Create private competition</h2>
          <button
            type="button"
            onClick={() => setCreateCompOpen(false)}
            aria-label="Close create competition"
            className="press flex min-h-10 min-w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-4 space-y-3">
          <input
            type="text"
            value={compTitle}
            onChange={(e) => setCompTitle(e.target.value)}
            maxLength={60}
            aria-label="Competition title"
            placeholder="e.g. 7-Day University Focus Challenge"
            className="h-11 w-full rounded-2xl border border-border bg-background px-3.5 text-sm outline-hidden focus:border-primary"
          />
          <input
            type="text"
            value={compDesc}
            onChange={(e) => setCompDesc(e.target.value)}
            maxLength={160}
            aria-label="Competition description"
            placeholder="Short goal or description (optional)"
            className="h-11 w-full rounded-2xl border border-border bg-background px-3.5 text-sm outline-hidden focus:border-primary"
          />
          <div className="grid grid-cols-3 gap-2">
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setCompDays(d)}
                className={cn(
                  "press rounded-2xl border py-2 text-xs font-medium",
                  compDays === d
                    ? "border-primary bg-primary-soft text-foreground"
                    : "border-border bg-secondary/40 text-muted-foreground",
                )}
              >
                {d} days
              </button>
            ))}
          </div>
          <PillButton
            onClick={() => void handleCreateCompetition()}
            disabled={compTitle.trim().length < 3 || busyAction === "createComp"}
          >
            {busyAction === "createComp" ? "Creating..." : "Create & generate invite code"}
          </PillButton>
        </div>
      </Sheet>

      {/* Competition Detail Sheet */}
      <Sheet
        open={Boolean(activeComp)}
        onClose={() => setActiveComp(null)}
        ariaLabel="Competition details"
      >
        {activeComp && (
          <div>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-xl font-semibold">{activeComp.title}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {activeComp.startDayKey} → {activeComp.endDayKey} · Code: {activeComp.inviteCode}
                </p>
              </div>
              <Trophy className="size-5 text-primary" />
            </div>
            {activeComp.description && (
              <p className="mt-2 text-sm text-muted-foreground">{activeComp.description}</p>
            )}
            <div className="mt-4 divide-y divide-border rounded-2xl border border-border px-3">
              {loadingCompMembers ? (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  Loading standings...
                </p>
              ) : activeCompMembers.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">No members yet.</p>
              ) : (
                activeCompMembers.map((m, idx) => (
                  <div
                    key={m.userId}
                    className="flex items-center justify-between gap-3 py-2.5 text-sm"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="w-5 text-xs font-semibold text-muted-foreground tabular-nums">
                        #{idx + 1}
                      </span>
                      <AvatarBadge username={m.username} avatarId={m.avatarId} size="sm" />
                      <span className="truncate font-medium">@{m.username}</span>
                    </div>
                    <span className="shrink-0 font-semibold tabular-nums">
                      {formatMinutes(m.totalMinutes)}
                    </span>
                  </div>
                ))
              )}
            </div>
            <div className="mt-4">
              <PillButton variant="ghost" onClick={() => setActiveComp(null)}>
                Close
              </PillButton>
            </div>
          </div>
        )}
      </Sheet>

      {/* Create Focus Room Lobby Sheet */}
      <Sheet open={roomOpen} onClose={() => setRoomOpen(false)} ariaLabel="Create focus room">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl font-semibold">Create focus room lobby</h2>
          <button
            type="button"
            onClick={() => setRoomOpen(false)}
            aria-label="Close create room"
            className="press flex min-h-10 min-w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Prepares a shared lobby entry for upcoming live group sessions.
        </p>
        <div className="mt-4 space-y-3">
          <input
            type="text"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            maxLength={60}
            aria-label="Room name"
            placeholder="e.g. Late Night Study Hall"
            className="h-11 w-full rounded-2xl border border-border bg-background px-3.5 text-sm outline-hidden focus:border-primary"
          />
          <PillButton
            onClick={() => void handleCreateRoom()}
            disabled={roomName.trim().length < 3 || busyAction === "createRoom"}
          >
            {busyAction === "createRoom" ? "Creating..." : "Create room"}
          </PillButton>
        </div>
      </Sheet>

      {/* Focus Room Detail Sheet */}
      <Sheet
        open={Boolean(selectedRoom)}
        onClose={() => setSelectedRoom(null)}
        ariaLabel="Focus room details"
      >
        {selectedRoom && (
          <div>
            <h2 className="text-xl font-semibold">{selectedRoom.name}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {selectedRoom.sessionMinutes} min session · Status: {selectedRoom.status}
            </p>
            <div className="mt-5 space-y-2">
              <PillButton
                onClick={() => {
                  if (f.timer.status === "idle") {
                    f.selectMinutes(selectedRoom.sessionMinutes);
                  }
                  setSelectedRoom(null);
                  void navigate({ to: "/" });
                }}
              >
                Open {selectedRoom.sessionMinutes} min timer
              </PillButton>
              <PillButton variant="ghost" onClick={() => setSelectedRoom(null)}>
                Close
              </PillButton>
            </div>
          </div>
        )}
      </Sheet>

      <div className="flex-1" />
      <BottomNav />
    </div>
  );
}
