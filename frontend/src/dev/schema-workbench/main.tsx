import { createRoot } from 'react-dom/client'
import { SchemaWorkbench } from './SchemaWorkbench'
import '../../styles.css'
import './schema-workbench.css'

if (import.meta.env.DEV) createRoot(document.getElementById('root')!).render(<SchemaWorkbench />)
