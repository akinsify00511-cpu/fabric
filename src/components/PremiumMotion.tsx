import { useEffect, useRef } from 'react'
import Lenis from 'lenis'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import './premium-motion.css'

gsap.registerPlugin(ScrollTrigger)

/**
 * Avenize premium experience layer.
 *
 * Lenis owns the page scroll; GSAP owns entrance/route motion and stays
 * synchronized with Lenis. Components opt into richer motion with data-
 * attributes, so existing product surfaces remain safe by default.
 */
export default function PremiumMotion() {
  const lenisRef = useRef<Lenis | null>(null)

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) return

    const lenis = new Lenis({
      autoRaf: false,
      anchors: true,
      smoothWheel: true,
      syncTouch: false,
      lerp: 0.085,
    })
    lenisRef.current = lenis

    const raf = (time: number) => {
      lenis.raf(time)
    }
    gsap.ticker.add(raf)
    lenis.on('scroll', ScrollTrigger.update)
    gsap.ticker.lagSmoothing(0)

    const reveal = gsap.utils.toArray<HTMLElement>('[data-premium-reveal]')
    const revealAnimations = reveal.map((element) => {
      const delay = Number(element.dataset.premiumDelay ?? 0)
      return gsap.fromTo(
        element,
        { autoAlpha: 0, y: 24 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.72,
          delay,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: element,
            start: 'top 88%',
            once: true,
          },
        },
      )
    })

    const hero = document.querySelector<HTMLElement>('[data-premium-hero]')
    const heroTl = hero
      ? gsap.timeline({ defaults: { ease: 'power3.out' } })
          .fromTo('[data-premium-hero-eyebrow]', { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.55 })
          .fromTo('[data-premium-hero-title]', { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 0.8 }, '-=0.3')
          .fromTo('[data-premium-hero-copy]', { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.65 }, '-=0.45')
          .fromTo('[data-premium-hero-actions]', { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.55 }, '-=0.3')
      : null

    const cleanupHover = () => {
      document.querySelectorAll<HTMLElement>('[data-premium-spotlight]').forEach((card) => {
        const onMove = (event: MouseEvent) => {
          const rect = card.getBoundingClientRect()
          card.style.setProperty('--spotlight-x', `${event.clientX - rect.left}px`)
          card.style.setProperty('--spotlight-y', `${event.clientY - rect.top}px`)
        }
        card.addEventListener('pointermove', onMove)
        ;(card as HTMLElement & { __avenizeCleanup?: () => void }).__avenizeCleanup = () => {
          card.removeEventListener('pointermove', onMove)
        }
      })
    }
    cleanupHover()

    ScrollTrigger.refresh()

    return () => {
      heroTl?.kill()
      revealAnimations.forEach((animation) => animation.kill())
      document.querySelectorAll<HTMLElement>('[data-premium-spotlight]').forEach((card) => {
        ;(card as HTMLElement & { __avenizeCleanup?: () => void }).__avenizeCleanup?.()
      })
      ScrollTrigger.getAll().forEach((trigger) => trigger.kill())
      lenis.off('scroll', ScrollTrigger.update)
      gsap.ticker.remove(raf)
      lenis.destroy()
      lenisRef.current = null
    }
  }, [])

  return null
}
