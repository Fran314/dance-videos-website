import { ok, err, type Result } from 'neverthrow'
import { isRecord } from './utils.js'
import {
    isUsers, isCourse, isCourses, isSelfUser,
    isAddUserParams, isCourseIdParams, isCourseVideoParams,
    isHashParams, isUploadChunkParams,
    isLoginBody, isAddUserBody, isAddCourseBody,
    isAddVideoBody, isUpdateVideoBody, isInitUploadBody,
    isInitUploadResponse, isFinalizeUploadResponse,
} from './generated/validators.js'

export type ValidationError = { message: string; details: unknown[] }

const formatErrors = (errors: unknown[] | null): ValidationError => {
    const details = errors ?? []
    const first = details[0]
    let summary = ''
    if (isRecord(first)) {
        const rawPath = first['instancePath']
        const path = typeof rawPath === 'string' && rawPath !== '' ? rawPath : '<root>'
        const rawMsg = first['message']
        const msg = typeof rawMsg === 'string' ? rawMsg : 'invalid'
        summary = `: ${path} ${msg}`
    }
    return { message: `validation failed${summary}`, details }
}

type Validator<T> = ((data: unknown) => data is T) & { errors: unknown[] | null }

const makeParser = <T>(validate: Validator<T>) =>
    (data: unknown): Result<T, ValidationError> =>
        validate(data) ? ok(data) : err(formatErrors(validate.errors))

// Domain types
export const parseUsers = makeParser(isUsers)
export const parseCourse = makeParser(isCourse)
export const parseCourses = makeParser(isCourses)
export const parseSelfUser = makeParser(isSelfUser)

// Params
export const parseAddUserParams = makeParser(isAddUserParams)
export const parseCourseIdParams = makeParser(isCourseIdParams)
export const parseCourseVideoParams = makeParser(isCourseVideoParams)
export const parseHashParams = makeParser(isHashParams)
export const parseUploadChunkParams = makeParser(isUploadChunkParams)

// Request bodies
export const parseLoginBody = makeParser(isLoginBody)
export const parseAddUserBody = makeParser(isAddUserBody)
export const parseAddCourseBody = makeParser(isAddCourseBody)
export const parseAddVideoBody = makeParser(isAddVideoBody)
export const parseUpdateVideoBody = makeParser(isUpdateVideoBody)
export const parseInitUploadBody = makeParser(isInitUploadBody)

// Responses
export const parseInitUploadResponse = makeParser(isInitUploadResponse)
export const parseFinalizeUploadResponse = makeParser(isFinalizeUploadResponse)
