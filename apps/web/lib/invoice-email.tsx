interface Props {
  orgName: string
  invoiceNumber: string
  issueDate: string
  amount: number
  dueDate: string
  customMessage?: string
  iban?: string | null
  reference?: string | null
}

export function buildInvoiceEmailHtml({
  orgName,
  invoiceNumber,
  issueDate,
  amount,
  dueDate,
  customMessage,
  iban,
  reference,
}: Props): string {
  const formattedIssue = new Date(issueDate).toLocaleDateString('sl-SI')
  const formattedDue = new Date(dueDate).toLocaleDateString('sl-SI')

  // Izračunamo ali je rok plačila blizu (manj kot 3 dni)
  const daysUntilDue = Math.ceil((new Date(dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  const isUrgent = daysUntilDue <= 3 && daysUntilDue >= 0
  const isOverdue = daysUntilDue < 0

  const dueColor = isOverdue ? '#DC2626' : isUrgent ? '#D97706' : '#854F0B'
  const dueLabel = isOverdue
    ? `⚠️ Zapadel ${Math.abs(daysUntilDue)} dni nazaj`
    : isUrgent
    ? `⏰ Rok plačila: ${formattedDue} (čez ${daysUntilDue} ${daysUntilDue === 1 ? 'dan' : 'dni'})`
    : `Rok plačila: ${formattedDue}`

  const messageHtml = customMessage
    ? customMessage.replace(/\n/g, '<br>')
    : `V prilogi vam pošiljamo račun <strong>${invoiceNumber}</strong> z dne ${formattedIssue}, v znesku <strong>€${amount.toFixed(2)}</strong>.<br><br>Plačilo opravite s skeniranjem QR kode v priloženem PDF-u z vašo bančno aplikacijo.`

  return `<!DOCTYPE html>
<html lang="sl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Račun ${invoiceNumber}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" style="width:100%;border-collapse:collapse;background:#f5f5f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;border:1px solid #e8e8e8;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">

          <!-- Header -->
          <tr>
            <td style="padding:28px 32px 20px 32px;border-bottom:1px solid #f0f0f0;">
              <div style="font-size:18px;font-weight:600;color:#0D1F12;">${escapeHtml(orgName)}</div>
              <div style="font-size:13px;color:#888;margin-top:2px;">vam pošilja račun</div>
            </td>
          </tr>

          <!-- Invoice number + date -->
          <tr>
            <td style="padding:24px 32px 0 32px;">
              <div style="font-size:13px;color:#888;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Račun</div>
              <div style="font-size:26px;font-weight:700;color:#0D1F12;letter-spacing:-0.5px;">${invoiceNumber}</div>
              <div style="font-size:13px;color:#666;margin-top:4px;">Datum izdaje: ${formattedIssue}</div>
            </td>
          </tr>

          <!-- Amount + due date -->
          <tr>
            <td style="padding:16px 32px 0 32px;">
              <table role="presentation" style="width:100%;border-collapse:collapse;background:#0D1F12;border-radius:14px;overflow:hidden;">
                <tr>
                  <td style="padding:24px 28px;">
                    <div style="font-size:12px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:8px;">Znesek za plačilo</div>
                    <div style="font-size:42px;font-weight:700;color:#ffffff;letter-spacing:-1.5px;line-height:1;">€${amount.toFixed(2)}</div>
                    <div style="font-size:13px;color:#E8B547;margin-top:10px;font-weight:500;">${dueLabel}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- PLAČAJ ZDAJ gumb + Flik info -->
          <tr>
            <td style="padding:20px 32px 0 32px;">
              <table role="presentation" style="width:100%;border-collapse:collapse;background:#E1F5EE;border-radius:14px;border:1.5px solid #A6D9C3;">
                <tr>
                  <td style="padding:20px 24px;">
                    <div style="font-size:13px;font-weight:700;color:#0E5E3B;margin-bottom:6px;">💳 Hitro plačilo — QR koda v PDF prilogi</div>
                    <div style="font-size:12px;color:#1D9E75;line-height:1.6;margin-bottom:14px;">
                      Odprite priložen PDF → skenirajte QR kodo z vašo bančno aplikacijo → potrdite plačilo.<br>
                      <strong>Denar pride takoj na TRR.</strong>
                    </div>
                    <table role="presentation" style="border-collapse:collapse;">
                      <tr>
                        <td style="padding-right:8px;font-size:11px;color:#1D9E75;">✓ NLB</td>
                        <td style="padding-right:8px;font-size:11px;color:#1D9E75;">✓ SKB</td>
                        <td style="padding-right:8px;font-size:11px;color:#1D9E75;">✓ Sparkasse</td>
                        <td style="padding-right:8px;font-size:11px;color:#1D9E75;">✓ Addiko</td>
                        <td style="font-size:11px;color:#1D9E75;">✓ vse SI banke</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${iban ? `
          <!-- Bančni podatki -->
          <tr>
            <td style="padding:16px 32px 0 32px;">
              <table role="presentation" style="width:100%;border-collapse:collapse;background:#F7F6F2;border-radius:12px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">Bančni podatki za nakazilo</div>
                    <table role="presentation" style="border-collapse:collapse;width:100%;">
                      <tr>
                        <td style="font-size:12px;color:#666;padding-bottom:4px;width:100px;">Prejemnik:</td>
                        <td style="font-size:12px;color:#0D1F12;font-weight:500;padding-bottom:4px;">${escapeHtml(orgName)}</td>
                      </tr>
                      <tr>
                        <td style="font-size:12px;color:#666;padding-bottom:4px;">IBAN:</td>
                        <td style="font-size:12px;color:#0D1F12;font-weight:500;font-family:monospace;padding-bottom:4px;">${iban}</td>
                      </tr>
                      <tr>
                        <td style="font-size:12px;color:#666;padding-bottom:4px;">Znesek:</td>
                        <td style="font-size:12px;color:#0D1F12;font-weight:500;padding-bottom:4px;">€${amount.toFixed(2)}</td>
                      </tr>
                      ${reference ? `<tr>
                        <td style="font-size:12px;color:#666;">Sklic:</td>
                        <td style="font-size:12px;color:#0D1F12;font-weight:500;font-family:monospace;">${reference}</td>
                      </tr>` : ''}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>` : ''}

          <!-- Message -->
          <tr>
            <td style="padding:20px 32px 8px 32px;">
              <div style="font-size:14px;color:#444;line-height:1.7;">
                ${messageHtml}
              </div>
            </td>
          </tr>

          <!-- PDF attachment notice -->
          <tr>
            <td style="padding:8px 32px 24px 32px;">
              <table role="presentation" style="width:100%;border-collapse:collapse;background:#FFF8E7;border-radius:10px;border:1px solid rgba(232,181,71,0.3);">
                <tr>
                  <td style="padding:12px 18px;">
                    <div style="font-size:13px;color:#92600A;">
                      📎 <strong>PDF račun je v prilogi</strong> — vsebuje UPN QR kodo za takojšnje plačilo
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:18px 32px 28px 32px;border-top:1px solid #f0f0f0;">
              <div style="font-size:13px;color:#444;line-height:1.6;">
                Lep pozdrav,<br>
                <strong style="color:#0D1F12;">${escapeHtml(orgName)}</strong>
              </div>
              <div style="font-size:11px;color:#aaa;margin-top:12px;">
                V primeru vprašanj odgovorite na ta email.
              </div>
            </td>
          </tr>

        </table>

        <div style="font-size:11px;color:#aaa;margin-top:16px;text-align:center;">
          Poslano prek <a href="https://xn--raunko-j2a.si" style="color:#1D9E75;text-decoration:none;">Računko</a> · AI računovodja za slovenskega podjetnika
        </div>

      </td>
    </tr>
  </table>
</body>
</html>`
}
