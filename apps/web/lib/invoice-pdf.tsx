import { Document, Page, Text, View, StyleSheet, Image, Font } from '@react-pdf/renderer'
import QRCode from 'qrcode'

// Inter latin-ext (VSE tri utezi morajo biti latin-EXT, sicer manjkajo
// sumniki - prejsnja verzija je imela navadni latin subset, ki NIMA "č",
// zato je ta crka izginila iz vseh PDF racunov: Mahnič->Mahni, RAČUN->RAUN)
Font.register({
  family: 'Inter',
  fonts: [
    { src: 'https://fonts.bunny.net/inter/files/inter-latin-ext-400-normal.woff', fontWeight: 400 },
    { src: 'https://fonts.bunny.net/inter/files/inter-latin-ext-600-normal.woff', fontWeight: 600 },
    { src: 'https://fonts.bunny.net/inter/files/inter-latin-ext-700-normal.woff', fontWeight: 700 },
  ],
})

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Inter', fontSize: 10, color: '#111' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 30 },
  companyName: { fontSize: 18, fontWeight: 700, marginBottom: 6 },
  companyInfo: { color: '#666', fontSize: 9, lineHeight: 1.6 },
  invoiceTitle: { textAlign: 'right' },
  invoiceTitleH1: { fontSize: 26, fontWeight: 700, letterSpacing: 2, color: '#111' },
  invoiceMeta: { color: '#666', fontSize: 9, marginTop: 6, lineHeight: 1.6 },
  hr: { borderBottomWidth: 0.5, borderBottomColor: '#e0e0e0', marginVertical: 18 },
  buyerLabel: { fontSize: 8, color: '#999', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 },
  buyerName: { fontSize: 12, fontWeight: 700 },
  buyerSub: { fontSize: 9, color: '#666', marginTop: 3 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#f5f5f5', padding: 8, marginTop: 18 },
  tableHeaderText: { fontSize: 8, color: '#666', textTransform: 'uppercase' },
  tableRow: { flexDirection: 'row', padding: 9, borderBottomWidth: 0.5, borderBottomColor: '#f0f0f0' },
  col1: { flex: 4 },
  col2: { flex: 1, textAlign: 'right' },
  col3: { flex: 1.5, textAlign: 'right' },
  col4: { flex: 1, textAlign: 'right' },
  col5: { flex: 1.5, textAlign: 'right' },
  totals: { alignItems: 'flex-end', marginTop: 18 },
  totalsBox: { width: 240 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, color: '#666', fontSize: 10 },
  totalFinal: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#111', color: '#fff', padding: 10, borderRadius: 4, fontSize: 12, fontWeight: 700, marginTop: 8 },
  bottomSection: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 24, paddingTop: 18, borderTopWidth: 0.5, borderTopColor: '#e0e0e0' },
  payTitle: { fontSize: 8, color: '#999', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  payRow: { flexDirection: 'row', marginBottom: 4, fontSize: 9 },
  payLabel: { color: '#999', width: 50 },
  payValue: { fontWeight: 700, color: '#111' },
  qrImage: { width: 100, height: 100 },
  qrLabel: { fontSize: 8, color: '#999', textAlign: 'center', marginTop: 4 },
  footer: { marginTop: 30, textAlign: 'center', fontSize: 8, color: '#aaa', borderTopWidth: 0.5, borderTopColor: '#f0f0f0', paddingTop: 12 },
  notes: { backgroundColor: '#fff5f5', borderWidth: 0.5, borderColor: '#fcc', color: '#c00', padding: 6, fontSize: 9, fontWeight: 700, marginBottom: 10 },
})

interface Props {
  invoice: any
  org: any
  qrDataUrl: string
  fursQrDataUrl?: string
}

