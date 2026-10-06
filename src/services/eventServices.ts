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
