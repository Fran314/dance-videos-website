import path from 'path'
import express, {
    type Router,
    type Request,
    type Response,
    type NextFunction,
} from 'express'
import { buildBranding, substituteMarkers } from '@dance-videos/shared/branding'
import { isRecord } from '@dance-videos/shared'

import { DIST_DIR, BRANDING_PATH, IS_PRODUCTION } from './env.js'
import {
    loadBrandingConfig,
    loadBrandingCss,
    resolveCourseImages,
} from './branding.js'
import { readTextFile } from './fs.js'
import { expressLogger as logger } from './logger.js'

let frontendRouter: Router | undefined

if (IS_PRODUCTION) {
    if (DIST_DIR === undefined) {
        console.error('Fatal: DIST_DIR must be set when serving the frontend')
        process.exit(1)
    }

    const configResult = await loadBrandingConfig(BRANDING_PATH)
    if (configResult.isErr()) {
        console.error(`Fatal: ${configResult.error}`)
        process.exit(1)
    }
    const branding = buildBranding(configResult.value)

    const themeCssResult = await loadBrandingCss(BRANDING_PATH)
    if (themeCssResult.isErr()) {
        console.error(`Fatal: ${themeCssResult.error}`)
        process.exit(1)
    }

    const courseImagesResult = await resolveCourseImages(
        BRANDING_PATH,
        branding.runtime.courseImages,
    )
    if (courseImagesResult.isErr()) {
        console.error(`Fatal: ${courseImagesResult.error}`)
        process.exit(1)
    }
    const brandingInfo = JSON.stringify({
        logoText: branding.runtime.logoText,
        courseImages: courseImagesResult.value,
    })

    const indexRes = await readTextFile(path.join(DIST_DIR, 'index.html'))
    if (indexRes.isErr()) {
        console.error(`Fatal: failed to read index.html: ${indexRes.error}`)
        process.exit(1)
    }
    const indexHtml = substituteMarkers(
        indexRes.value,
        branding,
        themeCssResult.value,
    )

    const manifestRes = await readTextFile(
        path.join(DIST_DIR, 'manifest.webmanifest'),
    )
    if (manifestRes.isErr()) {
        console.error(`Fatal: failed to read manifest: ${manifestRes.error}`)
        process.exit(1)
    }
    let manifest: unknown
    try {
        manifest = JSON.parse(manifestRes.value)
    } catch (e) {
        console.error(
            `Fatal: invalid JSON in manifest.webmanifest: ${String(e)}`,
        )
        process.exit(1)
    }
    if (!isRecord(manifest)) {
        console.error('Fatal: manifest.webmanifest is not a JSON object')
        process.exit(1)
    }
    manifest.name = branding.manifestPatch.name
    manifest.short_name = branding.manifestPatch.short_name
    const manifestJson = JSON.stringify(manifest)

    const router = express.Router()

    const sendIndex = (res: Response) => {
        res.set('Cache-Control', 'no-cache')
        res.type('html').send(indexHtml)
    }

    router.get('/branding-info', (_req, res) => {
        res.set('Cache-Control', 'no-cache')
        res.type('application/json').send(brandingInfo)
    })
    router.get('/manifest.webmanifest', (_req, res) => {
        res.set('Cache-Control', 'no-cache')
        res.type('application/manifest+json').send(manifestJson)
    })
    router.get('/', (_req, res) => sendIndex(res))
    router.get('/index.html', (_req, res) => sendIndex(res))

    // Override default branding if given. Missing files still fall through to default
    if (BRANDING_PATH !== undefined) {
        router.use(
            '/branding',
            express.static(path.join(BRANDING_PATH, 'assets')),
        )
    }

    router.use(
        express.static(DIST_DIR, {
            index: false,
            setHeaders: (res, filePath) => {
                if (filePath.includes(`${path.sep}assets${path.sep}`)) {
                    res.setHeader(
                        'Cache-Control',
                        `public, max-age=${365 * 24 * 60 * 60}, immutable`,
                    )
                } else {
                    const base = path.basename(filePath)
                    if (base === 'sw.js' || base === 'registerSW.js') {
                        res.setHeader('Cache-Control', 'no-cache')
                    }
                }
            },
        }),
    )

    router.use((req: Request, res: Response, next: NextFunction) => {
        if (
            req.method === 'GET' &&
            !req.path.startsWith('/api') &&
            req.accepts('html')
        ) {
            return sendIndex(res)
        }
        next()
    })

    logger.literal('Frontend serving enabled')

    frontendRouter = router
}

export { frontendRouter }
