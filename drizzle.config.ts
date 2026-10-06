import type { Config } from "drizzle-kit";
import * as dotenv from "dotenv";

// Load environment variables dari file .env secara eksplisit
dotenv.config();

export default {
  schema: "./src/config/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;