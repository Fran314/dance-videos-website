import path from 'path'
import { spawn, ChildProcess } from 'child_process'
import { ResultAsync, ok, err } from 'neverthrow'
import { TEMP_PATH } from '../env.js'
import { transcoderLogger as logger, TRANSCODER_LOG_PATH } from '../logger.js'
import { FilesystemError, ensureDir, ensureEmptyDir, rm } from '../fs.js'
import { isRecord } from '@dance-videos/shared'
import { videoFilter720p } from './presets.js'

export const JOBS_PATH = path.join(TEMP_PATH, 'ffmpeg')
export const JOBS_LOG_PATH = path.join(TRANSCODER_LOG_PATH, 'jobs')

export class FfmpegError extends Error {
    constructor(
        public readonly source: string,
        public readonly cause: unknown,
    ) {
        super(`${source}: ${String(cause)}`)
        this.name = 'FfmpegError'
    }
}

export type FfmpegOperationError = FfmpegError | FilesystemError

export interface VideoMetadata {
    duration: number
    colorSpace?: string
    colorTransfer?: string
    colorPrimaries?: string
    width: number
    height: number
}

const dirsResult = await ResultAsync.combine([
    ensureEmptyDir(JOBS_PATH),
    ensureDir(JOBS_LOG_PATH),
])
if (dirsResult.isErr()) {
    console.error(
        `Fatal: failed to create upload directories: ${dirsResult.error}`,
    )
    process.exit(1)
}

const spawnBase = (
    command: string,
    args: string[],
): { proc: ChildProcess; result: ResultAsync<void, Error> } => {
    const proc = spawn(command, args)

    const result = ResultAsync.fromPromise(
        new Promise<void>((resolve, reject) => {
            proc.on('error', reject)
            proc.on('close', code => {
                if (code === 0) resolve()
                else reject(new Error(`${command} exited with code ${code}`))
            })
        }),
        e => (e instanceof Error ? e : new Error(String(e))),
    )

    return { proc, result }
}

export const ffmpeg = (
    source: string,
    outFile: string,
    args: string[],
    logPrefix: string,
    onOutTimeProg?: (progTime: number) => void,
): { proc: ChildProcess; result: ResultAsync<string, FfmpegError> } => {
    const progressArgs =
        onOutTimeProg !== undefined ? ['-progress', 'pipe:1'] : []

    const command = 'ionice'
    const fullArgs = [
        '-c3',
        'nice',
        '-n',
        '19',
        'ffmpeg',
        '-y',
        '-i',
        source,
        ...args,
        ...progressArgs,
        outFile,
    ]

    const { proc, result } = spawnBase(command, fullArgs)

    if (onOutTimeProg !== undefined) {
        let buf = ''
        proc.stdout?.on('data', (data: Buffer) => {
            buf += data.toString()
            const lines = buf.split(/[\r\n]/)
            buf = lines.pop() || ''
            for (const line of lines) {
                if (line.startsWith('out_time_ms=')) {
                    const outTimeMs = parseInt(line.split('=')[1] ?? '', 10)
                    const outTimeSec = Math.floor(outTimeMs / 1_000_000)
                    // const pct = Math.min(100, Math.round((outTimeMs / 1_000_000 / progress.duration) * 100))
                    onOutTimeProg(outTimeSec)
                }
            }
        })
    } else {
        // TODO confirm that this drain is actually needed
        proc.stdout?.resume() // drain unconditionally to prevent buffer deadlock
    }

    return {
        proc,
        result: result
            .map(() => {
                logger.info(`${logPrefix} succeeded for ${source}`)
                return outFile
            })
            .mapErr(e => {
                logger.error(`${logPrefix} failed for ${source}: ${e.message}`)
                void rm(outFile, { force: true }).match(
                    () => {},
                    () => {},
                )
                return new FfmpegError(source, e)
            }),
    }
}

export const getVideoMetadata = (
    source: string,
): ResultAsync<VideoMetadata, FfmpegError> => {
    const args = [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'format=duration:stream=color_space,color_transfer,color_primaries,width,height',
        '-of',
        'json',
        source,
    ]

    const { proc, result } = spawnBase('ffprobe', args)

    let output = ''
    proc.stdout?.on('data', (data: Buffer) => (output += data.toString()))

    return result
        .mapErr(e => new FfmpegError(source, e))
        .andThen(() => {
            let parsed: unknown
            try {
                parsed = JSON.parse(output.trim())
            } catch {
                return err(
                    new FfmpegError(
                        source,
                        new Error('Failed to parse ffprobe JSON output.'),
                    ),
                )
            }

            const metadata: VideoMetadata = {
                duration: 0,
                colorSpace: undefined,
                colorTransfer: undefined,
                colorPrimaries: undefined,
                width: 0,
                height: 0,
            }

            if (isRecord(parsed)) {
                if (isRecord(parsed.format)) {
                    if (typeof parsed.format.duration === 'string') {
                        const duration = parseFloat(parsed.format.duration)
                        if (!isNaN(duration)) {
                            metadata.duration = duration
                        }
                    }
                }

                if (Array.isArray(parsed.streams)) {
                    const stream: unknown = parsed.streams[0]
                    if (isRecord(stream)) {
                        const {
                            color_space,
                            color_transfer,
                            color_primaries,
                            width,
                            height,
                        } = stream
                        if (typeof color_space === 'string')
                            metadata.colorSpace = color_space

                        if (typeof color_transfer === 'string')
                            metadata.colorTransfer = color_transfer

                        if (typeof color_primaries === 'string')
                            metadata.colorPrimaries = color_primaries

                        if (typeof width === 'number') metadata.width = width

                        if (typeof height === 'number') metadata.height = height
                    }
                }
            }

            return ok(metadata)
        })
}

export const generateThumbnail = (
    source: string,
): ResultAsync<string, FfmpegOperationError> => {
    const basename = path.basename(source, '.mp4')
    const outFile = path.join(JOBS_PATH, `${basename}-thumbnail.jpg`)

    logger.info(`Starting generation of thumbnail: ${source} -> ${outFile}`)
    return getVideoMetadata(source).andThen(videoMetadata => {
        const vfChain = videoFilter720p(videoMetadata)

        const args = [
            '-ss',
            '00:00:00',
            '-frames:v',
            '1',
            '-vf',
            vfChain,
            '-q:v',
            '5',
        ]
        return ffmpeg(source, outFile, args, 'thumbnail generation').result
    })
}

export const transcodeFastStart = (
    source: string,
): ResultAsync<string, FfmpegOperationError> => {
    const basename = path.basename(source, '.mp4')
    const outFile = path.join(JOBS_PATH, `${basename}-faststart.mp4`)

    const args = ['-c', 'copy', '-movflags', 'faststart']

    logger.info(
        `Starting ffmpeg transcode to faststart: ${source} -> ${outFile}`,
    )
    return ffmpeg(source, outFile, args, 'ffmpeg faststart').result
}
