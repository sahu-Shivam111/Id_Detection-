import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// src/config -> src -> server (where package.json lives)
const envPath = path.resolve(__dirname, "../../.env");
const result = dotenv.config({ path: envPath });

console.log("Loading .env from:", envPath);
if (result.error) console.error("dotenv error:", result.error.message);