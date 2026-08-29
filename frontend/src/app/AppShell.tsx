import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { LoginScreen } from '../features/auth/LoginScreen'
import { Dashboard } from '../features/dashboard/Dashboard'
import type { Department, Organization, Session } from '../shared/model'
import { createRhnApi, errorMessage, type Credentials, type RhnApi, type WorkContextOption, type WorkContextType } from '../shared/rhnApi'
import { Alert, Button, Dialog, EmptyState, Icon, IconButton, LoadingState, PlannedPage, StatusBadge, type IconName } from '../shared/ui'
import { formatTime } from '../shared/format'

const DoctorWorkstation = lazy(() => import('../features/outpatient/DoctorWorkstation')
  .then((module) => ({ default: module.DoctorWorkstation })))
const ResidentCenterWorkspace = lazy(() => import('../features/residents/ResidentCenterWorkspace')
  .then((module) => ({ default: module.ResidentCenterWorkspace })))
const DictionaryManagement = lazy(() => import('../features/settings/DictionaryManagement')
  .then((module) => ({ default: module.DictionaryManagement })))
const DictionaryAttributeManagement = lazy(() => import('../features/settings/DictionaryAttributeManagement')
  .then((module) => ({ default: module.DictionaryAttributeManagement })))
const AccessControlManagement = lazy(() => import('../features/settings/AccessControlManagement')
  .then((module) => ({ default: module.AccessControlManagement })))
const ParameterManagement = lazy(() => import('../features/settings/ParameterManagement')
  .then((module) => ({ default: module.ParameterManagement })))
const OrganizationPersonnelManagement = lazy(() => import('../features/settings/OrganizationPersonnelManagement')
  .then((module) => ({ default: module.OrganizationPersonnelManagement })))
const BasicDataManagement = lazy(() => import('../features/settings/BasicDataManagement')
  .then((module) => ({ default: module.BasicDataManagement })))
const GridAddressManagement = lazy(() => import('../features/settings/GridAddressManagement')
  .then((module) => ({ default: module.GridAddressManagement })))
const BusinessPartnerManagement = lazy(() => import('../features/settings/BusinessPartnerManagement')
  .then((module) => ({ default: module.BusinessPartnerManagement })))
const TasksWorkspace = lazy(() => import('../features/tasks/TasksWorkspace')
  .then((module) => ({ default: module.TasksWorkspace })))
const PharmacyWorkspace = lazy(() => import('../features/pharmacy/PharmacyWorkspace')
  .then((module) => ({ default: module.PharmacyWorkspace })))
const WarehouseManagement = lazy(() => import('../features/pharmacy/WarehouseManagement')
  .then((module) => ({ default: module.WarehouseManagement })))
const BillingWorkspace = lazy(() => import('../features/billing/BillingWorkspace')
  .then((module) => ({ default: module.BillingWorkspace })))
const CareManagementWorkspace = lazy(() => import('../features/care/CareManagementWorkspace')
  .then((module) => ({ default: module.CareManagementWorkspace })))
const SchedulingWorkspace = lazy(() => import('../features/outpatient/SchedulingWorkspace')
  .then((module) => ({ default: module.SchedulingWorkspace })))
const OutpatientRegistrationWorkspace = lazy(() => import('../features/outpatient/RegistrationWorkspace')
  .then((module) => ({ default: module.OutpatientRegistrationWorkspace })))

export interface ClinicalContext {
  organization: Organization
  department: Department
}

interface AuthenticatedState {
  session: Session
  api: RhnApi
  activeContexts: Partial<Record<WorkContextType, WorkContextSlot>>
}

interface WorkContextSlot {
  option: WorkContextOption
  api: RhnApi
  clinicalContext: ClinicalContext
}

interface WorkspaceTab {
  id: string
  path: string
  title: string
  icon: IconName
  closeable: boolean
}

interface NavigationNodeBase {
  id: string
  label: string
  icon?: IconName
  badge?: string
  muted?: boolean
  requiredAuthority?: string
}

interface NavigationItem extends NavigationNodeBase {
  to: string
  end?: boolean
  children?: never
}

interface NavigationDirectory extends NavigationNodeBase {
  to?: never
  end?: never
  children: NavigationItem[]
}

type NavigationNode = NavigationItem | NavigationDirectory

type WorkspaceTabAction = 'close-active' | 'close-left' | 'close-right' | 'close-others' | 'close-all'

const HOME_TAB: WorkspaceTab = { id: '/', path: '/', title: '工作台', icon: 'home', closeable: false }

const WORK_CONTEXT_LABELS: Record<WorkContextType, string> = {
  CLINICAL: '诊疗',
  PHARMACY: '药房',
  INVENTORY: '库房',
  GENERAL: '综合',
}