export function InvoicePDF({ invoice, org, qrDataUrl, fursQrDataUrl }: Props) {
  const isStorno = invoice.amount_total < 0
  const isDobropis = invoice.invoice_number?.includes('-D')
  const docType = isDobropis ? 'DOBROPIS' : isStorno ? 'STORNO' : 'RAČUN'
  const lineItems = invoice.line_items || []

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {/* POPRAVLJENO (11.8.2026): dodana maxWidth - prej se je dolgo
              ime podjetja stiskalo ob naslov "RAČUN" brez preloma vrstice. */}
          <View style={{ maxWidth: '60%' }}>
            <Text style={styles.companyName}>{org.name || ''}</Text>
            <View style={styles.companyInfo}>
              <Text>{org.address || ''}</Text>
              <Text>{org.post_code || ''} {org.city || ''}</Text>
              {/* POPRAVLJENO (30.7.2026): odstrani SI predpono - "Davčna
                  številka" jo po konvenciji NE vsebuje (za razliko od "ID za
                  DDV" spodaj, ki jo vedno ima). Prej sta bili polji identicni. */}
              <Text>Davčna številka: {(org.tax_number || '').replace(/^SI/i, '')}</Text>
              {org.vat_registered && <Text>ID za DDV: SI{(org.tax_number || '').replace(/^SI/i, '')}</Text>}
              {org.iban && <Text>TRR: {org.iban}</Text>}
            </View>
          </View>
          <View style={styles.invoiceTitle}>
            <Text style={[styles.invoiceTitleH1, { color: isStorno || isDobropis ? '#c00' : '#111' }]}>{docType}</Text>
            <View style={styles.invoiceMeta}>
              <Text>Številka: {invoice.invoice_number}</Text>
              <Text>Datum: {new Date(invoice.issue_date).toLocaleDateString('sl-SI')}</Text>
              {/* DODANO (30.7.2026): datum opravljene storitve/dobave je po
                  ZDDV-1 obvezen, ce se razlikuje od datuma izdaje racuna. */}
              {invoice.service_date && (
                <Text>
                  {invoice.service_date_to && invoice.service_date_to !== invoice.service_date
                    ? `Opravljeno: ${new Date(invoice.service_date).toLocaleDateString('sl-SI')} – ${new Date(invoice.service_date_to).toLocaleDateString('sl-SI')}`
                    : `Opravljeno: ${new Date(invoice.service_date).toLocaleDateString('sl-SI')}`}
                </Text>
              )}
              {invoice.due_date && <Text>Rok plačila: {new Date(invoice.due_date).toLocaleDateString('sl-SI')}</Text>}
            </View>
          </View>
        </View>

        {invoice.notes && <Text style={styles.notes}>{invoice.notes}</Text>}

        <View style={styles.hr} />

        <View>
          <Text style={styles.buyerLabel}>Kupec</Text>
          <Text style={styles.buyerName}>{invoice.client_name}</Text>
          {/* DODANO (30.7.2026): naslov kupca je ZAKONSKO OBVEZEN po
              ZDDV-1, 82. clen - prej se ni izpisal, ceprav se zbira. */}
          {invoice.client_address && <Text style={styles.buyerSub}>{invoice.client_address}</Text>}
          {invoice.client_tax_number && <Text style={styles.buyerSub}>ID za DDV: {invoice.client_tax_number}</Text>}
          {invoice.client_email && <Text style={styles.buyerSub}>{invoice.client_email}</Text>}
        </View>

        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderText, styles.col1]}>Storitev / Blago</Text>
          <Text style={[styles.tableHeaderText, styles.col2]}>Količina</Text>
          <Text style={[styles.tableHeaderText, styles.col3]}>Cena (€)</Text>
          <Text style={[styles.tableHeaderText, styles.col4]}>DDV</Text>
          <Text style={[styles.tableHeaderText, styles.col5]}>Skupaj (€)</Text>
        </View>

        {lineItems.map((item: any, idx: number) => (
          <View key={idx} style={styles.tableRow}>
            <Text style={styles.col1}>{item.description || ''}</Text>
            <Text style={styles.col2}>{item.quantity}</Text>
            <Text style={styles.col3}>€{Number(item.unit_price).toFixed(2)}</Text>
            <Text style={styles.col4}>{item.vat_rate}%</Text>
            <Text style={styles.col5}>€{(item.quantity * item.unit_price).toFixed(2)}</Text>
          </View>
        ))}

        <View style={styles.totals}>
          <View style={styles.totalsBox}>
            {/* POPRAVLJENO (16.8.2026): pri racunu z VEC stopnjami DDV je bila
                prikazana ena sama skupna osnova in en DDV. 82. clen ZDDV-1
                zahteva razclenitev po stopnjah - kupec mora videti osnovo in
                znesek DDV za VSAKO stopnjo posebej. Pri enotni stopnji ostane
                prikaz enak kot doslej. */}
            {(() => {
              const postavke: any[] = Array.isArray(invoice.line_items) ? invoice.line_items : []
              const poStopnji = new Map<number, { net: number; vat: number }>()
              for (const pz of postavke) {
                const kolicina = Number(pz.quantity ?? 1)
                const cena = Number(pz.unit_price ?? 0)
                const popust = Number(pz.discount_pct ?? 0)
                const neto = kolicina * cena * (1 - popust / 100)
                const stopnja = Number(pz.vat_rate ?? 22)
                const o = poStopnji.get(stopnja) || { net: 0, vat: 0 }
                o.net += neto
                o.vat += neto * stopnja / 100
                poStopnji.set(stopnja, o)
              }
              const stopnje = Array.from(poStopnji.entries()).sort((a, b) => b[0] - a[0])
              if (stopnje.length > 1) {
                return stopnje.map(([rate, v]) => (
                  <View key={rate} style={styles.totalRow}>
                    <Text>Osnova {rate}% / DDV:</Text>
                    <Text>€{v.net.toFixed(2)} / €{v.vat.toFixed(2)}</Text>
                  </View>
                ))
              }
              return (
                <>
                  <View style={styles.totalRow}>
                    <Text>Osnova za DDV:</Text>
                    <Text>€{Number(invoice.amount_net).toFixed(2)}</Text>
                  </View>
                  <View style={styles.totalRow}>
                    <Text>DDV:</Text>
                    <Text>€{Number(invoice.vat_amount).toFixed(2)}</Text>
                  </View>
                </>
              )
            })()}
            <View style={styles.totalFinal}>
              <Text>{isStorno || isDobropis ? 'SKUPAJ ZA VRAČILO:' : 'SKUPAJ ZA PLAČILO:'}</Text>
              <Text>€{Number(invoice.amount_total).toFixed(2)}</Text>
            </View>
          </View>
        </View>

        {!isStorno && !isDobropis && invoice.status === 'paid' && (
          <View style={{ marginTop: 16, padding: 14, backgroundColor: '#e8f5ee', borderRadius: 6, borderWidth: 1, borderColor: '#1f6b3a', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 13, fontWeight: 700, color: '#1f6b3a' }}>PLAČANO</Text>
            <Text style={{ fontSize: 9, color: '#1f6b3a' }}>
              {invoice.paid_at ? `Plačano dne ${new Date(invoice.paid_at).toLocaleDateString('sl-SI')}` : 'Račun je poravnan'}
            </Text>
          </View>
        )}
        {!isStorno && !isDobropis && invoice.status !== 'paid' && (
          <View style={styles.bottomSection}>
            <View>
              <Text style={styles.payTitle}>Plačilni podatki</Text>
              <View style={styles.payRow}>
                <Text style={styles.payLabel}>TRR:</Text>
                <Text style={styles.payValue}>{org.iban || ''}</Text>
              </View>
              <View style={styles.payRow}>
                <Text style={styles.payLabel}>Sklic:</Text>
                <Text style={styles.payValue}>{invoice.reference || `SI00 ${invoice.invoice_number}`}</Text>
              </View>
              <View style={styles.payRow}>
                <Text style={styles.payLabel}>Namen:</Text>
                <Text style={styles.payValue}>Plačilo računa {invoice.invoice_number}</Text>
              </View>
              <View style={styles.payRow}>
                <Text style={styles.payLabel}>Znesek:</Text>
                <Text style={styles.payValue}>€{Number(invoice.amount_total).toFixed(2)}</Text>
              </View>
            </View>
            <View>
              <Image src={qrDataUrl} style={styles.qrImage} />
              <Text style={styles.qrLabel}>UPN QR</Text>
            </View>
          </View>
        )}

        {/* DODANO (11.8.2026): DEMO nacin - jasen vodni zig namesto normalnega
            FURS potrditvenega bloka, ce sta ZOI/EOR oznacena kot demo. */}
        {(invoice.zoi?.startsWith('DEMO-') || invoice.eor?.startsWith('DEMO-')) ? (
          <View style={{ marginTop: 14, paddingTop: 10, borderTopWidth: 2, borderTopColor: '#c00', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 10, fontWeight: 700, marginBottom: 3, color: '#c00' }}>⚠ DEMO RAČUN — NI DAVČNO POTRJEN</Text>
              <Text style={{ fontSize: 7, color: '#c00' }}>Ta račun je bil ustvarjen v demo/preskusnem načinu aplikacije in NI bil</Text>
              <Text style={{ fontSize: 7, color: '#c00' }}>poslan na FURS. Ne uporabljajte ga za dejansko gotovinsko poslovanje.</Text>
            </View>
          </View>
        ) : (invoice.zoi || invoice.eor) && (
          <View style={{ marginTop: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#ddd', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 8, fontWeight: 700, marginBottom: 3, color: '#333' }}>Davčno potrjen račun (FURS)</Text>
              {invoice.zoi && <Text style={{ fontSize: 7, color: '#555', marginBottom: 2 }}>ZOI: {invoice.zoi}</Text>}
              {invoice.eor && <Text style={{ fontSize: 7, color: '#555', marginBottom: 2 }}>EOR: {invoice.eor}</Text>}
              <Text style={{ fontSize: 6.5, color: '#888', marginTop: 2 }}>Račun lahko preverite na blagajne.fu.gov.si</Text>
            </View>
            {fursQrDataUrl && (
              <View style={{ alignItems: 'center', marginLeft: 12 }}>
                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                <Image src={fursQrDataUrl} style={{ width: 60, height: 60 }} />
                <Text style={{ fontSize: 6, color: '#888', marginTop: 2 }}>Preveri račun</Text>
              </View>
            )}
          </View>
        )}
        <Text style={styles.footer}>
          Dokument je izdan elektronsko · {org.name} · {new Date().getFullYear()}
        </Text>
      </Page>
    </Document>
  )
}

