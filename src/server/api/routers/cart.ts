import {
  cartPreviewInputSchema,
  getCartPreview
} from '~/server/commerce/cart-preview'
import { createTRPCRouter, publicProcedure } from '~/server/api/trpc'

export const cartRouter = createTRPCRouter({
  preview: publicProcedure
    .input(cartPreviewInputSchema)
    .query(({ ctx, input }) => getCartPreview(ctx.db, input))
})