function workContextTypeForPath(path: string): WorkContextType {
  const pathname = path.split(/[?#]/, 1)[0]
  if (pathname === '/pharmacy/warehouse') return 'INVENTORY'
  if (pathname === '/pharmacy') return 'PHARMACY'
  if (pathname.startsWith('/outpatient/') || pathname === '/residents' || pathname === '/care-management'
    || pathname === '/billing') return 'CLINICAL'
  return 'CLINICAL'
}

function workContextKey(context: Pick<WorkContextOption, 'organizationId' | 'departmentId'>) {
  return `${context.organizationId}:${context.departmentId ?? ''}`
}

const DEFAULT_EXPANDED_DIRECTORIES = ['outpatient-services']

const NAVIGATION_NODES: NavigationNode[] = [
  { id: 'home', label: '工作台', icon: 'home', to: '/', end: true, requiredAuthority: 'PORTAL.ACCESS' },
  { id: 'tasks', label: '任务中心', icon: 'tasks', badge: '已接入', to: '/tasks', requiredAuthority: 'TASK.READ' },
  {
    id: 'outpatient-services', label: '门诊诊疗', icon: 'clinical', children: [
      { id: 'outpatient-registration', label: '门诊挂号', icon: 'residents', to: '/outpatient/registration', requiredAuthority: 'OUTPATIENT_REGISTRATION.ACCESS' },
      { id: 'outpatient-reception', label: '门诊医生站', icon: 'clinical', to: '/outpatient/reception', requiredAuthority: 'OUTPATIENT_RECEPTION.ACCESS' },
      { id: 'outpatient-scheduling', label: '排班与号源', icon: 'tasks', badge: '简易', to: '/outpatient/scheduling', requiredAuthority: 'OUTPATIENT_SCHEDULING.ACCESS' },
      { id: 'billing', label: '费用结算', icon: 'billing', badge: 'M3.4', to: '/billing', requiredAuthority: 'BILLING.ACCESS' },
    ],
  },
  {
    id: 'patient-services', label: '患者服务', icon: 'residents', children: [
      { id: 'residents', label: '居民中心', icon: 'residents', badge: 'MPI', to: '/residents', requiredAuthority: 'RESIDENT.ACCESS' },
      { id: 'care-management', label: '连续照护', icon: 'clinical', badge: 'M4.1', to: '/care-management', requiredAuthority: 'CARE_MANAGEMENT.ACCESS' },
    ],
  },
  {
    id: 'pharmacy-management', label: '药事管理', icon: 'pharmacy', children: [
      { id: 'pharmacy', label: '门诊药房', icon: 'pharmacy', badge: 'M3.3', to: '/pharmacy', end: true, requiredAuthority: 'PHARMACY.ACCESS' },
      { id: 'warehouse', label: '库房管理', icon: 'pharmacy', badge: '基础', to: '/pharmacy/warehouse', requiredAuthority: 'PHARMACY_WAREHOUSE.ACCESS' },
    ],
  },
  {
    id: 'operations-config', label: '运营配置', icon: 'roadmap', children: [
      { id: 'master-data', label: '基础数据中心', icon: 'clinical', to: '/settings/master-data', requiredAuthority: 'MASTER_DATA.ACCESS' },
      { id: 'business-partners', label: '厂商与供应商', icon: 'pharmacy', to: '/settings/partners', requiredAuthority: 'BUSINESS_PARTNER.ACCESS' },
      { id: 'organization', label: '组织与人员', icon: 'residents', to: '/settings/organization', requiredAuthority: 'ORGANIZATION.ACCESS' },
      { id: 'grid-addresses', label: '网格地址', icon: 'roadmap', to: '/settings/grid-addresses', requiredAuthority: 'GRID_ADDRESS.ACCESS' },
    ],
  },
  {
    id: 'system-config', label: '系统配置', icon: 'settings', children: [
      { id: 'parameters', label: '参数管理', icon: 'settings', to: '/settings/parameters', requiredAuthority: 'CONFIGURATION.ACCESS' },
      { id: 'dictionaries', label: '字典管理', icon: 'settings', to: '/settings/dictionaries', requiredAuthority: 'DICTIONARY.ACCESS' },
      { id: 'dictionary-attributes', label: '字典扩展配置', icon: 'settings', to: '/settings/dictionary-attributes', requiredAuthority: 'DICTIONARY_ATTRIBUTE.ACCESS' },
      { id: 'access-control', label: '角色与权限', icon: 'settings', to: '/settings/access-control', requiredAuthority: 'IAM.MANAGE' },
    ],
  },
]

function filterNavigation(nodes: NavigationNode[], authorities: Set<string>): NavigationNode[] {
  const result: NavigationNode[] = []
  for (const node of nodes) {
    if (node.children) {
      const children = filterNavigation(node.children, authorities) as NavigationItem[]
      if (children.length) result.push({ ...node, children } as NavigationDirectory)
    } else if (!node.requiredAuthority || authorities.has(node.requiredAuthority)) {
      result.push(node)
    }
  }
  return result
}

function requiredAuthorityForPath(nodes: NavigationNode[], pathname: string): string | undefined {
  for (const node of nodes) {
    if (node.to && navigationNodeMatchesPath(node, pathname)) return node.requiredAuthority
    const child = node.children ? requiredAuthorityForPath(node.children, pathname) : undefined
    if (child) return child
  }
  return undefined
}

const NAVIGATION_DIRECTORY_IDS = new Set(
  NAVIGATION_NODES.filter((node) => node.children?.length).map((node) => node.id),
)

function initialExpandedDirectories() {
  const stored = localStorage.getItem('rhn.navigation.expanded')
  if (!stored) return new Set(DEFAULT_EXPANDED_DIRECTORIES)
  try {
    const ids = JSON.parse(stored)
    if (!Array.isArray(ids)) return new Set(DEFAULT_EXPANDED_DIRECTORIES)
    const validIds = ids.filter((id): id is string => typeof id === 'string' && NAVIGATION_DIRECTORY_IDS.has(id))
    return new Set(validIds.length > 0 ? validIds : DEFAULT_EXPANDED_DIRECTORIES)
  } catch {
    return new Set(DEFAULT_EXPANDED_DIRECTORIES)
  }
}

function navigationNodeMatchesPath(node: NavigationNode, pathname: string): boolean {
  if (node.to) return node.end ? pathname === node.to : pathname === node.to || pathname.startsWith(`${node.to}/`)
  return node.children?.some((child) => navigationNodeMatchesPath(child, pathname)) ?? false
}

function navigationAncestorsForPath(nodes: NavigationNode[], pathname: string, ancestors: string[] = []): string[] | null {
  for (const node of nodes) {
    if (node.to && navigationNodeMatchesPath(node, pathname)) return ancestors
    if (node.children) {
      const match = navigationAncestorsForPath(node.children, pathname, [...ancestors, node.id])
      if (match) return match
    }
  }
  return null
}

function tabForPath(pathname: string): WorkspaceTab | null {
  if (pathname === '/') return HOME_TAB
  if (pathname === '/residents') return { id: pathname, path: pathname, title: '居民中心', icon: 'residents', closeable: true }
  if (pathname === '/tasks') return { id: pathname, path: pathname, title: '任务中心', icon: 'tasks', closeable: true }
  if (pathname === '/pharmacy') return { id: pathname, path: pathname, title: '药事管理', icon: 'pharmacy', closeable: true }
  if (pathname === '/pharmacy/warehouse') return { id: pathname, path: pathname, title: '库房管理', icon: 'pharmacy', closeable: true }
  if (pathname === '/billing') return { id: pathname, path: pathname, title: '费用结算', icon: 'billing', closeable: true }
  if (pathname === '/care-management') return { id: pathname, path: pathname, title: '连续照护', icon: 'clinical', closeable: true }
  if (pathname === '/outpatient/registration') return { id: pathname, path: pathname, title: '门诊挂号', icon: 'residents', closeable: true }
  if (pathname === '/outpatient/scheduling') return { id: pathname, path: pathname, title: '排班与号源', icon: 'clinical', closeable: true }
  if (pathname === '/outpatient/reception') return { id: pathname, path: pathname, title: '门诊医生站', icon: 'residents', closeable: true }
  if (pathname === '/settings/master-data') return { id: pathname, path: pathname, title: '基础数据中心', icon: 'clinical', closeable: true }
  if (pathname === '/settings/partners') return { id: pathname, path: pathname, title: '厂商与供应商', icon: 'pharmacy', closeable: true }
  if (pathname === '/settings/organization') return { id: pathname, path: pathname, title: '组织与人员', icon: 'residents', closeable: true }
  if (pathname === '/settings/grid-addresses') return { id: pathname, path: pathname, title: '网格地址', icon: 'roadmap', closeable: true }
  if (pathname === '/settings/parameters') return { id: pathname, path: pathname, title: '参数管理', icon: 'settings', closeable: true }
  if (pathname === '/settings/dictionaries') return { id: pathname, path: pathname, title: '字典管理', icon: 'settings', closeable: true }
  if (pathname === '/settings/dictionary-attributes') return { id: pathname, path: pathname, title: '字典扩展配置', icon: 'settings', closeable: true }
  if (pathname === '/settings/access-control') return { id: pathname, path: pathname, title: '角色与权限', icon: 'settings', closeable: true }
  if (pathname.startsWith('/roadmap/')) {
    const module = pathname.slice('/roadmap/'.length)
    const modules: Record<string, { title: string; icon: IconName }> = {
      pharmacy: { title: '药事管理', icon: 'pharmacy' },
      billing: { title: '费用结算', icon: 'billing' },
    }
    const metadata = modules[module] ?? { title: '后续业务模块', icon: 'roadmap' as IconName }
    return { id: pathname, path: pathname, ...metadata, closeable: true }
  }
  return null
}

export function AppShell() {
  const [authenticated, setAuthenticated] = useState<AuthenticatedState | null>(null)
  const [loginError, setLoginError] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [mobileLayout, setMobileLayout] = useState(() => window.matchMedia('(max-width: 760px)').matches)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('rhn.sidebar.collapsed') === 'true')
  const [expandedDirectories, setExpandedDirectories] = useState(initialExpandedDirectories)
  const [hoveredNavigation, setHoveredNavigation] = useState<{ node: NavigationNode; top: number } | null>(null)
  const [collapsedDirectory, setCollapsedDirectory] = useState<{ node: NavigationNode; top: number } | null>(null)
  const navigationHoverOpenTimer = useRef<number | null>(null)
  const navigationHoverCloseTimer = useRef<number | null>(null)
  const [tabs, setTabs] = useState<WorkspaceTab[]>([HOME_TAB])
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()

  const activeTab = tabForPath(location.pathname)
  const activeTabId = activeTab?.id ?? HOME_TAB.id

  useEffect(() => {
    localStorage.setItem('rhn.sidebar.collapsed', String(sidebarCollapsed))
  }, [sidebarCollapsed])

  useEffect(() => {
    localStorage.setItem('rhn.navigation.expanded', JSON.stringify([...expandedDirectories]))
  }, [expandedDirectories])

  useEffect(() => {
    const ancestors = navigationAncestorsForPath(NAVIGATION_NODES, location.pathname)
    if (!ancestors?.length) return
    setExpandedDirectories((current) => {
      const next = new Set(current)
      ancestors.forEach((id) => next.add(id))
      return next.size === current.size ? current : next
    })
  }, [location.pathname])

  useEffect(() => {
    if (sidebarCollapsed && !mobileLayout) return
    if (navigationHoverOpenTimer.current) window.clearTimeout(navigationHoverOpenTimer.current)
    if (navigationHoverCloseTimer.current) window.clearTimeout(navigationHoverCloseTimer.current)
    setHoveredNavigation(null)
    setCollapsedDirectory(null)
  }, [mobileLayout, sidebarCollapsed])

  useEffect(() => () => {
    if (navigationHoverOpenTimer.current) window.clearTimeout(navigationHoverOpenTimer.current)
    if (navigationHoverCloseTimer.current) window.clearTimeout(navigationHoverCloseTimer.current)
  }, [])

  useEffect(() => {
    if (navigationHoverOpenTimer.current) window.clearTimeout(navigationHoverOpenTimer.current)
    if (navigationHoverCloseTimer.current) window.clearTimeout(navigationHoverCloseTimer.current)
    setCollapsedDirectory(null)
    setHoveredNavigation(null)
  }, [location.pathname])

  useEffect(() => {
    if (!collapsedDirectory) return
    const closeFlyout = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return
      if (!event.target.closest('.collapsed-nav-flyout') && !event.target.closest('.sidebar')) setCollapsedDirectory(null)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCollapsedDirectory(null)
    }
    document.addEventListener('pointerdown', closeFlyout)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeFlyout)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [collapsedDirectory])

  useEffect(() => {
    if (!authenticated) return
    if (location.pathname === '/settings') {
      navigate('/settings/parameters', { replace: true })
      return
    }
    const nextTab = tabForPath(location.pathname)
    if (!nextTab) {
      navigate('/', { replace: true })
      return
    }
    const currentPath = `${location.pathname}${location.search}${location.hash}`
    setTabs((current) => {
      const existing = current.find((tab) => tab.id === nextTab.id)
      if (existing) return current.map((tab) => tab.id === nextTab.id ? { ...tab, path: currentPath } : tab)
      return [...current, { ...nextTab, path: currentPath }]
    })
  }, [authenticated, location.hash, location.pathname, location.search, navigate])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)')
    const updateLayout = (event: MediaQueryListEvent | MediaQueryList) => {
      setMobileLayout(event.matches)
      if (!event.matches) setSidebarOpen(false)
    }
    updateLayout(media)
    media.addEventListener('change', updateLayout)
    return () => media.removeEventListener('change', updateLayout)
  }, [])

  useEffect(() => {
    if (!sidebarOpen) return
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const navigation = document.getElementById('primary-navigation')
    const visibleNavigationItems = () => Array.from(
      navigation?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? [],
    ).filter((item) => item.getClientRects().length > 0 && !item.closest('[inert]'))
    visibleNavigationItems()[0]?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setSidebarOpen(false)
      }
      const navigationItems = visibleNavigationItems()
      if (event.key === 'Tab' && navigationItems.length > 0) {
        const first = navigationItems[0]
        const last = navigationItems[navigationItems.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus()
    }
  }, [sidebarOpen])

  async function login(credentials: Credentials) {
    const api = createRhnApi(credentials)
    setLoginError('')
    try {
      const session = await api.session.current()
      if (!session.workContexts.length) throw { message: '当前账号没有有效的机构与科室工作上下文' }
      const organizations = await api.organization.list()
      const departmentCache = new Map<string, Department[]>()
      const activeContexts: Partial<Record<WorkContextType, WorkContextSlot>> = {}
      for (const contextType of Object.keys(WORK_CONTEXT_LABELS) as WorkContextType[]) {
        const available = session.workContexts.filter((context) => context.workContextType === contextType)
        if (!available.length) continue
        const storedKey = localStorage.getItem(`rhn.work-context.${contextType}`)
        const selected = available.find((context) => workContextKey(context) === storedKey) ?? available[0]
        const organization = organizations.find((item) => item.id === selected.organizationId)
        if (!organization) continue
        let departments = departmentCache.get(organization.id)
        if (!departments) {
          departments = await api.organization.departments(organization.id)
          departmentCache.set(organization.id, departments)
        }
        const department = departments.find((item) => item.id === selected.departmentId)
        if (!department) continue
        activeContexts[contextType] = {
          option: selected,
          api: api.withWorkContext(selected),
          clinicalContext: { organization, department },
        }
      }
      if (!Object.keys(activeContexts).length) throw { message: '当前账号没有可用的科室工作上下文' }
      setAuthenticated({ session, api, activeContexts })
      navigate('/')
    } catch (error) {
      setLoginError(errorMessage(error))
    }
  }

  async function switchWorkContext(contextType: WorkContextType, contextKey: string) {
    if (!authenticated) return
    const selected = authenticated.session.workContexts.find((context) =>
      context.workContextType === contextType && workContextKey(context) === contextKey)
    if (!selected) return
    const organizations = await authenticated.api.organization.list()
    const organization = organizations.find((item) => item.id === selected.organizationId)
    if (!organization) return
    const departments = await authenticated.api.organization.departments(organization.id)
    const department = departments.find((item) => item.id === selected.departmentId)
    if (!department) return
    localStorage.setItem(`rhn.work-context.${contextType}`, contextKey)
    setAuthenticated((current) => current ? {
      ...current,
      activeContexts: {
        ...current.activeContexts,
        [contextType]: {
          option: selected,
          api: current.api.withWorkContext(selected),
          clinicalContext: { organization, department },
        },
      },
    } : current)
    await queryClient.invalidateQueries({ refetchType: 'active' })
  }

  function logout() {
    queryClient.clear()
    setTabs([HOME_TAB])
    setAuthenticated(null)
    navigate('/')
  }

  function closeTab(tabId: string) {
    const index = tabs.findIndex((tab) => tab.id === tabId)
    if (index < 0 || !tabs[index].closeable) return
    const remaining = tabs.filter((tab) => tab.id !== tabId)
    setTabs(remaining)
    if (tabId === activeTabId) {
      navigate((remaining[index] ?? remaining[index - 1] ?? HOME_TAB).path)
    }
  }

  function manageTabs(action: WorkspaceTabAction, targetTabId = activeTabId) {
    if (action === 'close-active') {
      closeTab(targetTabId)
      return
    }
    const targetIndex = tabs.findIndex((tab) => tab.id === targetTabId)
    if (targetIndex < 0) return
    const remaining = tabs.filter((tab, index) => {
      if (!tab.closeable) return true
      if (action === 'close-left') return index >= targetIndex
      if (action === 'close-right') return index <= targetIndex
      if (action === 'close-others') return tab.id === targetTabId
      return false
    })
    setTabs(remaining)
    if (!remaining.some((tab) => tab.id === activeTabId)) {
      navigate(remaining.find((tab) => tab.id === targetTabId)?.path ?? HOME_TAB.path)
    }
  }

  function toggleDirectory(directoryId: string) {
    setExpandedDirectories((current) => {
      const next = new Set(current)
      if (next.has(directoryId)) next.delete(directoryId)
      else next.add(directoryId)
      return next
    })
  }

  function openCollapsedDirectory(node: NavigationNode, element: HTMLElement) {
    const bounds = element.getBoundingClientRect()
    const top = Math.max(8, Math.min(bounds.top, window.innerHeight - 320))
    if (navigationHoverOpenTimer.current) window.clearTimeout(navigationHoverOpenTimer.current)
    if (navigationHoverCloseTimer.current) window.clearTimeout(navigationHoverCloseTimer.current)
    setHoveredNavigation(null)
    setCollapsedDirectory({ node, top })
  }

  function handleCollapsedNavigationHover(node: NavigationNode, element: HTMLElement) {
    if (!collapsedNavigation) return
    if (navigationHoverOpenTimer.current) window.clearTimeout(navigationHoverOpenTimer.current)
    if (navigationHoverCloseTimer.current) window.clearTimeout(navigationHoverCloseTimer.current)
    const bounds = element.getBoundingClientRect()
    const top = Math.max(8, Math.min(bounds.top, window.innerHeight - 48))
    if (node.children?.length) {
      setHoveredNavigation(null)
      if (collapsedDirectory?.node.id === node.id) return
      navigationHoverOpenTimer.current = window.setTimeout(() => {
        setCollapsedDirectory({ node, top: Math.max(8, Math.min(bounds.top, window.innerHeight - 320)) })
      }, 140)
      return
    }
    setCollapsedDirectory(null)
    setHoveredNavigation({ node, top })
  }

  function handleCollapsedNavigationHoverEnd(node: NavigationNode) {
    if (navigationHoverOpenTimer.current) window.clearTimeout(navigationHoverOpenTimer.current)
    if (!node.children?.length) {
      navigationHoverCloseTimer.current = window.setTimeout(() => setHoveredNavigation(null), 160)
      return
    }
    if (collapsedDirectory?.node.id !== node.id) return
    navigationHoverCloseTimer.current = window.setTimeout(() => setCollapsedDirectory(null), 220)
  }

  function keepCollapsedDirectoryOpen() {
    if (navigationHoverCloseTimer.current) window.clearTimeout(navigationHoverCloseTimer.current)
  }

  function scheduleCollapsedDirectoryClose() {
    if (navigationHoverCloseTimer.current) window.clearTimeout(navigationHoverCloseTimer.current)
    navigationHoverCloseTimer.current = window.setTimeout(() => setCollapsedDirectory(null), 220)
  }

  function scheduleCollapsedNavigationPreviewClose() {
    if (navigationHoverCloseTimer.current) window.clearTimeout(navigationHoverCloseTimer.current)
    navigationHoverCloseTimer.current = window.setTimeout(() => setHoveredNavigation(null), 160)
  }

  function closeNavigationAfterNavigate() {
    if (navigationHoverOpenTimer.current) window.clearTimeout(navigationHoverOpenTimer.current)
    if (navigationHoverCloseTimer.current) window.clearTimeout(navigationHoverCloseTimer.current)
    setSidebarOpen(false)
    setCollapsedDirectory(null)
    setHoveredNavigation(null)
  }

  function toggleNavigation() {
    if (mobileLayout) setSidebarOpen((open) => !open)
    else setSidebarCollapsed((collapsed) => !collapsed)
  }

  if (!authenticated) return <LoginScreen onLogin={login} error={loginError} />
  const { api, session, activeContexts } = authenticated
  const fallbackSlot = Object.values(activeContexts)[0]
  if (!fallbackSlot) return <LoginScreen onLogin={login} error="当前账号没有可用工作上下文" />
  const activeContextType = workContextTypeForPath(location.pathname)
  const activeSlot = activeContexts[activeContextType] ?? fallbackSlot
  const availableForActiveType = session.workContexts.filter((context) =>
    context.workContextType === activeSlot.option.workContextType)
  const collapsedNavigation = sidebarCollapsed && !mobileLayout
  const activeAuthorities = new Set([...session.authorities, ...(activeSlot.option.authorities ?? [])])
  const visibleNavigation = filterNavigation(NAVIGATION_NODES, activeAuthorities)

  return (
    <div className={`app-shell ${sidebarCollapsed && !mobileLayout ? 'is-sidebar-collapsed' : ''}`}>
      {sidebarOpen && <button className="sidebar-backdrop" type="button" aria-label="关闭主导航"
        onClick={() => setSidebarOpen(false)} />}
      <aside id="primary-navigation" aria-label="主导航" aria-hidden={mobileLayout && !sidebarOpen || undefined}
        inert={mobileLayout && !sidebarOpen || undefined} className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="brand"><div className="brand-mark">R</div><div><strong>健域智枢</strong><span>Regional Health Nexus</span></div></div>
        <nav className="sidebar-navigation" aria-label="功能菜单">
          <NavigationTree nodes={visibleNavigation} pathname={location.pathname} collapsed={collapsedNavigation}
            expandedDirectories={expandedDirectories} onToggleDirectory={toggleDirectory}
            onCollapsedDirectory={openCollapsedDirectory} onNavigate={closeNavigationAfterNavigate}
            openCollapsedDirectoryId={collapsedDirectory?.node.id}
            onHover={handleCollapsedNavigationHover} onHoverEnd={handleCollapsedNavigationHoverEnd} />
        </nav>
        <div className="sidebar-foot"><span className="status-dot" /><div><strong>Foundation 1.2</strong><span>工作门户底座</span></div></div>
      </aside>

      {collapsedNavigation && hoveredNavigation && !collapsedDirectory && hoveredNavigation.node.to && createPortal(
        <NavLink className="collapsed-nav-preview" to={hoveredNavigation.node.to}
          style={{ top: hoveredNavigation.top }} onMouseEnter={keepCollapsedDirectoryOpen}
          onMouseLeave={scheduleCollapsedNavigationPreviewClose} onClick={closeNavigationAfterNavigate}>
          {hoveredNavigation.node.label}
        </NavLink>,
        document.body,
      )}
      {collapsedNavigation && collapsedDirectory && createPortal(
        <CollapsedNavigationFlyout node={collapsedDirectory.node} top={collapsedDirectory.top}
          pathname={location.pathname} expandedDirectories={expandedDirectories}
          onToggleDirectory={toggleDirectory} onNavigate={closeNavigationAfterNavigate}
          onMouseEnter={keepCollapsedDirectoryOpen} onMouseLeave={scheduleCollapsedDirectoryClose} />,
        document.body,
      )}

      <main className="main-area" inert={mobileLayout && sidebarOpen || undefined}>
        <header className="topbar">
          <IconButton className="menu-button" icon={mobileLayout ? 'menu' : sidebarCollapsed ? 'chevron-right' : 'chevron-left'}
            label={mobileLayout ? sidebarOpen ? '关闭主导航' : '打开主导航' : sidebarCollapsed ? '展开菜单栏' : '收缩菜单栏'}
            aria-controls="primary-navigation" aria-expanded={mobileLayout ? sidebarOpen : !sidebarCollapsed}
            onClick={toggleNavigation} />
          <label className="context context-switcher">
            <span className="visually-hidden">切换当前业务类型的工作机构与科室</span>
            <select value={workContextKey(activeSlot.option)}
              aria-label={`${WORK_CONTEXT_LABELS[activeSlot.option.workContextType]}工作上下文`}
              onChange={(event) => void switchWorkContext(activeSlot.option.workContextType, event.target.value)}>
              {availableForActiveType.map((context) => <option
                key={`${context.organizationId}:${context.departmentId ?? ''}`}
                value={`${context.organizationId}:${context.departmentId ?? ''}`}>
                {WORK_CONTEXT_LABELS[context.workContextType]} · {context.departmentName ?? context.organizationName}
              </option>)}
            </select>
          </label>
          <WorkspaceTabs tabs={tabs} activeTabId={activeTabId} onActivate={(path) => navigate(path)}
            onClose={closeTab} onManage={manageTabs} />
          <div className="top-actions">
            <NotificationCenter api={activeSlot.api} contextKey={`${activeSlot.option.workContextType}:${workContextKey(activeSlot.option)}`}
              onNavigate={(path) => navigate(path)} />
            <UserAccountMenu session={session} activeContexts={activeContexts}
              activeContextType={activeSlot.option.workContextType}
              onSwitchWorkContext={switchWorkContext} onNavigate={(path) => navigate(path)} onLogout={logout} />
          </div>
        </header>
        <div className="workspace-content">
          {tabs.map((tab) => {
            const requestedType = workContextTypeForPath(tab.path)
            const tabSlot = activeContexts[requestedType] ?? fallbackSlot
            const slotKey = `${tab.id}:${tabSlot.option.workContextType}:${workContextKey(tabSlot.option)}`
            const tabAuthorities = new Set([...session.authorities, ...(tabSlot.option.authorities ?? [])])
            const requiredAuthority = requiredAuthorityForPath(NAVIGATION_NODES, tab.path)
            const authorized = !requiredAuthority || tabAuthorities.has(requiredAuthority)
            return <div id={`workspace-panel-${encodeURIComponent(tab.id)}`} key={tab.id}
              className="workspace-panel" role="tabpanel" aria-labelledby={`workspace-tab-${encodeURIComponent(tab.id)}`}
              hidden={tab.id !== activeTabId}>
              <div className="page" key={slotKey}>
                {!authorized ? <EmptyState icon="error" title="无权访问该功能"
                  copy={`当前工作上下文缺少权限：${requiredAuthority}`} /> :
                <Suspense fallback={<LoadingState label="正在加载功能…" />}><Routes location={tab.path}>
                  <Route path="/" element={<Dashboard api={tabSlot.api} onStart={() => navigate('/outpatient/registration')}
                    onOpenTasks={() => navigate('/tasks')} />} />
                  <Route path="/residents" element={<ResidentCenterWorkspace api={tabSlot.api} onNavigate={(path) => navigate(path)} />} />
                  <Route path="/tasks" element={<TasksWorkspace api={tabSlot.api} onNavigate={(path) => navigate(path)} />} />
                  <Route path="/pharmacy" element={<PharmacyWorkspace api={tabSlot.api}
                    clinicalContext={tabSlot.clinicalContext} />} />
                  <Route path="/pharmacy/warehouse" element={<WarehouseManagement api={tabSlot.api}
                    clinicalContext={tabSlot.clinicalContext} onNavigate={(path) => navigate(path)} />} />
                  <Route path="/billing" element={<BillingWorkspace api={tabSlot.api}
                    clinicalContext={tabSlot.clinicalContext} />} />
                  <Route path="/care-management" element={<CareManagementWorkspace api={tabSlot.api}
                    clinicalContext={tabSlot.clinicalContext} onNavigate={(path) => navigate(path)} />} />
                  <Route path="/outpatient/scheduling" element={<SchedulingWorkspace api={tabSlot.api}
                    clinicalContext={tabSlot.clinicalContext} />} />
                  <Route path="/outpatient/registration" element={<OutpatientRegistrationWorkspace api={tabSlot.api}
                    clinicalContext={tabSlot.clinicalContext} onNavigate={(path) => navigate(path)} />} />
                  <Route path="/outpatient/reception" element={<DoctorWorkstation api={tabSlot.api}
                    clinicalContext={tabSlot.clinicalContext} />} />
                  <Route path="/settings" element={<Navigate to="/settings/parameters" replace />} />
                  <Route path="/settings/organization" element={<OrganizationPersonnelManagement api={tabSlot.api} />} />
                  <Route path="/settings/grid-addresses" element={<GridAddressManagement api={tabSlot.api} />} />
                  <Route path="/settings/master-data" element={<BasicDataManagement api={tabSlot.api}
                    organization={tabSlot.clinicalContext.organization} onNavigate={(path) => navigate(path)} />} />
                  <Route path="/settings/partners" element={<BusinessPartnerManagement api={tabSlot.api}
                    organization={tabSlot.clinicalContext.organization} />} />
                  <Route path="/settings/parameters" element={<ParameterManagement api={tabSlot.api} context={{
                    tenantId: session.tenantId,
                    organization: tabSlot.clinicalContext.organization, department: tabSlot.clinicalContext.department,
                    userId: session.userId,
                  }} />} />
                  <Route path="/settings/dictionaries" element={<DictionaryManagement api={tabSlot.api}
                    onOpenAttributeConfiguration={(dictionaryId) => navigate(`/settings/dictionary-attributes?dictionaryId=${dictionaryId}`)} />} />
                  <Route path="/settings/dictionary-attributes" element={<DictionaryAttributeManagement api={tabSlot.api}
                    context={{ tenantId: session.tenantId, organization: tabSlot.clinicalContext.organization,
                      department: tabSlot.clinicalContext.department }}
                    onNavigate={(path) => navigate(path)} />} />
                  <Route path="/settings/access-control" element={<AccessControlManagement api={tabSlot.api}
                    context={tabSlot.clinicalContext} />} />
                  <Route path="/roadmap/:module" element={<PlannedPage title="后续业务模块" copy="该模块将在门诊主链后按业务优先级接入共享底座。" />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes></Suspense>}
              </div>
            </div>
          })}
        </div>
      </main>
    </div>
  )
}

