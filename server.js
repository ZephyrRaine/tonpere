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
const calendarPath = path.join(dataDir, "calendar.json");

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

// Serve the generated calendar JSON with date-based filtering
app.get("/api/calendar", (_req, res) => {
  try {
    if (!fs.existsSync(calendarPath)) {
      return res.status(404).json({ error: "calendar.json not found. Generate it first." });
    }
    const raw = fs.readFileSync(calendarPath, "utf-8");
    const calendarData = JSON.parse(raw);
    
    // Determine current date status
    // TESTING: Using October (month 9) instead of December for testing
    const now = new Date();
    const currentMonth = now.getMonth(); // 0-indexed
    const targetMonth = 9; // October (for testing)
    const today = now.getDate();
    
    // Filter calendar data based on current date
    const filtered = {};
    const dayKeys = Object.keys(calendarData).map(Number).filter((n) => Number.isFinite(n));
    const maxDay = dayKeys.length ? Math.max(...dayKeys) : 24;
    
    for (let day = 1; day <= maxDay; day++) {
      const dayStr = String(day);
      const dayData = calendarData[dayStr];
      
      if (!dayData) {
        // Day doesn't exist in calendar, mark as REDACTED
        filtered[dayStr] = [{ url: "REDACTED", submitterName: "REDACTED" }];
        continue;
      }
      
      // Check if day should be accessible
      let isAccessible = false;
      if (currentMonth > targetMonth) {
        // We're past the target month, all days are accessible
        isAccessible = true;
      } else if (currentMonth === targetMonth) {
        // We're in the target month, only past/current days are accessible
        if (day <= today) {
          isAccessible = true;
        }
      } else {
        // We're before the target month, no days are accessible
        isAccessible = false;
      }
      
      if (isAccessible) {
        // Special case: last day should include all bangers
        if (day === maxDay) {
          const submissions = readSubmissions();
          const allBangers = [];
          for (const submission of submissions) {
            const name = String(submission.name || "").trim();
            const banger = String(submission.banger || "").trim();
            if (name && banger && banger.length > 0) {
              allBangers.push({
                url: banger,
                submitterName: name
              });
            }
          }
          // If we have bangers, return them; otherwise fall back to regular calendar data
          if (allBangers.length > 0) {
            filtered[dayStr] = allBangers;
          } else {
            filtered[dayStr] = dayData;
          }
        } else {
          // Return actual data for regular days
          filtered[dayStr] = dayData;
        }
      } else {
        // Return REDACTED placeholder
        filtered[dayStr] = [{ url: "REDACTED", submitterName: "REDACTED" }];
      }
    }
    
    return res.json(filtered);
  } catch (err) {
    return res.status(500).json({ error: "Failed to read calendar.json" });
  }
});

// Health endpoint
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server running on http://localhost:${port}`);
});


