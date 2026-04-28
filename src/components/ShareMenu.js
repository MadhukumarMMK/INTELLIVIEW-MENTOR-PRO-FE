import React, { useState, useRef, useEffect } from "react";
import { Share2, MessageCircle, Mail, Link as LinkIcon, Check } from "lucide-react";
import "./ShareMenu.css";

// Inline brand SVGs — lucide-react removed brand-name icons in newer versions
const LinkedinIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.05-1.86-3.05-1.86 0-2.14 1.45-2.14 2.95v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.63-1.86 3.36-1.86 3.59 0 4.25 2.36 4.25 5.44v6.31zM5.34 7.43a2.06 2.06 0 11.01-4.12 2.06 2.06 0 010 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.23 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.23 0z"/>
  </svg>
);
const TwitterXIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);
const FacebookIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M24 12.073c0-6.627-5.373-12-12-12S0 5.446 0 12.073c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.79-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.49 0-1.955.925-1.955 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
);

/**
 * Professional share menu.
 * Shows a compact arrow/share button; on click, expands a popover.
 *
 * Props:
 *   platforms — array of platform IDs to include. Defaults to all.
 *               Allowed: 'linkedin' | 'twitter' | 'facebook' | 'whatsapp' | 'email' | 'copy'
 *               Admin contexts typically use ['linkedin', 'whatsapp', 'copy'].
 */
export default function ShareMenu({
  url,
  text = "",
  title = "",
  platforms = ['linkedin', 'twitter', 'facebook', 'whatsapp', 'email', 'copy']
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(text);
  const encodedTitle = encodeURIComponent(title);

  const ALL_TARGETS = {
    linkedin: {
      id: "linkedin",
      label: "LinkedIn",
      Icon: LinkedinIcon,
      color: "#0a66c2",
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`
    },
    twitter: {
      id: "twitter",
      label: "X (Twitter)",
      Icon: TwitterXIcon,
      color: "#000000",
      href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`
    },
    facebook: {
      id: "facebook",
      label: "Facebook",
      Icon: FacebookIcon,
      color: "#1877f2",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`
    },
    whatsapp: {
      id: "whatsapp",
      label: "WhatsApp",
      Icon: MessageCircle,
      color: "#25D366",
      href: `https://wa.me/?text=${encodedText}%20${encodedUrl}`
    },
    email: {
      id: "email",
      label: "Email",
      Icon: Mail,
      color: "#ea4335",
      href: `mailto:?subject=${encodedTitle}&body=${encodedText}%20${encodedUrl}`
    }
  };
  const targets = platforms
    .filter(p => p !== 'copy' && ALL_TARGETS[p])
    .map(p => ALL_TARGETS[p]);
  const showCopy = platforms.includes('copy');

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  // If the browser supports the native Web Share API, prefer it on small screens
  const nativeShare = async () => {
    if (navigator.share && window.matchMedia('(max-width: 640px)').matches) {
      try {
        await navigator.share({ title, text, url });
        return true;
      } catch { /* user cancelled — fall through */ }
    }
    return false;
  };

  const handleButtonClick = async () => {
    const used = await nativeShare();
    if (!used) setOpen(o => !o);
  };

  return (
    <div className={`share-menu ${open ? 'share-menu-open' : ''}`} ref={rootRef}>
      <button
        className="share-btn"
        onClick={handleButtonClick}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Share2 size={15} strokeWidth={2} />
        <span>Share</span>
      </button>
      {open && (
        <div className="share-popover" role="menu">
          <div className="share-popover-head">Share this profile</div>
          <div className="share-targets">
            {targets.map(t => {
              const Icon = t.Icon;
              return (
                <a
                  key={t.id}
                  href={t.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="share-target"
                  onClick={() => setOpen(false)}
                  style={{ '--share-accent': t.color }}
                >
                  <span className="share-target-icon"><Icon size={18} strokeWidth={2} /></span>
                  <span>{t.label}</span>
                </a>
              );
            })}
          </div>
          {showCopy && (
            <button className="share-copy" onClick={copyLink}>
              {copied ? <Check size={15} strokeWidth={2.5} /> : <LinkIcon size={15} strokeWidth={2} />}
              <span>{copied ? "Link copied!" : "Copy link"}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
