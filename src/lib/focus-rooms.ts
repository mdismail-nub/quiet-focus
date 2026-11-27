import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "./firebase";

export type FocusRoomStatus = "waiting" | "focusing" | "break";
export type FocusRoomVisibility = "public" | "invite";

export interface FocusRoom {
  id: string;
  name: string;
  hostId: string;
  visibility: FocusRoomVisibility;
  sessionMinutes: number;
  status: FocusRoomStatus;
  activeCount: number;
}

export interface FocusRoomParticipant {
  userId: string;
  username: string;
  isFocusing: boolean;
  joinedAt: number;
}

export interface FocusRoomGroupStats {
  totalParticipants: number;
  currentlyFocusing: number;
  combinedSessionMinutes: number;
}

export async function listPublicFocusRooms(): Promise<FocusRoom[]> {
  let snap;
  try {
    snap = await getDocs(
      query(
        collection(db, "focus_rooms"),
        where("visibility", "==", "public"),
        orderBy("updatedAt", "desc"),
        limit(10),
      ),
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, "focus_rooms");
  }

  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      id: String(data["id"] ?? d.id),
      name: String(data["name"] ?? "Quiet Room"),
      hostId: String(data["hostId"] ?? ""),
      visibility: (data["visibility"] as FocusRoomVisibility) ?? "public",
      sessionMinutes: Number(data["sessionMinutes"] ?? 25),
      status: (data["status"] as FocusRoomStatus) ?? "waiting",
      activeCount: Number(data["activeCount"] ?? 1),
    };
  });
}

export async function createFocusRoomLobby(params: {
  hostId: string;
  name: string;
  sessionMinutes: number;
  visibility?: FocusRoomVisibility;
}): Promise<FocusRoom> {
  const cleanName = params.name.trim();
  if (cleanName.length < 3 || cleanName.length > 60) {
    throw new Error("Room name must be 3–60 characters.");
  }
  const minutes = Math.max(5, Math.min(240, Math.round(params.sessionMinutes || 25)));
  const id = `room_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const visibility = params.visibility ?? "public";

  try {
    await setDoc(doc(db, "focus_rooms", id), {
      id,
      name: cleanName,
      hostId: params.hostId,
      visibility,
      sessionMinutes: minutes,
      status: "waiting",
      activeCount: 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `focus_rooms/${id}`);
  }

  return {
    id,
    name: cleanName,
    hostId: params.hostId,
    visibility,
    sessionMinutes: minutes,
    status: "waiting",
    activeCount: 1,
  };
}
