import { createFile, MP4BoxBuffer } from 'mp4box'
import { ResultAsync } from 'neverthrow'
import { FilesystemError, readFile } from './fs.js'

export class CodecDetectionError extends Error {
    constructor(public readonly path: string, public readonly cause: unknown) {
        super(`${path}: ${String(cause)}`)
        this.name = 'CodecDetectionError'
    }
}
export type GetCodecError = FilesystemError | CodecDetectionError

const toMP4BoxBuffer = (buffer: Buffer): MP4BoxBuffer => {
    const ab = new ArrayBuffer(buffer.byteLength)
    new Uint8Array(ab).set(buffer)
    return MP4BoxBuffer.fromArrayBuffer(ab, 0)
}

// const toMP4BoxBuffer = (buffer: Buffer): MP4BoxBuffer => {
//     const ab = buffer.buffer.slice(
//         buffer.byteOffset,
//         buffer.byteOffset + buffer.byteLength,
//     ) as MP4BoxBuffer
//     ab.fileStart = 0
//     return ab
// }


const getCodecFromBuffer = (buffer: MP4BoxBuffer): Promise<string> => {
    return new Promise((resolve, reject) => {
        const mp4boxFile = createFile()

        mp4boxFile.onReady = info => {
            const videoTrack = info.tracks.find(t => t.type === 'video')
            const audioTrack = info.tracks.find(t => t.type === 'audio')

            const codecs: string[] = []
            if (videoTrack?.codec) codecs.push(videoTrack.codec)
            if (audioTrack?.codec) codecs.push(audioTrack.codec)

            resolve(`video/mp4; codecs="${codecs.join(', ')}"`)
        }

        mp4boxFile.onError = (_module, message) => reject(new Error(message))

        mp4boxFile.appendBuffer(buffer)
        mp4boxFile.flush()
    })
}

export const getCodec = (filePath: string): ResultAsync<string, GetCodecError> => {
    return readFile(filePath)
        .map(toMP4BoxBuffer)
        .andThen((buffer) => ResultAsync.fromPromise(
            getCodecFromBuffer(buffer),
            (e) => new CodecDetectionError(filePath, e),
        ))
}
