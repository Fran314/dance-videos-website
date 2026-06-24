export interface Branding {
    meta: {
        APP_TITLE: string
        APP_DESCRIPTION: string
        APP_DOMAIN: string
    }
    runtime: {
        logoText: string
        courseImages: string[]
    }
    manifestPatch: {
        name: string
        short_name: string
    }
}

export interface BrandingConfig {
    title?: string
    description?: string
    domain?: string
    logoText?: string
}

const DEFAULTS_VALUES = {
    title: 'Dance Videos Website',
    description: '',
    domain: 'localhost',
    logoText: 'Dance videos',
    courseImages: [
        '/branding/courses/001.webp',
        '/branding/courses/002.webp',
        '/branding/courses/003.webp',
        '/branding/courses/004.webp',
        '/branding/courses/005.webp',
        '/branding/courses/006.webp',
        '/branding/courses/007.webp',
    ],
}

export function buildBranding(config: BrandingConfig): Branding {
    const title = config.title || DEFAULTS_VALUES.title
    const description = config.description || DEFAULTS_VALUES.description
    const domain = config.domain || DEFAULTS_VALUES.domain
    const logoText = config.logoText || DEFAULTS_VALUES.logoText
    const courseImages = DEFAULTS_VALUES.courseImages

    return {
        meta: {
            APP_TITLE: title,
            APP_DESCRIPTION: description,
            APP_DOMAIN: domain,
        },
        runtime: { logoText, courseImages },
        manifestPatch: { name: title, short_name: logoText },
    }
}

export const DEFAULT_BRANDING: Branding = buildBranding({})

export function escapeHtml(value: unknown): string {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
}

export function substituteMarkers(
    html: string,
    branding: Branding,
    themeCss: string,
): string {
    return html
        .replaceAll('{{APP_TITLE}}', escapeHtml(branding.meta.APP_TITLE))
        .replaceAll(
            '{{APP_DESCRIPTION}}',
            escapeHtml(branding.meta.APP_DESCRIPTION),
        )
        .replaceAll('{{APP_DOMAIN}}', escapeHtml(branding.meta.APP_DOMAIN))
        .replaceAll('{{APP_THEME_CSS}}', themeCss)
}
