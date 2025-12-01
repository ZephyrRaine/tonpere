import "dotenv/config";
import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import twilio from "twilio";
import cron from "node-cron";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Paths
const publicDir = path.join(__dirname, "public");
const dataDir = path.join(__dirname, "data");
const submissionsPath = path.join(dataDir, "submissions.json");
const calendarPath = path.join(dataDir, "calendar.json");
const phoneNumbersPath = path.join(dataDir, "phone-numbers.txt");
const smsLogPath = path.join(dataDir, "sms-sent-log.json");

// Ensure data directory and file exist
function ensureStorage() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(submissionsPath)) {
    fs.writeFileSync(submissionsPath, JSON.stringify([] , null, 2));
  }
  if (!fs.existsSync(phoneNumbersPath)) {
    // Create a template file with instructions
    fs.writeFileSync(phoneNumbersPath, "# Add phone numbers here, one per line\n# Format: +1234567890 (include country code)\n# Example:\n# +15551234567\n# +15559876543\n");
  }
  if (!fs.existsSync(smsLogPath)) {
    fs.writeFileSync(smsLogPath, JSON.stringify([], null, 2));
  }
}

ensureStorage();

function sanitizeDayData(dayData) {
  if (!Array.isArray(dayData)) return [];
  return dayData.map((item) => {
    const url = typeof item === "object" && item !== null && typeof item.url === "string" ? item.url : "";
    return { url };
  });
}

// Middleware
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Serve calendar.html as root
app.get("/", (_req, res) => {
  res.sendFile(path.join(publicDir, "calendar.html"));
});

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

// Shared date utilities
function getCurrentDateInfo() {
  const now = new Date();
  return {
    now,
    currentMonth: now.getMonth(), // 0-indexed
    targetMonth: 11, // October (for testing)
    today: now.getDate(),
  };
}

