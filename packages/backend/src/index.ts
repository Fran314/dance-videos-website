import path from 'path'
import express, { NextFunction, Request, Response } from 'express'
import cookieParser from 'cookie-parser'
import { rateLimit } from 'express-rate-limit'
import { ResultAsync } from 'neverthrow'

import './types.js'

import { PORT, TEMP_PATH, VERBOSE_LOG } from './env.js'
import { expressLogger as logger } from './logger.js'
import { frontendRouter } from './frontend.js'
import { state } from './state.js'
import {
    FfmpegOperationError,
    generateThumbnail,
    transcodeFastStart,
} from './video-processing/ffmpeg.js'
import { queueTranscoder } from './video-processing/queue.js'
import { chunkUploader, chunkUploadMiddleware } from './chunkUploader.js'
import { createReadStream, ensureEmptyDir, rm, stat } from './fs.js'
import { randomFileName, toKebabCase } from './utils.js'
import { promisify } from 'util'
import {
    Id,
    isToken,
    isNonEmptySafeStr,
    keys,
    randomPassword,
    CHUNK_UPLOAD_SIZE,
    parseLoginBody,
    parseAddUserParams,
    parseAddUserBody,
    parseAddCourseBody,
    parseCourseIdParams,
    parseCourseVideoParams,
    parseAddVideoBody,
    parseUpdateVideoBody,
    parseHashParams,
    parseUploadChunkParams,
    parseInitUploadBody,
} from '@dance-videos/shared'

const PROCESSING_PATH = path.join(TEMP_PATH, 'processing')
const dirsResult = await ResultAsync.combine([ensureEmptyDir(PROCESSING_PATH)])
if (dirsResult.isErr()) {
    console.error(
        `Fatal: failed to create processing directory: ${dirsResult.error}`,
    )
    process.exit(1)
}

logger.literal('Starting service...')

if (keys(state.getUsers()).length === 0) {
    const username = 'admin'
    if (!isNonEmptySafeStr(username)) {
        console.error(`Fatal: invalid initial admin username: ${username}`)
        process.exit(1)
    }
    const password = randomPassword()
    const addRes = await state.addUser(username, {
        password,
        admin: true,
        courses: [],
    })
    if (addRes.isErr()) {
        console.error(`Fatal: failed to create initial admin: ${addRes.error}`)
        process.exit(1)
    }
    logger.literal(
        `Initial admin created: username 'admin', password '${password}'. Log in and change it as soon as possible.`,
    )
}

const onTranscodeSuccess = async (
    courseId: Id,
    videoId: Id,
    outFile: string,
) => {
    // The video might have been removed meanwhile
    if (state.getVideo(courseId, videoId) === undefined) {
        logger.literal(
            `Failed to add converted video  ${courseId}-${videoId} because video doesn't exist anymore`,
        )
    } else {
        const addRes = await state.addConvertedToVideo(
            courseId,
            videoId,
            outFile,
        )
        if (addRes.isErr()) {
            logger.literal(
                `Failed to add converted video ${courseId}:${videoId} to state: ${addRes.error}`,
            )
        }
    }

    const rmRes = await rm(outFile)
    if (rmRes.isErr()) {
        logger.literal(
            `Failed to remove transcode output file ${outFile}: ${rmRes.error}`,
        )
    }
}
const onTranscodeError = async (
    courseId: Id,
    videoId: Id,
    error: FfmpegOperationError,
) => {
    logger.literal(
        `Transcode failed for video ${courseId}-${videoId}: ${error}`,
    )
    // The video might have been removed meanwhile
    if (state.getVideo(courseId, videoId) === undefined) {
        logger.literal(
            `Failed to set error to video ${courseId}-${videoId} because video doesn't exist anymore`,
        )
    } else {
        const setErrRes = await state.setErrorToVideo(courseId, videoId)
        if (setErrRes.isErr()) {
            logger.literal(
                `Failed to set error to video ${courseId}-${videoId}: ${setErrRes.error}`,
            )
        }
    }
}
const onTranscodeProgress = async (
    courseId: Id,
    videoId: Id,
    progress: number,
) => {
    const video = state.getVideo(courseId, videoId)
    // Avoid race conditions
    if (video?.status === 'queued' || video?.status === 'converting') {
        const setProgRes = await state.setProgressToVideo(
            courseId,
            videoId,
            progress,
        )
        if (setProgRes.isErr()) {
            logger.literal(
                `Failed to set progress to video ${courseId}-${videoId}: ${setProgRes.error}`,
            )
        }
    }
}

