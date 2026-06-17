import buildApp from './app.js'

if (
  process.env.NODE_ENV === 'production' &&
  !(process.env.CORS_ORIGIN || '').trim()
) {
  console.warn(
    '[estimator-api] WARNING: CORS_ORIGIN is unset in production — all browser origins are allowed.'
  )
}

const app = await buildApp()
const port = Number(process.env.PORT) || 3000
const host = process.env.HOST || '0.0.0.0'

async function shutdown(signal) {
  try {
    await app.close()
    process.exit(0)
  } catch (err) {
    console.error(`[estimator-api] ${signal} shutdown error`, err)
    process.exit(1)
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

try {
  await app.listen({ port, host })
} catch (err) {
  console.error(err)
  process.exit(1)
}
