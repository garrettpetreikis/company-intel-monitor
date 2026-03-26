// lib/scraper.js
// Multi-source scraper tuned for hydraulic cylinder sales
// Handles both account intelligence AND competitor intelligence

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

// ─── Shared data sources ───────────────────────────────────────────────────

async function fetchGoogleNews(company, mode = "account") {
  const searches = mode === "competitor" ? [
    `"${company.name}" complaint OR delay OR recall OR shortage OR issue OR problem OR price increase`,
    `"${company.name}" loses OR lost OR layoff OR departure OR discontinue OR backordered`,
  ] : [
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

async function fetchPRNewswire(company) {
  const q = encodeURIComponent(company.name);
  const xml = await safeFetch(`https://www.prnewswire.com/rss/news-releases-list.rss?q=${q}`);
  return xml ? parseRssTitles(xml, 5) : "No PR Newswire results";
}

async function fetchBusinessWire(company) {
  const q = encodeURIComponent(company.name);
  const xml = await safeFetch(`https://feed.businesswire.com/rss/home/?rss=G22&q=${q}`);
  return xml ? parseRssTitles(xml, 5) : "No Business Wire results";
}

async function fetchTradePress(company) {
  const feeds = [
    { name: "Hydraulics & Pneumatics", url: "https://www.hydraulicspneumatics.com/rss.xml" },
    { name: "Equipment World",         url: "https://www.equipmentworld.com/rss.xml" },
    { name: "For Construction Pros",   url: "https://www.forconstructionpros.com/rss.xml" },
    { name: "Ag Web",                  url: "https://www.agweb.com/rss.xml" },
    { name: "Plant Engineering",       url: "https://www.plantengineering.com/rss.xml" },
    { name: "Industry Week",           url: "https://www.industryweek.com/rss.xml" },
    { name: "Fluid Power Journal",     url: "https://fluidpowerjournal.com/feed/" },
    { name: "Power & Motion",          url: "https://www.powermotiontech.com/rss.xml" },
  ];

  let results = [];
  const nameLower = company.name.toLowerCase();
  for (const feed of feeds) {
    const xml = await safeFetch(feed.url);
    if (!xml) continue;
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
    const matches = items
      .filter(m => m[1].toLowerCase().includes(nameLower))
      .slice(0, 3)
      .map(m => {
        const title = (m[1].match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/) || [])[1] || "";
        return title ? `- [${feed.name}] ${title.trim()}` : null;
      }).filter(Boolean);
    if (matches.length) results.push(...matches);
  }
  return results.length > 0 ? results.join("\n") : "No trade press mentions found";
}

async function fetchJobs(company, mode = "account") {
  const roles = mode === "competitor"
    ? ["sales", "sales representative", "regional sales", "account manager"]
    : ["engineer", "procurement", "maintenance", "manufacturing", "sourcing", "quality"];

  let allJobs = [];
  for (const role of roles) {
    const q = encodeURIComponent(`${company.name} ${role}`);
    const xml = await safeFetch(`https://www.indeed.com/rss?q=${q}&sort=date&limit=3`);
    if (xml) {
      const titles = parseRssTitles(xml, 3);
      if (titles) allJobs.push(`[Indeed] ${titles}`);
    }
  }

  const zq = encodeURIComponent(mode === "competitor"
    ? `${company.name} sales representative OR account manager`
    : `${company.name} engineer OR procurement OR maintenance`);
  const zxml = await safeFetch(`https://www.ziprecruiter.com/jobs-feeds/rss?q=${zq}`);
  if (zxml) {
    const titles = parseRssTitles(zxml, 5);
    if (titles) allJobs.push(`[Ziprecruiter]\n${titles}`);
  }

  const careersPages = [
    `https://${company.url}/careers`,
    `https://${company.url}/jobs`,
  ];
  for (const pageUrl of careersPages) {
    const html = await safeFetch(pageUrl);
    if (html && html.length > 500) {
      allJobs.push(`[Careers page]: ${stripHtml(html).slice(0, 1500)}`);
      break;
    }
  }

  return allJobs.length > 0 ? allJobs.join("\n") : "No job data found";
}

async function fetchWebsite(company) {
  const pages = [
    `https://${company.url}`,
    `https://${company.url}/news`,
    `https://${company.url}/newsroom`,
    `https://${company.url}/press-releases`,
    `https://${company.url}/products`,
    `https://${company.url}/about`,
  ];

  let combined = [];
  for (const pageUrl of pages) {
    const html = await safeFetch(pageUrl);
    if (html && html.length > 300) {
      combined.push(`[${pageUrl}]: ${stripHtml(html).slice(0, 1000)}`);
    }
  }
  return combined.length > 0 ? combined.join("\n\n") : "Could not fetch website";
}

async function fetchThomasnet(company) {
  const q = encodeURIComponent(company.name);
  const html = await safeFetch(`https://www.thomasnet.com/search/?what=${q}`);
  return html ? `[Thomasnet]: ${stripHtml(html).slice(0, 2000)}` : "No Thomasnet data";
}

async function fetchEdgar(company) {
  const q = encodeURIComponent(company.name);
  const url = `https://efts.sec.gov/LATEST/search-index?q=${q}&dateRange=custom&startdt=${getLastMonthDate()}&enddt=${getTodayDate()}&forms=8-K`;
  const html = await safeFetch(url);
  return html ? `[SEC EDGAR]: ${stripHtml(html).slice(0, 1500)}` : "No SEC filings found";
}

// Also search for reviews and complaints about competitors
async function fetchReviews(company) {
  const searches = [
    `"${company.name}" hydraulic cylinder review OR complaint OR problem OR quality issue`,
    `"${company.name}" delivery delay OR backorder OR lead time OR price increase`,
    `"${company.name}" vs OR alternative OR replacement OR switching`,
  ];
  let results = [];
  for (const q of searches) {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
    const xml = await safeFetch(url);
    if (xml) results.push(parseRssTitles(xml, 3));
  }
  return results.filter(Boolean).join("\n") || "No review/complaint data found";
}
// ─── ImportYeti (free import/export data) ─────────────────────────────────

async function fetchImportData(company, mode = "account") {
  const q = encodeURIComponent(company.name);
  const url = `https://www.importyeti.com/company/${q}`;
  const html = await safeFetch(url);
  if (!html || html.length < 500) {
    // Fallback: try USA Trade search
    const fallback = await safeFetch(
      `https://www.usatrade.census.gov/data/search?q=${q}`
    );
    return fallback
      ? `[USA Trade]: ${stripHtml(fallback).slice(0, 1500)}`
      : "No import/export data found";
  }
  const text = stripHtml(html).slice(0, 3000);
  return `[ImportYeti - ${mode}]: ${text}`;
}

// ─── NHTSA Recall Database ─────────────────────────────────────────────────

async function fetchNHTSA(company) {
  const q = encodeURIComponent(company.name);
  const url = `https://api.nhtsa.gov/complaints/complaintsByVehicle?make=${q}`;
  const html = await safeFetch(url);
  
  // Also search recalls
  const recallUrl = `https://api.nhtsa.gov/recalls/recallsByVehicle?make=${q}`;
  const recalls = await safeFetch(recallUrl);
  
  // Search NHTSA news for company mentions
  const newsUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(`"${company.name}" NHTSA recall OR defect OR safety`)}&hl=en-US&gl=US&ceid=US:en`;
  const newsXml = await safeFetch(newsUrl);
  const newsTitles = newsXml ? parseRssTitles(newsXml, 5) : "";

  let result = "";
  if (html && html.length > 50) result += `[NHTSA Complaints]: ${stripHtml(html).slice(0, 1500)}\n`;
  if (recalls && recalls.length > 50) result += `[NHTSA Recalls]: ${stripHtml(recalls).slice(0, 1500)}\n`;
  if (newsTitles) result += `[NHTSA News]: ${newsTitles}`;
  
  return result || "No NHTSA data found";
}

// ─── YouTube channel scraper ───────────────────────────────────────────────

async function fetchYouTube(company) {
  // Search YouTube via Google News RSS for recent video announcements
  const searches = [
    `"${company.name}" site:youtube.com new product OR launch OR announcement`,
    `"${company.name}" youtube new equipment OR machinery OR hydraulic`,
  ];
  
  let results = [];
  for (const q of searches) {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
    const xml = await safeFetch(url);
    if (xml) results.push(parseRssTitles(xml, 3));
  }

  // Also try to fetch their YouTube channel page directly
  const ytSearch = await safeFetch(
    `https://www.youtube.com/results?search_query=${encodeURIComponent(company.name + " new product launch")}`
  );
  if (ytSearch) {
    const text = stripHtml(ytSearch).slice(0, 1500);
    results.push(`[YouTube search]: ${text}`);
  }

  return results.filter(Boolean).join("\n") || "No YouTube data found";
}