// Helper za FURS verifikacijski QR (server-side) - koda z URL-jem za
// preverjanje davcno potrjenega racuna (obvezno po ZDavPR za potrjene racune)
export async function generateFursQr(zoi: string, issueDate: Date): Promise<string> {
  const { getFursVerificationUrl } = await import('./furs')
  const url = getFursVerificationUrl(zoi, issueDate)
  return await QRCode.toDataURL(url, { width: 150, margin: 1, errorCorrectionLevel: 'M' })
}

// Helper za UPN QR generation (server-side)
export async function generateUpnQr(invoice: any, org: any): Promise<string> {
  const amount = String(Math.round(invoice.amount_total * 100)).padStart(11, '0')
  const ibanClean = (org.iban || '').replace(/\s/g, '')
  const refClean = (invoice.reference || `SI00 ${invoice.invoice_number}`).replace(/\s/g, '')
  
  function upnDate(dateStr: string): string {
    const d = new Date(dateStr)
    return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`
  }
  
  const namen = `Placilo racuna ${invoice.invoice_number}`.slice(0, 42)
  
  const upnFields = [
    'UPNQR', '', '', '', '',
    invoice.client_name.slice(0, 33),
    '', '',
    amount,
    '', '', 'OTHR',
    namen,
    upnDate(invoice.due_date),
    ibanClean,
    refClean,
    org.name.slice(0, 33),
    (org.address || '').slice(0, 33),
    `${org.post_code || ''} ${org.city || ''}`.trim().slice(0, 33),
  ]
  
  const checksum = upnFields.reduce((s, f) => s + f.length + 1, 0)
  const upnData = upnFields.join('\n') + '\n' + String(checksum).padStart(3, '0')
  
  return await QRCode.toDataURL(upnData, { width: 200, margin: 2, errorCorrectionLevel: 'M' })
}