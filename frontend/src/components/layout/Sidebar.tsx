import { NavLink } from 'react-router-dom'

interface NavItem {
  to: string
  icon: string
  label: string
}

const toolLinks: NavItem[] = [
  { to: '/', icon: '\u266B', label: 'Text to Speech' },
  { to: '/editor', icon: '\u270E', label: 'Writing Editor' },
  { to: '/vocabulary', icon: '\uD83D\uDCDA', label: 'Vocabulary' },
  { to: '/memorization', icon: '\uD83E\uDDE0', label: 'Memorization' },
]

const ykiLinks: NavItem[] = [
  { to: '/yki', icon: '\uD83C\uDF93', label: 'Dashboard' },
  { to: '/yki/reading', icon: '\uD83D\uDCD6', label: 'Reading' },
  { to: '/yki/writing', icon: '\uD83D\uDCDD', label: 'Writing' },
  { to: '/yki/listening', icon: '\uD83C\uDFA7', label: 'Listening' },
  { to: '/yki/speaking', icon: '\uD83C\uDF99\uFE0F', label: 'Speaking' },
]

const manageLinks: NavItem[] = [
  { to: '/knowledge', icon: '\uD83D\uDCC2', label: 'Knowledge Base' },
  { to: '/settings', icon: '\u2699', label: 'Settings' },
]

function NavSection({ label, links }: { label: string; links: NavItem[] }) {
  return (
    <div className="nav-section">
      <div className="nav-label">{label}</div>
      {links.map(link => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.to === '/'}
          className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
        >
          <span className="nav-icon">{link.icon}</span>
          <span>{link.label}</span>
        </NavLink>
      ))}
    </div>
  )
}

export default function Sidebar() {
  return (
    <nav className="sidebar">
      <div className="sidebar-header">
        <h1 className="logo">PiedPiper</h1>
        <span className="logo-sub">Swedish Language Learning & YKI Prep</span>
      </div>
      <NavSection label="Tools" links={toolLinks} />
      <NavSection label="YKI Exam" links={ykiLinks} />
      <NavSection label="Manage" links={manageLinks} />
    </nav>
  )
}
