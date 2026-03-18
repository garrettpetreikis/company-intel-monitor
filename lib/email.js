// lib/email.js
// Builds and sends the HTML digest with account intel + competitor section

async function sendDigest(companies, competitors, recipientEmail) {
  const date = new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });

  // ── Account signal config ──
  const ACCT_ICONS  = { product:"🚀", exec:"👤", facility:"🏭", hiring:"📋", capex:"💰", supplier:"⚠️", press:"📰", ma:"🤝", tradeshow:"🎪", cert:"✅" };
  const ACCT_LABELS = { product:"New product / equipment launch", exec:"Executive hire or departure", facility:"Facility expansion", hiring:"Hiring signal", capex:"Capital investment", supplier:"Supplier issue", press:"Press release", ma:"M&A activity", tradeshow:"Trade show activity", cert:"Certification" };

  // ── Competitor signal config ──
  const COMP_ICONS  = { complaint:"😤", price:"💸", departure:"🚪", gap:"🕳️", supply:"🔴", loss:"📉", win:"📈", leadership:"🔄", financial:"⚡", capacity:"⏳" };
  const COMP_LABELS = { complaint:"Customer complaint", price:"Price increase", departure:"Sales rep departure", gap:"Product gap", supply:"Supply chain issue", loss:"Customer loss", win:"Customer win", leadership:"Leadership change", financial:"Financial stress", capacity:"Capacity constraint" };

  const CONF_COLOR  = { high:"#c0392b", med:"#d35400", low:"#7f8c8d" };
  const CONF_BG     = { high:"#fdf0ef", med:"#fef5ec", low:"#f4f4f4" };
  const SEV_COLOR   = { high:"#6d1f1f", med:"#7a3c00", low:"#555" };
  const SEV_BG      = { high:"#ffe8e8", med:"#fff3e0", low:"#f4f4f4" };

  const allAccountSignals    = companies.flatMap(c => c.signals || []);
  const allCompetitorSignals = competitors.flatMap(c => c.signals || []);
  const highPriority = allAccountSignals.filter(s => s.confidence === "high").length;
  const highThreats  = allCompetitorSignals.filter(s => s.severity === "high").length;

  function getBestAction(signals) {
    if (!signals || signals.length === 0) return null;
    const order = { high:0, med:1, low:2 };
    return [...signals]
      .filter(s => s.action)
      .sort((a,b) => (order[a.confidence]||2) - (order[b.confidence]||2))[0] || null;
  }

  function getBestOpportunity(signals) {
    if (!signals || signals.length === 0) return null;
    const order = { high:0, med:1, low:2 };
    return [...signals]
      .filter(s => s.opportunity)
      .sort((a,b) => (order[a.severity]||2) - (order[b.severity]||2))[0] || null;
  }

  // ── Account sections ──
  const accountSections = companies.map(company => {
    const signals = company.signals || [];
    const bestAction = getBestAction(signals);

    if (signals.length === 0) return `
      <tr><td style="padding:20px 0;border-bottom:1px solid #f0ede6">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="font-family:'Georgia',serif;font-size:16px;font-weight:bold;color:#1a1a1a">${company.name}</td>
          <td align="right" style="font-family:'Courier New',monospace;font-size:11px;color:#bbb">${company.url}</td>
        </tr></table>
        <p style="color:#bbb;font-size:13px;margin:8px 0 0;font-style:italic">No new signals detected this cycle.</p>
      </td></tr>`;

    const signalRows = signals.map(sig => `
      <div style="border-left:3px solid ${CONF_COLOR[sig.confidence]||'#ccc'};padding:12px 14px;margin:10px 0;background:${CONF_BG[sig.confidence]||'#fafafa'};border-radius:0 6px 6px 0">
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:6px"><tr>
          <td style="font-size:13px;font-weight:bold;color:#1a1a1a">${ACCT_ICONS[sig.type]||'📌'} ${sig.title}</td>
          <td align="right"><span style="font-size:10px;font-weight:bold;color:${CONF_COLOR[sig.confidence]};background:${CONF_BG[sig.confidence]};border:1px solid ${CONF_COLOR[sig.confidence]}40;padding:2px 8px;border-radius:20px;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">${sig.confidence} confidence</span></td>
        </tr></table>
        <p style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.05em;margin:0 0 6px">${ACCT_LABELS[sig.type]||sig.type}</p>
        <p style="font-size:13px;color:#444;line-height:1.65;margin:0 0 8px">${sig.body}</p>
        ${sig.sources?.length ? `<div>${sig.sources.map(s=>`<span style="font-size:10px;background:#fff;border:1px solid #e0ddd6;padding:2px 8px;border-radius:10px;margin-right:4px;color:#888;font-family:'Courier New',monospace">${s}</span>`).join("")}</div>` : ""}
      </div>`).join("");

    const actionBlock = bestAction ? `
      <div style="margin-top:14px;background:#fffbf0;border:1.5px solid #f0c040;border-radius:8px;padding:14px 16px">
        <p style="font-size:11px;font-weight:bold;color:#b8860b;text-transform:uppercase;letter-spacing:.06em;margin:0 0 6px">📞 Your move this week</p>
        <p style="font-size:13px;color:#1a1a1a;line-height:1.6;margin:0;font-weight:500">${bestAction.action}</p>
      </div>` : "";

    return `
      <tr><td style="padding:24px 0;border-bottom:1px solid #f0ede6">
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px"><tr>
          <td style="font-family:'Georgia',serif;font-size:17px;font-weight:bold;color:#1a1a1a">${company.name}</td>
          <td align="right" style="font-family:'Courier New',monospace;font-size:11px;color:#bbb">${company.url}</td>
        </tr></table>
        ${signalRows}
        ${actionBlock}
      </td></tr>`;
  }).join("");

  // ── Competitor sections ──
  const competitorSections = competitors.map(comp => {
    const signals = comp.signals || [];
    const bestOpp = getBestOpportunity(signals);

    if (signals.length === 0) return `
      <tr><td style="padding:16px 0;border-bottom:1px solid #f0ede6">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="font-family:'Georgia',serif;font-size:15px;font-weight:bold;color:#1a1a1a">${comp.name}</td>
          <td align="right" style="font-family:'Courier New',monospace;font-size:11px;color:#bbb">${comp.url}</td>
        </tr></table>
        <p style="color:#bbb;font-size:13px;margin:8px 0 0;font-style:italic">No vulnerabilities detected this cycle.</p>
      </td></tr>`;

    const signalRows = signals.map(sig => `
      <div style="border-left:3px solid ${SEV_COLOR[sig.severity]||'#ccc'};padding:12px 14px;margin:10px 0;background:${SEV_BG[sig.severity]||'#fafafa'};border-radius:0 6px 6px 0">
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:6px"><tr>
          <td style="font-size:13px;font-weight:bold;color:#1a1a1a">${COMP_ICONS[sig.type]||'🎯'} ${sig.title}</td>
          <td align="right"><span style="font-size:10px;font-weight:bold;color:${SEV_COLOR[sig.severity]};background:${SEV_BG[sig.severity]};border:1px solid ${SEV_COLOR[sig.severity]}40;padding:2px 8px;border-radius:20px;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">${sig.severity} severity</span></td>
        </tr></table>
        <p style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.05em;margin:0 0 6px">${COMP_LABELS[sig.type]||sig.type}</p>
        <p style="font-size:13px;color:#444;line-height:1.65;margin:0 0 8px">${sig.body}</p>
        ${sig.sources?.length ? `<div>${sig.sources.map(s=>`<span style="font-size:10px;background:#fff;border:1px solid #e0ddd6;padding:2px 8px;border-radius:10px;margin-right:4px;color:#888;font-family:'Courier New',monospace">${s}</span>`).join("")}</div>` : ""}
      </div>`).join("");

    const oppBlock = bestOpp ? `
      <div style="margin-top:14px;background:#fff5f5;border:1.5px solid #e05555;border-radius:8px;padding:14px 16px">
        <p style="font-size:11px;font-weight:bold;color:#c0392b;text-transform:uppercase;letter-spacing:.06em;margin:0 0 6px">🎯 Exploit this opening</p>
        <p style="font-size:13px;color:#1a1a1a;line-height:1.6;margin:0;font-weight:500">${bestOpp.opportunity}</p>
      </div>` : "";

    return `
      <tr><td style="padding:20px 0;border-bottom:1px solid #f0ede6">
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px"><tr>
          <td style="font-family:'Georgia',serif;font-size:15px;font-weight:bold;color:#1a1a1a">${comp.name}</td>
          <td align="right" style="font-family:'Courier New',monospace;font-size:11px;color:#bbb">${comp.url}</td>
        </tr></table>
        ${signalRows}
        ${oppBlock}
      </td></tr>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f2eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:640px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e8e2d6">

  <!-- Header -->
  <div style="background:#1a1a1a;padding:30px 36px">
    <p style="font-family:'Courier New',monospace;font-size:10px;color:#c4a35a;letter-spacing:.12em;text-transform:uppercase;margin:0 0 8px">Hydraulic Cylinder Sales Intelligence</p>
    <h1 style="font-family:'Georgia',serif;font-size:26px;font-weight:normal;color:#f5f2eb;margin:0 0 6px">Weekly Account Digest</h1>
    <p style="font-family:'Courier New',monospace;font-size:12px;color:#666;margin:0">${date}</p>
  </div>

  <!-- Summary bar -->
  <div style="background:#f5f2eb;padding:16px 36px;border-bottom:1px solid #e8e2d6">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="text-align:center;padding:0 12px 0 0;border-right:1px solid #e0ddd6">
        <p style="font-family:'Georgia',serif;font-size:22px;font-weight:bold;color:#1a1a1a;margin:0">${allAccountSignals.length}</p>
        <p style="font-size:10px;color:#888;margin:2px 0 0;font-family:'Courier New',monospace;text-transform:uppercase;letter-spacing:.05em">account signals</p>
      </td>
      <td style="text-align:center;padding:0 12px;border-right:1px solid #e0ddd6">
        <p style="font-family:'Georgia',serif;font-size:22px;font-weight:bold;color:#c0392b;margin:0">${highPriority}</p>
        <p style="font-size:10px;color:#888;margin:2px 0 0;font-family:'Courier New',monospace;text-transform:uppercase;letter-spacing:.05em">high priority</p>
      </td>
      <td style="text-align:center;padding:0 12px;border-right:1px solid #e0ddd6">
        <p style="font-family:'Georgia',serif;font-size:22px;font-weight:bold;color:#c0392b;margin:0">${highThreats}</p>
        <p style="font-size:10px;color:#888;margin:2px 0 0;font-family:'Courier New',monospace;text-transform:uppercase;letter-spacing:.05em">competitor threats</p>
      </td>
      <td style="text-align:center;padding:0 0 0 12px">
        <p style="font-family:'Georgia',serif;font-size:22px;font-weight:bold;color:#1a1a1a;margin:0">${companies.length + competitors.length}</p>
        <p style="font-size:10px;color:#888;margin:2px 0 0;font-family:'Courier New',monospace;text-transform:uppercase;letter-spacing:.05em">companies tracked</p>
      </td>
    </tr></table>
  </div>

  <!-- Account Intel -->
  <div style="padding:0 36px">
    <p style="font-family:'Courier New',monospace;font-size:10px;color:#c4a35a;letter-spacing:.12em;text-transform:uppercase;margin:24px 0 4px">Account Intelligence</p>
    <p style="font-size:12px;color:#aaa;margin:0 0 4px">Buying signals across your key accounts</p>
    <table width="100%" cellpadding="0" cellspacing="0">${accountSections}</table>
  </div>

  <!-- Divider -->
  <div style="margin:8px 36px;border-top:2px solid #1a1a1a"></div>

  <!-- Competitor Intel -->
  <div style="padding:0 36px">
    <p style="font-family:'Courier New',monospace;font-size:10px;color:#c0392b;letter-spacing:.12em;text-transform:uppercase;margin:24px 0 4px">⚔️ Competitor Intelligence</p>
    <p style="font-size:12px;color:#aaa;margin:0 0 4px">Vulnerabilities, openings, and threats from your competition</p>
    <table width="100%" cellpadding="0" cellspacing="0">${competitorSections}</table>
  </div>

  <!-- Footer -->
  <div style="background:#f5f2eb;border-top:1px solid #e8e2d6;padding:20px 36px;margin-top:8px">
    <p style="font-size:11px;color:#aaa;font-family:'Courier New',monospace;margin:0;line-height:1.6">
      Auto-generated ${date} · Powered by Claude (Anthropic) · Public data only<br>
      Signals are indicative only — verify before outreach
    </p>
  </div>

</div>
</body>
</html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.RESEND_API_KEY}`
    },
    body: JSON.stringify({
      from: "Intel Monitor <onboarding@resend.dev>",
      to: [recipientEmail],
      subject: `🔵 Weekly Intel — ${highPriority} account signals · ${highThreats} competitor threats`,
      html
    })
  });

  if (!res.ok) throw new Error(`Resend failed: ${await res.text()}`);
  return await res.json();
}

module.exports = { sendDigest };
