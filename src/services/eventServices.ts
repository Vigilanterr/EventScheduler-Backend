import { and, asc, eq, gt, lt, ne } from "drizzle-orm";
import { db } from "../config/db";
import { events } from "../config/schema";

export interface EventResponse {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  participants: string[];
  created_at?: string;
  updated_at?: string;
}

export interface ConflictItem {
  event_id: string;
  title: string;
  start_time: string;
  end_time: string;
  participants: string[];
  conflicting_participants: string[];
}

export interface TimeSlot {
  start_time: string;
  end_time: string;
}

type DbEvent = typeof events.$inferSelect;

const norm = (s: string) => s.trim().toLowerCase();

export const toResponse = (row: DbEvent): EventResponse => ({
  id: row.id,
  title: row.title,
  start_time: toISO(row.startTime),
  end_time: toISO(row.endTime),
  participants: row.participants,
  created_at: row.createdAt ? toISO(row.createdAt) : undefined,
  updated_at: row.updatedAt ? toISO(row.updatedAt) : undefined,
});

export const toISO = (value: string | Date): string => {
  if (value instanceof Date) return value.toISOString();
  const s = value.replace(" ", "T");
  const hasTZ = /Z$|[+-]\d{2}:?\d{2}$/.test(s);
  return new Date(hasTZ ? s : s + "Z").toISOString();
};

export const parseDate = (value: unknown): Date | null => {
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string") return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
};

export const normalizeParticipants = (input: unknown): string[] | null => {
  if (!Array.isArray(input)) return null;
  const cleaned = input
    .filter((p): p is string => typeof p === "string")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (cleaned.length !== (input as unknown[]).length) return null;
  const deduped = [...new Map(cleaned.map((p) => [norm(p), p])).values()];
  return deduped;
};

export const isOverlap = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
  aStart < bEnd && bStart < aEnd;

export const intersection = (a: string[], b: string[]): string[] => {
  const set = new Set(b.map(norm));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of a) {
    const key = norm(p);
    if (set.has(key) && !seen.has(key)) {
      seen.add(key);
      out.push(p);
    }
  }
  return out;
};

export const validateEventInput = (body: any): string | null => {
  const title = body?.title;
  const startRaw = body?.start_time ?? body?.startTime;
  const endRaw = body?.end_time ?? body?.endTime;
  const participants = body?.participants;
  if (typeof title !== "string" || title.trim().length === 0) return "Field title wajib diisi!";
  if (startRaw === undefined || endRaw === undefined) return "Field start_time dan end_time wajib diisi!";
  const start = parseDate(startRaw);
  const end = parseDate(endRaw);
  if (!start || !end) return "Format start_time atau end_time tidak valid!";
  if (start.getTime() >= end.getTime()) return "start_time harus lebih kecil dari end_time!";
  const clean = normalizeParticipants(participants);
  if (clean === null) return "Field participants wajib berupa array string!";
  if (clean.length === 0) return "Field participants tidak boleh kosong!";
  return null;
};

export const validateParticipants = (participants: unknown): string | null => {
  const clean = normalizeParticipants(participants);
  if (clean === null) return "Field participants wajib berupa array string!";
  if (clean.length === 0) return "Field participants tidak boleh kosong!";
  return null;
};

export const getAllEventsFromDb = async (): Promise<EventResponse[]> => {
  const rows = await db.select().from(events).orderBy(asc(events.startTime));
  return rows.map(toResponse);
};

export const getEventByIdFromDb = async (id: string): Promise<EventResponse | null> => {
  const rows = await db.select().from(events).where(eq(events.id, id)).limit(1);
  if (rows.length === 0) return null;
  return toResponse(rows[0]);
};

export const deleteEventFromDb = async (id: string): Promise<boolean> => {
  const existing = await getEventByIdFromDb(id);
  if (!existing) return false;
  await db.delete(events).where(eq(events.id, id));
  return true;
};

const findOverlapping = async (start: Date, end: Date, excludeId?: string) => {
  const conditions = [lt(events.startTime, end.toISOString()), gt(events.endTime, start.toISOString())];
  if (excludeId) conditions.push(ne(events.id, excludeId));
  return db.select().from(events).where(and(...conditions));
};

