import { toRaw, isRef } from 'vue'
import {
    type Course,
    type Video,
    type CourseSummary,
    type WithId,
    getCurrYearStr,
    splitDateStr,
    isYearStr,
    type YearStr,
    makeYearStr,
} from '@dance-videos/shared'
import { branding } from '@/branding'

// Casts are safe: the recursion preserves shape, so output type matches input.
export const deepToRaw = <T>(v: T): T => {
    if (v === null || typeof v !== 'object') return v
    // eslint-disable-next-line no-restricted-syntax
    if (isRef(v)) return deepToRaw(v.value) as T
    if (v instanceof Date || v instanceof RegExp) return v
    if (v instanceof Map)
        // eslint-disable-next-line no-restricted-syntax
        return new Map(
            [...v].map(([k, x]) => [deepToRaw(k), deepToRaw(x)]),
        ) as T
    // eslint-disable-next-line no-restricted-syntax
    if (v instanceof Set) return new Set([...v].map(deepToRaw)) as T
    // eslint-disable-next-line no-restricted-syntax
    if (Array.isArray(v)) return v.map(deepToRaw) as T
    // eslint-disable-next-line no-restricted-syntax
    const raw = toRaw(v) as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(raw)) out[k] = deepToRaw(raw[k])
    // eslint-disable-next-line no-restricted-syntax
    return out as T
}

export const sortCourses = (
    a: WithId<CourseSummary>,
    b: WithId<CourseSummary>,
): number => {
    if (a.year !== b.year) return b.year.localeCompare(a.year)

    const stripCommonPrefix = (a: string, b: string): [string, string] => {
        let i = 0
        while (i < a.length && i < b.length && a[i] === b[i]) {
            i++
        }
        return [a.slice(i), b.slice(i)]
    }

    const [aName, bName] = stripCommonPrefix(
        a.displayName.toLowerCase(),
        b.displayName.toLowerCase(),
    )

    if (aName.startsWith('avanzato')) return -1
    if (bName.startsWith('avanzato')) return 1

    if (aName.startsWith('intermedio')) return -1
    if (bName.startsWith('intermedio')) return 1

    if (aName.startsWith('base')) return -1
    if (bName.startsWith('base')) return 1

    if (a.displayName !== b.displayName)
        return a.displayName.localeCompare(b.displayName)

    return a.id.localeCompare(b.id)
}
export const sortVideos = (a: WithId<Video>, b: WithId<Video>): number => {
    if (a.date !== b.date) return b.date.localeCompare(a.date)

    if (a.uploadTimestamp > b.uploadTimestamp) return -1
    if (a.uploadTimestamp < b.uploadTimestamp) return 1
    return 0
}

export const courseImage = (index: number): string => {
    const images = branding.value.courseImages
    if (images.length === 0) return ''
    return images[index % images.length]!
}

export const courseLabel = (
    course: WithId<Course> | WithId<Omit<Course, 'videos'>>,
): string => {
    if (course.year === getCurrYearStr()) return course.displayName
    else return `${course.displayName} (${course.year})`
}
export const videoLabel = (video: WithId<Video>): string => {
    const { year, month, day } = splitDateStr(video.date)
    const date = `${day}/${month}/${year}`
    if (video.label !== '') return `${video.label} - ${date}`
    else return date
}

const extractYear = (search: string): { year: YearStr; rest: string } => {
    const defaultResult = { year: getCurrYearStr(), rest: search }

    const slashMatch = search.match(/(\d{2}\/\d{2})/)
    if (slashMatch) {
        const candidate = slashMatch[1]
        if (isYearStr(candidate)) {
            return {
                year: candidate,
                rest: search.replace(candidate, '').trim(),
            }
        }
        return defaultResult
    }

    const fourDigit = search.match(/(\d{4})/)
    if (fourDigit) {
        const n = parseInt(fourDigit[1]!.slice(0, 2), 10)
        return {
            year: makeYearStr(n),
            rest: search.replace(fourDigit[0], '').trim(),
        }
    }

    const twoDigit = search.match(/(\d{2})/)
    if (twoDigit) {
        const n = parseInt(twoDigit[1]!, 10)
        return {
            year: makeYearStr(n),
            rest: search.replace(twoDigit[0], '').trim(),
        }
    }

    return defaultResult
}

export const searchCourses = (
    courses: WithId<CourseSummary>[],
    search: string,
): WithId<CourseSummary>[] => {
    const { year, rest } = extractYear(search)
    return courses
        .filter(c => c.year === year)
        .filter(c => c.displayName.toLowerCase().includes(rest.toLowerCase()))
}
