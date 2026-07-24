import 'dotenv/config'
import { Daytona } from '@daytona/sdk'

async function main() {
  const daytona = new Daytona()
  console.log('creating sandbox...')
  const t0 = Date.now()
  const sandbox = await daytona.create()
  console.log(`sandbox created in ${((Date.now() - t0) / 1000).toFixed(1)}s: ${sandbox.id}`)

  try {
    const response = await sandbox.process.executeCommand('node -e "console.log(2+2)"')
    console.log('exitCode:', response.exitCode)
    console.log('result:', response.result)
  } finally {
    await daytona.delete(sandbox)
    console.log('sandbox deleted')
  }
}

main().catch((err) => {
  console.error('SMOKE TEST FAILED:', err)
  process.exit(1)
})
