/**
 * Slika UPN QR kode na strežniku (PDF računov). Zahteve standarda in
 * nastavitve knjižnice: upnBwipOpcije v lib/upn-qr.ts.
 */
import { toBuffer } from 'bwip-js/node'
import { upnBwipOpcije } from './upn-qr'

export async function upnQrPng(vsebina: string): Promise<Buffer> {
  return await toBuffer(upnBwipOpcije(vsebina) as Parameters<typeof toBuffer>[0])
}

export async function upnQrDataUrl(vsebina: string): Promise<string> {
  return 'data:image/png;base64,' + (await upnQrPng(vsebina)).toString('base64')
}