for (const { courseId, videoId } of state.getUnfinishedVideos()) {
    const source = state.getVideoOriginalPath(courseId, videoId)
    logger.literal(`Re-queuing unconverted video ${courseId}:${videoId}`)
    queueTranscoder.transcode(
        source,
        courseId,
        videoId,
        onTranscodeProgress,
        onTranscodeSuccess,
        onTranscodeError,
    )
}

const app = express()
const api = express.Router()

// Necessary assuming that this website sits behind a reverse-proxy. It makes
// it so that the IP seen by express is the actual IP that made the request to
// the reverse-proxy. Otherwise, it would see something like 127.0.0.1 as the
// IP.
//
// This is hardcoded and not exactly flexible.
// TODO: change this to something customizeable for people who run this website NOT
// behind reverse-proxy (though they shouldn't as this does nothing to handle HTTPS)
app.set('trust proxy', 1)

app.use(express.json())
app.use(cookieParser())

//
// --- MIDDLEWARES --- //
const limiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    limit: 10,
    message: (req: Request, _res: Response) => {
        logger.warn(req, 429, 'too many attempts')
        return 'too many attempts, try again later'
    },
})

/*
 * Guarantees that:
 * - req.sessionToken satisfies isToken
 * - req.username satisfies isValidUsername
 * - req.username is associated to req.sessionToken
 * - req.user is associated to req.username
 */
const authenticated = (req: Request, res: Response, next: NextFunction) => {
    const sessionToken: unknown = req.cookies['session-token']
    if (!isToken(sessionToken)) {
        logger.warn(req, 401, 'failed authentication: invalid session token')
        return res.sendStatus(401)
    }

    const username = state.getSession(sessionToken)
    if (username === undefined) {
        logger.warn(
            req,
            401,
            `failed authentication: unknown session token '${sessionToken}'`,
        )
        return res.sendStatus(401)
    }

    const user = state.getUser(username)
    if (user === undefined) {
        logger.error(
            req,
            500,
            `failed authentication: existing session token '${sessionToken}' associated to non-existing user '${username}'`,
        )
        return res.sendStatus(500)
    }

    req.sessionToken = sessionToken
    req.username = username
    req.user = user
    next()
}
const isAdmin = (req: Request, res: Response, next: NextFunction) => {
    if (!req.user?.admin) {
        logger.warn(
            req,
            403,
            `attempted to access admin area by non admin user '${req.username}'`,
        )
        return res.sendStatus(403)
    }
    next()
}
// --- --- //
//

//
// --- LOGIN/OUT ROUTES --- //

/**
 * POST /login
 *
 * Creates session for user
 *
 * Returns:
 *  - 200
 *  - 400: invalid request
 *  - 401 polite: invalid credentials
 *  - 500: internal server error
 */

api.post('/login', limiter, async (req, res) => {
    const body = parseLoginBody(req.body)
    if (body.isErr()) {
        logger.warn(req, 400, body.error.message)
        return res.sendStatus(400)
    }
    const { username, password } = body.value

    const user = state.getUser(username)
    if (user === undefined) {
        logger.warn(req, 401, `user ${username} doesn't exist`)
        return res.sendStatus(401)
    }

    if (password !== user.password) {
        logger.warn(req, 401, 'incorrect password')
        return res.sendStatus(401)
    }

    const result = await state.addSession(username)
    if (result.isErr()) {
        logger.error(req, 500, `failed to create session: ${result.error}`)
        return res.sendStatus(500)
    }

    const token = result.value
    res.cookie('session-token', token, { maxAge: 365 * 24 * 60 * 60 * 1000 })

    logger.info(req, 200)
    return res.sendStatus(200)
})

/**
 * POST /logout [authenticated]
 *
 * Removes session for authenticated user
 *
 * Returns:
 *  - 200
 *  - 401: not authenticated
 *  - 500: internal server error
 */
api.post('/logout', [authenticated], async (req: Request, res: Response) => {
    const sessionToken = req.sessionToken!

    const deleteRes = await state.deleteSession(sessionToken)
    if (deleteRes.isErr()) {
        logger.error(req, 500, `failed to delete session: ${deleteRes.error}`)
        return res.sendStatus(500)
    }
    res.clearCookie('session-token')

    logger.info(req, 200)
    return res.sendStatus(200)
})
// --- --- //
//

//
// --- USER ROUTES --- //

/**
 * GET /users [authenticated, isAdmin]
 *
 * Returns all the users
 *
 * Returns:
 *  - 200
 *  - 401: not authenticated
 *  - 403: not admin
 */
api.get('/users', [authenticated, isAdmin], (req: Request, res: Response) => {
    const users = state.getUsers()
    logger.info(req, 200)
    return res.status(200).send(users)
})

