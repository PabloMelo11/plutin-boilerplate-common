import { AsyncLocalStorage } from 'node:async_hooks'

export const context = new AsyncLocalStorage()

type Context = {
  traceId: string
}

export function getContext(): Context {
  return (context.getStore() as Context) || { traceId: 'no-trace' }
}
