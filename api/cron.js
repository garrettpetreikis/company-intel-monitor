// api/cron.js
// This file runs on a schedule via Vercel Cron Jobs.
// It scrapes all companies, analyzes with Claude, and emails the digest.

const { scrapeAll } = require("../lib/scraper");
const { sendDigest } = require("../lib/email");

// ─── YOUR COMPANY WATCHLIST ────────────────────────────────────────────────
// Add or remove companies here. Each needs a name and a URL.
const COMPANIES = [
  { name: "Salesforce",  url: "salesforce.com" },
  { name: "HubSpot",     url: "hubspot.com" },
  { name: "ServiceNow",  url: "servicenow.com" },
  { name: "Workday",     url: "workday.com" },
  // Add more companies below:
  // { name: "company name", url: "company.com" },
  { name: "Revolution Mixer", url: "revolutionmixers.com" },
];

// ─── YOUR EMAIL ───────────────────────────────────────────────────────────
const RECIPIENT_EMAIL = process.env.RECIPIENT_EMAIL || "gpetreikis@ramrodindustries.com";

// ─── CRON HANDLER ─────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  // Security: Vercel signs cron requests. This check prevents unauthorized triggers.
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  console.log("Starting company intelligence scrape...");
  const startTime = Date.now();

  try {
    // 1. Scrape all companies and analyze with Claude
    const results = await scrapeAll(COMPANIES);

    // 2. Send email digest
    await sendDigest(results, RECIPIENT_EMAIL);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`Done. ${results.length} companies processed in ${elapsed}s`);

    return res.status(200).json({
      success: true,
      companiesProcessed: results.length,
      elapsedSeconds: elapsed,
      signalCounts: results.map(c => ({ company: c.name, signals: c.signals?.length || 0 }))
    });

  } catch (error) {
    console.error("Cron job failed:", error);
    return res.status(500).json({ error: error.message });
  }
};