function UserAccountMenu({ session, activeContexts, activeContextType, onSwitchWorkContext, onNavigate, onLogout }: {
  session: Session
  activeContexts: Partial<Record<WorkContextType, WorkContextSlot>>
  activeContextType: WorkContextType
  onSwitchWorkContext: (contextType: WorkContextType, contextKey: string) => Promise<void>
  onNavigate: (path: string) => void
  onLogout: () => void
}) {
  const [open, setOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [switchingContext, setSwitchingContext] = useState(false)
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement))
  const menuRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const fallbackSlot = Object.values(activeContexts)[0]
  const activeSlot = (activeContexts[activeContextType] ?? fallbackSlot)!
  const effectiveContextType = activeSlot.option.workContextType
  const contextKey = workContextKey(activeSlot.option)
  const availableContexts = session.workContexts.filter((context) =>
    context.workContextType === effectiveContextType)
  const visibleSlots = (Object.keys(WORK_CONTEXT_LABELS) as WorkContextType[])
    .map((type) => activeContexts[type]).filter((slot): slot is WorkContextSlot => Boolean(slot))

  useEffect(() => {
    const updateFullscreen = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', updateFullscreen)
    return () => document.removeEventListener('fullscreenchange', updateFullscreen)
  }, [])

  useEffect(() => {
    if (!open) return
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setOpen(false)
      menuRef.current?.querySelector<HTMLButtonElement>('.profile-trigger')?.focus()
    }
    document.addEventListener('pointerdown', closeOnPointerDown)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  function navigateFromMenu(path: string) {
    setOpen(false)
    onNavigate(path)
  }

  async function refreshWorkspace() {
    setRefreshing(true)
    try {
      await queryClient.invalidateQueries({ refetchType: 'active' })
    } finally {
      setRefreshing(false)
    }
  }

  async function toggleFullscreen() {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await document.documentElement.requestFullscreen()
  }

  async function changeWorkContext(nextContextKey: string) {
    if (nextContextKey === contextKey) return
    setSwitchingContext(true)
    try {
      await onSwitchWorkContext(effectiveContextType, nextContextKey)
      setOpen(false)
    } finally {
      setSwitchingContext(false)
    }
  }

  return <div className="account-menu" ref={menuRef}>
    <button type="button" className="profile-trigger" aria-expanded={open}
      aria-controls="account-menu-panel" onClick={() => setOpen((current) => !current)}>
      <span className="avatar" aria-hidden="true">{session.username.slice(0, 1).toUpperCase()}</span>
      <span className="profile-copy"><strong>{session.username}</strong><span>{activeSlot.clinicalContext.department.name}</span></span>
      <Icon name={open ? 'chevron-up' : 'chevron-down'} />
    </button>
    {open && <section id="account-menu-panel" className="account-panel" role="region" aria-label="用户与账户">
      <header className="account-panel__header">
        <span className="avatar avatar--large" aria-hidden="true">{session.username.slice(0, 1).toUpperCase()}</span>
        <div><strong>{session.username}</strong><span>当前登录用户</span></div>
      </header>

      <div className="account-panel__context">
        <div className="account-panel__section-label"><span>{WORK_CONTEXT_LABELS[effectiveContextType]}工作上下文</span><small>同类型单选</small></div>
        <label>
          <span className="visually-hidden">切换{WORK_CONTEXT_LABELS[effectiveContextType]}工作机构与科室</span>
          <select value={contextKey} disabled={switchingContext}
            onChange={(event) => void changeWorkContext(event.target.value)}>
            {availableContexts.map((context) => <option
              key={`${context.organizationId}:${context.departmentId ?? ''}`}
              value={`${context.organizationId}:${context.departmentId ?? ''}`}>
              {context.organizationName}{context.departmentName ? ` · ${context.departmentName}` : ''}
            </option>)}
          </select>
        </label>
        <div className="account-panel__context-slots" aria-label="已激活的业务上下文">
          {visibleSlots.map((slot) => <span key={slot.option.workContextType}>
            <small>{WORK_CONTEXT_LABELS[slot.option.workContextType]}</small>
            <strong>{slot.clinicalContext.department.name}</strong>
          </span>)}
        </div>
      </div>

      <div className="account-panel__shortcuts" aria-label="快捷操作">
        <button type="button" onClick={() => navigateFromMenu('/')}>
          <Icon name="home" /><span><strong>工作台</strong><small>返回首页</small></span>
        </button>
        <button type="button" onClick={() => navigateFromMenu('/tasks')}>
          <Icon name="tasks" /><span><strong>我的任务</strong><small>查看待办</small></span>
        </button>
        <button type="button" disabled={refreshing} onClick={() => void refreshWorkspace()}>
          <Icon name="refresh" /><span><strong>{refreshing ? '正在刷新' : '刷新数据'}</strong><small>更新当前页面</small></span>
        </button>
        <button type="button" onClick={() => void toggleFullscreen()}>
          <Icon name="fullscreen" /><span><strong>{fullscreen ? '退出全屏' : '全屏显示'}</strong><small>扩展工作区</small></span>
        </button>
      </div>

      <div className="account-panel__links">
        <button type="button" onClick={() => navigateFromMenu('/settings/organization')}>
          <Icon name="user" /><span>组织与人员</span><Icon name="chevron-right" />
        </button>
        <button type="button" onClick={() => navigateFromMenu('/settings/parameters')}>
          <Icon name="settings" /><span>常用参数设置</span><Icon name="chevron-right" />
        </button>
      </div>

      <footer className="account-panel__footer">
        <span title={session.tenantId}>租户 {session.tenantId}</span>
        <button type="button" onClick={onLogout}><Icon name="logout" />退出登录</button>
      </footer>
    </section>}
  </div>
}