/**
 * GET /users/self [authenticated]
 *
 * Returns information about the user making the request
 *
 * Returns:
 *  - 200
 *  - 401: not authenticated
 */
api.get('/users/self', [authenticated], (req: Request, res: Response) => {
    const username = req.username!
    const admin = req.user!.admin

    const courses = state.getUserCourses(username)

    logger.info(req, 200)
    return res.status(200).send({
        username,
        admin,
        courses,
    })
})

/**
 * POST /user/:username/add [authenticated, isAdmin]
 *
 * Creates user `:username`
 *
 * Returns:
 *  - 200
 *  - 409 polite: username già esistente
 *  - 401: not authenticated
 *  - 403: not admin
 *  - 400: invalid form
 *  - 500: internal server error
 */
api.post(
    '/users/:username/add',
    [authenticated, isAdmin],
    async (req: Request, res: Response) => {
        const params = parseAddUserParams(req.params)
        if (params.isErr()) {
            logger.warn(req, 400, params.error.message)
            return res.sendStatus(400)
        }
        const { username } = params.value

        const body = parseAddUserBody(req.body)
        if (body.isErr()) {
            logger.warn(req, 400, body.error.message)
            return res.sendStatus(400)
        }
        const { password, admin, courses } = body.value

        for (const course of courses) {
            if (state.getCourse(course) === undefined) {
                logger.warn(
                    req,
                    400,
                    'invalid courses field (non-existing course)',
                )
                return res.sendStatus(400)
            }
        }

        if (state.getUser(username) !== undefined) {
            logger.warn(req, 409, 'username already exists')
            return res.sendStatus(409)
        }

        const addRes = await state.addUser(username, {
            password,
            admin,
            courses,
        })
        if (addRes.isErr()) {
            logger.error(
                req,
                500,
                `failed to add user ${username}: ${addRes.error}`,
            )
            return res.sendStatus(500)
        }

        logger.info(req, 200)
        return res.sendStatus(200)
    },
)

/**
 * POST /users/:username/delete [authenticated, isAdmin]
 *
 * Deletes user `:username`
 *
 * Returns:
 *  - 200
 *  - 401: not authenticated
 *  - 403: not admin
 *  - 400: user does not exist
 *  - 500: internal server error
 */
api.post(
    '/users/:username/delete',
    [authenticated, isAdmin],
    async (req: Request, res: Response) => {
        const params = parseAddUserParams(req.params)
        if (params.isErr()) {
            logger.warn(req, 400, params.error.message)
            return res.sendStatus(400)
        }
        const { username } = params.value

        if (state.getUser(username) === undefined) {
            logger.warn(req, 400, `user ${username} doesn't exist`)
            return res.sendStatus(400)
        }

        const deleteRes = await state.deleteUser(username)
        if (deleteRes.isErr()) {
            logger.error(
                req,
                500,
                `failed to delete user ${username}: ${deleteRes.error}`,
            )
            return res.sendStatus(500)
        }

        logger.info(req, 200)
        return res.sendStatus(200)
    },
)

/**
 * POST /users/:username/update [authenticated, isAdmin]
 *
 * Updates user `:username`
 *
 * Returns:
 *  - 200
 *  - 401: not authenticated
 *  - 403: not admin
 *  - 400: invalid form
 *  - 500: internal server error
 */
api.post(
    '/users/:username/update',
    [authenticated, isAdmin],
    async (req: Request, res: Response) => {
        const params = parseAddUserParams(req.params)
        if (params.isErr()) {
            logger.warn(req, 400, params.error.message)
            return res.sendStatus(400)
        }
        const { username } = params.value

        const body = parseAddUserBody(req.body)
        if (body.isErr()) {
            logger.warn(req, 400, body.error.message)
            return res.sendStatus(400)
        }
        const { password, admin, courses } = body.value

        for (const course of courses) {
            if (state.getCourse(course) === undefined) {
                logger.warn(
                    req,
                    400,
                    'invalid courses field (non-existing course)',
                )
                return res.sendStatus(400)
            }
        }

        if (state.getUser(username) === undefined) {
            logger.warn(req, 400, `user ${username} doesn't exist`)
            return res.sendStatus(400)
        }

        const updateRes = await state.updateUser(username, {
            password,
            admin,
            courses,
        })
        if (updateRes.isErr()) {
            logger.error(
                req,
                500,
                `failed to update user ${username}: ${updateRes.error}`,
            )
            return res.sendStatus(500)
        }

        logger.info(req, 200)
        return res.sendStatus(200)
    },
)
// --- --- //
//

//
// --- COURSES ROUTES --- //

/**
 * GET /courses [authenticated, isAdmin]
 *
 * Returns all the courses
 *
 * Returns:
 *  - 200
 *  - 401: not authenticated
 *  - 403: not admin
 */
