import type { SVGAttributes } from 'react'

export type IconName =
  | 'add'
  | 'arrow-left'
  | 'award'
  | 'billing'
  | 'calendar'
  | 'card'
  | 'check'
  | 'chevron-down'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-up'
  | 'clinical'
  | 'close'
  | 'copy'
  | 'error'
  | 'credential'
  | 'drag'
  | 'eye'
  | 'eye-off'
  | 'face'
  | 'fullscreen'
  | 'home'
  | 'hospital'
  | 'info'
  | 'lock'
  | 'menu'
  | 'mic'
  | 'minimize'
  | 'moon'
  | 'notification'
  | 'organization'
  | 'logout'
  | 'pharmacy'
  | 'pill'
  | 'print'
  | 'refresh'
  | 'residents'
  | 'roadmap'
  | 'search'
  | 'settings'
  | 'emergency'
  | 'sparkles'
  | 'success'
  | 'sun'
  | 'tasks'
  | 'user'
  | 'warning'

export function Icon({ name, className = '', ...props }: SVGAttributes<SVGSVGElement> & { name: IconName }) {
  return <svg className={`ui-icon ${className}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>
    {iconPath(name)}
  </svg>
}

function iconPath(name: IconName) {
  switch (name) {
    case 'add': return <><path d="M12 5v14" /><path d="M5 12h14" /></>
    case 'arrow-left': return <><path d="m15 18-6-6 6-6" /><path d="M9 12h10" /></>
    case 'award': return <><circle cx="12" cy="8" r="6" /><path d="m15.48 12.89 1.52 8.53a.5.5 0 0 1-.81.47L12.6 19.2a1 1 0 0 0-1.2 0l-3.58 2.69a.5.5 0 0 1-.81-.47l1.51-8.53" /></>
    case 'billing': return <><path d="M6 2h12v20l-3-2-3 2-3-2-3 2Z" /><path d="M9 7h6M9 11h6M9 15h3" /></>
    case 'calendar': return <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>
    case 'card': return <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 9h18M7 14h4" /></>
    case 'check': return <path d="m5 12 4 4L19 6" />
    case 'chevron-down': return <path d="m6 9 6 6 6-6" />
    case 'chevron-left': return <path d="m15 18-6-6 6-6" />
    case 'chevron-right': return <path d="m9 18 6-6-6-6" />
    case 'chevron-up': return <path d="m6 15 6-6 6 6" />
    case 'clinical': return <><path d="M12 2v20M2 12h20" /><circle cx="12" cy="12" r="9" /></>
    case 'close': return <><path d="m6 6 12 12" /><path d="m18 6-12 12" /></>
    case 'copy': return <><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></>
    case 'error': return <><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></>
    case 'credential': return <><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M9 6h6M8 17h8" /><path d="m9 13 2 2 4-4" /></>
    case 'drag': return <><circle cx="9" cy="6" r="1" fill="currentColor" stroke="none" /><circle cx="15" cy="6" r="1" fill="currentColor" stroke="none" /><circle cx="9" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="9" cy="18" r="1" fill="currentColor" stroke="none" /><circle cx="15" cy="18" r="1" fill="currentColor" stroke="none" /></>
    case 'eye': return <><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>
    case 'eye-off': return <><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><line x1="2" x2="22" y1="2" y2="22" /></>
    case 'face': return <><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><circle cx="9" cy="10" r=".5" /><circle cx="15" cy="10" r=".5" /><path d="M8.5 14a5 5 0 0 0 7 0" /></>
    case 'fullscreen': return <><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" /></>
    case 'home': return <><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10M9 20v-6h6v6" /></>
    case 'hospital': return <><path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M9 9h6M9 13h6M9 17h6M12 5v4" /></>
    case 'info': return <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>
    case 'lock': return <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>
    case 'menu': return <><path d="M4 7h16M4 12h16M4 17h16" /></>
    case 'mic': return <><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" x2="12" y1="19" y2="22" /><line x1="8" x2="16" y1="22" y2="22" /></>
    case 'minimize': return <><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" /></>
    case 'moon': return <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    case 'notification': return <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>
    case 'organization': return <><path d="M4 21V5h10v16M14 10h6v11M8 9h2M8 13h2M8 17h2M17 14h1M17 17h1M2 21h20" /></>
    case 'logout': return <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5" /></>
    case 'pharmacy': return <><path d="M5 4h14M8 4v5l-3 5a4 4 0 0 0 3.5 6h7a4 4 0 0 0 3.5-6l-3-5V4" /><path d="M7 13h10" /></>
    case 'pill': return <><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" /><path d="m8.5 8.5 7 7" /></>
    case 'print': return <><path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M7 14h10v7H7zM17 11h.01" /></>
    case 'refresh': return <><path d="M20 6v5h-5" /><path d="M4 18v-5h5" /><path d="M18.5 9A7 7 0 0 0 6 6.5L4 9M5.5 15A7 7 0 0 0 18 17.5l2-2.5" /></>
    case 'residents': return <><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0" /><circle cx="17" cy="9" r="2" /><path d="M15 15a5 5 0 0 1 6 5" /></>
    case 'roadmap': return <><path d="M6 3v18M18 3v18" /><path d="M6 6h8l4 4M18 14h-8l-4 4" /></>
    case 'search': return <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>
    case 'settings': return <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>
    case 'emergency': return <><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z" /></>
    case 'sparkles': return <><path d="m12 3 1.25 3.75L17 8l-3.75 1.25L12 13l-1.25-3.75L7 8l3.75-1.25Z" /><path d="m18 13 .85 2.15L21 16l-2.15.85L18 19l-.85-2.15L15 16l2.15-.85ZM5 14l.65 1.35L7 16l-1.35.65L5 18l-.65-1.35L3 16l1.35-.65Z" /></>
    case 'success': return <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16.5 9" /></>
    case 'sun': return <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></>
    case 'tasks': return <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="m8 9 2 2 4-4M8 16h8" /></>
    case 'user': return <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>
    case 'warning': return <><path d="M12 3 2.5 20h19Z" /><path d="M12 9v5M12 17h.01" /></>
  }
}
