import { Request, Response } from "express";
import {
  getAllEventsFromDb,
  getEventByIdFromDb,
  deleteEventFromDb,
  createEventWithConflictCheck,
} from "../services/eventServices";

const isValidUUID = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export const getEvents = async (_req: Request, res: Response) => {
  try {
    const allEvents = await getAllEventsFromDb();
    return res.status(200).json({ success: true, data: allEvents });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: "Gagal mengambil event" });
  }
};

export const getEventById = async (req: Request, res: Response) => {
  try {
    if (!isValidUUID(req.params.id)) {
      return res.status(400).json({ success: false, message: "ID event tidak valid!" });
    }
    const event = await getEventByIdFromDb(req.params.id);
    if (!event) {
      return res.status(404).json({ success: false, message: "Event tidak ditemukan!" });
    }
    return res.status(200).json({ success: true, data: event });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: "Gagal mengambil event" });
  }
};

export const createEvent = async (req: Request, res: Response) => {
  try {
    const result = await createEventWithConflictCheck(req.body);
    if (!result.success) return res.status(409).json(result);
    return res.status(201).json(result);
  } catch (error: any) {
    const status = error.status === 404 ? 404 : error.status === 400 ? 400 : 500;
    const message = status === 500 ? "Gagal membuat event" : error.message;
    return res.status(status).json({ success: false, message });
  }
};
