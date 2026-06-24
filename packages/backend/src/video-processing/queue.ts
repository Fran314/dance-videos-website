import path from 'path'
import { createWriteStream } from 'fs'
import { ChildProcess } from 'child_process'
import { Result } from 'neverthrow'
import { Id } from '@dance-videos/shared'
import { transcoderLogger as logger } from '../logger.js'
import { cp, rm } from '../fs.js'
import { now } from '../utils.js'
import {
    ffmpeg,
    getVideoMetadata,
    FfmpegOperationError,
    JOBS_PATH,
    JOBS_LOG_PATH,
} from './ffmpeg.js'
import { conversionArgs720p } from './presets.js'

interface TranscodeJob {
    source: string
    courseId: Id
    videoId: Id
    proc?: ChildProcess
    aborted?: boolean
    onProgress?: (courseId: Id, videoId: Id, progress: number) => Promise<void>
    onSuccess?: (courseId: Id, videoId: Id, outFile: string) => Promise<void>
    onError?: (
        courseId: Id,
        videoId: Id,
        error: FfmpegOperationError,
    ) => Promise<void>
}

class QueueTranscoder {
    private queue: TranscodeJob[] = []
    private active = false
    private current: TranscodeJob | null = null
    private shuttingDown = false

    transcode(
        source: string,
        courseId: Id,
        videoId: Id,
        onProgress?: (
            courseId: Id,
            videoId: Id,
            progress: number,
        ) => Promise<void>,
        onSuccess?: (
            courseId: Id,
            videoId: Id,
            outFile: string,
        ) => Promise<void>,
        onError?: (
            courseId: Id,
            videoId: Id,
            error: FfmpegOperationError,
        ) => Promise<void>,
    ): void {
        if (
            this.queue.some(
                j => j.courseId === courseId && j.videoId === videoId,
            ) ||
            (this.current?.courseId === courseId &&
                this.current?.videoId === videoId)
        ) {
            logger.warn(
                `Job with duplicate id=${courseId}-${videoId} was rejected.`,
            )
            return
        }
        const job: TranscodeJob = {
            source,
            courseId,
            videoId,
            onProgress,
            onSuccess,
            onError,
        }
        this.queue.push(job)
        void this.processQueue()
    }

    abortTranscode(courseId: Id, videoId: Id): void {
        const idx = this.queue.findIndex(
            j => j.courseId === courseId && j.videoId === videoId,
        )
        if (idx !== -1) {
            this.queue.splice(idx, 1)
            logger.info(
                `Removed queued transcode for id=${courseId}-${videoId}`,
            )
            return
        }

        if (
            this.current?.courseId === courseId &&
            this.current.videoId === videoId
        ) {
            logger.info(
                `Aborting active transcode for id=${courseId}-${videoId}`,
            )
            this.current.aborted = true
            this.current.proc?.kill('SIGKILL')
        }
    }

    private async processQueue() {
        if (this.active || this.queue.length === 0 || this.shuttingDown) return

        this.active = true
        this.current = this.queue.shift()!

        const result = await this.runJob()

        const { courseId, videoId, onSuccess, onError, aborted } = this.current
        if (!aborted) {
            await result.match(
                outFile => onSuccess?.(courseId, videoId, outFile),
                error => onError?.(courseId, videoId, error),
            )
        }

        this.current = null
        this.active = false
        void this.processQueue()
    }

    private async runJob(): Promise<Result<string, FfmpegOperationError>> {
        const job = this.current!
        const { source, courseId, videoId } = job
        const localSource = path.join(
            JOBS_PATH,
            `${courseId}-${videoId}-source.mp4`,
        )
        const outFile = path.join(
            JOBS_PATH,
            `${courseId}-${videoId}-converted.mp4`,
        )
        const logFile = path.join(
            JOBS_LOG_PATH,
            `${now()}-${courseId}-${videoId}-converted.log`,
        )

        logger.info(`Starting ffmpeg transcode for id=${courseId}-${videoId}`)

        const transcodeResult = await cp(source, localSource)
            .andThen(() => getVideoMetadata(localSource))
            .andThen(videoMetadata => {
                const duration = videoMetadata.duration

                let lastReportedProgress = -1
                const onOutTimeProg = (progTime: number): void => {
                    const progress = Math.min(
                        100,
                        Math.round((progTime / duration) * 100),
                    )
                    if (progress > lastReportedProgress) {
                        lastReportedProgress = progress
                        void job.onProgress?.(courseId, videoId, progress)
                    }
                }
                const { proc, result } = ffmpeg(
                    source,
                    outFile,
                    conversionArgs720p(videoMetadata),
                    `ffmpeg transcode id=${courseId}-${videoId}`,
                    onOutTimeProg,
                )
                job.proc = proc

                const logStream = createWriteStream(logFile, { flags: 'a' })
                proc.stderr?.pipe(logStream)
                proc.on('close', () => logStream.end())
                proc.on('error', () => logStream.end())

                return result
            })

        await rm(localSource, { force: true }).match(
            () => {},
            () => {},
        )
        return transcodeResult.map(() => outFile)
    }

    shutdown(): void {
        this.shuttingDown = true
        if (this.current) {
            this.abortTranscode(this.current.courseId, this.current.videoId)
        }
    }
}

export const queueTranscoder = new QueueTranscoder()
