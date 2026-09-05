import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import Lenis from 'lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import '../styles/premium-motion.css'

gsap.registerPlugin(ScrollTrigger)

const PUBLIC_PATHS = new Set(['/', '/pricing', '/contact', '/help', '/privacy', '/terms', '/cookies'])

function isReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export default function PremiumMotion() {
  const location = useLocation()

  useEffect(() => {
    if (isReducedMotion()) return
    const lenis = new Lenis({ duration: 1.05, smoothWheel: true, syncTouch: false })
    let frame = 0
    const tick = (time: number) => {
      lenis.raf(time)
      ScrollTrigger.update()
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      lenis.destroy()
    }
  }, [])

  useEffect(() => {
    if (isReducedMotion()) return
    const ctx = gsap.context(() => {
      const root = document.querySelector('#root')
      if (root) gsap.fromTo(root, { opacity: 0.96 }, { opacity: 1, duration: 0.32, ease: 'power2.out', overwrite: true })
      const publicPage = PUBLIC_PATHS.has(location.pathname) || location.pathname.startsWith('/landing')
      const selector = publicPage ? '[data-premium-reveal], main h1, main h2, main h3' : '[data-premium-reveal]'
      gsap.utils.toArray<HTMLElement>(selector).forEach((el, index) => {
        if (el.dataset.premiumAnimated === 'true') return
        el.dataset.premiumAnimated = 'true'
        gsap.fromTo(el, { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.65, delay: Math.min(index * 0.035, 0.28), ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 88%', once: true } })
      })
      gsap.utils.toArray<HTMLElement>('[data-premium-card]').forEach((el) => {
        if (el.dataset.premiumCardBound === 'true') return
        el.dataset.premiumCardBound = 'true'
        const enter = () => gsap.to(el, { y: -5, scale: 1.008, duration: 0.28, ease: 'power2.out' })
        const leave = () => gsap.to(el, { y: 0, scale: 1, duration: 0.35, ease: 'power3.out' })
        el.addEventListener('mouseenter', enter)
        el.addEventListener('mouseleave', leave)
        el.addEventListener('focusin', enter)
        el.addEventListener('focusout', leave)
      })
    })
    return () => ctx.revert()
  }, [location.pathname, location.search])

  return null
}
