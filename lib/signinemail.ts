// The sign-in email: a 6-digit code to type, plus a one-tap link.
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function codeEmail(code: string, link: string) {
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#F4F1EC">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F4F1EC"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:480px;background:#FFFFFF;border-radius:12px">
<tr><td style="padding:32px 32px 8px 32px;font-family:Georgia,serif;font-size:22px;color:#19283C">Alza<span style="color:#B8893B">HR</span></td></tr>
<tr><td style="padding:8px 32px 0 32px;font-family:Arial,sans-serif;font-size:15px;line-height:22px;color:#1C1A19">Your sign-in code:</td></tr>
<tr><td style="padding:10px 32px 4px 32px;font-family:Arial,sans-serif;font-size:34px;font-weight:bold;letter-spacing:8px;color:#19283C">${esc(code)}</td></tr>
<tr><td style="padding:6px 32px 0 32px;font-family:Arial,sans-serif;font-size:14px;line-height:21px;color:#4A4441">Type it on the sign-in page. It works once and expires soon.</td></tr>
<tr><td style="padding:22px 32px 0 32px"><a href="${esc(link)}" style="display:inline-block;background:#19283C;color:#FFFFFF;text-decoration:none;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;padding:12px 20px;border-radius:8px">Or sign in with one tap</a></td></tr>
<tr><td style="padding:24px 32px 30px 32px;font-family:Arial,sans-serif;font-size:12px;line-height:18px;color:#6B645E">Didn't ask to sign in? You can ignore this email. Nobody can get in without this code.</td></tr>
</table></td></tr></table></body></html>`;
  const text = `Your AlzaHR sign-in code: ${code}\n\nType it on the sign-in page. It works once and expires soon.\n\nOr sign in with one tap: ${link}\n\nDidn't ask to sign in? You can ignore this email.`;
  return { subject: `Your AlzaHR sign-in code: ${code}`, html, text };
}

