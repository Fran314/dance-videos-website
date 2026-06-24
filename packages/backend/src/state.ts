import path from 'path'
import { ok, err, okAsync, errAsync, ResultAsync } from 'neverthrow'
import { DATA_PATH, STORAGE_PATH } from './env.js'
import { getCodec } from './mp4box.js'
import {
    FilesystemError,
    readJsonFile,
    writeFile,
    rename,
    cp,
    rm,
    ensureDirs,
    exists,
} from './fs.js'
import { JsonParseError } from './json.js'
import type { GetCodecError } from './mp4box.js'
import {
    Course,
    Courses,
    CourseSummary,
    DateStr,
    entries,
    Id,
    isNonEmptySafeStr,
    isToken,
    keys,
    NonEmptySafeStr,
    parseCourses,
    parseUsers,
    randomNewId,
    randomToken,
    SafeStr,
    Token,
    User,
    Users,
    Video,
} from '@dance-videos/shared'

type Sessions = Record<Token, NonEmptySafeStr>

const isSessions = (data: unknown): data is Sessions => {
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return false
    for (const [key, value] of Object.entries(data)) {
        if (!isToken(key)) return false
        if (!isNonEmptySafeStr(value)) return false
    }
    return true
}

class NotFoundError extends Error {
    constructor(public readonly key: string) {
        super(key)
        this.name = 'NotFoundError'
    }
}

export type StateReadError = FilesystemError | JsonParseError
export type StateWriteError = FilesystemError
export type StateInitError = StateReadError
export type StateOperationError =
    | StateWriteError
    | NotFoundError
    | GetCodecError

const USERS_PATH = path.join(DATA_PATH, 'users.json')
const COURSES_PATH = path.join(DATA_PATH, 'courses.json')
const SESSIONS_PATH = path.join(DATA_PATH, 'sessions.json')

const THUMBNAILS_PATH = path.join(DATA_PATH, 'thumbnails')
export const VIDEOS_PATH = path.join(STORAGE_PATH, 'videos')
export const VIDEOS_ORIGINAL_PATH = path.join(STORAGE_PATH, 'videos-original')

const dirsResult = await ensureDirs(
    DATA_PATH,
    THUMBNAILS_PATH,
    VIDEOS_PATH,
    VIDEOS_ORIGINAL_PATH,
)
if (dirsResult.isErr()) {
    console.error(
        `Fatal: failed to create upload directories: ${dirsResult.error}`,
    )
    process.exit(1)
}

const atomicWrite = (
    object: object,
    filePath: string,
): ResultAsync<void, FilesystemError> => {
    const tempPath = filePath + '.tmp'
    return writeFile(tempPath, JSON.stringify(object, null, 2)).andThen(() =>
        rename(tempPath, filePath),
    )
}

class State {
    private users: Users = {}
    private courses: Courses = {}
    private sessions: Sessions = {}

    private writeLock: Promise<void> = Promise.resolve()

    constructor() {}

    init(): ResultAsync<void, StateInitError> {
        return ResultAsync.combine([
            this.readUsers(),
            this.readCourses(),
            this.readSessions(),
        ]).map(() => undefined)
    }

    private readUsers(): ResultAsync<void, StateReadError> {
        return exists(USERS_PATH).andThen(present => {
            if (!present) {
                this.users = {}
                return okAsync(undefined)
            }
            return readJsonFile(USERS_PATH).andThen(data => {
                const parsed = parseUsers(data)
                if (parsed.isErr())
                    return err(
                        new JsonParseError(USERS_PATH, parsed.error.message),
                    )
                this.users = parsed.value
                return ok(undefined)
            })
        })
    }
    private readCourses(): ResultAsync<void, StateReadError> {
        return exists(COURSES_PATH).andThen(present => {
            if (!present) {
                this.courses = {}
                return okAsync(undefined)
            }
            return readJsonFile(COURSES_PATH).andThen(data => {
                const parsed = parseCourses(data)
                if (parsed.isErr())
                    return err(
                        new JsonParseError(COURSES_PATH, parsed.error.message),
                    )
                this.courses = parsed.value
                return ok(undefined)
            })
        })
    }
    private readSessions(): ResultAsync<void, StateReadError> {
        return exists(SESSIONS_PATH).andThen(present => {
            if (!present) {
                this.sessions = {}
                return okAsync(undefined)
            }
            return readJsonFile(SESSIONS_PATH).andThen(data => {
                if (!isSessions(data))
                    return err(
                        new JsonParseError(SESSIONS_PATH, 'invalid structure'),
                    )
                this.sessions = data
                return ok(undefined)
            })
        })
    }

