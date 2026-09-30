import s from './landing.module.css'
import { RAZISKAVA } from '@/lib/landing-raziskava'

/** Drobna opomba z metodologijo raziskave - pod prvo omembo stevilke. */
export default function Opomba() {
  if (!RAZISKAVA.metodologija) {
    return null /* TODO: podatek iz raziskave (vzorec / metodologija) */
  }
  return <p className={s.opomba}>{RAZISKAVA.metodologija}</p>
}
