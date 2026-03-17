// lib/email.js
// Builds and sends the HTML email digest via Resend

async function sendDigest(companies, recipientEmail) {
  const date = new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });

  const ICONS = { product:"🚀", exec:"👤", ma:"🤝", press:"📰", job:"📋", web:"🔄" };
  const LABELS = { product:"Product launch", exec:"Executive hire/departure", ma:"M&A activity", press:"Press release", job:"Job posting spike", web:"Website change" };
  const CONF_COLOR = { high:"#d32f2f", med:"#e65100", low:"#616161" };
  const CONF_BG = { high:"#ffebee", med:"#fff3e0", low:"#f5f5f5" };

  // Count total high-priority signals
  const allSignals = companies.flatMap(c => c.signals || []);
  const highCount = allSignals.filter(s => s.confidence === "high").length;
  const totalCount = allSignals.length;

  // Build company sections
  const companySections = companies.map(company => {
    const signals = company.signals || [];
    if (signals.length === 0) return `
      <tr><td style="padding:16px 0;border-bottom:1px solid #f0f0f0">
        <strong style="font-size:15px">${company.name}</strong>
        <p style="color:#999;font-size:13px;margin:4px 0 0">No new signals detected this cycle.</p>
      </td></tr>`;

    const signalRows = signals.map(sig => `
      <div style="background:#fafafa;border-left:3px solid ${CONF_COLOR[sig.confidence] || '#999'};border-radius:4px;padding:12px 14px;margin:8px 0">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span>${ICONS[sig.type] || "📌"}</span>
          <span style="font-size:11px;font-weight:600;color:${CONF_COLOR[sig.confidence]};background:${CONF_BG[sig.confidence]};padding:2px 8px;border-radius:10px;text-transform:uppercase;letter-spacing:.04em">${sig.confidence || "low"} confidence</span>
          <span style="font-size:11px;color:#999">${LABELS[sig.type] || sig.type}</span>
        </div>
        <div style="font-size:14px;font-weight:600;color:#1a1a1a;margin-bottom:4px">${sig.title}</div>
        <div style="font-size:13px;color:#555;line-height:1.6">${sig.body}</div>
        ${sig.sources?.length ? `<div style="margin-top:6px">${sig.sources.map(s => `<span style="font-size:11px;background:#efefef;padding:2px 7px;border-radius:10px;margin-right:4px;color:#666">${s}</span>`).join("")}</div>` : ""}
      </div>`).join("");

    return `
      <tr><td style="padding:20px 0;border-bottom:1px solid #f0f0f0">
        <strong style="font-size:15px;color:#1a1a1a">${company.name}</strong>
        <span style="font-size:12px;color:#999;margin-left:8px">${company.url}</span>
        <div style="margin-top:10px">${signalRows}</div>
      </td></tr>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8f8f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:640px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e8e8e4">

    <!-- Header -->
    <div style="background:#1a1a1a;padding:28px 32px">
      <div style="font-size:11px;color:#888;letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px">Company Intelligence</div>
      <div style="font-size:22px;font-weight:600;color:#fff">Weekly Signal Digest</div>
      <div style="font-size:13px;color:#aaa;margin-top:4px">${date}</div>
    </div>

    <!-- Summary bar -->
    <div style="background:#f8f8f6;padding:16px 32px;border-bottom:1px solid #eeeeea;display:flex;gap:24px">
      <div>
        <div style="font-size:24px;font-weight:600;color:#1a1a1a">${totalCount}</div>
        <div style="font-size:12px;color:#888">total signals</div>
      </div>
      <div>
        <div style="font-size:24px;font-weight:600;color:#d32f2f">${highCount}</div>
        <div style="font-size:12px;color:#888">high priority</div>
      </div>
      <div>
        <div style="font-size:24px;font-weight:600;color:#1a1a1a">${companies.length}</div>
        <div style="font-size:12px;color:#888">companies monitored</div>
      </div>
    </div>

    <!-- Company signals -->
    <div style="padding:0 32px">
      <table width="100%" cellpadding="0" cellspacing="0">${companySections}</table>
    </div>

    <!-- Footer -->
    <div style="padding:24px 32px;background:#f8f8f6;border-top:1px solid #eeeeea">
      <div style="font-size:12px;color:#999;line-height:1.6">
        This digest was generated automatically by your Company Intelligence Monitor.<br>
        Signals are analyzed by Claude (Anthropic) using public web data.
      </div>
    </div>
  </div>
</body>
</html>`;

  // Send via Resend
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.RESEND_API_KEY}`
    },
    body: JSON.stringify({
      from: "Intel Monitor <digest@yourdomain.com>",
      to: [recipientEmail],
      subject: `📊 Weekly Intel Digest — ${highCount} high-priority signals across ${companies.length} companies`,
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
