import path from 'path'
import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'
import { ensureDirs } from './fs.js'
import { LOG_PATH } from './env.js'
import { Request } from 'express'

export const SERVICE_LOG_PATH = path.join(LOG_PATH, 'service')
export const TRANSCODER_LOG_PATH = path.join(LOG_PATH, 'transcoder')

const dirsResult = await ensureDirs(
    SERVICE_LOG_PATH,
    TRANSCODER_LOG_PATH,
)
if (dirsResult.isErr()) {
    console.error(`Fatal: failed to create log directories: ${dirsResult.error}`)
    process.exit(1)
}


const format = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY/MM/DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) => {
        return `[${String(timestamp)}] ${level.toUpperCase()}: ${String(message)}`
    }),
)
const rotateFileTransport = (logPath: string) => {
    return new DailyRotateFile({
        dirname: logPath,
        filename: '%DATE%.log', // e.g. 2025-07-29.log
        datePattern: 'YYYY-MM-DD', // daily rotation
        // zippedArchive: true, // compress old logs
        maxSize: '20m', // max size per file before it rotates again that day
        // maxFiles: '14d', // keep logs for 14 days
        level: 'info',
    })
}
class ExpressLogger {
    private logger

    constructor() {
        this.logger = winston.createLogger({
            level: 'info',
            format,
            transports: [
                new winston.transports.Console(),
                rotateFileTransport(SERVICE_LOG_PATH),
            ],
        })
    }

    literal(msg: string) {
        this.logger.info(msg)
    }

    private formatMsg(req: Request, status: number, msg = '') {
        let username = req?.username || 'unknown'
        if (req.user?.admin) {
            username = `[admin] ${username}`
        }
        if (msg) {
            return `${username} ${req.method} ${status} ${req.url}, ${msg}`
        } else {
            return `${username} ${req.method} ${status} ${req.url}`
        }
    }

    info(req: Request, status: number, msg?: string) {
        this.logger.info(this.formatMsg(req, status, msg))
    }
    warn(req: Request, status: number, msg?: string) {
        this.logger.warn(this.formatMsg(req, status, msg))
    }
    error(req: Request, status: number, msg?: string) {
        this.logger.error(this.formatMsg(req, status, msg))
    }
}

export const expressLogger = new ExpressLogger()
export const transcoderLogger = winston.createLogger({
    level: 'info',
    format,
    transports: [
        new winston.transports.Console(),
        rotateFileTransport(TRANSCODER_LOG_PATH),
    ],
})
