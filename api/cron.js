// api/cron.js
// Runs on schedule via Vercel Cron Jobs.
// Scrapes accounts + competitors, analyzes with Claude, emails digest.

const { scrapeAll, scrapeAllCompetitors } = require("../lib/scraper");
const { sendDigest } = require("../lib/email");

// ─── YOUR ACCOUNT WATCHLIST ────────────────────────────────────────────────
const COMPANIES = [
  { name: "Revolution Mixer", url: "revolutionmixers.com" },
  // Add your key accounts here:
  //   { name: "Revolution Mixer", url: "revolutionmixers.com" },
  { name: "Petersen Industries", url: "petersenind.com" },
  { name: "Tag Mfg.", url: "tagmfg.us" },
  { name: "TimberPro", url: "timberpro.com" },
  { name: "Precision Husky", url: "precisionhusky.com" },
  { name: "LANCO", url: "thelancogroup.com" },
  { name: "LiftKing", url: "liftking.com" },
  { name: "Broderson", url: "broderson.com" },
  { name: "Toyota Material Handling", url: "www.tmhna.com" },
  { name: "Excel Baler", url: "excelbalermfg.com" },
  { name: "Labrie Group", url: "labriegroup.com" },
  { name: "CSTH Continental Mixer Bridgeport EZ-Pack", url: "onesourceparts.com" },
];

// ─── YOUR COMPETITOR LIST ──────────────────────────────────────────────────
const COMPETITORS = [
  { name: "Hengli",   url: "henglihydraulics.com" },
  { name: "Rosenboom",   url: "rosenboom.com" },
  { name: "Aggressive Hydraulics", url: "aggressivehydraulics.com" },
  { name: "Texas Hydraulics", url: "texashydraulics.com" },
  // Add up to 6 competitors — replace names and URLs with your real ones
];

// ─── YOUR EMAIL ────────────────────────────────────────────────────────────
const RECIPIENT_EMAIL = process.env.RECIPIENT_EMAIL || "you@youremail.com";

// ─── CRON HANDLER ──────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  console.log("Starting intel scrape...");
  const startTime = Date.now();

  try {
    // Run accounts and competitors in parallel
    const [accountResults, competitorResults] = await Promise.all([
      scrapeAll(COMPANIES),
      scrapeAllCompetitors(COMPETITORS),
    ]);

    await sendDigest(accountResults, competitorResults, RECIPIENT_EMAIL);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`Done in ${elapsed}s`);

    return res.status(200).json({
      success: true,
      accountsProcessed: accountResults.length,
      competitorsProcessed: competitorResults.length,
      elapsedSeconds: elapsed,
    });

  } catch (error) {
    console.error("Cron job failed:", error);
    return res.status(500).json({ error: error.message });
  }
};