api.get('/courses', [authenticated, isAdmin], (req: Request, res: Response) => {
    const courses = state.getCourses()
    logger.info(req, 200)
    return res.status(200).send(courses)
})

/**
 * POST /courses/add [authenticated, isAdmin]
 *
 * Creates a new course
 *
 * Returns:
 *  - 200
 *  - 401: not authenticated
 *  - 403: not admin
 *  - 400: invalid form
 *  - 500: internal server error
 */
api.post(
    '/courses/add',
    [authenticated, isAdmin],
    async (req: Request, res: Response) => {
        const body = parseAddCourseBody(req.body)
        if (body.isErr()) {
            logger.warn(req, 400, body.error.message)
            return res.sendStatus(400)
        }
        const { displayName, year } = body.value

        const addRes = await state.addCourse({ displayName, year, videos: {} })
        if (addRes.isErr()) {
            logger.error(req, 500, `failed to add course ${addRes.error}`)
            return res.sendStatus(500)
        }

        logger.info(req, 200)
        return res.sendStatus(200)
    },
)

/**
 * POST /courses/:courseId/delete [authenticated, isAdmin]
 *
 * Deletes course `:courseId`
 *
 * Returns:
 *  - 200
 *  - 401: not authenticated
 *  - 403: not admin
 *  - 400: invalid form
 *  - 500: internal server error
 */
api.post(
    '/courses/:courseId/delete',
    [authenticated, isAdmin],
    async (req: Request, res: Response) => {
        const params = parseCourseIdParams(req.params)
        if (params.isErr()) {
            logger.warn(req, 400, params.error.message)
            return res.sendStatus(400)
        }
        const { courseId } = params.value

        if (state.getCourse(courseId) === undefined) {
            logger.warn(req, 400, `course ${courseId} doesn't exist`)
            return res.sendStatus(400)
        }

        // TODO IMPORTANT this should also abort transcodes

        const deleteRes = await state.deleteCourse(courseId)
        if (deleteRes.isErr()) {
            logger.error(req, 500, `failed to delete course ${deleteRes.error}`)
            return res.sendStatus(500)
        }

        logger.info(req, 200)
        return res.sendStatus(200)
    },
)

/**
 * POST /courses/:courseId/update [authenticated, isAdmin]
 *
 * Updates course `:courseId`
 *
 * Returns:
 *  - 200
 *  - 401: not authenticated
 *  - 403: not admin
 *  - 400: invalid form
 *  - 500: internal server error
 */
api.post(
    '/courses/:courseId/update',
    [authenticated, isAdmin],
    async (req: Request, res: Response) => {
        const params = parseCourseIdParams(req.params)
        if (params.isErr()) {
            logger.warn(req, 400, params.error.message)
            return res.sendStatus(400)
        }
        const { courseId } = params.value

        const body = parseAddCourseBody(req.body)
        if (body.isErr()) {
            logger.warn(req, 400, body.error.message)
            return res.sendStatus(400)
        }
        const { displayName, year } = body.value

        if (state.getCourse(courseId) === undefined) {
            logger.warn(req, 400, `course ${courseId} doesn't exist`)
            return res.sendStatus(400)
        }

        const updateRes = await state.updateCourse(courseId, {
            displayName,
            year,
        })
        if (updateRes.isErr()) {
            logger.error(req, 500, `failed to update course ${updateRes.error}`)
            return res.sendStatus(500)
        }

        logger.info(req, 200)
        return res.sendStatus(200)
    },
)

/**
 * GET /courses/:courseId [authenticated]
 *
 * Returns course `:courseId`
 *
 * Returns:
 *  - 200
 *  - 401: not authenticated
 *  - 403: not authorized
 *  - 400: invalid form
 */
api.get(
    '/courses/:courseId',
    [authenticated],
    (req: Request, res: Response) => {
        const username = req.username!

        const params = parseCourseIdParams(req.params)
        if (params.isErr()) {
            logger.warn(req, 400, params.error.message)
            return res.sendStatus(400)
        }
        const { courseId } = params.value

        const course = state.getCourse(courseId)
        if (course === undefined) {
            logger.warn(req, 400, `course ${courseId} doesn't exist`)
            return res.sendStatus(400)
        }

        if (!state.hasAccessToCourse(username, courseId)) {
            logger.warn(
                req,
                403,
                `user doesn't have access to course ${courseId}`,
            )
            return res.sendStatus(403)
        }

        logger.info(req, 200)
        return res.status(200).send(course)
    },
)