    private writeWithLock(
        data: object,
        filePath: string,
    ): ResultAsync<void, StateWriteError> {
        const op = ResultAsync.fromSafePromise(this.writeLock).andThen(() =>
            atomicWrite(data, filePath),
        )
        this.writeLock = op.match(
            () => {},
            () => {},
        )
        return op
    }

    private writeUsers() {
        return this.writeWithLock(this.users, USERS_PATH)
    }
    private writeCourses() {
        return this.writeWithLock(this.courses, COURSES_PATH)
    }
    private writeSessions() {
        return this.writeWithLock(this.sessions, SESSIONS_PATH)
    }

    // --- SESSIONS --- //
    getSession = (token: Token): NonEmptySafeStr | undefined => {
        return this.sessions[token]
    }
    addSession = (
        username: NonEmptySafeStr,
    ): ResultAsync<Token, StateWriteError> => {
        const token = randomToken()
        this.sessions[token] = username
        return this.writeSessions().map(() => token)
    }
    deleteSession = (token: Token): ResultAsync<void, StateWriteError> => {
        delete this.sessions[token]
        return this.writeSessions()
    }

    // --- USERS --- //
    getUsers = (): Users => {
        return this.users
    }
    getUser = (username: NonEmptySafeStr): User | undefined => {
        return this.users[username]
    }
    addUser = (
        username: NonEmptySafeStr,
        user: User,
    ): ResultAsync<void, StateWriteError> => {
        // TODO maybe throw error if username already used? Or should be handled by the caller (ie: checking getUser beforehand)
        this.users[username] = user
        return this.writeUsers()
    }
    deleteUser = (
        username: NonEmptySafeStr,
    ): ResultAsync<void, StateOperationError> => {
        if (this.users[username] === undefined)
            return errAsync(new NotFoundError(username))

        delete this.users[username]
        for (const token of keys(this.sessions)) {
            if (this.sessions[token] === username) {
                delete this.sessions[token]
            }
        }

        return this.writeUsers().andThen(() => this.writeSessions())
    }

    updateUser = (
        username: NonEmptySafeStr,
        user: Partial<User>,
    ): ResultAsync<void, StateOperationError> => {
        if (this.users[username] === undefined)
            return errAsync(new NotFoundError(username))

        this.users[username] = { ...this.users[username], ...user }
        return this.writeUsers()
    }
    getUserCourses = (username: NonEmptySafeStr): Record<Id, CourseSummary> => {
        const userCourses: Record<string, CourseSummary> = {}
        for (const [courseId, course] of entries(this.courses)) {
            if (this.hasAccessToCourse(username, courseId)) {
                const { videos, ...videolessCourse } = course
                userCourses[courseId] = videolessCourse
            }
        }

        return userCourses
    }

    // --- COURSES --- //
    getCourses = (): Courses => {
        return this.courses
    }
    getCourse = (courseId: Id): Course | undefined => {
        return this.courses[courseId]
    }
    private getCoursePath = (courseId: Id): string => {
        return path.join(VIDEOS_PATH, courseId)
    }
    private getCourseOriginalPath = (courseId: Id): string => {
        return path.join(VIDEOS_ORIGINAL_PATH, courseId)
    }
    private getCourseThumbnailPath = (courseId: Id): string => {
        return path.join(THUMBNAILS_PATH, courseId)
    }
    addCourse = (course: Course): ResultAsync<Id, StateWriteError> => {
        const courseId = randomNewId(keys(this.courses))
        this.courses[courseId] = course
        return this.writeCourses().map(() => courseId)
    }
    deleteCourse = (courseId: Id): ResultAsync<void, StateOperationError> => {
        if (this.courses[courseId] === undefined)
            return errAsync(new NotFoundError(courseId))

        delete this.courses[courseId]
        for (const user of Object.values(this.users)) {
            user.courses = user.courses.filter(c => c !== courseId)
        }

        const rmOpts = { recursive: true, force: true }
        return this.writeUsers()
            .andThen(() => this.writeCourses())
            .andThen(() => rm(this.getCoursePath(courseId), rmOpts))
            .andThen(() => rm(this.getCourseOriginalPath(courseId), rmOpts))
            .andThen(() => rm(this.getCourseThumbnailPath(courseId), rmOpts))
    }
    updateCourse = (
        courseId: Id,
        course: Partial<Course>,
    ): ResultAsync<void, StateOperationError> => {
        if (this.courses[courseId] === undefined)
            return errAsync(new NotFoundError(courseId))

        this.courses[courseId] = { ...this.courses[courseId], ...course }
        return this.writeCourses()
    }

