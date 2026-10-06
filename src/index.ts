import express from "express";
import dotenv from "dotenv";
import eventRoutes from "./routes/eventRoute";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.use("/events", eventRoutes);

app.get("/", (_req, res) => {
  res.status(200).json({ success: true, message: "Event Scheduler API" });
});

app.use((_req, res) => {
  res.status(404).json({ success: false, message: "Route tidak ditemukan!" });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});