import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Paths
const publicDir = path.join(__dirname, "public");
const dataDir = path.join(__dirname, "data");
const submissionsPath = path.join(dataDir, "submissions.json");

// Ensure data directory and file exist
function ensureStorage() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(submissionsPath)) {
    fs.writeFileSync(submissionsPath, JSON.stringify([] , null, 2));
  }
}

ensureStorage();

// Middleware
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(publicDir));

// Helper to read/write submissions safely
function readSubmissions() {
  try {
    const raw = fs.readFileSync(submissionsPath, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    return [];
  }
}

function writeSubmissions(submissions) {
  fs.writeFileSync(submissionsPath, JSON.stringify(submissions, null, 2));
}

// POST endpoint to receive form submissions
app.post("/submit", (req, res) => {
  const { name, videos, banger } = req.body;

  const trimmedName = typeof name === "string" ? name.trim() : "";
  const videosRaw = typeof videos === "string" ? videos : "";
  const bangerRaw = typeof banger === "string" ? banger : "";

  if (!trimmedName) {
    return res.status(400).json({ error: "Name is required" });
  }

  const videoLines = videosRaw
    .split(/\r?\n/) // split per line
    .map((v) => v.trim())
    .filter((v) => v.length > 0);

  if (videoLines.length === 0) {
    return res.status(400).json({ error: "Please provide at least one YouTube link" });
  }

  const bangerSingle = bangerRaw
    .split(/\r?\n/)
    .map((v) => v.trim())
    .filter((v) => v.length > 0)[0] || "";

  const submission = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: trimmedName,
    videos: videoLines,
    banger: bangerSingle,
    createdAt: new Date().toISOString()
  };

  // Simple sync append to avoid complexity; fine for basic usage
  const existing = readSubmissions();
  existing.push(submission);
  writeSubmissions(existing);

  // For form submission from browser, redirect to a simple thank-you page
  if (req.headers.accept && req.headers.accept.includes("text/html")) {
    return res.redirect(303, "/thank-you.html");
  }

  return res.status(201).json({ ok: true, submission });
});

// Health endpoint
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server running on http://localhost:${port}`);
});


