import { customerRouter } from '~/server/api/routers/customer'
import { categoryRouter } from '~/server/api/routers/category'
import { catalogRouter } from '~/server/api/routers/catalog'
import { cartRouter } from '~/server/api/routers/cart'
import { checkoutRouter } from '~/server/api/routers/checkout'
import { dashboardRouter } from '~/server/api/routers/dashboard'
import { orderRouter } from '~/server/api/routers/order'
import { productRouter } from '~/server/api/routers/product'
import { createCallerFactory, createTRPCRouter } from '~/server/api/trpc'

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  dashboard: dashboardRouter,
  customer: customerRouter,
  order: orderRouter,
  product: productRouter,
  category: categoryRouter,
  catalog: catalogRouter,
  cart: cartRouter,
  checkout: checkoutRouter
})

// export type definition of API
export type AppRouter = typeof appRouter

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter)