// ─── CONEXPO / Trade show exhibitor lists ─────────────────────────────────

async function fetchTradeShows(company) {
  const nameLower = company.name.toLowerCase();
  const searches = [
    `"${company.name}" CONEXPO 2026 OR "Farm Progress" OR IFPE OR "World Ag Expo" exhibitor OR booth OR launch`,
    `"${company.name}" trade show 2025 OR 2026 exhibiting OR exhibitor OR new product`,
  ];

  let results = [];
  for (const q of searches) {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
    const xml = await safeFetch(url);
    if (xml) results.push(parseRssTitles(xml, 3));
  }

  // Try CONEXPO exhibitor page directly
  const conexpo = await safeFetch(
    `https://www.conexpoconagg.com/exhibitors/search?q=${encodeURIComponent(company.name)}`
  );
  if (conexpo && conexpo.toLowerCase().includes(nameLower)) {
    results.push(`[CONEXPO 2026 Exhibitor]: ${company.name} is listed as a CONEXPO 2026 exhibitor`);
  }

  return results.filter(Boolean).join("\n") || "No trade show data found";
}

function getTodayDate() { return new Date().toISOString().split("T")[0]; }
function getLastMonthDate() {
  const d = new Date(); d.setMonth(d.getMonth() - 1);
  return d.toISOString().split("T")[0];
}