// SMS functionality
function readCalendar() {
  try {
    if (!fs.existsSync(calendarPath)) {
      return null;
    }
    const raw = fs.readFileSync(calendarPath, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    console.error("Error reading calendar:", err);
    return null;
  }
}

function getTodayCalendarEntries() {
  const calendarData = readCalendar();
  if (!calendarData) {
    return { entries: [], isLastDay: false };
  }
  
  const { currentMonth, targetMonth, today } = getCurrentDateInfo();
  
  // Determine which calendar day corresponds to today
  // Same logic as the calendar endpoint
  let calendarDay = null;
  if (currentMonth > targetMonth) {
    // We're past the target month, use today's date
    calendarDay = today;
  } else if (currentMonth === targetMonth) {
    // We're in the target month, use today's date
    calendarDay = today;
  } else {
    // We're before the target month, no calendar day available
    return { entries: [], isLastDay: false };
  }
  
  // Get max day from calendar
  const dayKeys = Object.keys(calendarData).map(Number).filter((n) => Number.isFinite(n));
  const maxDay = dayKeys.length ? Math.max(...dayKeys) : 24;
  const isLastDay = calendarDay === maxDay;
  
  // Get entries for today's calendar day
  const dayStr = String(calendarDay);
  const dayData = calendarData[dayStr];
  
  if (!dayData || !Array.isArray(dayData)) {
    return { entries: [], isLastDay: false };
  }
  
  const entries = dayData.filter((item) => item && item.url && item.url !== "REDACTED");
  return { entries, isLastDay };
}

function readPhoneNumbers() {
  try {
    if (!fs.existsSync(phoneNumbersPath)) {
      return [];
    }
    const content = fs.readFileSync(phoneNumbersPath, "utf-8");
    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"));
  } catch (err) {
    console.error("Error reading phone numbers:", err);
    return [];
  }
}

function readSmsLog() {
  try {
    if (!fs.existsSync(smsLogPath)) {
      return [];
    }
    const raw = fs.readFileSync(smsLogPath, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    return [];
  }
}

function writeSmsLog(log) {
  fs.writeFileSync(smsLogPath, JSON.stringify(log, null, 2));
}

function hasSentToday() {
  const log = readSmsLog();
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD format
  return log.includes(today);
}

function markAsSent() {
  const log = readSmsLog();
  const today = new Date().toISOString().split("T")[0];
  if (!log.includes(today)) {
    log.push(today);
    writeSmsLog(log);
  }
}

function formatCalendarMessage(entries, isLastDay) {
  if (isLastDay) {
    return "tous les bangers sont sortis, rdv sur https://tonpere.com ";
  }
  
  let message = `Noël approche la mif, check ces bons sons pour patienter :\n\n`;
  entries.forEach((entry, index) => {
    if (entry.url) {
      message += `${entry.url}\n\n`;
    }
  });
  
  return message;
}

async function sendDailySms() {
  // Check if already sent today
  if (hasSentToday()) {
    console.log("SMS already sent today, skipping...");
    return;
  }
  
  // Check if Twilio credentials are configured
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  
  if (!accountSid || !authToken || !fromNumber) {
    console.log("Twilio credentials not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER environment variables.");
    return;
  }
  
  // Get today's calendar entries
  const { entries: todayEntries, isLastDay } = getTodayCalendarEntries();
  
  // Don't send SMS if there are no entries
  if (todayEntries.length === 0) {
    console.log("No calendar entries for today, skipping SMS...");
    // Still mark as sent to avoid checking again
    markAsSent();
    return;
  }
  
  // Read phone numbers
  const phoneNumbers = readPhoneNumbers();
  
  if (phoneNumbers.length === 0) {
    console.log("No phone numbers configured. Add numbers to data/phone-numbers.txt");
    return;
  }
  
  // Format message
  const message = formatCalendarMessage(todayEntries, isLastDay);
  
  // Initialize Twilio client
  const client = twilio(accountSid, authToken);
  
  // Send to all phone numbers
  const results = [];
  for (const phoneNumber of phoneNumbers) {
    try {
      const result = await client.messages.create({
        body: message,
        from: fromNumber,
        to: phoneNumber,
      });
      results.push({ phoneNumber, success: true, sid: result.sid });
      console.log(`SMS sent to ${phoneNumber}: ${result.sid}`);
    } catch (err) {
      results.push({ phoneNumber, success: false, error: err.message });
      console.error(`Failed to send SMS to ${phoneNumber}:`, err.message);
    }
  }
  
  // Mark as sent if at least one message was successful
  const hasSuccess = results.some((r) => r.success);
  if (hasSuccess) {
    markAsSent();
    console.log(`Daily SMS sent. Success: ${results.filter((r) => r.success).length}/${results.length}`);
  } else {
    console.error("Failed to send any SMS messages. Not marking as sent.");
  }
}

// Set up daily cron job (runs at 9:00 AM every day)
// Cron format: minute hour day month weekday
cron.schedule("0 10 * * *", () => {
  console.log("Running daily SMS job...");
  sendDailySms().catch((err) => {
    console.error("Error in daily SMS job:", err);
  });
});

// Also run on server start, but only if it's after 9am (will skip if already sent today)
const now = new Date();
const currentHour = now.getHours();
if (currentHour >= 10) {
  sendDailySms().catch((err) => {
    console.error("Error in initial SMS check:", err);
  });
} else {
  console.log(`Server started before 10am (current time: ${now.toLocaleTimeString()}). SMS will be sent at 9am via cron job.`);
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
    const { now, currentMonth, targetMonth, today } = getCurrentDateInfo();
    
    // Filter calendar data based on current date
    const filtered = {};
    const dayKeys = Object.keys(calendarData).map(Number).filter((n) => Number.isFinite(n));
    const maxDay = dayKeys.length ? Math.max(...dayKeys) : 24;
    
    for (let day = 1; day <= maxDay; day++) {
      const dayStr = String(day);
      const dayData = calendarData[dayStr];
      
      if (!dayData) {
        // Day doesn't exist in calendar, mark as REDACTED
        filtered[dayStr] = [{ url: "REDACTED" }];
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
        // Return actual data (last day already includes all bangers from calendar generation)
        filtered[dayStr] = sanitizeDayData(dayData);
      } else {
        // Return REDACTED placeholder
        filtered[dayStr] = [{ url: "REDACTED" }];
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