function NotificationCenter({ api, contextKey, onNavigate }: {
  api: RhnApi; contextKey: string; onNavigate: (path: string) => void
}) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const summaryKey = ['portal-summary', contextKey]
  const notificationKey = ['portal-notifications', contextKey]
  const summary = useQuery({ queryKey: summaryKey, queryFn: api.portal.summary, refetchInterval: 60_000 })
  const notifications = useQuery({ queryKey: notificationKey, queryFn: api.portal.notifications.list, enabled: open })
  const markRead = useMutation({
    mutationFn: api.portal.notifications.markRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKey })
      void queryClient.invalidateQueries({ queryKey: summaryKey })
    },
  })
  const archive = useMutation({
    mutationFn: api.portal.notifications.archive,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKey })
      void queryClient.invalidateQueries({ queryKey: summaryKey })
    },
  })

  function openNotification(id: string, routePath?: string | null) {
    markRead.mutate(id)
    if (routePath) onNavigate(routePath)
    setOpen(false)
  }

  const unread = summary.data?.notifications.unread ?? 0
  return <div className="notification-button">
    <IconButton icon="notification" label={unread > 0 ? `消息，${unread} 条未读` : '消息'} onClick={() => setOpen(true)} />
    {unread > 0 && <span className="notice"><span className="visually-hidden">有新消息</span></span>}
    {open && <Dialog title="消息中心" eyebrow="工作门户" description={`${unread} 条未读消息`} onClose={() => setOpen(false)}>
      {notifications.isPending && <LoadingState label="正在加载消息…" />}
      {(notifications.error || markRead.error || archive.error) && <Alert>{errorMessage(
        notifications.error || markRead.error || archive.error,
      )}</Alert>}
      {!notifications.isPending && notifications.data?.length === 0 && <EmptyState icon="notification"
        title="暂无消息" copy="任务变化和业务事件会在这里形成可追踪通知。" />}
      {notifications.data && notifications.data.length > 0 && <div className="notification-list">
        {notifications.data.map((notification) => <article className={`notification-item ${notification.status === 'UNREAD' ? 'is-unread' : ''}`}
          key={notification.id}>
          <button type="button" className="notification-item__main"
            onClick={() => openNotification(notification.id, notification.routePath)}>
            <span><strong>{notification.title}</strong>
              {notification.status === 'UNREAD' && <StatusBadge tone="info">未读</StatusBadge>}</span>
            <p>{notification.message}</p><small>{formatTime(notification.createdAt)}</small>
          </button>
          <Button variant="text" size="sm" onClick={() => archive.mutate(notification.id)}>归档</Button>
        </article>)}
      </div>}
    </Dialog>}
  </div>
}

