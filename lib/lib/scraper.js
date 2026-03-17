// lib/scraper.js
// Fetches public signals for each company and runs them through Claude

const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Signal sources ────────────────────────────────────────────────────────

async function fetchNewsSignals(company) {
  const query = encodeURIComponent(`${company.name} announcement OR acquisition OR launch OR hire`);
  const url = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const xml = await res.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 5);
    return items.map(m => {
      const title = (m[1].match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || [])[1] || "";
      const date  = (m[1].match(/<pubDate>(.*?)<\/pubDate>/) || [])[1] || "";
      return `- ${title} (${date})`;
    }).join("\n");
  } catch {
    return "No news fetched";
  }
}

async function fetchJobSignals(company) {
  // Uses Indeed RSS (no auth required for basic search)
  const query = encodeURIComponent(company.name);
  const url = `https://www.indeed.com/rss?q=${query}&sort=date&limit=5`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const xml = await res.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 5);
    const jobs = items.map(m => {
      const title = (m[1].match(/<title>(.*?)<\/title>/) || [])[1] || "";
      return `- ${title}`;
    }).join("\n");
    return jobs || "No recent jobs found";
  } catch {
    return "No job data fetched";
  }
}

async function fetchWebsiteText(company) {
  try {
    const res = await fetch(`https://${company.url}`, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; IntelBot/1.0)" }
    });
    const html = await res.text();
    // Strip tags and collapse whitespace
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 3000);
    return text;
  } catch {
    return "Could not fetch website";
  }
}

// ─── Claude analysis ───────────────────────────────────────────────────────

async function analyzeWithClaude(company, rawData) {
  const prompt = `You are a competitive intelligence analyst. Analyze the following signals for ${company.name} (${company.url}) and extract meaningful business intelligence.

RAW SIGNALS:
--- Recent News ---
${rawData.news}

--- Recent Job Postings ---
${rawData.jobs}

--- Website Snapshot (first 3000 chars) ---
${rawData.website}

Your task: Identify and return a JSON array of signals. Each signal must have:
- type: one of "product", "exec", "ma", "job", "press", "web"
- title: short headline (max 12 words)
- body: 2-3 sentence analysis of what this signal means for the business
- confidence: "high", "med", or "low"
- sources: array of source names used

Focus on: new product launches, executive hires/departures, M&A activity, press releases, hiring spikes, website changes.

Return ONLY a valid JSON array, no markdown, no explanation. Example:
[{"type":"product","title":"New AI analytics tool launched","body":"...","confidence":"high","sources":["News"]}]

If there are no meaningful signals, return an empty array: []`;

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }]
    });
    const text = message.content[0].text.trim();
    return JSON.parse(text);
  } catch (e) {
    console.error(`Claude analysis failed for ${company.name}:`, e.message);
    return [];
  }
}

// ─── Main export ───────────────────────────────────────────────────────────

async function scrapeCompany(company) {
  console.log(`Scraping ${company.name}...`);
  const [news, jobs, website] = await Promise.all([
    fetchNewsSignals(company),
    fetchJobSignals(company),
    fetchWebsiteText(company)
  ]);
  const signals = await analyzeWithClaude(company, { news, jobs, website });
  return { ...company, signals, scrapedAt: new Date().toISOString() };
}

async function scrapeAll(companies) {
  const results = [];
  for (const company of companies) {
    const result = await scrapeCompany(company);
    results.push(result);
    // Small delay to be respectful to servers
    await new Promise(r => setTimeout(r, 1500));
  }
  return results;
}

module.exports = { scrapeAll };
