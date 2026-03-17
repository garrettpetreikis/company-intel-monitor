// test-run.js
// Run this locally to test before deploying:
//   ANTHROPIC_API_KEY=sk-... RESEND_API_KEY=re_... RECIPIENT_EMAIL=you@you.com node test-run.js

const { scrapeAll } = require("./lib/scraper");
const { sendDigest } = require("./lib/email");

const TEST_COMPANIES = [
  { name: "Anthropic", url: "anthropic.com" },
  { name: "OpenAI",    url: "openai.com" },
];

(async () => {
  console.log("Running test scrape...\n");
  const results = await scrapeAll(TEST_COMPANIES);
  console.log("\nSignals found:");
  results.forEach(c => {
    console.log(`  ${c.name}: ${c.signals?.length || 0} signals`);
    c.signals?.forEach(s => console.log(`    [${s.confidence}] ${s.title}`));
  });

  if (process.env.RECIPIENT_EMAIL) {
    console.log("\nSending test email...");
    await sendDigest(results, process.env.RECIPIENT_EMAIL);
    console.log("Email sent!");
  } else {
    console.log("\n(Set RECIPIENT_EMAIL env var to also test email sending)");
  }
})();