function WorkspaceTabs({ tabs, activeTabId, onActivate, onClose, onManage }: {
  tabs: WorkspaceTab[]
  activeTabId: string
  onActivate: (path: string) => void
  onClose: (id: string) => void
  onManage: (action: WorkspaceTabAction, targetTabId?: string) => void
}) {
  const [managementOpen, setManagementOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ tabId: string; x: number; y: number } | null>(null)
  const managementRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    document.getElementById(`workspace-tab-${encodeURIComponent(activeTabId)}`)?.scrollIntoView({
      behavior: 'smooth', block: 'nearest', inline: 'nearest',
    })
  }, [activeTabId])

  useEffect(() => {
    if (!managementOpen) return
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!managementRef.current?.contains(event.target as Node)) setManagementOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setManagementOpen(false)
      managementRef.current?.querySelector<HTMLButtonElement>('.workspace-tabs__management-trigger')?.focus()
    }
    document.addEventListener('pointerdown', closeOnPointerDown)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [managementOpen])

  useEffect(() => {
    if (!contextMenu) return
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(
      '#workspace-tab-context-menu button:not(:disabled)',
    )?.focus())
    const closeContextMenu = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('.workspace-tab-context-menu')) setContextMenu(null)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      const targetTabId = contextMenu.tabId
      setContextMenu(null)
      document.getElementById(`workspace-tab-${encodeURIComponent(targetTabId)}`)?.focus()
    }
    const closeOnViewportChange = () => setContextMenu(null)
    document.addEventListener('pointerdown', closeContextMenu)
    document.addEventListener('keydown', closeOnEscape)
    window.addEventListener('resize', closeOnViewportChange)
    window.addEventListener('scroll', closeOnViewportChange, true)
    return () => {
      document.removeEventListener('pointerdown', closeContextMenu)
      document.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('resize', closeOnViewportChange)
      window.removeEventListener('scroll', closeOnViewportChange, true)
    }
  }, [contextMenu])

  function runManagementAction(action: WorkspaceTabAction, targetTabId = activeTabId) {
    setManagementOpen(false)
    setContextMenu(null)
    onManage(action, targetTabId)
  }

  function openContextMenu(tabId: string, x: number, y: number) {
    const margin = 8
    const menuWidth = 168
    const menuHeight = 224
    setManagementOpen(false)
    setContextMenu({
      tabId,
      x: Math.max(margin, Math.min(x, window.innerWidth - menuWidth - margin)),
      y: Math.max(margin, Math.min(y, window.innerHeight - menuHeight - margin)),
    })
  }

  function handleTabKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, index: number, tabId: string) {
    if (event.key === 'ContextMenu' || event.shiftKey && event.key === 'F10') {
      event.preventDefault()
      const bounds = event.currentTarget.getBoundingClientRect()
      openContextMenu(tabId, bounds.left + 24, bounds.bottom - 4)
      return
    }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
      : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length : (index + 1) % tabs.length
    const nextTab = tabs[nextIndex]
    onActivate(nextTab.path)
    requestAnimationFrame(() => document.getElementById(`workspace-tab-${encodeURIComponent(nextTab.id)}`)?.focus())
  }

  return <nav className="workspace-tabs" aria-label="已打开页面">
    <div className="workspace-tabs__track" role="tablist" aria-label="工作区标签页">
      {tabs.map((tab, index) => <div
        className={`workspace-tab ${tab.id === activeTabId ? 'active' : ''} ${contextMenu?.tabId === tab.id ? 'context-target' : ''}`}
        key={tab.id} onContextMenu={(event) => {
          event.preventDefault()
          openContextMenu(tab.id, event.clientX, event.clientY)
        }}>
        <button id={`workspace-tab-${encodeURIComponent(tab.id)}`} className="workspace-tab__main" type="button"
          role="tab" aria-selected={tab.id === activeTabId}
          aria-controls={`workspace-panel-${encodeURIComponent(tab.id)}`} tabIndex={tab.id === activeTabId ? 0 : -1}
          title={`${tab.title}（右键管理）`} onClick={() => onActivate(tab.path)}
          onKeyDown={(event) => handleTabKeyDown(event, index, tab.id)}
          onAuxClick={(event) => { if (event.button === 1 && tab.closeable) onClose(tab.id) }}>
          <Icon name={tab.icon} /><span>{tab.title}</span>
        </button>
        {tab.closeable && <IconButton className="workspace-tab__close" icon="close" label={`关闭${tab.title}`}
          onClick={() => onClose(tab.id)} />}
      </div>)}
    </div>
    <div className="workspace-tabs__management" ref={managementRef}>
      <IconButton className="workspace-tabs__management-trigger" icon="chevron-down"
        label="管理标签页" aria-haspopup="menu" aria-expanded={managementOpen}
        aria-controls="workspace-tab-management-menu" onClick={() => setManagementOpen((open) => !open)} />
      {managementOpen && <WorkspaceTabManagementMenu id="workspace-tab-management-menu"
        className="workspace-tabs__management-menu" tabs={tabs} targetTabId={activeTabId}
        onAction={(action) => runManagementAction(action)} />}
    </div>
    {contextMenu && createPortal(<WorkspaceTabManagementMenu id="workspace-tab-context-menu"
      className="workspace-tab-context-menu" tabs={tabs} targetTabId={contextMenu.tabId}
      style={{ left: contextMenu.x, top: contextMenu.y }}
      onAction={(action) => runManagementAction(action, contextMenu.tabId)} />, document.body)}
  </nav>
}

