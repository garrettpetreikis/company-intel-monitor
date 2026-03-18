// lib/scraper.js
// Multi-source scraper tuned for hydraulic cylinder sales
// Targets: heavy equipment manufacturers, ag equipment makers, industrial OEMs

const Anthropic = require("@anthropic-ai/sdk");
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Helper ────────────────────────────────────────────────────────────────

async function safeFetch(url, opts = {}) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; IntelBot/1.0)", ...opts.headers },
      ...opts
    });
    return await res.text();
  } catch {
    return "";
  }
}

function stripHtml(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseRssTitles(xml, limit = 5) {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, limit);
  return items.map(m => {
    const title = (m[1].match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/) || [])[1] || "";
    const date  = (m[1].match(/<pubDate>(.*?)<\/pubDate>/) || [])[1] || "";
    return title ? `- ${title.trim()} ${date ? `(${date})` : ""}` : null;
  }).filter(Boolean).join("\n");
}

// ─── 1. Google News (2 targeted searches) ─────────────────────────────────

async function fetchGoogleNews(company) {
  const searches = [
    `"${company.name}" new product OR launch OR equipment OR expansion OR acquisition OR facility`,
    `"${company.name}" engineering OR procurement OR manufacturing OR hydraulic OR cylinder OR plant`,
  ];
  let results = [];
  for (const q of searches) {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
    const xml = await safeFetch(url);
    if (xml) results.push(parseRssTitles(xml, 4));
  }
  return results.filter(Boolean).join("\n") || "No Google News results";
}

// ─── 2. PR Newswire RSS ────────────────────────────────────────────────────

async function fetchPRNewswire(company) {
  const q = encodeURIComponent(company.name);
  const url = `https://www.prnewswire.com/rss/news-releases-list.rss?q=${q}`;
  const xml = await safeFetch(url);
  return xml ? parseRssTitles(xml, 5) : "No PR Newswire results";
}

// ─── 3. Business Wire RSS ──────────────────────────────────────────────────

async function fetchBusinessWire(company) {
  const q = encodeURIComponent(company.name);
  const url = `https://feed.businesswire.com/rss/home/?rss=G22&q=${q}`;
  const xml = await safeFetch(url);
  return xml ? parseRssTitles(xml, 5) : "No Business Wire results";
}

// ─── 4. Trade press RSS feeds ──────────────────────────────────────────────

async function fetchTradePress(company) {
  const feeds = [
    { name: "Hydraulics & Pneumatics", url: "https://www.hydraulicspneumatics.com/rss.xml" },
    { name: "Equipment World",         url: "https://www.equipmentworld.com/rss.xml" },
    { name: "For Construction Pros",   url: "https://www.forconstructionpros.com/rss.xml" },
    { name: "Ag Web",                  url: "https://www.agweb.com/rss.xml" },
    { name: "Ag Equipment Intel",      url: "https://www.agequipmentintelligence.com/rss" },
    { name: "Plant Engineering",       url: "https://www.plantengineering.com/rss.xml" },
    { name: "Industry Week",           url: "https://www.industryweek.com/rss.xml" },
  ];

  let results = [];
  const nameLower = company.name.toLowerCase();

  for (const feed of feeds) {
    const xml = await safeFetch(feed.url);
    if (!xml) continue;
    // Only keep items mentioning the company
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
    const matches = items
      .filter(m => m[1].toLowerCase().includes(nameLower))
      .slice(0, 3)
      .map(m => {
        const title = (m[1].match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/) || [])[1] || "";
        return title ? `- [${feed.name}] ${title.trim()}` : null;
      })
      .filter(Boolean);
    if (matches.length) results.push(...matches);
  }

  return results.length > 0 ? results.join("\n") : "No trade press mentions found";
}

// ─── 5. Job boards (Indeed + Ziprecruiter + Glassdoor) ────────────────────

