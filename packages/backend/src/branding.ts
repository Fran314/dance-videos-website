import path from 'path'
import { ok, err, okAsync, type Result, type ResultAsync } from 'neverthrow'
import { isRecord } from '@dance-videos/shared'
import type { BrandingConfig } from '@dance-videos/shared/branding'

import { exists, readDir, readJsonFile, readTextFile } from './fs.js'
import { JsonParseError } from './json.js'

export class BrandingError extends Error {
    constructor(
        message: string,
        public readonly cause?: unknown,
    ) {
        super(message)
        this.name = 'BrandingError'
    }
}

const IMAGE_EXTENSIONS = ['.webp', '.png', '.jpg', '.jpeg', '.svg', '.avif']

export const parseBrandingConfig = (
    raw: unknown,
): Result<BrandingConfig, BrandingError> => {
    if (!isRecord(raw))
        return err(new BrandingError('branding config must be a JSON object'))

    const config: BrandingConfig = {}
    for (const key of ['title', 'description', 'domain', 'logoText'] as const) {
        const value = raw[key]
        if (value === undefined) continue
        if (typeof value !== 'string')
            return err(
                new BrandingError(
                    `branding config field '${key}' must be a string`,
                ),
            )
        config[key] = value
    }

    return ok(config)
}

export const loadBrandingConfig = (
    brandingPath: string | undefined,
): ResultAsync<BrandingConfig, BrandingError> => {
    if (brandingPath === undefined) return okAsync({})

    const configPath = path.join(brandingPath, 'branding.json')
    return exists(configPath)
        .mapErr(e => new BrandingError(`failed to access ${configPath}`, e))
        .andThen(present => {
            if (!present) return okAsync<BrandingConfig, BrandingError>({})
            return readJsonFile(configPath)
                .mapErr(e =>
                    e instanceof JsonParseError
                        ? new BrandingError(
                              `invalid JSON in ${configPath}`,
                              e.cause,
                          )
                        : new BrandingError(
                              `failed to read ${configPath}`,
                              e,
                          ),
                )
                .andThen(parsed =>
                    parseBrandingConfig(parsed).mapErr(
                        e =>
                            new BrandingError(
                                `${configPath}: ${e.message}`,
                                e.cause,
                            ),
                    ),
                )
        })
}

export const loadBrandingCss = (
    brandingPath: string | undefined,
): ResultAsync<string, BrandingError> => {
    if (brandingPath === undefined) return okAsync('')

    const cssPath = path.join(brandingPath, 'branding.css')
    return exists(cssPath)
        .mapErr(e => new BrandingError(`failed to access ${cssPath}`, e))
        .andThen(present => {
            if (!present) {
                return okAsync<string, BrandingError>('')
            }

            return readTextFile(cssPath)
                .mapErr(e => new BrandingError(`failed to read ${cssPath}`, e))
                .andThen(css => {
                    const match = /<\/style/i.test(css)
                    if (match) {
                        return err(
                            new BrandingError(
                                `${cssPath} must not contain a '</style' sequence`,
                            ),
                        )
                    }
                    return ok(css)
                })
        })
}

const listImageUrls = (dir: string): ResultAsync<string[], BrandingError> =>
    exists(dir)
        .mapErr(e => new BrandingError(`failed to access ${dir}`, e))
        .andThen(present => {
            if (!present) return okAsync<string[], BrandingError>([])
            return readDir(dir)
                .mapErr(e => new BrandingError(`failed to read ${dir}`, e))
                .map(files =>
                    files
                        .filter(f =>
                            IMAGE_EXTENSIONS.includes(
                                path.extname(f).toLowerCase(),
                            ),
                        )
                        .sort()
                        .map(f => `/branding/courses/${f}`),
                )
        })

export const resolveCourseImages = (
    brandingPath: string | undefined,
    defaults: string[],
): ResultAsync<string[], BrandingError> => {
    if (brandingPath === undefined) return okAsync(defaults)

    const overrideDir = path.join(brandingPath, 'assets', 'courses')
    return listImageUrls(overrideDir).map(override =>
        override.length > 0 ? override : defaults,
    )
}