function WorkspaceTabManagementMenu({ id, className, tabs, targetTabId, style, onAction }: {
  id: string
  className: string
  tabs: WorkspaceTab[]
  targetTabId: string
  style?: CSSProperties
  onAction: (action: WorkspaceTabAction) => void
}) {
  const targetIndex = tabs.findIndex((tab) => tab.id === targetTabId)
  const canCloseTarget = tabs[targetIndex]?.closeable ?? false
  const canCloseLeft = tabs.slice(0, Math.max(targetIndex, 0)).some((tab) => tab.closeable)
  const canCloseRight = targetIndex >= 0 && tabs.slice(targetIndex + 1).some((tab) => tab.closeable)
  const canCloseOthers = tabs.some((tab) => tab.closeable && tab.id !== targetTabId)
  const canCloseAll = tabs.some((tab) => tab.closeable)

  return <div id={id} className={`workspace-tab-menu ${className}`} style={style} role="menu">
    <button type="button" role="menuitem" disabled={!canCloseTarget}
      onClick={() => onAction('close-active')}>关闭当前页</button>
    <button type="button" role="menuitem" disabled={!canCloseLeft}
      onClick={() => onAction('close-left')}>关闭左侧页面</button>
    <button type="button" role="menuitem" disabled={!canCloseRight}
      onClick={() => onAction('close-right')}>关闭右侧页面</button>
    <button type="button" role="menuitem" disabled={!canCloseOthers}
      onClick={() => onAction('close-others')}>关闭其他页面</button>
    <button type="button" role="menuitem" disabled={!canCloseAll}
      onClick={() => onAction('close-all')}>关闭全部页面</button>
  </div>
}