/**
 * POST /courses/:courseId/videos/add [authenticated, isAdmin]
 *
 * Uploads a new video for the course `:courseId`
 *
 * Returns:
 *  - 206
 *  - 401: not authenticated
 *  - 403: not admin
 *  - 400: invalid form
 *  - 500: internal server error
 */
api.post(
    '/courses/:courseId/videos/add',
    [authenticated, isAdmin],
    async (req: Request, res: Response) => {
        const params = parseCourseIdParams(req.params)
        if (params.isErr()) {
            logger.warn(req, 400, params.error.message)
            return res.sendStatus(400)
        }
        const { courseId } = params.value

        const body = parseAddVideoBody(req.body)
        if (body.isErr()) {
            logger.warn(req, 400, body.error.message)
            return res.sendStatus(400)
        }
        const { date, label, file } = body.value

        const uploadTimestamp = Date.now()

        const course = state.getCourse(courseId)
        if (course === undefined) {
            logger.warn(req, 400, `course ${courseId} doesn't exist`)
            return res.sendStatus(400)
        }
        const readyRes = await chunkUploader.fileReady(file)
        if (readyRes.isErr()) {
            logger.error(
                req,
                500,
                `failed to check if file is ready ${readyRes.error}`,
            )
            return res.sendStatus(500)
        }
        if (!readyRes.value) {
            logger.warn(req, 400, "file isn't ready")
            return res.sendStatus(400)
        }

        //                                                        //
        // --- Checks succeded, procede with video processing --- //
        //                                                        //

        const source = path.join(PROCESSING_PATH, randomFileName('.mp4'))
        const moveRes = await chunkUploader.moveFile(file, source)
        if (moveRes.isErr()) {
            logger.error(
                req,
                500,
                `failed to move uploaded file: ${moveRes.error}`,
            )
            return res.sendStatus(500)
        }

        const thmbRes = await generateThumbnail(source)
        if (thmbRes.isErr()) {
            logger.error(
                req,
                500,
                `failed to generate thumbnail: ${thmbRes.error}`,
            )
            return res.sendStatus(500)
        }
        const thmbFile = thmbRes.value

        const fsRes = await transcodeFastStart(source)
        if (fsRes.isErr()) {
            logger.error(
                req,
                500,
                `failed to transcode to faststart: ${fsRes.error}`,
            )
            return res.sendStatus(500)
        }
        const fsFile = fsRes.value

        const addRes = await state.addVideo(courseId, thmbFile, fsFile, {
            date,
            uploadTimestamp,
            label,
        })
        if (addRes.isErr()) {
            logger.error(req, 500, `failed to add video: ${addRes.error}`)
            return res.sendStatus(500)
        }
        const videoId = addRes.value

        const cleanupRes = await ResultAsync.combine([rm(thmbFile), rm(fsFile)])
        if (cleanupRes.isErr()) {
            logger.error(
                req,
                500,
                `failed to clean up files of new video: ${cleanupRes.error}`,
            )
            return res.sendStatus(500)
        }

        logger.info(req, 206)
        res.sendStatus(206)

        const videoOrigSrc = state.getVideoOriginalPath(courseId, videoId)
        queueTranscoder.transcode(
            videoOrigSrc,
            courseId,
            videoId,
            onTranscodeProgress,
            onTranscodeSuccess,
            onTranscodeError,
        )
    },
)

/**
 * POST /courses/:courseId/videos/:videoId/delete [authenticated, isAdmin]
 *
 * Deletes the video `:videoId` for the course `:courseId`
 *
 * Returns:
 *  - 200
 *  - 401: not authenticated
 *  - 403: not admin
 *  - 400: invalid form
 *  - 500: internal server error
 */
api.post(
    '/courses/:courseId/videos/:videoId/delete',
    [authenticated, isAdmin],
    async (req: Request, res: Response) => {
        const params = parseCourseVideoParams(req.params)
        if (params.isErr()) {
            logger.warn(req, 400, params.error.message)
            return res.sendStatus(400)
        }
        const { courseId, videoId } = params.value

        if (state.getCourse(courseId) === undefined) {
            logger.warn(req, 400, `course ${courseId} doesn't exist`)
            return res.sendStatus(400)
        }
        if (state.getVideo(courseId, videoId) === undefined) {
            logger.warn(
                req,
                400,
                `video ${videoId} for course ${courseId} doesn't exist`,
            )
            return res.sendStatus(400)
        }

        queueTranscoder.abortTranscode(courseId, videoId)
        const deleteRes = await state.deleteVideo(courseId, videoId)
        if (deleteRes.isErr()) {
            logger.error(req, 500, `failed to delete video: ${deleteRes.error}`)
            return res.sendStatus(500)
        }

        logger.info(req, 200)
        return res.sendStatus(200)
    },
)