export const findConflicts = async (
  start: Date,
  end: Date,
  participants: string[],
  excludeId?: string
): Promise<ConflictItem[]> => {
  const candidates = await findOverlapping(start, end, excludeId);
  const conflicts: ConflictItem[] = [];
  for (const row of candidates) {
    const same = intersection(row.participants, participants);
    if (same.length === 0) continue;
    const res = toResponse(row);
    conflicts.push({
      event_id: res.id,
      title: res.title,
      start_time: res.start_time,
      end_time: res.end_time,
      participants: res.participants,
      conflicting_participants: same,
    });
  }
  return conflicts;
};

export const findParticipantConflicts = async (
  participants: string[],
  excludeId?: string
) => {
  const rows = await db.select().from(events);
  return rows.filter((r) => {
    if (excludeId && r.id === excludeId) return false;
    return intersection(r.participants, participants).length > 0;
  });
};

export const findSuggestion = async (
  start: Date,
  end: Date,
  participants: string[],
  excludeId?: string
): Promise<TimeSlot> => {
  const duration = end.getTime() - start.getTime();
  const related = await findParticipantConflicts(participants, excludeId);
  const busy = related
    .map((r) => ({
      start: new Date(r.startTime).getTime(),
      end: new Date(r.endTime).getTime(),
    }))
    .sort((a, b) => a.start - b.start);
  let candidate = start.getTime();
  for (let i = 0; i < 100; i++) {
    const overlapping = busy.filter((b) => isOverlap(candidate, candidate + duration, b.start, b.end));
    if (overlapping.length === 0) break;
    candidate = Math.min(...overlapping.map((b) => b.end));
  }
  return {
    start_time: new Date(candidate).toISOString(),
    end_time: new Date(candidate + duration).toISOString(),
  };
};

export const isSuggestionFree = async (
  suggestion: TimeSlot,
  participants: string[],
  excludeId?: string
): Promise<boolean> => {
  const conflicts = await findConflicts(
    new Date(suggestion.start_time),
    new Date(suggestion.end_time),
    participants,
    excludeId
  );
  return conflicts.length === 0;
};

export type CreateEventResult =
  | { success: true; message: string; data: EventResponse }
  | { success: false; message: string; conflicts: ConflictItem[]; suggestion: TimeSlot };

export const createEventWithConflictCheck = async (body: any): Promise<CreateEventResult> => {
  const err = validateEventInput(body);
  if (err) throw Object.assign(new Error(err), { status: 400 });
  const title = body.title.trim();
  const start = parseDate(body.start_time ?? body.startTime)!;
  const end = parseDate(body.end_time ?? body.endTime)!;
  const participants = normalizeParticipants(body.participants)!;
  const conflicts = await findConflicts(start, end, participants);
  if (conflicts.length > 0) {
    const suggestion = await findSuggestion(start, end, participants);
    return { success: false, message: "Event memiliki konflik jadwal", conflicts, suggestion };
  }
  const rows = await db
    .insert(events)
    .values({ title, startTime: start.toISOString(), endTime: end.toISOString(), participants })
    .returning();
  return { success: true, message: "Event berhasil dibuat", data: toResponse(rows[0]) };
};

export const buildConflictResponse = (conflicts: ConflictItem[], suggestion: TimeSlot) => ({
  success: false as const,
  message: "Event memiliki konflik jadwal",
  conflicts,
  suggestion,
});

export const updateEventWithConflictCheck = async (id: string, body: any): Promise<CreateEventResult> => {
  const existing = await getEventByIdFromDb(id);
  if (!existing) throw Object.assign(new Error("Event tidak ditemukan"), { status: 404 });
  const err = validateEventInput(body);
  if (err) throw Object.assign(new Error(err), { status: 400 });
  const title = body.title.trim();
  const start = parseDate(body.start_time ?? body.startTime)!;
  const end = parseDate(body.end_time ?? body.endTime)!;
  const participants = normalizeParticipants(body.participants)!;
  const conflicts = await findConflicts(start, end, participants, id);
  if (conflicts.length > 0) {
    const suggestion = await findSuggestion(start, end, participants, id);
    return { success: false, message: "Event memiliki konflik jadwal", conflicts, suggestion };
  }
  const rows = await db
    .update(events)
    .set({ title, startTime: start.toISOString(), endTime: end.toISOString(), participants, updatedAt: new Date().toISOString() })
    .where(eq(events.id, id))
    .returning();
  return { success: true, message: "Event berhasil diperbarui", data: toResponse(rows[0]) };
};
