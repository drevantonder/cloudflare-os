import { Select } from '@cloudflare/kumo'
import { AuthenticatedApi, ConnectedAccountsSubscriber } from '@gadgets/workshop-shared/api'
import { RpcStub, RpcTarget } from 'capnweb'
import { useEffect, useState } from 'react'

type Account = {id: number, name: string}

interface OpenAICodexAccountSelectProps {
  authenticatedApi: RpcStub<AuthenticatedApi>
  value: string
  onValueChange: (value: string) => void
  error?: string
}

export function OpenAICodexAccountSelect({ authenticatedApi, value, onValueChange, error }: OpenAICodexAccountSelectProps) {
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

  return (
    <Select
      label="OpenAI Codex account"
      value={value || undefined}
      onValueChange={(next) => onValueChange(next as string)}
      error={error}
      renderValue={(selected) => accounts.find(account => String(account.id) === selected)?.name ?? 'Select an account'}
    >
      {accounts.map(account => (
        <Select.Option key={account.id} value={String(account.id)}>{account.name}</Select.Option>
      ))}
    </Select>
  )
}