    // --- VIDEOS -- //
    getVideo = (courseId: Id, videoId: Id): Video | undefined => {
        return this.courses[courseId]?.videos[videoId]
    }
    getVideoPath = (courseId: Id, videoId: Id): string => {
        return path.join(VIDEOS_PATH, courseId, `${videoId}-720p.mp4`)
    }
    getVideoOriginalPath = (courseId: Id, videoId: Id): string => {
        return path.join(VIDEOS_ORIGINAL_PATH, courseId, `${videoId}.mp4`)
    }
    getVideoThumbnailPath = (courseId: Id, videoId: Id): string => {
        return path.join(THUMBNAILS_PATH, courseId, `${videoId}.jpg`)
    }
    addVideo = (
        courseId: Id,
        thumbnailFile: string,
        videoFile: string,
        videoData: {
            date: DateStr
            uploadTimestamp: number
            label: SafeStr
        },
    ): ResultAsync<Id, StateOperationError> => {
        if (this.courses[courseId] === undefined)
            return errAsync(new NotFoundError(courseId))

        const videoId = randomNewId(keys(this.courses[courseId].videos))

        // Lock the id so that it doesn't get stolen by other calls of addVideo
        // This is meant to be only a temporary state. Any video found in this
        // state for a long period is a sign of unrecoverable data loss and
        // should be safe to delete
        this.courses[courseId].videos[videoId] = {
            ...videoData,
            status: 'locking',
            conversionProgress: 0,
            originalCodec: '',
            convertedCodec: '',
        }

        const thumbnailPath = this.getVideoThumbnailPath(courseId, videoId)
        const originalPath = this.getVideoOriginalPath(courseId, videoId)

        return cp(thumbnailFile, thumbnailPath)
            .andThen(() => cp(videoFile, originalPath))
            .andThen(() => getCodec(originalPath))
            .andThen(originalCodec => {
                this.courses[courseId]!.videos[videoId] = {
                    ...this.courses[courseId]!.videos[videoId]!,
                    status: 'queued',
                    originalCodec,
                }
                return this.writeCourses().map(() => videoId)
            })
            .orElse(e => {
                delete this.courses[courseId]?.videos[videoId]
                return errAsync(e)
            })
    }
    setProgressToVideo = (
        courseId: Id,
        videoId: Id,
        progress: number,
    ): ResultAsync<void, StateOperationError> => {
        if (this.courses[courseId] === undefined)
            return errAsync(new NotFoundError(courseId))
        if (this.courses[courseId].videos[videoId] === undefined)
            return errAsync(new NotFoundError(`${courseId}/${videoId}`))

        this.courses[courseId].videos[videoId] = {
            ...this.courses[courseId].videos[videoId],
            status: 'converting',
            conversionProgress: progress,
        }
        return this.writeCourses()
    }
    setErrorToVideo = (
        courseId: Id,
        videoId: Id,
    ): ResultAsync<void, StateOperationError> => {
        if (this.courses[courseId] === undefined)
            return errAsync(new NotFoundError(courseId))
        if (this.courses[courseId].videos[videoId] === undefined)
            return errAsync(new NotFoundError(`${courseId}/${videoId}`))

        this.courses[courseId].videos[videoId] = {
            ...this.courses[courseId].videos[videoId],
            status: 'error',
        }
        return this.writeCourses()
    }
    addConvertedToVideo = (
        courseId: Id,
        videoId: Id,
        videoFile: string,
    ): ResultAsync<void, StateOperationError> => {
        if (this.courses[courseId] === undefined)
            return errAsync(new NotFoundError(courseId))
        if (this.courses[courseId].videos[videoId] === undefined)
            return errAsync(new NotFoundError(`${courseId}/${videoId}`))

        const convertedPath = this.getVideoPath(courseId, videoId)
        return cp(videoFile, convertedPath)
            .andThen(() => getCodec(convertedPath))
            .andThen(convertedCodec => {
                this.courses[courseId]!.videos[videoId] = {
                    ...this.courses[courseId]!.videos[videoId]!,
                    status: 'converted',
                    conversionProgress: 100,
                    convertedCodec,
                }
                return this.writeCourses()
            })
    }
    updateVideo = (
        courseId: Id,
        videoId: Id,
        video: Partial<Video>,
    ): ResultAsync<void, StateOperationError> => {
        if (this.courses[courseId] === undefined)
            return errAsync(new NotFoundError(courseId))
        if (this.courses[courseId].videos[videoId] === undefined)
            return errAsync(new NotFoundError(`${courseId}/${videoId}`))

        this.courses[courseId].videos[videoId] = {
            ...this.courses[courseId].videos[videoId],
            ...video,
        }
        return this.writeCourses()
    }
    deleteVideo = (
        courseId: Id,
        videoId: Id,
    ): ResultAsync<void, StateOperationError> => {
        if (this.courses[courseId] === undefined)
            return errAsync(new NotFoundError(courseId))
        if (this.courses[courseId].videos[videoId] === undefined)
            return errAsync(new NotFoundError(`${courseId}/${videoId}`))

        const video = this.courses[courseId].videos[videoId]

        delete this.courses[courseId].videos[videoId]
        const force = { force: true }
        return this.writeCourses()
            .andThen(() =>
                rm(this.getVideoThumbnailPath(courseId, videoId), force),
            )
            .andThen(() =>
                rm(this.getVideoOriginalPath(courseId, videoId), force),
            )
            .andThen(() =>
                video.status !== 'converted'
                    ? okAsync(undefined)
                    : rm(this.getVideoPath(courseId, videoId), force),
            )
    }

