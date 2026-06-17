import { QueryClient } from '@tanstack/react-query'

/**
 * Creates a new QueryClient instance with sensible defaults shared across the app.
 */
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Data is considered fresh for 5 minutes.
        staleTime: 5 * 60 * 1000,
        // Garbage-collect cached data after 10 minutes.
        gcTime: 10 * 60 * 1000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
      mutations: {
        retry: 0,
      },
    },
  })
}

let browserQueryClient: QueryClient | undefined = undefined

/**
 * Returns a request-scoped client on the server and a singleton in the browser.
 */
export function getQueryClient() {
  if (typeof window === 'undefined') {
    return makeQueryClient()
  }
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient()
  }
  return browserQueryClient
}
