import { createRoot } from 'react-dom/client'
import { ComponentSamples } from './ComponentSamples'
import { WaitingWorkspaceSample } from './WaitingWorkspaceSample'
import '../styles.css'
// 与医生站相同的样式导入顺序，保证同级选择器的覆盖结果一致。
import '../features/outpatient/waiting/waitingWorkspace.css'
import '../styles/features/outpatient-doctor.css'
import './page-samples.css'

createRoot(document.getElementById('root')!).render(new URLSearchParams(location.search).get('sample') === 'components' ? <ComponentSamples /> : <WaitingWorkspaceSample />)
