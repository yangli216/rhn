// Claude Code PostToolUse hook: check the edited frontend file and feed violations back to the agent.
// Exit 2 makes Claude Code show stderr to the model so it fixes the file in the same turn.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

let input = ''
process.stdin.setEncoding('utf8')
for await (const chunk of process.stdin) input += chunk

let path
try {
  const event = JSON.parse(input)
  path = event.tool_input?.file_path ?? event.tool_input?.notebook_path
} catch {
  process.exit(0)
}
if (typeof path !== 'string' || !/\/frontend\/src\/.+\.(?:css|tsx?)$/.test(path)) process.exit(0)

const result = spawnSync(process.execPath, [fileURLToPath(new URL('./check-ui-files.mjs', import.meta.url)), path], { encoding: 'utf8' })
if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout)
  process.exit(2)
}