// ─── Claude: Account analysis ──────────────────────────────────────────────

async function analyzeAccount(company, rawData) {
  const prompt = `You are an expert sales intelligence analyst working exclusively for Garrett at Ligon Hydraulics (ligonhyd.com) — North America's largest hydraulic cylinder manufacturer.

ABOUT LIGON HYDRAULICS (use this to write specific, differentiated action items):
- 100% American-made hydraulic cylinders — multiple US manufacturing facilities
- ISO 9001:2015 certified + ITAR registered
- Custom-engineered cylinders for virtually any application
- Bore sizes up to 30 inches, stroke lengths up to 720 inches
- Markets: Agriculture, Mining & Construction, Earth Moving, Cranes, Aerospace & Defense, Auto Hauling, AWP, Fire & Rescue, Forestry, Material Handling, Oil & Gas, Snow & Ice, Turf, Waste & Recycling
- Products: Welded, Threaded, Multi-Stage/Telescopic, Bolted-Head, Pneumatic cylinders, Accumulators
- Key differentiators: Domestic manufacturing (no import risk or tariff exposure), full engineering staff at every facility, corrosion-resistant coatings, longest stroke capability in the industry, decades of application-specific experience
- Largest supplier of hydraulic cylinders for the snow removal industry globally
- Leading supplier for the auto carrier industry
- Known for: responsive engineering support, custom design capability, field-proven reliability

GARRETT'S SALES APPROACH:
- Target buyers: VP Engineering, Plant Manager, Procurement Manager, Sourcing Manager, Maintenance Director, Quality Manager
- Best opening angle: domestic manufacturing + tariff protection, custom engineering capability, application-specific experience
- Urgency drivers: new product launches, new hires (especially engineering/procurement), facility expansions, supplier issues, trade show activity

ACCOUNT: ${company.name} (${company.url})
ACCOUNT TYPE: Heavy equipment manufacturer, agriculture equipment maker, or industrial OEM/factory

COLLECTED INTELLIGENCE:
--- Google News --- ${rawData.googleNews}
--- PR Newswire --- ${rawData.prNewswire}
--- Business Wire --- ${rawData.businessWire}
--- Trade Press --- ${rawData.tradePress}
--- Job Postings --- ${rawData.jobs}
--- Thomasnet --- ${rawData.thomasnet}
--- Company Website --- ${rawData.website}
--- SEC EDGAR --- ${rawData.edgar}
--- Import/Export Data (ImportYeti) --- ${rawData.importData}
--- NHTSA Recalls & Complaints --- ${rawData.nhtsa}
--- YouTube Product Announcements --- ${rawData.youtube}
--- Trade Show Activity (CONEXPO, Farm Progress, IFPE) --- ${rawData.tradeshows}

BUYING TRIGGERS TO IDENTIFY:
1. NEW PRODUCT / EQUIPMENT LAUNCH — new machinery needing hydraulic cylinders
2. FACILITY EXPANSION — new plant, production line, capacity increase
3. KEY HIRE — VP Engineering, Plant Manager, Procurement Manager, Sourcing Manager, Maintenance Director, Quality Manager
4. PRODUCT LINE EXPANSION — new models, new markets
5. CAPEX SIGNAL — funding, major contract win, capital investment
6. SUPPLIER ISSUE — supply chain problems, delivery complaints, quality issues
7. HIRING SPIKE — engineering, maintenance, quality roles
8. TRADE SHOW ACTIVITY — exhibiting at CONEXPO, Farm Progress, IFPE
9. CERTIFICATION — new ISO, CE certifications = supplier review incoming
10. ACQUISITION — new product lines, new cylinder needs
11. TRADE SHOW PRESENCE — exhibiting at CONEXPO, Farm Progress, IFPE, or World Ag Expo = actively launching new equipment that needs cylinders
12. YOUTUBE PRODUCT LAUNCH — new product video published before official press release = earliest possible signal of new cylinder need
13. NHTSA RECALL / COMPLAINT — equipment using competitor cylinders flagged for safety issues = opening to position Ligon as the reliable domestic alternative

For each signal return:
- type: "product","exec","facility","hiring","capex","supplier","press","tradeshow","cert","ma"
- title: sharp sales alert, max 12 words
- body: 2-3 sentences on why this matters for cylinder sales specifically
- action: one specific concrete sales action to take THIS week
- confidence: "high","med","low"
- source_date: publish date of the source in "Month YYYY" format (e.g. "March 2026") — extract from the date shown next to the article title in the raw data. If no date is available, use null
- sources: array of source names

Be ruthlessly sales-focused. Every signal must connect to a cylinder sales opportunity. IMPORTANT: Only surface signals where the source_date is within the last 180 days. If you cannot confirm a signal is recent, do not include it. Never generate action items based on events older than 180 days..
Return ONLY a valid JSON array, no markdown. If no relevant signals: []`;

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }]
    });
    const clean = message.content[0].text.trim().replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch (e) {
    console.error(`Account analysis failed for ${company.name}:`, e.message);
    return [];
  }
}