async function fetchJobs(company) {
  const roles = ["engineer", "procurement", "maintenance", "manufacturing", "sourcing", "quality"];
  let allJobs = [];

  // Indeed RSS
  for (const role of roles) {
    const q = encodeURIComponent(`${company.name} ${role}`);
    const xml = await safeFetch(`https://www.indeed.com/rss?q=${q}&sort=date&limit=3`);
    if (xml) {
      const titles = parseRssTitles(xml, 3);
      if (titles) allJobs.push(`[Indeed] ${titles}`);
    }
  }

  // Ziprecruiter RSS
  const zq = encodeURIComponent(`${company.name} engineer OR procurement OR maintenance`);
  const zxml = await safeFetch(`https://www.ziprecruiter.com/jobs-feeds/rss?q=${zq}`);
  if (zxml) {
    const titles = parseRssTitles(zxml, 5);
    if (titles) allJobs.push(`[Ziprecruiter]\n${titles}`);
  }

  // Company careers page
  const careersPages = [
    `https://${company.url}/careers`,
    `https://${company.url}/jobs`,
    `https://${company.url}/work-with-us`,
    `https://${company.url}/join-us`,
  ];
  for (const pageUrl of careersPages) {
    const html = await safeFetch(pageUrl);
    if (html && html.length > 500) {
      const text = stripHtml(html).slice(0, 1500);
      allJobs.push(`[Careers page - ${pageUrl}]: ${text}`);
      break;
    }
  }

  return allJobs.length > 0 ? allJobs.join("\n") : "No job data found";
}

// ─── 6. Thomasnet (industrial supplier directory) ─────────────────────────

async function fetchThomasnet(company) {
  const q = encodeURIComponent(company.name);
  const url = `https://www.thomasnet.com/search/?what=${q}`;
  const html = await safeFetch(url);
  if (!html) return "No Thomasnet data";
  const text = stripHtml(html).slice(0, 2000);
  return `[Thomasnet]: ${text}`;
}

// ─── 7. Company website (homepage + key pages) ────────────────────────────

async function fetchWebsite(company) {
  const pages = [
    `https://${company.url}`,
    `https://${company.url}/news`,
    `https://${company.url}/newsroom`,
    `https://${company.url}/press-releases`,
    `https://${company.url}/press`,
    `https://${company.url}/products`,
    `https://${company.url}/new-products`,
    `https://${company.url}/about`,
  ];

  let combined = [];
  for (const pageUrl of pages) {
    const html = await safeFetch(pageUrl);
    if (html && html.length > 300) {
      const text = stripHtml(html).slice(0, 1000);
      combined.push(`[${pageUrl}]: ${text}`);
    }
  }
  return combined.length > 0 ? combined.join("\n\n") : "Could not fetch website";
}

// ─── 8. SEC EDGAR (public companies only) ─────────────────────────────────

async function fetchEdgar(company) {
  const q = encodeURIComponent(company.name);
  const url = `https://efts.sec.gov/LATEST/search-index?q=${q}&dateRange=custom&startdt=${getLastMonthDate()}&enddt=${getTodayDate()}&forms=8-K`;
  const html = await safeFetch(url);
  if (!html) return "No SEC filings found";
  const text = stripHtml(html).slice(0, 1500);
  return `[SEC EDGAR 8-K filings]: ${text}`;
}

function getTodayDate() {
  return new Date().toISOString().split("T")[0];
}
function getLastMonthDate() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().split("T")[0];
}

// ─── Claude analysis ───────────────────────────────────────────────────────

