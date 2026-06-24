import { ok, err, ResultAsync, type Result } from 'neverthrow'
import {
    parseUsers,
    parseSelfUser,
    parseCourses,
    parseCourse,
    parseInitUploadResponse,
    parseFinalizeUploadResponse,
    type ValidationError,
    type NonEmptySafeStr,
    type Token,
    type Hash,
    type Id,
    type User,
    type Course,
    type SelfUser,
    type LoginBody,
    type AddUserBody,
    type AddCourseBody,
    type AddVideoBody,
    type UpdateVideoBody,
    type InitUploadBody,
} from '@dance-videos/shared'

export { CHUNK_UPLOAD_SIZE } from '@dance-videos/shared'

// --- ERRORS --- //
export class NetworkError extends Error {
    constructor(message: string) {
        super(message)
    }
}
export class HttpError extends Error {
    constructor(
        public readonly code: number,
        message: string,
    ) {
        super(message)
    }
}
export class ParseError extends Error {
    constructor(message: string) {
        super(message)
    }
}

export type ApiError = NetworkError | HttpError | ParseError

// --- HELPERS --- //
function buildUrl(path: string, params: Record<string, string>): string {
    let url = path
    for (const [key, value] of Object.entries(params)) {
        url = url.replace(`:${key}`, encodeURIComponent(value))
    }
    return `/api${url}`
}

function request(
    method: string,
    path: string,
    params: Record<string, string> | null,
    body: unknown,
): ResultAsync<Response, ApiError> {
    const url = buildUrl(path, params ?? {})
    const opts: RequestInit = { method }
    if (body !== null) {
        opts.headers = { 'Content-Type': 'application/json' }
        opts.body = JSON.stringify(body)
    }

    async function execute(): Promise<Result<Response, ApiError>> {
        let res: Response
        try {
            res = await fetch(url, opts)
        } catch (e) {
            return err(
                new NetworkError(
                    e instanceof Error ? e.message : 'network error',
                ),
            )
        }
        if (!res.ok) {
            const message = await res.text().catch(() => res.statusText)
            return err(new HttpError(res.status, message))
        }
        return ok(res)
    }

    return new ResultAsync(execute())
}

const toParseError = (e: ValidationError): ApiError => new ParseError(e.message)

function asJson(res: Response): ResultAsync<unknown, ApiError> {
    return ResultAsync.fromPromise(
        res.json(),
        (e): ApiError =>
            new ParseError(
                e instanceof Error ? e.message : 'invalid JSON response',
            ),
    )
}

// --- AUTH --- //
export function login(body: LoginBody): ResultAsync<void, ApiError> {
    return request('POST', '/login', null, body).map(() => undefined)
}

export function logout(): ResultAsync<void, ApiError> {
    return request('POST', '/logout', null, null).map(() => undefined)
}

// --- USERS --- //
export function getUsers(): ResultAsync<
    Record<NonEmptySafeStr, User>,
    ApiError
> {
    return request('GET', '/users', null, null)
        .andThen(asJson)
        .andThen(data => parseUsers(data).mapErr(toParseError))
}

export function getSelf(): ResultAsync<SelfUser, ApiError> {
    return request('GET', '/users/self', null, null)
        .andThen(asJson)
        .andThen(data => parseSelfUser(data).mapErr(toParseError))
}

export function addUser(
    username: NonEmptySafeStr,
    body: AddUserBody,
): ResultAsync<void, ApiError> {
    return request('POST', '/users/:username/add', { username }, body).map(
        () => undefined,
    )
}

export function deleteUser(
    username: NonEmptySafeStr,
): ResultAsync<void, ApiError> {
    return request('POST', '/users/:username/delete', { username }, null).map(
        () => undefined,
    )
}

export function updateUser(
    username: NonEmptySafeStr,
    body: AddUserBody,
): ResultAsync<void, ApiError> {
    return request('POST', '/users/:username/update', { username }, body).map(
        () => undefined,
    )
}

// --- COURSES --- //
export function getCourses(): ResultAsync<Record<Id, Course>, ApiError> {
    return request('GET', '/courses', null, null)
        .andThen(asJson)
        .andThen(data => parseCourses(data).mapErr(toParseError))
}

export function addCourse(body: AddCourseBody): ResultAsync<void, ApiError> {
    return request('POST', '/courses/add', null, body).map(() => undefined)
}

export function getCourse(courseId: Id): ResultAsync<Course, ApiError> {
    return request('GET', '/courses/:courseId', { courseId }, null)
        .andThen(asJson)
        .andThen(data => parseCourse(data).mapErr(toParseError))
}

