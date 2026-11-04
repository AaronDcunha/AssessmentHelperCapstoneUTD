import "server-only";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character]!));
}

/** Shared website palette; inline styles and presentation tables support email clients. */
export function notificationEmailHtml(input: { title: string; message: string }) {
  const title = escapeHtml(input.title);
  // Explicit breaks also work in clients that ignore white-space CSS.
  const message = escapeHtml(input.message).replace(/\r\n|\r|\n/g, "<br>");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#fafbfc;color:#192329;font-family:Inter,Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#fafbfc">
    <tr><td align="center" style="padding:32px 16px;">
      <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
        <tr><td bgcolor="#103e30" style="padding:24px;border-radius:12px 12px 0 0;">
          <p style="margin:0;color:#ffffff;font-size:24px;line-height:34px;font-weight:600;">Assessment Helper</p>
          <p style="margin:4px 0 0;color:#d4e5dd;font-size:14px;line-height:20px;">Faculty evaluation &amp; observation</p>
        </td></tr>
        <tr><td height="4" bgcolor="#ea7600" style="height:4px;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td bgcolor="#ffffff" style="padding:32px 24px;border:1px solid #e1e6ea;border-top:0;border-radius:0 0 12px 12px;">
          <h1 style="margin:0 0 24px;color:#192329;font-size:24px;line-height:34px;font-weight:600;overflow-wrap:anywhere;word-break:break-word;">${title}</h1>
          <div style="margin:0;color:#192329;font-size:16px;line-height:24px;overflow-wrap:anywhere;word-break:break-word;">${message}</div>
        </td></tr>
        <tr><td style="padding:24px;text-align:center;color:#617078;font-size:12px;line-height:17px;">
          <p style="margin:0 0 8px;font-weight:600;">Assessment Helper</p>
          <p style="margin:0;">This is an automated notification. Please do not reply.</p>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`;
}
