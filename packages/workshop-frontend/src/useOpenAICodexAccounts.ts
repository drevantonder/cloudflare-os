import { useEffect, useState } from 'react'
import { ConnectedAccountsSubscriber } from '@gadgets/workshop-shared/api'
import { RpcStub, RpcTarget } from 'capnweb'
import { AuthenticatedApi } from '@gadgets/workshop-shared/api'

type Account = {id: number, name: string}

export function useOpenAICodexAccounts(authenticatedApi: RpcStub<AuthenticatedApi>) {
  const [accounts, setAccounts] = useState<Account[]>([])

  useEffect(() => {
    class Subscriber extends RpcTarget implements ConnectedAccountsSubscriber {
      add(id: number, description: {displayName?: string, uniqueName?: string}, _vendor: unknown, _resources: unknown[], valid: boolean, vendorId: string) {
        if (!valid || vendorId !== 'openai-codex') return
        setAccounts(items => [...items.filter(account => account.id !== id), {
          id, name: description.displayName ?? description.uniqueName ?? 'ChatGPT account',
        }])
      }
      remove(id: number) { setAccounts(items => items.filter(account => account.id !== id)) }
      ready() {}
    }
    const subscriber = new Subscriber()
    let disposed = false
    let subscription: { [Symbol.dispose](): void } | undefined
    authenticatedApi.subscribeConnectedAccounts(subscriber).then(stub => {
      subscription = stub
      if (disposed) subscription[Symbol.dispose]()
    })
    return () => { disposed = true; subscription?.[Symbol.dispose]() }
  }, [authenticatedApi])

  return accounts
}
