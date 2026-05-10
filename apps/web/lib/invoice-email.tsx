interface Props {
    orgName: string
    invoiceNumber: string
    issueDate: string
    amount: number
    dueDate: string
    customMessage?: string
  }
  
  export function buildInvoiceEmailHtml({
    orgName,
    invoiceNumber,
    issueDate,
    amount,
    dueDate,
    customMessage,
  }: Props): string {
    const formattedIssue = new Date(issueDate).toLocaleDateString('sl-SI')
    const formattedDue = new Date(dueDate).toLocaleDateString('sl-SI')
    
    const messageHtml = customMessage 
      ? customMessage.replace(/\n/g, '<br>')
      : `V prilogi vam pošiljamo račun <strong>${invoiceNumber}</strong> z dne ${formattedIssue}, v znesku <strong>€${amount.toFixed(2)}</strong> z rokom plačila <strong>${formattedDue}</strong>.<br><br>Plačilo lahko opravite preko UPN QR kode v PDF-u.`
  
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
          <table role="presentation" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;border:1px solid #e8e8e8;overflow:hidden;">
            
            <!-- Header -->
            <tr>
              <td style="padding:32px 32px 24px 32px;border-bottom:1px solid #f0f0f0;">
                <div style="font-size:20px;font-weight:600;color:#0D1F12;margin-bottom:4px;">${orgName}</div>
                <div style="font-size:13px;color:#888;">Pošilja vam račun</div>
              </td>
            </tr>
            
            <!-- Title -->
            <tr>
              <td style="padding:28px 32px 16px 32px;">
                <div style="font-size:24px;font-weight:600;color:#0D1F12;letter-spacing:-0.5px;margin-bottom:6px;">
                  Račun ${invoiceNumber}
                </div>
                <div style="font-size:14px;color:#666;">
                  Datum izdaje: ${formattedIssue}
                </div>
              </td>
            </tr>
            
            <!-- Amount badge -->
            <tr>
              <td style="padding:0 32px 24px 32px;">
                <table role="presentation" style="width:100%;border-collapse:collapse;background:#F7F6F2;border-radius:10px;">
                  <tr>
                    <td style="padding:18px 22px;">
                      <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Znesek za plačilo</div>
                      <div style="font-size:32px;font-weight:600;color:#0D1F12;letter-spacing:-1px;">€${amount.toFixed(2)}</div>
                      <div style="font-size:13px;color:#854F0B;margin-top:6px;">Rok plačila: ${formattedDue}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            
            <!-- Message -->
            <tr>
              <td style="padding:8px 32px 24px 32px;">
                <div style="font-size:14px;color:#333;line-height:1.6;">
                  ${messageHtml}
                </div>
              </td>
            </tr>
            
            <!-- Attachment notice -->
            <tr>
              <td style="padding:0 32px 24px 32px;">
                <table role="presentation" style="width:100%;border-collapse:collapse;background:#EAF3DE;border-radius:10px;">
                  <tr>
                    <td style="padding:14px 18px;">
                      <div style="font-size:13px;color:#27500A;">
                        📎 <strong>PDF račun je v prilogi tega emaila</strong><br>
                        <span style="color:#3B6D11;font-size:12px;">Vsebuje UPN QR kodo za enostavno plačilo</span>
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            
            <!-- Footer -->
            <tr>
              <td style="padding:18px 32px 28px 32px;border-top:1px solid #f0f0f0;">
                <div style="font-size:12px;color:#888;line-height:1.6;">
                  Lep pozdrav,<br>
                  <strong style="color:#333;">${orgName}</strong>
                </div>
              </td>
            </tr>
            
          </table>
          
          <div style="font-size:11px;color:#aaa;margin-top:18px;text-align:center;">
            Dokument je bil poslan preko Računko · računko.si
          </div>
          
        </td>
      </tr>
    </table>
  </body>
  </html>`
  }
  