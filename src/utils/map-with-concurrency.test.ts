import { describe, expect, it, vi } from 'vitest'

import { mapWithConcurrency } from './map-with-concurrency'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('mapWithConcurrency', () => {
  it('processes every item once and preserves input order', async () => {
    const gates = [deferred(), deferred(), deferred()]
    const processed: number[] = []

    const resultPromise = mapWithConcurrency([1, 2, 3], 3, async (item) => {
      processed.push(item)
      await gates[item - 1]!.promise
      return `result-${item}`
    })

    await vi.waitFor(() => expect(processed).toHaveLength(3))
    gates[2]!.resolve()
    gates[0]!.resolve()
    gates[1]!.resolve()

    await expect(resultPromise).resolves.toEqual([
      'result-1',
      'result-2',
      'result-3'
    ])
    expect([...processed].sort((left, right) => left - right)).toEqual([
      1, 2, 3
    ])
  })

  it('never runs more workers than the configured concurrency', async () => {
    const gates = Array.from({ length: 6 }, deferred)
    let activeWorkers = 0
    let maximumActiveWorkers = 0

    const resultPromise = mapWithConcurrency(
      [0, 1, 2, 3, 4, 5],
      2,
      async (item) => {
        activeWorkers += 1
        maximumActiveWorkers = Math.max(maximumActiveWorkers, activeWorkers)
        await gates[item]!.promise
        activeWorkers -= 1
        return item
      }
    )

    await vi.waitFor(() => expect(activeWorkers).toBe(2))

    for (const gate of gates) {
      gate.resolve()
      await vi.waitFor(() =>
        expect(activeWorkers).toBeLessThanOrEqual(2)
      )
    }

    await expect(resultPromise).resolves.toEqual([0, 1, 2, 3, 4, 5])
    expect(maximumActiveWorkers).toBe(2)
  })

  it('gives new work to a worker that finishes before another worker', async () => {
    const slowFirstItem = deferred()
    const started: number[] = []

    const resultPromise = mapWithConcurrency([0, 1, 2], 2, async (item) => {
      started.push(item)
      if (item === 0) {
        await slowFirstItem.promise
      }
      return item
    })

    await vi.waitFor(() => expect(started).toEqual([0, 1, 2]))
    slowFirstItem.resolve()

    await expect(resultPromise).resolves.toEqual([0, 1, 2])
  })

  it('rejects a non-positive concurrency', async () => {
    await expect(
      mapWithConcurrency([1], 0, async (item) => item)
    ).rejects.toThrow('Concurrency must be a positive integer.')
  })
})