// ─── Claude: Competitor analysis ──────────────────────────────────────────

async function analyzeCompetitor(company, rawData) {
  const prompt = `You are an expert competitive intelligence analyst working for Garrett at Ligon Hydraulics — North America's largest American-made hydraulic cylinder manufacturer (ISO 9001:2015, ITAR registered, bore sizes to 30", stroke to 720", custom engineering at every facility, 100% domestic manufacturing with zero tariff/import risk).

COMPETITOR: ${company.name} (${company.url})

COLLECTED INTELLIGENCE:
--- Google News (complaints/issues focused) --- ${rawData.googleNews}
--- PR Newswire --- ${rawData.prNewswire}
--- Business Wire --- ${rawData.businessWire}
--- Trade Press --- ${rawData.tradePress}
--- Job Postings (sales roles) --- ${rawData.jobs}
--- Reviews & Complaints --- ${rawData.reviews}
--- Company Website --- ${rawData.website}
--- Thomasnet --- ${rawData.thomasnet}
--- SEC EDGAR --- ${rawData.edgar}
--- Import/Export Data — ALL commodities imported (cylinders, raw materials, steel, rod, seals, components, packaging, anything) --- ${rawData.importData}
--- NHTSA Recalls & Safety Complaints (flag any equipment failures involving hydraulic cylinders) --- ${rawData.nhtsa}
--- YouTube Announcements --- ${rawData.youtube}
--- Trade Show Activity --- ${rawData.tradeshows}

COMPETITIVE VULNERABILITIES TO IDENTIFY:
1. DELIVERY / QUALITY COMPLAINTS — customers complaining about lead times, quality issues, or defects = opening to position as reliable alternative
2. PRICE INCREASE — announced price hikes = their customers are now shopping around
3. KEY SALESPERSON DEPARTURE — sales rep or account manager left = their accounts are now unprotected and open to being called
4. PRODUCT GAP / DISCONTINUATION — stopped making a product or model = their customers need a new supplier
5. SUPPLY CHAIN ISSUE — material shortages, production delays, force majeure = their customers are at risk
6. CUSTOMER LOSS — lost a major account or contract = proof point for your prospects
7. CUSTOMER WIN — won a major account = signals which markets they're targeting so you can defend yours
8. LEADERSHIP CHANGE — new CEO, VP Sales, or ownership change = strategy shift, relationships in flux
9. FINANCIAL STRESS — layoffs, facility closure, cost cutting = service levels likely dropping
10. CAPACITY CONSTRAINT — overwhelmed with orders, long lead times = opportunity to take overflow business
11. OVERSEAS RAW MATERIAL SOURCING — importing steel tubing, chrome rod, seals, end caps, or any cylinder components from China, Taiwan, Mexico, or other overseas sources = tariff exposure, quality risk, lead time vulnerability. Flag every commodity and country of origin found.

For each signal return:
- type: "complaint","price","departure","gap","supply","loss","win","leadership","financial","capacity"
- title: sharp competitive alert max 12 words (e.g. "Competitor announcing 15% price increase — call their accounts now")
- body: 2-3 sentences on exactly what this vulnerability means and which of YOUR accounts or prospects might be affected
- opportunity: one specific action to exploit this opening. Must include: (1) which title to contact at accounts buying from this competitor, (2) the specific Ligon differentiator to lead with, (3) the actual opening line Garrett should use on the call or in an email.
- severity: "high","med","low" (how big is the opening this creates for you)
- source_date: publish date of the source in "Month YYYY" format (e.g. "March 2026") — extract from the date shown next to the article title in the raw data. If no date is available, use null
- sources: array of source names

Be direct and opportunistic. Every signal must translate into a specific sales action. IMPORTANT: Only surface signals where the source_date is within the last 180 days. If you cannot confirm a signal is recent, do not include it. Never generate action items based on events older than 180 days..
Return ONLY a valid JSON array, no markdown. If no relevant signals: []`;

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }]
    });
    const clean = message.content[0].text.trim().replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch (e) {
    console.error(`Competitor analysis failed for ${company.name}:`, e.message);
    return [];
  }
}