/**
 * POST /courses/:courseId/videos/:videoId/update [authenticated, isAdmin]
 *
 * Updates the video `:videoId` for the course `:courseId`
 *
 * Returns:
 *  - 200
 *  - 401: not authenticated
 *  - 403: not admin
 *  - 400: invalid form
 *  - 500: internal server error
 */
api.post(
    '/courses/:courseId/videos/:videoId/update',
    [authenticated, isAdmin],
    async (req: Request, res: Response) => {
        const params = parseCourseVideoParams(req.params)
        if (params.isErr()) {
            logger.warn(req, 400, params.error.message)
            return res.sendStatus(400)
        }
        const { courseId, videoId } = params.value

        const body = parseUpdateVideoBody(req.body)
        if (body.isErr()) {
            logger.warn(req, 400, body.error.message)
            return res.sendStatus(400)
        }
        const { date, label } = body.value

        if (state.getCourse(courseId) === undefined) {
            logger.warn(req, 400, `course ${courseId} doesn't exist`)
            return res.sendStatus(400)
        }
        if (state.getVideo(courseId, videoId) === undefined) {
            logger.warn(
                req,
                400,
                `video ${videoId} for course ${courseId} doesn't exist`,
            )
            return res.sendStatus(400)
        }

        const updateRes = await state.updateVideo(courseId, videoId, {
            label,
            date,
        })
        if (updateRes.isErr()) {
            logger.error(req, 500, `failed to update video: ${updateRes.error}`)
            return res.sendStatus(500)
        }

        logger.info(req, 200)
        return res.sendStatus(200)
    },
)

/**
 * GET /courses/:courseId/videos/:videoId/thumbnail [authenticated]
 *
 * Returns the thumbnail of the video `:videoId` for the course `:courseId`
 *
 * Returns:
 *  - 200
 *  - 401: not authenticated
 *  - 403: not authorized
 *  - 400: invalid request
 *  - 500: internal server error
 */
api.get(
    '/courses/:courseId/videos/:videoId/thumbnail',
    [authenticated],
    (req: Request, res: Response) => {
        const username = req.username!

        const params = parseCourseVideoParams(req.params)
        if (params.isErr()) {
            logger.warn(req, 400, params.error.message)
            return res.sendStatus(400)
        }
        const { courseId, videoId } = params.value

        if (state.getCourse(courseId) === undefined) {
            logger.warn(req, 400, `course ${courseId} doesn't exist`)
            return res.sendStatus(400)
        }
        if (state.getVideo(courseId, videoId) === undefined) {
            logger.warn(
                req,
                400,
                `video ${videoId} for course ${courseId} doesn't exist`,
            )
            return res.sendStatus(400)
        }

        if (!state.hasAccessToVideo(username, courseId, videoId)) {
            logger.warn(
                req,
                403,
                `user doesn't have access to video ${videoId} of course ${courseId}`,
            )
            return res.sendStatus(403)
        }

        const thumbnailPath = state.getVideoThumbnailPath(courseId, videoId)

        if (VERBOSE_LOG) logger.info(req, 200)
        // The resolve here is only necessary because sendFile requires an
        // absolute path and thumbnailPath, which starts with the DATA_PATH from
        // env, might not be absolute
        return res.sendFile(path.resolve(thumbnailPath))
    },
)

/**
 * GET /courses/:courseId/videos/:videoId [authenticated]
 *
 * Returns the video `:videoId` for the course `:courseId`, either completely
 * or just the specified range
 *
 * Returns:
 *  - 200
 *  - 401: not authenticated
 *  - 403: not authorized
 *  - 400: invalid request
 */
