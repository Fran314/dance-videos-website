import { randomHex } from '@dance-videos/shared'

export const randomFileName = (ext: string = ''): string => {
    return randomHex(16) + ext
}

export const now = (): string => {
    const now = new Date()

    const yyyy = now.getFullYear()
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')

    const hh = String(now.getHours()).padStart(2, '0')
    const min = String(now.getMinutes()).padStart(2, '0')
    const ss = String(now.getSeconds()).padStart(2, '0')

    return `${yyyy}-${mm}-${dd}_${hh}-${min}-${ss}`
}

export const toKebabCase = (str: string): string => {
    // regex to find word boundaries
    // - [A-Z]{2,}(?=[A-Z][a-z]+[0-9]*|\b)  uppercase acronyms
    // - [A-Z]?[a-z]+[0-9]*                 words
    // - [A-Z]                              single uppercase letters.
    // - [0-9]+                             numbers.
    const matchedWords = String(str).match(
        /[A-Z]{2,}(?=[A-Z][a-z]+[0-9]*|\b)|[A-Z]?[a-z]+[0-9]*|[A-Z]|[0-9]+/g,
    )

    if (!matchedWords) {
        return ''
    }

    return matchedWords.map(x => x.toLowerCase()).join('-')
}
