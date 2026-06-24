import { ok, err, type Result } from 'neverthrow'

export class JsonParseError extends Error {
    constructor(
        public readonly path: string,
        public readonly cause: unknown,
    ) {
        super(`${path}: ${String(cause)}`)
        this.name = 'JsonParseError'
    }
}

export const parseJson = (
    raw: string,
    path: string,
): Result<unknown, JsonParseError> => {
    try {
        return ok(JSON.parse(raw))
    } catch (e) {
        return err(new JsonParseError(path, e))
    }
}