api.get(
    '/courses/:courseId/videos/:videoId',
    [authenticated],
    (req: Request, res: Response) => {
        const username = req.username!
        const original = req.query?.quality === 'original'

        const params = parseCourseVideoParams(req.params)
        if (params.isErr()) {
            logger.warn(req, 400, params.error.message)
            return res.sendStatus(400)
        }
        const { courseId, videoId } = params.value

        const course = state.getCourse(courseId)
        if (course === undefined) {
            logger.warn(req, 400, `course ${courseId} doesn't exist`)
            return res.sendStatus(400)
        }
        const video = state.getVideo(courseId, videoId)
        if (video === undefined) {
            logger.warn(
                req,
                400,
                `video ${videoId} for course ${courseId} doesn't exist`,
            )
            return res.sendStatus(400)
        }

        if (!state.hasAccessToVideo(username, courseId, videoId)) {
            logger.warn(
                req,
                403,
                `user doesn't have access to video ${videoId} of course ${courseId}`,
            )
            return res.sendStatus(403)
        }

        const range = req.headers.range

        const videoPath = original
            ? state.getVideoOriginalPath(courseId, videoId)
            : state.getVideoPath(courseId, videoId)

        const statRes = stat(videoPath)
        if (statRes.isErr()) {
            logger.error(
                req,
                500,
                `failed to get stat of ${videoPath}: ${statRes.error}`,
            )
            return res.sendStatus(500)
        }
        const fileSize = statRes.value.size

        if (!range) {
            if (VERBOSE_LOG) logger.info(req, 200)
            const readStreamRes = createReadStream(videoPath)
            if (readStreamRes.isErr()) {
                logger.error(
                    req,
                    500,
                    `failed to open read stream for ${videoPath}: ${readStreamRes.error}`,
                )
                return res.sendStatus(500)
            }

            res.writeHead(200, {
                'Content-Length': fileSize,
                'Content-Type': 'video/mp4',
                'Content-Disposition': `filename="${toKebabCase(course.displayName)}_${video.date}.mp4"`,
            })
            readStreamRes.value.pipe(res)
        } else {
            const CHUNK_SIZE = 5 * 1024 * 1024 // 5MB

            const parts = range.replace(/bytes=/, '').split('-')
            const start = parseInt(parts[0]!, 10)
            let end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
            end = Math.min(start + CHUNK_SIZE - 1, end, fileSize - 1)
            const chunkSize = end - start + 1

            if (VERBOSE_LOG) logger.info(req, 206)
            const readStreamRes = createReadStream(videoPath, { start, end })
            if (readStreamRes.isErr()) {
                logger.error(
                    req,
                    500,
                    `failed to open read stream for ${videoPath}: ${readStreamRes.error}`,
                )
                return res.sendStatus(500)
            }

            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunkSize,
                'Content-Type': 'video/mp4',
            })
            readStreamRes.value.pipe(res)
        }
    },
)
// --- --- //
//

//
// --- FILE UPLOADING --- //
/**
 * POST /file-upload/:hash/init [authenticated, isAdmin]
 *
 * Initializes the `:hash` file upload if it isn't already initialized
 *
 * Returns:
 *  - 200 + already uploaded chunks
 *  - 400: invalid request
 *  - 500: not enough space
 *  - 403: not owner
 */
api.post(
    '/file-upload/:hash/init',
    [authenticated, isAdmin],
    async (req: Request, res: Response) => {
        const username = req.username!

        const params = parseHashParams(req.params)
        if (params.isErr()) {
            logger.warn(req, 400, params.error.message)
            return res.sendStatus(400)
        }
        const { hash } = params.value

        const body = parseInitUploadBody(req.body)
        if (body.isErr()) {
            logger.warn(req, 400, body.error.message)
            return res.sendStatus(400)
        }
        const { size } = body.value

        const entry = chunkUploader.getUpload(hash)
        if (entry !== undefined) {
            if (entry.owner !== username) {
                logger.warn(
                    req,
                    403,
                    'upload already started and owned by different user',
                )
                return res.sendStatus(403)
            } else {
                logger.info(req, 200)
                return res.status(200).send(entry.chunks)
            }
        }

        const spaceResult = await chunkUploader.checkDiskSpace(size)
        if (spaceResult.isErr()) {
            logger.error(
                req,
                500,
                `failed to check disk space: ${spaceResult.error.message}`,
            )
            return res.sendStatus(500)
        }

        chunkUploader.createUpload(hash, username, size)

        logger.info(req, 200)
        res.status(200).send([])
    },
)

/**
 * POST /file-upload/:hash/finalize [authenticated, isAdmin]
 *
 * Finalize the `:hash` file upload
 *
 * Returns:
 *  - 200 + { token }
 *  - 400: invalid request
 *  - 403: not owner
 *  - 500: failed to concatenate files
 */
api.post(
    '/file-upload/:hash/finalize',
    [authenticated, isAdmin],
    async (req: Request, res: Response) => {
        const username = req.username!

        const params = parseHashParams(req.params)
        if (params.isErr()) {
            logger.warn(req, 400, params.error.message)
            return res.sendStatus(400)
        }
        const { hash } = params.value

        const entry = chunkUploader.getUpload(hash)
        if (entry === undefined) {
            logger.warn(req, 400, `upload ${hash} doesn't exist`)
            return res.sendStatus(400)
        }
        if (entry.owner !== username) {
            logger.warn(req, 403, `upload ${hash} owned by different user`)
            return res.sendStatus(403)
        }

        if (!chunkUploader.areChunksComplete(hash)) {
            logger.warn(req, 400, `upload ${hash} is missing some chunks`)
            return res.sendStatus(400)
        }

        const concRes = await chunkUploader.concatenateChunks(hash)
        if (concRes.isErr()) {
            logger.error(req, 500, `internal error: ${concRes.error}`)
            return res.sendStatus(500)
        }
        const finalizedToken = concRes.value

        chunkUploader.deleteUpload(hash)

        const rmRes = await chunkUploader.cleanupChunks(hash)
        if (rmRes.isErr()) {
            logger.error(
                req,
                500,
                `failed to clean up chunks for ${hash}: ${rmRes.error}`,
            )
            return res.sendStatus(500)
        }

        logger.info(req, 200)
        res.status(200).send({ token: finalizedToken })
    },
)

