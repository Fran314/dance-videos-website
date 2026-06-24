import { ref } from 'vue'
import { isRecord } from '@dance-videos/shared'

interface BrandingInfo {
    logoText: string
    courseImages: string[]
}

export const branding = ref<BrandingInfo>({
    logoText: '',
    courseImages: [],
})

const isStringArray = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every(item => typeof item === 'string')

const isBrandingInfo = (value: unknown): value is BrandingInfo =>
    isRecord(value) &&
    typeof value.logoText === 'string' &&
    isStringArray(value.courseImages)

// Fetched once at startup. On failure (e.g. offline) the neutral defaults above
// are kept so the shell still renders; colors and meta are baked into the HTML.
export const loadBranding = async (): Promise<void> => {
    const res = await fetch('/branding-info').catch(() => null)
    if (res === null || !res.ok) return

    const data: unknown = await res.json().catch(() => null)
    if (!isBrandingInfo(data)) return

    branding.value = { logoText: data.logoText, courseImages: data.courseImages }
}
