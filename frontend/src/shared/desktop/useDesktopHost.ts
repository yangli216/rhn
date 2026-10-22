import { useQuery } from '@tanstack/react-query'
import { getDesktopHost, type DesktopHost } from './desktopHost'

const BROWSER: DesktopHost = { kind: 'browser' }

/**
 * 当前桌面宿主。检测完成前与检测失败时都按浏览器处理，业务组件不必等待检测即可渲染现有交互。
 */
export function useDesktopHost(): DesktopHost {
  const query = useQuery({
    queryKey: ['desktop-host'],
    queryFn: getDesktopHost,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  })
  return query.data ?? BROWSER
}
