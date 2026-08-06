import { useEffect, useState } from 'react'
import { ConnectedAccountsSubscriber } from '@gadgets/workshop-shared/api'
import { VendorDescription } from '@gadgets/workshop-shared/gatekeeper'
import { RpcStub, RpcTarget } from 'capnweb'
import { AuthenticatedApi } from '@gadgets/workshop-shared/api'

export type ModelCatalog = Record<string, {name: string, contextWindow: number, outputLimit?: number}>

export type ConnectedModelProvider = {
  displayName: string
  models: ModelCatalog
  accounts: {id: number, name: string}[]
}

export function useConnectedModelProviders(authenticatedApi: RpcStub<AuthenticatedApi>) {
  const [providers, setProviders] = useState<Record<string, ConnectedModelProvider>>({})

  useEffect(() => {
    class Subscriber extends RpcTarget implements ConnectedAccountsSubscriber {
      add(id: number, description: {displayName?: string, uniqueName?: string}, vendor: VendorDescription, _resources: unknown[], valid: boolean, _vendorId: string) {
        const provider = vendor.modelProvider
        if (!provider || !valid) return
        setProviders(items => ({
          ...items,
          [provider.id]: {
            displayName: provider.displayName,
            models: provider.models,
            accounts: [...(items[provider.id]?.accounts ?? []).filter(account => account.id !== id), {
              id, name: description.displayName ?? description.uniqueName ?? provider.displayName,
            }],
          },
        }))
      }
      remove(id: number) { setProviders(items => Object.fromEntries(Object.entries(items).map(([provider, value]) => [provider, {...value, accounts: value.accounts.filter(account => account.id !== id)}]))) }
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

  return providers
}
