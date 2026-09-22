import { Button } from './index'
import { useFontSizePreference } from '../preferences/useFontSizePreference'

export function FontSizeControl() {
  const [fontSize, setFontSize] = useFontSizePreference()
  return <div className="ui-font-size-control" role="group" aria-label="字体大小">
    <span>字体大小</span>
    <div className="ui-font-size-control__options">
      <Button variant={fontSize === 'standard' ? 'secondary' : 'text'} aria-pressed={fontSize === 'standard'}
        onClick={() => setFontSize('standard')}>标准</Button>
      <Button variant={fontSize === 'large' ? 'secondary' : 'text'} aria-pressed={fontSize === 'large'}
        onClick={() => setFontSize('large')}>大字</Button>
    </div>
  </div>
}