function NavigationTree({ nodes, pathname, collapsed, expandedDirectories, onToggleDirectory,
  onCollapsedDirectory, onNavigate, onHover, onHoverEnd, openCollapsedDirectoryId, depth = 0 }: {
  nodes: NavigationNode[]
  pathname: string
  collapsed: boolean
  expandedDirectories: Set<string>
  onToggleDirectory: (id: string) => void
  onCollapsedDirectory: (node: NavigationNode, element: HTMLElement) => void
  onNavigate: () => void
  onHover: (node: NavigationNode, element: HTMLElement) => void
  onHoverEnd: (node: NavigationNode) => void
  openCollapsedDirectoryId?: string
  depth?: number
}) {
  const depthClass = `nav-depth-${Math.min(depth, 2)}`

  return <>
    {nodes.map((node) => {
      const directory = Boolean(node.children?.length)
      const active = navigationNodeMatchesPath(node, pathname)
      const expanded = directory && expandedDirectories.has(node.id)
      const flyoutOpen = collapsed && openCollapsedDirectoryId === node.id
      const itemClass = `nav-item ${depthClass} ${active ? 'active' : ''} ${node.muted ? 'muted' : ''} ${flyoutOpen ? 'flyout-open' : ''}`
      const hoverProps = {
        onMouseEnter: (event: React.MouseEvent<HTMLElement>) => onHover(node, event.currentTarget),
        onMouseLeave: () => onHoverEnd(node),
        onFocus: (event: React.FocusEvent<HTMLElement>) => onHover(node, event.currentTarget),
        onBlur: () => onHoverEnd(node),
      }

      if (!directory && node.to) {
        return <div className="nav-node" key={node.id}>
          <NavLink to={node.to} end={node.end} className={itemClass} aria-label={node.label}
            title={collapsed ? undefined : node.label}
            onClick={onNavigate} {...hoverProps}>
            <NavigationGlyph node={node} />
            <span className="nav-label">{node.label}</span>
            {node.badge && <StatusBadge>{node.badge}</StatusBadge>}
          </NavLink>
        </div>
      }

      const childrenOpen = !collapsed && expanded
      return <div className="nav-node nav-directory" key={node.id}>
        <button type="button" className={itemClass} aria-label={node.label}
          aria-expanded={collapsed ? flyoutOpen : childrenOpen}
          aria-controls={`navigation-directory-${node.id}`} title={collapsed ? undefined : node.label}
          onClick={(event) => collapsed ? onCollapsedDirectory(node, event.currentTarget) : onToggleDirectory(node.id)}
          {...hoverProps}>
          <NavigationGlyph node={node} />
          <span className="nav-label">{node.label}</span>
          <Icon className="nav-directory-chevron" name={childrenOpen ? 'chevron-down' : 'chevron-right'} />
        </button>
        <div id={`navigation-directory-${node.id}`} className={`nav-children ${childrenOpen ? 'open' : ''}`}
          aria-hidden={!childrenOpen}>
          <div className="nav-children__inner" inert={!childrenOpen || undefined}>
            <NavigationTree nodes={node.children ?? []} pathname={pathname} collapsed={collapsed}
              expandedDirectories={expandedDirectories} onToggleDirectory={onToggleDirectory}
              onCollapsedDirectory={onCollapsedDirectory} onNavigate={onNavigate}
              onHover={onHover} onHoverEnd={onHoverEnd} openCollapsedDirectoryId={openCollapsedDirectoryId}
              depth={depth + 1} />
          </div>
        </div>
      </div>
    })}
  </>
}

