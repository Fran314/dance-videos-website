import type { NonEmptySafeStr, User, Token } from '@dance-videos/shared'

declare module 'express-serve-static-core' {
    interface Request {
        sessionToken?: Token
        username?: NonEmptySafeStr
        user?: User
    }
}

export {}