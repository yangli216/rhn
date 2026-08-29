import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button, Panel } from '.'

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Uncaught application error', error, info)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return <main className="fatal-error"><Panel className="fatal-error__panel">
      <h1>页面暂时无法显示</h1>
      <p>请刷新页面重试；如果问题持续，请将发生时间反馈给系统管理员。</p>
      <Button onClick={() => window.location.reload()}>刷新页面</Button>
    </Panel></main>
  }
}
