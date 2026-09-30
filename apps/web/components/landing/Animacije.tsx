'use client'

import { useEffect } from 'react'
import s from './landing.module.css'

/**
 * Subtilne animacije ob vstopu v pogled: fade in dvig ([data-razkrij]) in
 * stetje stevilk ([data-stej]). Brez JS je vse vidno in stevilke so koncne.
 * Kdor ima vklopljeno zmanjsano gibanje, ne dobi nicesar od tega.
 */
export default function Animacije() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (!('IntersectionObserver' in window)) return
    const koren = document.querySelector('[data-landing]')
    if (!koren) return

    const visina = window.innerHeight
    const razkrij = Array.from(koren.querySelectorAll<HTMLElement>('[data-razkrij]'))
      // Kar je ze v pogledu ob nalaganju, ostane pri miru - brez utripa.
      .filter(el => el.getBoundingClientRect().top > visina * 0.9)
    koren.classList.add(s.animiraj)

    const opazovalec = new IntersectionObserver((vnosi) => {
      for (const v of vnosi) {
        if (!v.isIntersecting) continue
        const el = v.target as HTMLElement
        opazovalec.unobserve(el)
        if (el.dataset.stej != null) stej(el)
        else el.setAttribute('data-viden', '')
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 })

    for (const el of koren.querySelectorAll<HTMLElement>('[data-razkrij]')) {
      if (razkrij.includes(el)) opazovalec.observe(el)
      else el.setAttribute('data-viden', '')
    }
    for (const el of koren.querySelectorAll<HTMLElement>('[data-stej]')) opazovalec.observe(el)
    return () => opazovalec.disconnect()
  }, [])
  return null
}

function stej(el: HTMLElement) {
  const cilj = Number(el.dataset.stej)
  if (!Number.isFinite(cilj)) return
  const dec = cilj % 1 ? 1 : 0
  const trajanje = 1200
  const zacetek = performance.now()
  const korak = (t: number) => {
    const p = Math.min(1, (t - zacetek) / trajanje)
    const e = 1 - Math.pow(1 - p, 3)
    el.textContent = (cilj * e).toLocaleString('sl-SI', { minimumFractionDigits: dec, maximumFractionDigits: dec })
    if (p < 1) requestAnimationFrame(korak)
  }
  requestAnimationFrame(korak)
}
