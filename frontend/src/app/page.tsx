'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false)
  const [activeTab, setActiveTab] = useState<'whatsapp' | 'sms'>('whatsapp')
  const [replyVisible, setReplyVisible] = useState(false)
  const messagingRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Scroll reveal
  useEffect(() => {
    const els = document.querySelectorAll('.reveal')
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('visible')
            observer.unobserve(e.target)
          }
        })
      },
      { threshold: 0.15 }
    )
    els.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  // Messaging reply animation
  useEffect(() => {
    if (!messagingRef.current) return
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setTimeout(() => setReplyVisible(true), 2000)
            observer.unobserve(e.target)
          }
        })
      },
      { threshold: 0.4 }
    )
    observer.observe(messagingRef.current)
    return () => observer.disconnect()
  }, [])

  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;1,400;1,600&family=DM+Sans:wght@300;400;500;600&display=swap');

        :root {
          --bg: #0b1c2c;
          --accent: #f97316;
          --text: #ffffff;
          --muted: #94a3b8;
          --muted-light: #cbd5e1;
          --card-bg: rgba(255,255,255,0.05);
          --card-border: rgba(255,255,255,0.1);
          --glow: rgba(249,115,22,0.15);
        }

        .lp-root {
          background: var(--bg);
          color: var(--text);
          font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          min-height: 100vh;
          overflow-x: hidden;
        }

        .lp-serif {
          font-family: 'Playfair Display', Georgia, 'Times New Roman', serif;
        }

        /* ── Nav ─────────────────────────────────── */
        .lp-nav {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 100;
          padding: 16px 32px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          transition: background-color 0.3s, backdrop-filter 0.3s;
        }
        .lp-nav.scrolled {
          background-color: rgba(11,28,44,0.85);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
        }
        .lp-nav-wordmark {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: 24px;
          font-weight: 600;
          letter-spacing: 3px;
          color: var(--text);
        }
        .lp-nav-links {
          display: flex;
          align-items: center;
          gap: 32px;
        }
        .lp-nav-links a {
          color: var(--muted-light);
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
          transition: color 0.2s;
          cursor: pointer;
        }
        .lp-nav-links a:hover {
          color: var(--text);
        }
        .lp-btn-orange {
          background: var(--accent);
          color: var(--text);
          border: none;
          padding: 10px 24px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          text-decoration: none;
          display: inline-block;
          transition: background-color 0.2s, transform 0.15s;
        }
        .lp-btn-orange:hover {
          background: #ea680c;
          transform: translateY(-1px);
        }
        .lp-btn-outline {
          background: transparent;
          color: var(--text);
          border: 1.5px solid rgba(255,255,255,0.4);
          padding: 10px 24px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          text-decoration: none;
          display: inline-block;
          transition: border-color 0.2s, background 0.2s;
        }
        .lp-btn-outline:hover {
          border-color: var(--text);
          background: rgba(255,255,255,0.05);
        }

        /* ── Hero ────────────────────────────────── */
        .lp-hero {
          position: relative;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 120px 24px 60px;
          overflow: hidden;
        }
        .lp-hero-glow {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -55%);
          width: 600px;
          height: 600px;
          background: radial-gradient(circle, var(--glow) 0%, transparent 70%);
          pointer-events: none;
        }
        .lp-ring {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          border-radius: 50%;
          border: 1px solid rgba(249,115,22,0.12);
          pointer-events: none;
          animation: ring-pulse 4s ease-in-out infinite;
        }
        .lp-ring-1 {
          width: 280px;
          height: 280px;
          animation-delay: 0s;
        }
        .lp-ring-2 {
          width: 480px;
          height: 480px;
          animation-delay: 1s;
        }
        .lp-ring-3 {
          width: 700px;
          height: 700px;
          animation-delay: 2s;
        }
        .lp-ring-4 {
          width: 960px;
          height: 960px;
          animation-delay: 3s;
        }
        @keyframes ring-pulse {
          0%, 100% { opacity: 0.4; transform: translate(-50%, -50%) scale(0.97); }
          50% { opacity: 1; transform: translate(-50%, -50%) scale(1.03); }
        }
        .lp-hero-content {
          position: relative;
          z-index: 2;
          max-width: 720px;
        }
        .lp-hero h1 {
          font-family: 'Playfair Display', Georgia, serif;
          font-style: italic;
          font-weight: 600;
          font-size: 52px;
          line-height: 1.15;
          margin: 0 0 24px;
        }
        .lp-hero-sub {
          font-size: 18px;
          color: var(--muted-light);
          line-height: 1.7;
          margin: 0 0 40px;
          max-width: 560px;
          margin-left: auto;
          margin-right: auto;
        }
        .lp-hero-buttons {
          display: flex;
          gap: 16px;
          justify-content: center;
          flex-wrap: wrap;
        }
        .lp-trust-strip {
          position: relative;
          z-index: 2;
          display: flex;
          gap: 48px;
          margin-top: 64px;
          padding-top: 32px;
          border-top: 1px solid rgba(255,255,255,0.1);
          flex-wrap: wrap;
          justify-content: center;
        }
        .lp-trust-item {
          text-align: center;
        }
        .lp-trust-item strong {
          display: block;
          font-size: 15px;
          color: var(--text);
          margin-bottom: 4px;
        }
        .lp-trust-item span {
          font-size: 12px;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        /* ── Sections shared ─────────────────────── */
        .lp-section {
          padding: 100px 24px;
          max-width: 1100px;
          margin: 0 auto;
        }
        .lp-section-heading {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: 38px;
          font-weight: 600;
          text-align: center;
          margin: 0 0 56px;
        }

        /* ── How it works ────────────────────────── */
        .lp-steps {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 24px;
        }
        .lp-step-card {
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          border-radius: 16px;
          padding: 32px 24px;
          transition: transform 0.3s, border-color 0.3s;
        }
        .lp-step-card:hover {
          transform: translateY(-4px);
          border-color: rgba(249,115,22,0.3);
        }
        .lp-step-num {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: 36px;
          font-weight: 600;
          color: var(--accent);
          margin-bottom: 16px;
          line-height: 1;
        }
        .lp-step-card h3 {
          font-size: 18px;
          font-weight: 700;
          margin: 0 0 12px;
        }
        .lp-step-card p {
          font-size: 14px;
          color: var(--muted);
          line-height: 1.65;
          margin: 0;
        }

        /* ── Messaging demo ──────────────────────── */
        .lp-msg-section {
          padding: 100px 24px;
          max-width: 1100px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .lp-tabs {
          display: flex;
          gap: 8px;
          margin-bottom: 32px;
        }
        .lp-tab {
          padding: 8px 24px;
          border-radius: 999px;
          border: 1px solid var(--card-border);
          background: transparent;
          color: var(--muted);
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .lp-tab.active {
          background: var(--accent);
          color: var(--text);
          border-color: var(--accent);
        }
        .lp-phone {
          width: 320px;
          border: 2px solid rgba(255,255,255,0.15);
          border-radius: 32px;
          padding: 48px 16px 24px;
          background: rgba(0,0,0,0.3);
          position: relative;
          min-height: 400px;
        }
        .lp-phone-notch {
          position: absolute;
          top: 12px;
          left: 50%;
          transform: translateX(-50%);
          width: 80px;
          height: 6px;
          border-radius: 3px;
          background: rgba(255,255,255,0.15);
        }
        .lp-chat {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .lp-bubble {
          max-width: 85%;
          padding: 12px 16px;
          border-radius: 16px;
          font-size: 13px;
          line-height: 1.55;
        }
        .lp-bubble-out {
          align-self: flex-end;
          border-bottom-right-radius: 4px;
        }
        .lp-bubble-in {
          align-self: flex-start;
          border-bottom-left-radius: 4px;
        }
        .lp-bubble-wa-out {
          background: #005c4b;
          color: #e9edef;
        }
        .lp-bubble-wa-in {
          background: #202c33;
          color: #e9edef;
        }
        .lp-bubble-sms-out {
          background: #1a73e8;
          color: #fff;
        }
        .lp-bubble-sms-in {
          background: #2a3942;
          color: #e9edef;
        }
        .lp-bubble-link {
          color: #7aadff;
          text-decoration: underline;
          word-break: break-all;
        }
        .lp-reply-chip {
          align-self: flex-start;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border-radius: 12px;
          background: rgba(249,115,22,0.15);
          color: var(--accent);
          font-size: 13px;
          font-weight: 600;
          opacity: 0;
          transform: translateY(10px);
          transition: opacity 0.6s ease, transform 0.6s ease;
        }
        .lp-reply-chip.show {
          opacity: 1;
          transform: translateY(0);
        }

        /* ── Dashboard preview ───────────────────── */
        .lp-dash-section {
          padding: 100px 24px;
          max-width: 1100px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .lp-dash-phone {
          width: 340px;
          border: 2px solid rgba(255,255,255,0.15);
          border-radius: 32px;
          padding: 48px 16px 24px;
          background: rgba(0,0,0,0.3);
          position: relative;
        }
        .lp-dash-balance {
          background: linear-gradient(135deg, var(--accent), #c2410c);
          border-radius: 16px;
          padding: 24px;
          margin-bottom: 16px;
        }
        .lp-dash-balance-label {
          font-size: 12px;
          color: rgba(255,255,255,0.7);
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 6px;
        }
        .lp-dash-balance-amount {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: 32px;
          font-weight: 600;
          margin-bottom: 16px;
        }
        .lp-dash-progress-track {
          height: 8px;
          background: rgba(255,255,255,0.2);
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 8px;
        }
        .lp-dash-progress-fill {
          height: 100%;
          background: #fff;
          border-radius: 4px;
          width: 28%;
        }
        .lp-dash-progress-text {
          font-size: 12px;
          color: rgba(255,255,255,0.8);
        }
        .lp-dash-item {
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 10px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .lp-dash-item-name {
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 4px;
        }
        .lp-dash-item-amount {
          font-size: 12px;
          color: var(--muted);
        }
        .lp-dash-badge {
          font-size: 11px;
          padding: 4px 10px;
          border-radius: 999px;
          font-weight: 600;
        }
        .lp-badge-active {
          background: rgba(249,115,22,0.15);
          color: var(--accent);
        }
        .lp-badge-pending {
          background: rgba(148,163,184,0.15);
          color: var(--muted);
        }

        /* ── Features grid ───────────────────────── */
        .lp-features {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 24px;
        }
        .lp-feature-card {
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          border-radius: 16px;
          padding: 32px;
          transition: transform 0.3s, border-color 0.3s;
        }
        .lp-feature-card:hover {
          transform: translateY(-4px);
          border-color: rgba(249,115,22,0.3);
        }
        .lp-feature-accent {
          width: 32px;
          height: 3px;
          background: var(--accent);
          border-radius: 2px;
          margin-bottom: 20px;
        }
        .lp-feature-card h3 {
          font-size: 20px;
          font-weight: 700;
          margin: 0 0 12px;
        }
        .lp-feature-card p {
          font-size: 14px;
          color: var(--muted);
          line-height: 1.7;
          margin: 0;
        }

        /* ── CTA ─────────────────────────────────── */
        .lp-cta {
          text-align: center;
          padding: 100px 24px;
          max-width: 640px;
          margin: 0 auto;
        }
        .lp-cta h2 {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: 38px;
          font-weight: 600;
          margin: 0 0 16px;
        }
        .lp-cta-sub {
          color: var(--muted-light);
          font-size: 17px;
          line-height: 1.6;
          margin: 0 0 36px;
        }
        .lp-cta-small {
          margin-top: 16px;
          font-size: 13px;
          color: var(--muted);
        }

        /* ── Footer ──────────────────────────────── */
        .lp-footer {
          border-top: 1px solid rgba(255,255,255,0.08);
          padding: 64px 24px 32px;
          max-width: 1100px;
          margin: 0 auto;
        }
        .lp-footer-top {
          display: grid;
          grid-template-columns: 1.5fr 1fr 1fr 1fr;
          gap: 40px;
          margin-bottom: 48px;
        }
        .lp-footer-brand {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: 22px;
          font-weight: 600;
          letter-spacing: 3px;
          margin-bottom: 12px;
        }
        .lp-footer-brand-desc {
          font-size: 13px;
          color: var(--muted);
          line-height: 1.6;
          max-width: 260px;
        }
        .lp-footer-col h4 {
          font-size: 13px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          color: var(--muted-light);
          margin: 0 0 16px;
        }
        .lp-footer-col a {
          display: block;
          color: var(--muted);
          text-decoration: none;
          font-size: 14px;
          margin-bottom: 10px;
          transition: color 0.2s;
        }
        .lp-footer-col a:hover {
          color: var(--text);
        }
        .lp-footer-bottom {
          border-top: 1px solid rgba(255,255,255,0.08);
          padding-top: 24px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .lp-footer-legal {
          font-size: 12px;
          color: var(--muted);
          line-height: 1.6;
        }

        /* ── Scroll reveal ───────────────────────── */
        .reveal {
          opacity: 0;
          transform: translateY(30px);
          transition: opacity 0.8s ease, transform 0.8s ease;
        }
        .reveal.visible {
          opacity: 1;
          transform: translateY(0);
        }

        /* ── Responsive ──────────────────────────── */
        @media (max-width: 768px) {
          .lp-nav-links .lp-nav-link-text {
            display: none;
          }
          .lp-hero h1 {
            font-size: 32px;
          }
          .lp-hero-sub {
            font-size: 16px;
          }
          .lp-steps {
            grid-template-columns: 1fr;
          }
          .lp-features {
            grid-template-columns: 1fr;
          }
          .lp-section-heading {
            font-size: 28px;
          }
          .lp-cta h2 {
            font-size: 28px;
          }
          .lp-footer-top {
            grid-template-columns: 1fr 1fr;
            gap: 32px;
          }
          .lp-trust-strip {
            gap: 24px;
          }
        }
        @media (max-width: 480px) {
          .lp-nav {
            padding: 12px 16px;
          }
          .lp-footer-top {
            grid-template-columns: 1fr;
          }
          .lp-phone, .lp-dash-phone {
            width: 280px;
          }
        }
      `}} />

      <div className="lp-root">
        {/* ── Nav ──────────────────────────────── */}
        <nav className={`lp-nav ${scrolled ? 'scrolled' : ''}`}>
          <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="32" height="32" rx="8" fill="#f97316"/>
              <path d="M10 8 C10 8 16 6 22 8 L22 20 C22 24 16 26 16 26 C16 26 10 24 10 20 Z" fill="white" opacity="0.15"/>
              <text x="16" y="22" textAnchor="middle" fill="white" fontFamily="serif" fontSize="15" fontWeight="700">B</text>
            </svg>
            <span style={{fontFamily:'Playfair Display,serif', fontSize:'1.3rem', fontWeight:600, color:'#f1f5f9', letterSpacing:'0.02em'}}>olster</span>
          </div>
          <div className="lp-nav-links">
            <a className="lp-nav-link-text" onClick={() => scrollTo('how-it-works')}>How it works</a>
            <a className="lp-nav-link-text" onClick={() => scrollTo('features')}>Features</a>
            <a className="lp-nav-link-text" onClick={() => scrollTo('about')}>About</a>
            <Link href="/register" className="lp-btn-orange">Get started</Link>
          </div>
        </nav>

        {/* ── Hero ─────────────────────────────── */}
        <section className="lp-hero">
          <div className="lp-hero-glow" />
          <div className="lp-ring lp-ring-1" />
          <div className="lp-ring lp-ring-2" />
          <div className="lp-ring lp-ring-3" />
          <div className="lp-ring lp-ring-4" />

          <div className="lp-hero-content">
            <h1 className="lp-serif">When you can&rsquo;t carry it alone</h1>
            <p className="lp-hero-sub">
              Let the people who love you help &mdash; safely, privately, and on your terms.
              Money goes directly to your creditor. Never through you.
            </p>
            <div className="lp-hero-buttons">
              <Link href="/register" className="lp-btn-orange">
                Get started &mdash; it&rsquo;s free
              </Link>
              <button className="lp-btn-outline" onClick={() => scrollTo('how-it-works')}>
                See how it works
              </button>
            </div>
          </div>

          <div className="lp-trust-strip">
            <div className="lp-trust-item">
              <strong>&pound;1.8tn</strong>
              <span>UK consumer debt</span>
            </div>
            <div className="lp-trust-item">
              <strong>100%</strong>
              <span>Direct to creditor</span>
            </div>
            <div className="lp-trust-item">
              <strong>FCA</strong>
              <span>Compliant</span>
            </div>
          </div>
        </section>

        {/* ── How It Works ─────────────────────── */}
        <section id="how-it-works" className="lp-section reveal">
          <h2 className="lp-section-heading lp-serif">How Bolster works</h2>
          <div className="lp-steps">
            {[
              {
                num: '1',
                title: 'Link your debt',
                desc: "Add your creditor\u2019s sort code and account number. We verify it instantly with Confirmation of Payee.",
              },
              {
                num: '2',
                title: 'Create a private invite',
                desc: "Choose what your supporter can see \u2014 amount only, creditor name, or full balance. You\u2019re always in control.",
              },
              {
                num: '3',
                title: 'Supporter pays directly',
                desc: 'They click your link, choose an amount, and pay via open banking. Money goes straight to your creditor.',
              },
              {
                num: '4',
                title: 'Balance reduces',
                desc: 'Payment settles in ~90 seconds via Faster Payments. Your debt goes down. No middleman.',
              },
            ].map((step) => (
              <div key={step.num} className="lp-step-card">
                <div className="lp-step-num">{step.num}</div>
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Messaging Demo ───────────────────── */}
        <section className="lp-msg-section reveal" ref={messagingRef}>
          <h2 className="lp-section-heading lp-serif">Share privately. No public appeals.</h2>
          <div className="lp-tabs">
            <button
              className={`lp-tab ${activeTab === 'whatsapp' ? 'active' : ''}`}
              onClick={() => { setActiveTab('whatsapp'); setReplyVisible(false); setTimeout(() => setReplyVisible(true), 2000) }}
            >
              WhatsApp
            </button>
            <button
              className={`lp-tab ${activeTab === 'sms' ? 'active' : ''}`}
              onClick={() => { setActiveTab('sms'); setReplyVisible(false); setTimeout(() => setReplyVisible(true), 2000) }}
            >
              SMS
            </button>
          </div>
          <div className="lp-phone">
            <div className="lp-phone-notch" />
            {activeTab === 'whatsapp' ? (
              <div className="lp-chat">
                <div className="lp-bubble lp-bubble-out lp-bubble-wa-out">
                  Hey Mum, I know this is hard to ask but I&rsquo;m behind on my council tax. Could you help? No pressure at all.
                </div>
                <div className="lp-bubble lp-bubble-out lp-bubble-wa-out">
                  It goes straight to the council &mdash; not to me. Here&rsquo;s the link:
                  <br />
                  <span className="lp-bubble-link">bolster.app/pay/k8x2m</span>
                </div>
                <div className="lp-bubble lp-bubble-in lp-bubble-wa-in">
                  Of course love. Let me look at it now.
                </div>
                <div className={`lp-reply-chip ${replyVisible ? 'show' : ''}`}>
                  Mum paid &pound;200 &#x1F499;
                </div>
              </div>
            ) : (
              <div className="lp-chat">
                <div className="lp-bubble lp-bubble-out lp-bubble-sms-out">
                  Hi Mum, I&rsquo;m a bit behind on a bill. Would you be able to help? It pays the creditor directly, not me.
                </div>
                <div className="lp-bubble lp-bubble-out lp-bubble-sms-out">
                  Here&rsquo;s the link:
                  <br />
                  <span className="lp-bubble-link">bolster.app/pay/k8x2m</span>
                </div>
                <div className="lp-bubble lp-bubble-in lp-bubble-sms-in">
                  Done! Glad I could help. x
                </div>
                <div className={`lp-reply-chip ${replyVisible ? 'show' : ''}`}>
                  Mum paid &pound;150 &#x1F499;
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── Dashboard Preview ────────────────── */}
        <section className="lp-dash-section reveal">
          <h2 className="lp-section-heading lp-serif">Your dashboard. Your control.</h2>
          <div className="lp-dash-phone">
            <div className="lp-phone-notch" />
            <div className="lp-dash-balance">
              <div className="lp-dash-balance-label">Total debt</div>
              <div className="lp-dash-balance-amount">&pound;4,250.00</div>
              <div className="lp-dash-progress-track">
                <div className="lp-dash-progress-fill" />
              </div>
              <div className="lp-dash-progress-text">&pound;1,200 paid so far</div>
            </div>
            <div className="lp-dash-item">
              <div>
                <div className="lp-dash-item-name">Klarna</div>
                <div className="lp-dash-item-amount">&pound;850 remaining</div>
              </div>
              <span className="lp-dash-badge lp-badge-active">Active</span>
            </div>
            <div className="lp-dash-item">
              <div>
                <div className="lp-dash-item-name">Council Tax</div>
                <div className="lp-dash-item-amount">&pound;3,400 remaining</div>
              </div>
              <span className="lp-dash-badge lp-badge-pending">Pending</span>
            </div>
          </div>
        </section>

        {/* ── Features Grid ────────────────────── */}
        <section id="features" className="lp-section reveal">
          <h2 className="lp-section-heading lp-serif">Built for dignity</h2>
          <div className="lp-features">
            {[
              {
                title: 'Private by design',
                desc: 'You choose exactly what supporters see. No public pages. No social sharing. Just a private link between you and someone you trust.',
              },
              {
                title: 'Settles in seconds',
                desc: 'Payments route via UK Faster Payments and settle in ~90 seconds. No holding accounts. No delays.',
              },
              {
                title: 'Credit score protected',
                desc: "Paying down debt can only help. Bolster never touches your credit file \u2014 we just help money reach your creditor faster.",
              },
              {
                title: 'Dignity preserved',
                desc: 'No crowdfunding. No public appeals. No pity. Just practical help from people who care, delivered with respect.',
              },
            ].map((f) => (
              <div key={f.title} className="lp-feature-card">
                <div className="lp-feature-accent" />
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── CTA ──────────────────────────────── */}
        <section className="lp-cta reveal">
          <h2 className="lp-serif">Ready to let someone help?</h2>
          <p className="lp-cta-sub">
            Join Bolster today &mdash; it&rsquo;s free, private, and takes 2 minutes.
          </p>
          <Link href="/register" className="lp-btn-orange">
            Create your account
          </Link>
          <p className="lp-cta-small">No fees for recipients. Ever.</p>
        </section>

        {/* ── Footer ───────────────────────────── */}
        <footer id="about" className="lp-footer">
          <div className="lp-footer-top">
            <div>
              <div className="lp-footer-brand" style={{display:'flex', alignItems:'center', gap:'10px'}}>
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect width="32" height="32" rx="8" fill="#f97316"/>
                  <path d="M10 8 C10 8 16 6 22 8 L22 20 C22 24 16 26 16 26 C16 26 10 24 10 20 Z" fill="white" opacity="0.15"/>
                  <text x="16" y="22" textAnchor="middle" fill="white" fontFamily="serif" fontSize="15" fontWeight="700">B</text>
                </svg>
                <span style={{fontFamily:'Playfair Display,serif', fontSize:'1.3rem', fontWeight:600, color:'#f1f5f9', letterSpacing:'0.02em'}}>olster</span>
              </div>
              <p className="lp-footer-brand-desc">
                Helping people in financial hardship receive direct support from friends and family, with dignity.
              </p>
            </div>
            <div className="lp-footer-col">
              <h4>Product</h4>
              <a href="#" onClick={(e) => { e.preventDefault(); scrollTo('how-it-works') }}>How it works</a>
              <a href="#" onClick={(e) => { e.preventDefault(); scrollTo('features') }}>Features</a>
              <a href="#">Pricing</a>
            </div>
            <div className="lp-footer-col">
              <h4>Legal</h4>
              <a href="#">Privacy Policy</a>
              <a href="#">Terms of Service</a>
              <a href="#">Cookie Policy</a>
            </div>
            <div className="lp-footer-col">
              <h4>Company</h4>
              <a href="#">About</a>
              <a href="#">Contact</a>
              <a href="#">Careers</a>
            </div>
          </div>
          <div className="lp-footer-bottom">
            <span className="lp-footer-legal">
              &copy; 2025 Bolster Financial Services Ltd. Registered in England &amp; Wales.
            </span>
            <span className="lp-footer-legal">
              Bolster operates as an agent of TrueLayer under their FCA PISP licence.
            </span>
          </div>
        </footer>
      </div>
    </>
  )
}