/**
 * POST /file-upload/:hash/:idx [authenticated, isAdmin]
 *
 * Uploads the `:idx`-th chunk for the `:hash` file
 *
 * Returns:
 *  - 200
 *  - 400: invalid request
 *  - 403: not owner
 *  - 409: chunk already sent
 */
api.post(
    '/file-upload/:hash/:idx',
    [authenticated, isAdmin, chunkUploadMiddleware],
    async (req: Request, res: Response) => {
        // Multer writes the file before this handler runs, so any early
        // return must clean up the temp file to avoid orphans
        const cleanupIncoming = async () => {
            if (req.file) {
                const rmRes = await rm(req.file.path, { force: true })
                if (rmRes.isErr()) {
                    logger.literal('failed to cleanup incoming chunk')
                }
            }
        }

        const username = req.username!

        const chunk = req.file
        if (!chunk) {
            logger.warn(req, 400, 'chunk missing')
            return res.sendStatus(400)
        }

        const params = parseUploadChunkParams(req.params)
        if (params.isErr()) {
            logger.warn(req, 400, params.error.message)
            await cleanupIncoming()
            return res.sendStatus(400)
        }
        const { hash } = params.value

        const entry = chunkUploader.getUpload(hash)
        if (entry === undefined) {
            logger.warn(req, 400, `upload ${hash} doesn't exist`)
            await cleanupIncoming()
            return res.sendStatus(400)
        }
        if (entry.owner !== username) {
            logger.warn(req, 403, `upload ${hash} owned by different user`)
            await cleanupIncoming()
            return res.sendStatus(403)
        }

        const idx = parseInt(params.value.idx)
        if (isNaN(idx) || idx < 0 || idx > entry.size - 1) {
            logger.warn(req, 400, 'invalid idx')
            await cleanupIncoming()
            return res.sendStatus(400)
        }

        if (entry.chunks.includes(idx)) {
            logger.warn(req, 409, 'chunk already sent')
            await cleanupIncoming()
            return res.sendStatus(409)
        }

        if (chunk.size > CHUNK_UPLOAD_SIZE) {
            logger.warn(req, 400, 'chunk above max size')
            await cleanupIncoming()
            return res.sendStatus(400)
        }

        //                                    //
        // --- Checks succeded, add chunk --- //
        //                                    //

        const moveRes = await chunkUploader.storeChunk(hash, idx, chunk.path)
        if (moveRes.isErr()) {
            logger.error(req, 500, `failed to store chunk: ${moveRes.error}`)
            await cleanupIncoming()
            return res.sendStatus(500)
        }

        logger.info(req, 200)
        res.sendStatus(200)
    },
)
// --- --- //
//

// //
// // --- UTILITY ROUTES --- //
// api.post('/rescan-library', [authenticated, isAdmin], async (req, res) => {
//     await state.rescanLibrary()
//     logger.info(req, 200)
//     res.sendStatus(200)
// })
// // --- --- //
// //

app.use('/api', api)

if (frontendRouter) app.use(frontendRouter)

//
// --- ERROR HANDLING (must be last) --- //
app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(req, 500, `unhandled error occurred: ${message}`)

    if (res.headersSent) return next(err)
    res.sendStatus(500)
})
// --- --- //
//

const server = app.listen(PORT, () =>
    logger.literal(`Listening on port ${PORT}`),
)

const gracefulShutdown = async () => {
    logger.literal('SIGTERM signal received: closing HTTP server.')

    const shutdownTimeout = setTimeout(() => {
        logger.literal(
            'Could not close connections in time, forcefully shutting down',
        )
        process.exit(1)
    }, 10000) // 10 seconds

    try {
        await promisify(server.close.bind(server))()
        queueTranscoder.shutdown()
        clearTimeout(shutdownTimeout)
        process.exit(0)
    } catch (err) {
        logger.literal(`Error during graceful shutdown: ${String(err)}`)
        clearTimeout(shutdownTimeout)
        process.exit(1)
    }
}

process.on('SIGTERM', () => void gracefulShutdown())
process.on('SIGINT', () => void gracefulShutdown())
