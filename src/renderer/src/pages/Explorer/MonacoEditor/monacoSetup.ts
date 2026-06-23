import loader from '@monaco-editor/loader'
import * as monaco from 'monaco-editor'

// Tell @monaco-editor/react to use the locally bundled monaco instance instead
// of downloading it from jsDelivr (which the renderer CSP blocks).
loader.config({ monaco })
