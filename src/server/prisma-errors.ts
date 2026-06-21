import { Prisma } from '../../generated/prisma'

export function isPrismaErrorCode(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error as { code: unknown }).code === code
  )
}