// ─── Main exports ──────────────────────────────────────────────────────────

async function scrapeCompany(company) {
const [googleNews, prNewswire, businessWire, tradePress, jobs, thomasnet, website, edgar, importData, nhtsa, youtube, tradeshows] =
    await Promise.all([
      fetchGoogleNews(company, "account"),
      fetchPRNewswire(company),
      fetchBusinessWire(company),
      fetchTradePress(company),
      fetchJobs(company, "account"),
      fetchThomasnet(company),
      fetchWebsite(company),
      fetchEdgar(company),
      fetchImportData(company, "account"),
      fetchNHTSA(company),
      fetchYouTube(company),
      fetchTradeShows(company),
    ]);
  const signals = await analyzeAccount(company, { googleNews, prNewswire, businessWire, tradePress, jobs, thomasnet, website, edgar, importData, nhtsa, youtube, tradeshows });
  return { ...company, signals, scrapedAt: new Date().toISOString() };
}

async function scrapeCompetitor(company) {
  console.log(`\nScraping competitor: ${company.name}...`);
const [googleNews, prNewswire, businessWire, tradePress, jobs, thomasnet, website, edgar, reviews, importData, nhtsa, youtube, tradeshows] =
    await Promise.all([
      fetchGoogleNews(company, "competitor"),
      fetchPRNewswire(company),
      fetchBusinessWire(company),
      fetchTradePress(company),
      fetchJobs(company, "competitor"),
      fetchThomasnet(company),
      fetchWebsite(company),
      fetchEdgar(company),
      fetchReviews(company),
      fetchImportData(company, "competitor"),
      fetchNHTSA(company),
      fetchYouTube(company),
      fetchTradeShows(company),
    ]);
  const signals = await analyzeCompetitor(company, { googleNews, prNewswire, businessWire, tradePress, jobs, thomasnet, website, edgar, reviews, importData, nhtsa, youtube, tradeshows });
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

async function scrapeAllCompetitors(competitors) {
  const results = [];
  for (const competitor of competitors) {
    const result = await scrapeCompetitor(competitor);
    results.push(result);
    await new Promise(r => setTimeout(r, 2000));
  }
  return results;
}

module.exports = { scrapeAll, scrapeAllCompetitors };
