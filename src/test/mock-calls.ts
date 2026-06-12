export function firstMockCall<TArgs extends readonly unknown[]>(mock: {
  mock: { calls: TArgs[] }
}): TArgs {
  const call = mock.mock.calls[0]

  if (!call) {
    throw new Error('Expected mock to have been called.')
  }

  return call
}
