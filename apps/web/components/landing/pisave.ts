import { Inter, Onest } from 'next/font/google'

// Variabilni pisavi: ena datoteka na podmnozico namesto ene na debelino.
// latin-ext je obvezen: brez njega se č, š, ž narisejo z nadomestno pisavo.
export const pisavaNaslovi = Onest({
  subsets: ['latin', 'latin-ext'],
  variable: '--l-pisava-naslovi',
  display: 'swap',
})

export const pisavaBesedilo = Inter({
  subsets: ['latin', 'latin-ext'],
  variable: '--l-pisava-besedilo',
  display: 'swap',
})
