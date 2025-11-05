// Node script to generate data/calendar.json from data/submissions.json
// Requirements:
// - Each day (1..24) gets exactly 3 links
// - Links must be from 3 different submitters (1 link per person per day)
// - Distribute fairly across submitters; randomize order deterministically per run

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, "..", "data");
const submissionsPath = path.join(dataDir, "submissions.json");
const calendarPath = path.join(dataDir, "calendar.json");

function readJson(file) {
  try {
    const raw = fs.readFileSync(file, "utf-8");
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function shuffle(array) {
  // Fisher-Yates
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function buildPools(submissions) {
  // Build a map of submitter -> queue of links
  const submitterToLinks = new Map();
  for (const sub of submissions) {
    const name = String(sub.name || "").trim();
    if (!name) continue;
    const videos = Array.isArray(sub.videos) ? sub.videos : [];
    const cleaned = videos
      .map((v) => String(v || "").trim())
      .filter((v) => v.length > 0);
    if (cleaned.length === 0) continue;
    submitterToLinks.set(name, (submitterToLinks.get(name) || []).concat(cleaned));
  }
  // Shuffle each submitter's links for randomness
  for (const [name, links] of submitterToLinks) {
    submitterToLinks.set(name, shuffle(links.slice()));
  }
  return submitterToLinks;
}

function countTotalLinks(pool) {
  let total = 0;
  for (const links of pool.values()) total += links.length;
  return total;
}

function getRequiredDays() {
  const cliDaysArg = process.argv.find((a) => a.startsWith("--days="));
  const daysFromCli = cliDaysArg ? parseInt(cliDaysArg.split("=")[1], 10) : NaN;
  const daysEnv = process.env.DAYS ? parseInt(process.env.DAYS, 10) : NaN;
  return Number.isFinite(daysFromCli)
    ? daysFromCli
    : Number.isFinite(daysEnv)
    ? daysEnv
    : 24;
}

function generateCalendar(submissions) {
  const pool = buildPools(submissions);
  const submitters = Array.from(pool.keys());
  if (submitters.length < 3) {
    throw new Error("Need at least 3 submitters to fill each day with unique people");
  }

  const REQUIRED_DAYS = getRequiredDays();
  const LINKS_PER_DAY = 3;
  const REQUIRED_LINKS = REQUIRED_DAYS * LINKS_PER_DAY;

  const totalLinks = countTotalLinks(pool);
  if (totalLinks < REQUIRED_LINKS) {
    throw new Error(`Not enough total links: have ${totalLinks}, need ${REQUIRED_LINKS}`);
  }

  // Track how many times each submitter has been used to balance distribution
  const usedCount = new Map(submitters.map((s) => [s, 0]));

  // Helper to get next submitter with available links, preferring lower usedCount
  function getNextSubmitter(excluded) {
    const candidates = submitters
      .filter((s) => !excluded.has(s) && (pool.get(s) || []).length > 0)
      .sort((a, b) => {
        const ca = usedCount.get(a) || 0;
        const cb = usedCount.get(b) || 0;
        if (ca !== cb) return ca - cb;
        // tie-breaker random
        return Math.random() - 0.5;
      });
    return candidates[0] || null;
  }

  const calendar = {};
  for (let day = 1; day <= REQUIRED_DAYS; day++) {
    const dayAssignments = [];
    const chosenSubmitters = new Set();
    for (let i = 0; i < LINKS_PER_DAY; i++) {
      const submitter = getNextSubmitter(chosenSubmitters);
      if (!submitter) {
        throw new Error(`Could not find enough distinct submitters for day ${day}`);
      }
      const links = pool.get(submitter);
      const url = links.shift();
      dayAssignments.push({ url, submitterName: submitter });
      usedCount.set(submitter, (usedCount.get(submitter) || 0) + 1);
      chosenSubmitters.add(submitter);
    }
    calendar[String(day)] = dayAssignments;
  }

  return calendar;
}

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

function main() {
  ensureDataDir();
  const submissions = readJson(submissionsPath);
  if (!Array.isArray(submissions)) {
    throw new Error("submissions.json missing or invalid (expected array)");
  }

  const placeholderFlag = process.argv.includes("--placeholders") || String(process.env.PLACEHOLDERS || "").toLowerCase() === "true";

  let calendar;
  if (placeholderFlag) {
    const LINKS_PER_DAY = 3;
    const REQUIRED_DAYS = getRequiredDays();
    
    // Generate random ID-like strings
    function randomId(length = 11) {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
      let result = '';
      for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    }
    
    function randomNumericId(length = 10) {
      let result = '';
      for (let i = 0; i < length; i++) {
        result += Math.floor(Math.random() * 10);
      }
      return result;
    }
    
    // Supported services with URL generators
    const services = [
      () => `https://www.youtube.com/watch?v=${randomId(11)}`,
      () => `https://youtu.be/${randomId(11)}`,
      () => `https://open.spotify.com/track/${randomId(22)}`,
      () => `https://www.deezer.com/track/${randomNumericId(10)}`,
      () => `https://soundcloud.com/artist-${Math.floor(Math.random() * 1000)}/track-${Math.floor(Math.random() * 1000)}`,
      () => `https://artist${Math.floor(Math.random() * 100)}.bandcamp.com/track/track-${Math.floor(Math.random() * 1000)}`
    ];
    
    // Generate placeholder submissions with bangers
    const NUM_BANGERS = 15;
    const placeholderSubmissions = [];
    for (let i = 1; i <= NUM_BANGERS; i++) {
      const serviceIndex = Math.floor(Math.random() * services.length);
      const urlGenerator = services[serviceIndex];
      placeholderSubmissions.push({
        id: `placeholder-${i}-${Date.now()}`,
        name: `Placeholder User ${i}`,
        videos: [],
        banger: urlGenerator(),
        createdAt: new Date().toISOString()
      });
    }
    // Write placeholder submissions to submissions.json
    fs.writeFileSync(submissionsPath, JSON.stringify(placeholderSubmissions, null, 2));
    
    calendar = {};
    for (let day = 1; day <= REQUIRED_DAYS; day++) {
      const items = [];
      for (let i = 1; i <= LINKS_PER_DAY; i++) {
        // Randomly select a service
        const serviceIndex = Math.floor(Math.random() * services.length);
        const urlGenerator = services[serviceIndex];
        items.push({
          url: urlGenerator(),
          submitterName: `Placeholder ${i}`
        });
      }
      calendar[String(day)] = items;
    }
  } else {
    const calendarGenerated = generateCalendar(submissions);
    calendar = calendarGenerated;
  }

  fs.writeFileSync(calendarPath, JSON.stringify(calendar, null, 2));
  // eslint-disable-next-line no-console
  console.log(`Generated calendar.json at ${calendarPath}`);
}

try {
  main();
} catch (err) {
  // eslint-disable-next-line no-console
  console.error("Failed to generate calendar:", err.message);
  process.exit(1);
}