async function analyzeWithClaude(company, rawData) {
  const prompt = `You are an expert sales intelligence analyst helping a hydraulic cylinder salesperson identify the best time to reach out to target accounts.

ACCOUNT: ${company.name} (${company.url})
ACCOUNT TYPE: Heavy equipment manufacturer, agriculture equipment maker, or industrial OEM/factory

COLLECTED INTELLIGENCE FROM MULTIPLE SOURCES:

--- Google News ---
${rawData.googleNews}

--- PR Newswire ---
${rawData.prNewswire}

--- Business Wire ---
${rawData.businessWire}

--- Trade Press (Hydraulics & Pneumatics, Equipment World, Ag Web, etc.) ---
${rawData.tradePress}

--- Job Postings (Indeed, Ziprecruiter, Careers page) ---
${rawData.jobs}

--- Thomasnet Industrial Directory ---
${rawData.thomasnet}

--- Company Website (homepage, news, products, about) ---
${rawData.website}

--- SEC EDGAR Filings ---
${rawData.edgar}

YOUR TASK:
Identify signals that indicate this company may need hydraulic cylinders, is expanding, or represents a strong reason to reach out now. Think like an experienced industrial salesperson who knows that the right timing is everything.

BUYING TRIGGERS TO IDENTIFY:
1. NEW PRODUCT / EQUIPMENT LAUNCH — New machinery, loader, tractor, press, lift, or any equipment that uses hydraulic cylinders
2. FACILITY EXPANSION — New plant, new production line, capacity increase, new location
3. KEY HIRE — New VP Engineering, Plant Manager, Procurement Manager, Sourcing Manager, Maintenance Director, or Quality Manager = new decision maker to meet
4. PRODUCT LINE EXPANSION — New models, new markets, new applications
5. CAPEX SIGNAL — Funding round, major contract win, capital investment announcement = budget available
6. SUPPLIER ISSUE — Supply chain problems, delivery complaints, quality issues with current suppliers
7. HIRING SPIKE IN ENGINEERING / MAINTENANCE / QUALITY — Active build-out or new product development underway
8. TRADE SHOW ACTIVITY — Exhibiting at CONEXPO, Farm Progress, IFPE, or similar = launching something new
9. CERTIFICATION OR COMPLIANCE — New ISO, CE, or industry certifications = quality review of all suppliers
10. ACQUISITION — Acquiring another company = integrating new product lines, new cylinder needs

For each signal, return:
- type: "product", "exec", "facility", "hiring", "capex", "supplier", "press", "tradeshow", "cert", "ma"
- title: sharp sales alert headline, max 12 words (e.g. "New ag loader announced — cylinder specs likely being finalized now")
- body: 2-3 sentences explaining WHY this matters for selling hydraulic cylinders specifically and what opportunity it creates
- action: one specific, concrete sales action to take THIS week (name the role to contact, the angle to use, the channel to use)
- confidence: "high", "med", or "low"
- sources: which sources this came from

Be ruthlessly specific and sales-focused. No generic summaries. Every signal must directly connect to a hydraulic cylinder sales opportunity. If a signal is weak or irrelevant to cylinder sales, skip it.

Return ONLY a valid JSON array. No markdown. No explanation.
Example: [{"type":"exec","title":"New Procurement Manager hired — 90-day window to get on approved vendor list","body":"Sarah Chen joined as Procurement Manager from John Deere on March 10. New procurement leaders typically review and refresh their approved vendor lists within their first 90 days. This is the single best window to get introduced before existing supplier relationships solidify.","action":"Find Sarah Chen on LinkedIn, connect this week with a note referencing her John Deere background, and offer a cylinder capability overview call.","confidence":"high","sources":["LinkedIn","Company website"]}]

If there are truly no relevant signals after checking all sources, return: []`;

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
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

// ─── Main ──────────────────────────────────────────────────────────────────

async function scrapeCompany(company) {
  console.log(`\nScraping ${company.name}...`);

  // Run all sources in parallel for speed
  const [googleNews, prNewswire, businessWire, tradePress, jobs, thomasnet, website, edgar] =
    await Promise.all([
      fetchGoogleNews(company),
      fetchPRNewswire(company),
      fetchBusinessWire(company),
      fetchTradePress(company),
      fetchJobs(company),
      fetchThomasnet(company),
      fetchWebsite(company),
      fetchEdgar(company),
    ]);

  console.log(`  Sources collected for ${company.name} — analyzing with Claude...`);

  const signals = await analyzeWithClaude(company, {
    googleNews, prNewswire, businessWire, tradePress, jobs, thomasnet, website, edgar
  });

  console.log(`  ${signals.length} signals found for ${company.name}`);
  return { ...company, signals, scrapedAt: new Date().toISOString() };
}

async function scrapeAll(companies) {
  const results = [];
  for (const company of companies) {
    const result = await scrapeCompany(company);
    results.push(result);
    await new Promise(r => setTimeout(r, 2000));
  }
  return results;
}

module.exports = { scrapeAll };