    getUnfinishedVideos = (): { courseId: Id; videoId: Id }[] => {
        const output: { courseId: Id; videoId: Id }[] = []
        for (const [courseId, course] of entries(this.getCourses())) {
            for (const [videoId, video] of entries(course.videos)) {
                if (video.status !== 'converted' && video.status !== 'error') {
                    output.push({ courseId: courseId, videoId: videoId })
                }
            }
        }
        return output
    }

    hasAccessToCourse = (username: NonEmptySafeStr, courseId: Id): boolean => {
        const user = this.users[username]
        if (user === undefined) return false

        const course = this.courses[courseId]
        if (course === undefined) return false

        return user.admin || user.courses.includes(courseId)
    }
    hasAccessToVideo = (
        username: NonEmptySafeStr,
        courseId: Id,
        videoId: Id,
    ): boolean => {
        const user = this.users[username]
        if (user === undefined) return false

        const course = this.courses[courseId]
        if (course === undefined) return false

        const video = course.videos[videoId]
        if (video === undefined) return false

        return user.admin || user.courses.includes(courseId)
    }

    // --- UTILITIES --- //

    /* CAN throw */
    /* utility function for acting on all videos directly on backend */
    rescanLibrary = async () => {
        // for (const courseId in this.#courses) {
        //     for (const videoId in this.#courses[courseId].videos) {
        //         const originalPath = this.getVideoOriginalPath(
        //             courseId,
        //             videoId,
        //         )
        //         const originalCodec = await getCodec(originalPath)
        //
        //         const convertedPath = this.getVideoPath(courseId, videoId)
        //         const convertedCodec = await getCodec(convertedPath)
        //
        //         this.#courses[courseId].videos[videoId] = {
        //             ...this.#courses[courseId].videos[videoId],
        //             originalCodec,
        //             convertedCodec,
        //             status: 'converted',
        //         }
        //     }
        // }
        // await this.#writeCourses()
    }
}

export const state = new State()

const initRes = await state.init()
if (initRes.isErr()) {
    // TODO should this be logged by the logger aswell?
    // Is it possible to access the logger here?
    // Should it be possible to access the logger here?
    console.error(`Fatal: failed to initialize state: ${initRes.error}`)
    process.exit(1)
}
