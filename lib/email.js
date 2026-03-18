// lib/email.js
// Builds and sends the HTML email digest via Resend

async function sendDigest(companies, recipientEmail) {
  const date = new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });

  const ICONS = { product:"🚀", exec:"👤", facility:"🏭", hiring:"📋", capex:"💰", supplier:"⚠️", press:"📰", ma:"🤝", job:"📋", web:"🔄" };
  const LABELS = { product:"New product / equipment launch", exec:"Executive hire or departure", facility:"Facility expansion", hiring:"Hiring signal", capex:"Capital investment", supplier:"Supplier issue", press:"Press release", ma:"M&A activity", job:"Job posting spike", web:"Website change" };
  const CONF_COLOR = { high:"#c0392b", med:"#d35400", low:"#7f8c8d" };
  const CONF_BG    = { high:"#fdf0ef", med:"#fef5ec", low:"#f4f4f4" };

  const allSignals = companies.flatMap(c => c.signals || []);
  const highCount  = allSignals.filter(s => s.confidence === "high").length;
  const totalCount = allSignals.length;

  // Pick the single best action item per company (highest confidence signal with an action field)
  function getBestAction(signals) {
    if (!signals || signals.length === 0) return null;
    const order = { high: 0, med: 1, low: 2 };
    const sorted = [...signals]
      .filter(s => s.action)
      .sort((a, b) => (order[a.confidence] || 2) - (order[b.confidence] || 2));
    return sorted[0] || null;
  }

  const companySections = companies.map(company => {
    const signals  = company.signals || [];
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
      <div style="border-left:3px solid ${CONF_COLOR[sig.confidence] || '#ccc'};padding:12px 14px;margin:10px 0;background:${CONF_BG[sig.confidence] || '#fafafa'};border-radius:0 6px 6px 0">
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:6px"><tr>
          <td style="font-size:13px;font-weight:bold;color:#1a1a1a">${ICONS[sig.type] || '📌'} ${sig.title}</td>
          <td align="right" style="white-space:nowrap">
            <span style="font-size:10px;font-weight:bold;color:${CONF_COLOR[sig.confidence]};background:${CONF_BG[sig.confidence]};border:1px solid ${CONF_COLOR[sig.confidence]}30;padding:2px 8px;border-radius:20px;text-transform:uppercase;letter-spacing:.04em">${sig.confidence} confidence</span>
          </td>
        </tr></table>
        <p style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.05em;margin:0 0 6px">${LABELS[sig.type] || sig.type}</p>
        <p style="font-size:13px;color:#444;line-height:1.65;margin:0 0 8px">${sig.body}</p>
        ${sig.sources?.length ? `<div>${sig.sources.map(s => `<span style="font-size:10px;background:#fff;border:1px solid #e0ddd6;padding:2px 8px;border-radius:10px;margin-right:4px;color:#888;font-family:'Courier New',monospace">${s}</span>`).join("")}</div>` : ""}
      </div>`).join("");

    // Action item block — only shown if there's a signal with an action
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
          <p style="font-family:'Georgia',serif;font-size:24px;font-weight:bold;color:#1a1a1a;margin:0">${totalCount}</p>
          <p style="font-size:11px;color:#888;margin:2px 0 0;font-family:'Courier New',monospace;text-transform:uppercase;letter-spacing:.05em">signals</p>
        </td>
        <td style="text-align:center;padding:0 12px;border-right:1px solid #e0ddd6">
          <p style="font-family:'Georgia',serif;font-size:24px;font-weight:bold;color:#c0392b;margin:0">${highCount}</p>
          <p style="font-size:11px;color:#888;margin:2px 0 0;font-family:'Courier New',monospace;text-transform:uppercase;letter-spacing:.05em">high priority</p>
        </td>
        <td style="text-align:center;padding:0 0 0 12px">
          <p style="font-family:'Georgia',serif;font-size:24px;font-weight:bold;color:#1a1a1a;margin:0">${companies.length}</p>
          <p style="font-size:11px;color:#888;margin:2px 0 0;font-family:'Courier New',monospace;text-transform:uppercase;letter-spacing:.05em">accounts</p>
        </td>
      </tr></table>
    </div>

    <!-- Company signals -->
    <div style="padding:0 36px">
      <table width="100%" cellpadding="0" cellspacing="0">${companySections}</table>
    </div>

    <!-- Footer -->
    <div style="background:#f5f2eb;border-top:1px solid #e8e2d6;padding:20px 36px">
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
      subject: `🔵 Weekly Account Intel — ${highCount} high-priority signals across ${companies.length} accounts`,
      html
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend failed: ${err}`);
  }
  return await res.json();
}

module.exports = { sendDigest };
