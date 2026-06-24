import path from 'path'
import { exec } from 'child_process'

import multer from 'multer'
import { errAsync, okAsync, ResultAsync } from 'neverthrow'

import { TEMP_PATH } from './env.js'

import { FilesystemError, rename, rm, exists, createWriteStream, createReadStream, ensureEmptyDir } from './fs.js'
import { randomFileName } from './utils.js'
import { formatBytes, Hash, randomToken, Token, CHUNK_UPLOAD_SIZE } from '@dance-videos/shared'

const UPLOAD_PATH = path.join(TEMP_PATH, 'uploads')
const COMPLETED_PATH = path.join(UPLOAD_PATH, 'completed')
const BUILDING_PATH = path.join(UPLOAD_PATH, 'chunks')
const INCOMING_PATH = path.join(UPLOAD_PATH, 'incoming')

const DISK_SPACE_LIMIT = 4 * 1024 * 1024 * 1024 // 4 GB

const dirsResult = await ResultAsync.combine([
    ensureEmptyDir(COMPLETED_PATH),
    ensureEmptyDir(BUILDING_PATH),
    ensureEmptyDir(INCOMING_PATH),
])
if (dirsResult.isErr()) {
    console.error(`Fatal: failed to create upload directories: ${dirsResult.error}`)
    process.exit(1)
}

export const chunkUploadMiddleware = multer({
    storage: multer.diskStorage({
        destination: INCOMING_PATH,
        filename: (_req, _file, cb) => {
            cb(null, randomFileName())
        },
    }),
    limits: {
        fileSize: CHUNK_UPLOAD_SIZE + 1, // apparently this number is exclusive and not inclusive
    },
}).single('chunk')

export class ChunkUploaderError extends Error {
    constructor(public readonly source: string, public readonly cause: unknown) {
        super(`${source}: ${String(cause)}`)
        this.name = 'ChunkUploaderError'
    }
}

export type ChunkUploaderOperationError = ChunkUploaderError | FilesystemError

interface ChunkUpload {
    owner: string
    size: number
    chunks: number[]
}

class ChunkUploader {
    private uploads: Record<Hash, ChunkUpload> = {}

    private hashPath(hash: Hash): string {
        return path.join(BUILDING_PATH, hash)
    }
    private chunkPath(hash: Hash, idx: number): string {
        return path.join(BUILDING_PATH, hash, idx.toString())
    }
    private finalizedPath(file: Token): string {
        return path.join(COMPLETED_PATH, file)
    }

    getUpload(hash: Hash): ChunkUpload | undefined {
        return this.uploads[hash]
    }

    createUpload(hash: Hash, owner: string, size: number): void {
        this.uploads[hash] = { owner, size, chunks: [] }
    }

    deleteUpload(hash: Hash): void {
        delete this.uploads[hash]
    }

    checkDiskSpace(size: number): ResultAsync<void, ChunkUploaderError> {
        return getAvailableDiskSpace().andThen((availableDiskSpace) => {
            const required = 2 * size * CHUNK_UPLOAD_SIZE
            const freeAfterReserve = availableDiskSpace - required
            if (freeAfterReserve < DISK_SPACE_LIMIT) {
                const shortfall = DISK_SPACE_LIMIT - freeAfterReserve
                const error = new ChunkUploaderError(
                    UPLOAD_PATH,
                    `insufficient space on disk: available=${formatBytes(availableDiskSpace)}, required=${formatBytes(required)}, limit=${formatBytes(DISK_SPACE_LIMIT)}, shortfall=${formatBytes(shortfall)}`,
                )
                return errAsync(error)
            }
            return okAsync(undefined)
        })
    }

    areChunksComplete(hash: Hash): boolean {
        const entry = this.uploads[hash]
        if (entry === undefined) return false
        if (entry.chunks.length !== entry.size) return false
        for (let i = 0; i < entry.size; i++) {
            if (entry.chunks[i] !== i) return false
        }
        return true
    }

    storeChunk(hash: Hash, idx: number, incomingPath: string): ResultAsync<void, FilesystemError> {
        const chunkPath = this.chunkPath(hash, idx)
        return rename(incomingPath, chunkPath).map(() => {
            const entry = this.uploads[hash]!
            entry.chunks.push(idx)
            entry.chunks.sort((a, b) => a - b)
        })
    }

    concatenateChunks(hash: Hash): ResultAsync<Token, ChunkUploaderError> {
        const entry = this.uploads[hash]
        if (entry === undefined) {
            const error = new ChunkUploaderError(hash, 'upload not found')
            return errAsync(error)
        }

        const pipeChunks = async (): Promise<Token> => {
            const finalizedName = randomToken()
            const finalizedPath = this.finalizedPath(finalizedName)
            const writeStreamRes = createWriteStream(finalizedPath)
            if (writeStreamRes.isErr())
                throw writeStreamRes.error

            const writeStream = writeStreamRes.value

            try {
                for (let idx = 0; idx < entry.size; idx++) {
                    const chunkPath = this.chunkPath(hash, idx)
                    await new Promise<void>((resolve, reject) => {
                        const readStreamRes = createReadStream(chunkPath)
                        if (readStreamRes.isErr())
                            throw readStreamRes.error

                        const readStream = readStreamRes.value
                        readStream.on('error', reject)
                        readStream.on('end', resolve)
                        readStream.pipe(writeStream, { end: false })
                    })
                }
                await new Promise<void>((resolve, reject) => {
                    writeStream.end()
                    writeStream.on('finish', resolve)
                    writeStream.on('error', reject)
                })
            } catch (e) {
                writeStream.destroy()
                throw e
            }

            return finalizedName
        }

        return ResultAsync.fromPromise(pipeChunks(), (e) => new ChunkUploaderError(hash, e))
    }

    cleanupChunks(hash: Hash): ResultAsync<void, FilesystemError> {
        return rm(path.join(BUILDING_PATH, hash), { recursive: true, force: true })
    }

    fileReady(file: Token): ResultAsync<boolean, FilesystemError> {
        return exists(this.finalizedPath(file))
    }

    moveFile(file: Token, dest: string): ResultAsync<void, FilesystemError> {
        return rename(this.finalizedPath(file), dest)
    }
}

const getAvailableDiskSpace = (): ResultAsync<number, ChunkUploaderError> =>
    ResultAsync.fromPromise(
        new Promise<number>((resolve, reject) => {
            exec(`df -k --output=avail ${UPLOAD_PATH}`, (err, stdout) => {
                if (err) return reject(err)

                const output = stdout.trim().split('\n')[1]
                if (output === undefined)
                    return reject(new Error('Unexpected df output'))

                const availableKb = parseInt(output, 10)
                if (!Number.isInteger(availableKb))
                    return reject(new Error('Could not parse available space'))

                resolve(availableKb * 1024) // bytes
            })
        }),
        (e) => new ChunkUploaderError(UPLOAD_PATH, e),
    )

export const chunkUploader = new ChunkUploader()