function NavigationGlyph({ node }: { node: NavigationNode }) {
  return <span className="nav-icon">
    {node.icon ? <Icon name={node.icon} /> : <span className="nav-fallback-glyph">{node.label.trim().charAt(0)}</span>}
  </span>
}

function CollapsedNavigationFlyout({ node, top, pathname, expandedDirectories, onToggleDirectory, onNavigate,
  onMouseEnter, onMouseLeave }: {
  node: NavigationNode
  top: number
  pathname: string
  expandedDirectories: Set<string>
  onToggleDirectory: (id: string) => void
  onNavigate: () => void
  onMouseEnter: () => void
  onMouseLeave: () => void
}) {
  return <section className="collapsed-nav-flyout" aria-label={`${node.label}子菜单`}
    style={{ top, maxHeight: `calc(100dvh - ${top + 8}px)` }} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
    <header className="collapsed-nav-flyout__header"><strong>{node.label}</strong></header>
    <nav className="collapsed-nav-flyout__body" aria-label={`${node.label}目录`}>
      <NavigationTree nodes={node.children ?? []} pathname={pathname} collapsed={false}
        expandedDirectories={expandedDirectories} onToggleDirectory={onToggleDirectory}
        onCollapsedDirectory={() => undefined} onNavigate={onNavigate}
        onHover={() => undefined} onHoverEnd={() => undefined} />
    </nav>
  </section>
}
