// lib/scraper.js
// Fetches public signals for each company and runs them through Claude
// Tuned for hydraulic cylinder sales into heavy equipment, ag equipment, and industrial OEMs

const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Signal sources ────────────────────────────────────────────────────────

async function fetchNewsSignals(company) {
  const queries = [
    `${company.name} new product OR new equipment OR plant OR facility OR expansion OR acquisition`,
    `${company.name} engineering OR manufacturing OR procurement OR hydraulic OR cylinder`,
  ];

  let allItems = [];
  for (const q of queries) {
    const query = encodeURIComponent(q);
    const url = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const xml = await res.text();
      const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 4);
      items.forEach(m => {
        const title = (m[1].match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || [])[1] || "";
        const date  = (m[1].match(/<pubDate>(.*?)<\/pubDate>/) || [])[1] || "";
        if (title) allItems.push(`- ${title} (${date})`);
      });
    } catch {
      // continue
    }
  }
  return allItems.length > 0 ? allItems.join("\n") : "No news fetched";
}

async function fetchJobSignals(company) {
  const roles = ["engineer", "procurement", "maintenance", "manufacturing"];
  let allJobs = [];

  for (const role of roles) {
    const query = encodeURIComponent(`${company.name} ${role}`);
    const url = `https://www.indeed.com/rss?q=${query}&sort=date&limit=3`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const xml = await res.text();
      const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 3);
      items.forEach(m => {
        const title = (m[1].match(/<title>(.*?)<\/title>/) || [])[1] || "";
        if (title) allJobs.push(`- ${title}`);
      });
    } catch {
      // continue
    }
  }

  try {
    const careersUrl = `https://${company.url}/careers`;
    const res = await fetch(careersUrl, {
      signal: AbortSignal.timeout(6000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; IntelBot/1.0)" }
    });
    const html = await res.text();
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 1500);
    if (text.length > 100) allJobs.push(`\nCareers page snapshot: ${text}`);
  } catch {
    // careers page not found, skip
  }

  return allJobs.length > 0 ? allJobs.join("\n") : "No job data fetched";
}

async function fetchWebsiteText(company) {
  let combined = "";
  const pages = [
    `https://${company.url}`,
    `https://${company.url}/news`,
    `https://${company.url}/press-releases`,
    `https://${company.url}/products`,
  ];

  for (const pageUrl of pages) {
    try {
      const res = await fetch(pageUrl, {
        signal: AbortSignal.timeout(6000),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; IntelBot/1.0)" }
      });
      const html = await res.text();
      const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 1200);
      combined += `\n[${pageUrl}]: ${text}`;
    } catch {
      // skip
    }
  }

  return combined.length > 50 ? combined : "Could not fetch website";
}

// ─── Claude analysis (sales-focused prompt) ───────────────────────────────

async function analyzeWithClaude(company, rawData) {
  const prompt = `You are an expert sales intelligence analyst helping a hydraulic cylinder salesperson identify the best time to reach out to prospects and accounts.

You are analyzing: ${company.name} (${company.url})

This company is a target account in one or more of these categories: heavy equipment manufacturer, agriculture equipment maker, or industrial OEM/factory.

RAW DATA COLLECTED:
--- Recent News ---
${rawData.news}

--- Job Postings (engineering, procurement, maintenance roles) ---
${rawData.jobs}

--- Website Pages Snapshot ---
${rawData.website}

YOUR TASK:
Analyze this data and identify signals that indicate this company may need hydraulic cylinders soon, is expanding capacity, or represents a good reason to reach out now.

BUYING TRIGGERS TO LOOK FOR:
1. NEW PRODUCT LAUNCH — They are launching new equipment or machinery that likely requires hydraulic cylinders (e.g. new loader, new tractor model, new press line, new lift system)
2. FACILITY EXPANSION — New plant opening, facility expansion, or capacity increase = new equipment purchases incoming
3. KEY HIRE — New VP Engineering, Chief Engineer, Procurement Manager, Maintenance Director, or Plant Manager hired = new decision maker, good time to introduce yourself
4. PRODUCT LINE EXPANSION — Adding new equipment models or entering new markets = potential new cylinder specs needed
5. COMPETITOR SUPPLIER ISSUE — Any mention of supply chain problems, delivery issues, or switching suppliers
6. CAPEX / INVESTMENT SIGNAL — Funding round, capital investment announcement, or major contract win = budget available for equipment
7. HIRING SPIKE IN ENGINEERING/MAINTENANCE — Suggests active build-out or new product development

For each signal found, provide:
- type: one of "product", "exec", "facility", "hiring", "capex", "supplier", "press"
- title: punchy headline max 12 words — written like a sales alert e.g. "New VP Engineering hired — ideal time to introduce cylinders"
- body: 2-3 sentences explaining EXACTLY why this matters for selling hydraulic cylinders and what action the salesperson should take
- action: one specific recommended sales action e.g. "Call procurement this week and reference the new product line launch" or "Send LinkedIn connection request to new VP Engineering"
- confidence: "high", "med", or "low"
- sources: array of source names

Be specific and sales-focused. Do not give generic business overviews. Every signal must connect directly to a hydraulic cylinder sales opportunity.

Return ONLY a valid JSON array, no markdown, no explanation.
Example: [{"type":"exec","title":"New VP Engineering hired — prime outreach window","body":"John Smith joined as VP Engineering from Caterpillar on March 10. New engineering leaders typically review existing supplier relationships in their first 90 days, making this an ideal window to introduce your cylinder capabilities before relationships are locked in.","action":"Connect with John Smith on LinkedIn this week and reference his Caterpillar background.","confidence":"high","sources":["LinkedIn","Team page"]}]

If there are truly no relevant signals, return: []`;

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }]
    });
    const text = message.content[0].text.trim();
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
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
    await new Promise(r => setTimeout(r, 1500));
  }
  return results;
}

module.exports = { scrapeAll };
