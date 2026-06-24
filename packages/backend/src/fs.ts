import path from 'path'
import fs from 'fs/promises'
import type { Stats, ReadStream, WriteStream } from 'fs'
import { statSync, createReadStream as fsCreateReadStream, createWriteStream as fsCreateWriteStream } from 'fs'
import { Result, ResultAsync } from 'neverthrow'
import { parseJson, JsonParseError } from './json.js'

export class FilesystemError extends Error {
    constructor(public readonly path: string, public readonly cause: unknown) {
        super(`${path}: ${String(cause)}`)
        this.name = 'FilesystemError'
    }
}

export const readFile = (filePath: string): ResultAsync<Buffer, FilesystemError> =>
    ResultAsync.fromPromise(fs.readFile(filePath), (e) => new FilesystemError(filePath, e))

export const readTextFile = (filePath: string): ResultAsync<string, FilesystemError> =>
    ResultAsync.fromPromise(fs.readFile(filePath, { encoding: 'utf8' }), (e) => new FilesystemError(filePath, e))

export const readJsonFile = (filePath: string): ResultAsync<unknown, FilesystemError | JsonParseError> =>
    readTextFile(filePath).andThen((raw) => parseJson(raw, filePath))

export const writeFile = (filePath: string, data: string): ResultAsync<void, FilesystemError> =>
    ensureParent(filePath).andThen(() =>
        ResultAsync.fromPromise(fs.writeFile(filePath, data, 'utf8'), (e) => new FilesystemError(filePath, e)))

export const cp = (src: string, dest: string): ResultAsync<void, FilesystemError> =>
    ensureParent(dest).andThen(() =>
        ResultAsync.fromPromise(fs.cp(src, dest), (e) => new FilesystemError(dest, e)))

export const rm = (filePath: string, options?: { force?: boolean; recursive?: boolean }): ResultAsync<void, FilesystemError> =>
    ResultAsync.fromPromise(fs.rm(filePath, options), (e) => new FilesystemError(filePath, e))

export const rename = (oldPath: string, newPath: string): ResultAsync<void, FilesystemError> =>
    ensureParent(newPath).andThen(() =>
        ResultAsync.fromPromise(fs.rename(oldPath, newPath), (e) => new FilesystemError(oldPath, e)))

export const mkdir = (dirPath: string, options?: { recursive?: boolean }): ResultAsync<void, FilesystemError> => {
    const mkdirVoid = async (): Promise<void> => {
        await fs.mkdir(dirPath, options)
    }
    return ResultAsync.fromPromise(mkdirVoid(), (e) => new FilesystemError(dirPath, e))
}
export const ensureDir = (dirPath: string): ResultAsync<void, FilesystemError> =>
    mkdir(dirPath, { recursive: true })
export const ensureDirs = (...dirPaths: string[]): ResultAsync<void, FilesystemError> =>
    ResultAsync.combine(dirPaths.map(dirPath => ensureDir(dirPath))).map(() => { })
export const ensureParent = (filePath: string): ResultAsync<void, FilesystemError> =>
    ensureDir(path.dirname(filePath))
export const ensureEmptyDir = (dirPath: string): ResultAsync<void, FilesystemError> =>
    rm(dirPath, { recursive: true, force: true }).andThen(() => ensureDir(dirPath))
export const ensureEmptyDirs = (...dirPaths: string[]): ResultAsync<void, FilesystemError> =>
    ResultAsync.combine(dirPaths.map(dirPath => ensureEmptyDir(dirPath))).map(() => { })

export const stat = (filePath: string): Result<Stats, FilesystemError> =>
    Result.fromThrowable(() => statSync(filePath), (e) => new FilesystemError(filePath, e))()

export interface ReadStreamOptions {
    start?: number
    end?: number
    // encoding?: BufferEncoding
}
export const createReadStream = (filePath: string, options?: ReadStreamOptions): Result<ReadStream, FilesystemError> =>
    Result.fromThrowable(() => fsCreateReadStream(filePath, options), (e) => new FilesystemError(filePath, e))()

export const createWriteStream = (filePath: string): Result<WriteStream, FilesystemError> =>
    Result.fromThrowable(() => fsCreateWriteStream(filePath), (e) => new FilesystemError(filePath, e))()

export const exists = (filePath: string): ResultAsync<boolean, FilesystemError> =>
    ResultAsync.fromPromise(
        fs.access(filePath).then(() => true, () => false),
        (e) => new FilesystemError(filePath, e),
    )

export const readDir = (dirPath: string): ResultAsync<string[], FilesystemError> =>
    ResultAsync.fromPromise(fs.readdir(dirPath), (e) => new FilesystemError(dirPath, e))