export function deleteCourse(courseId: Id): ResultAsync<void, ApiError> {
    return request('POST', '/courses/:courseId/delete', { courseId }, null).map(
        () => undefined,
    )
}

export function updateCourse(
    courseId: Id,
    body: AddCourseBody,
): ResultAsync<void, ApiError> {
    return request('POST', '/courses/:courseId/update', { courseId }, body).map(
        () => undefined,
    )
}

// --- VIDEOS --- //
export function addVideo(
    courseId: Id,
    body: AddVideoBody,
): ResultAsync<void, ApiError> {
    return request(
        'POST',
        '/courses/:courseId/videos/add',
        { courseId },
        body,
    ).map(() => undefined)
}

export function deleteVideo(
    courseId: Id,
    videoId: Id,
): ResultAsync<void, ApiError> {
    return request(
        'POST',
        '/courses/:courseId/videos/:videoId/delete',
        { courseId, videoId },
        null,
    ).map(() => undefined)
}

export function updateVideo(
    courseId: Id,
    videoId: Id,
    body: UpdateVideoBody,
): ResultAsync<void, ApiError> {
    return request(
        'POST',
        '/courses/:courseId/videos/:videoId/update',
        { courseId, videoId },
        body,
    ).map(() => undefined)
}

export function videoSrcUrl(
    courseId: Id,
    videoId: Id,
    origQuality: boolean,
): string {
    const baseUrl = buildUrl('/courses/:courseId/videos/:videoId', {
        courseId,
        videoId,
    })

    if (origQuality) {
        return baseUrl + '?quality=original'
    } else {
        return baseUrl
    }
}
export function videoThumbnailUrl(courseId: Id, videoId: Id): string {
    return buildUrl('/courses/:courseId/videos/:videoId/thumbnail', {
        courseId,
        videoId,
    })
}

// --- CHUNK UPLOAD --- //
export function initUpload(
    hash: Hash,
    body: InitUploadBody,
): ResultAsync<number[], ApiError> {
    return request('POST', '/file-upload/:hash/init', { hash }, body)
        .andThen(asJson)
        .andThen(data => parseInitUploadResponse(data).mapErr(toParseError))
}

export function finalizeUpload(
    hash: Hash,
): ResultAsync<{ token: Token }, ApiError> {
    return request('POST', '/file-upload/:hash/finalize', { hash }, null)
        .andThen(asJson)
        .andThen(data => parseFinalizeUploadResponse(data).mapErr(toParseError))
}

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 2000
const CHUNK_TIMEOUT_MS = 60000

export function uploadChunk(
    hash: Hash,
    idx: number,
    chunk: Blob,
    onProgress?: (loaded: number) => void,
): ResultAsync<void, ApiError> {
    const url = buildUrl('/file-upload/:hash/:idx', {
        hash: hash,
        idx: String(idx),
    })

    async function execute(): Promise<Result<void, ApiError>> {
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            const result = await attemptChunkUpload(url, chunk, onProgress)
            if (result.isOk()) return result

            const error = result.error

            // HTTP errors are not worth retrying
            if (error instanceof HttpError) return result

            // Network errors: retry with backoff
            if (attempt < MAX_RETRIES) {
                await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt))
            }
        }

        return err(
            new NetworkError(`upload failed after ${MAX_RETRIES} attempts`),
        )
    }

    return new ResultAsync(execute())
}

function attemptChunkUpload(
    url: string,
    chunk: Blob,
    onProgress?: (loaded: number) => void,
): ResultAsync<void, ApiError> {
    const promise = new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', url)
        xhr.timeout = CHUNK_TIMEOUT_MS

        if (onProgress) {
            xhr.upload.onprogress = e => {
                if (e.lengthComputable) onProgress(e.loaded)
            }
        }

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve()
            } else {
                reject(new HttpError(xhr.status, 'chunk upload failed'))
            }
        }

        xhr.onerror = () => reject(new NetworkError('network error'))
        xhr.ontimeout = () => reject(new NetworkError('request timed out'))
        xhr.onabort = () => reject(new NetworkError('request aborted'))

        const formData = new FormData()
        formData.append('chunk', chunk)
        xhr.send(formData)
    })

    return ResultAsync.fromPromise(promise, (e): ApiError => {
        if (e instanceof NetworkError || e instanceof HttpError) return e
        return new NetworkError(
            e instanceof Error ? e.message : 'unknown error',
        )
    })
}
