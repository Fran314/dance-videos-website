import { defineStore } from 'pinia'

import { type NonEmptySafeStr, type Course, type Id } from '@dance-videos/shared'
import * as api from '@/services/api'
import { HttpError, type ApiError } from '@/services/api'

interface AuthState {
    authenticated: boolean | null
    username: NonEmptySafeStr | null
    admin: boolean | null
    courses: Record<Id, Omit<Course, 'videos'>> | null
}

export interface Notification {
    id: number
    type: 'info' | 'success' | 'error'
    message: string
    persistent: boolean
}
interface StateState {
    error: boolean
    notifications: Notification[]
    nextNotificationId: number
}

const errorMessage = (message: string, code?: number): string => {
    if (code === undefined) return message
    if (message === "") return `Error ${code}`
    return `${code}: ${message}`
}

const apiErrorMessage = (e: ApiError): { message: string; code?: number } =>
    e instanceof HttpError ? { message: e.message, code: e.code } : { message: e.message }
export const useAuthStore = defineStore('authStore', {
    state: (): AuthState => ({
        authenticated: null,
        username: null,
        admin: null,
        courses: null,
    }),
    actions: {
        async loadUser() {
            const stateStore = useStateStore()
            const result = await api.getSelf()

            if (result.isOk()) {
                this.$reset()
                this.$patch({
                    authenticated: true,
                    ...result.value,
                })
            } else if (result.error instanceof HttpError && result.error.code === 401) {
                this.$reset()
                this.authenticated = false
            } else {
                this.$reset()
                stateStore.pushFatalApiError(result.error)
            }
        },
    },
})
export const useStateStore = defineStore('stateStore', {
    state: (): StateState => ({
        error: false,
        notifications: [],
        nextNotificationId: 0,
    }),
    actions: {
        pushInfo(message: string) {
            this.pushNotification('info', message, false)
        },
        pushSuccess(message: string) {
            this.pushNotification('success', message, false)
        },
        pushError(message: string, code?: number) {
            this.pushNotification('error', errorMessage(message, code), false)
        },
        pushFatalError(message: string, code?: number) {
            this.error = true
            this.pushNotification('error', errorMessage(message, code), true)
        },
        pushApiError(error: ApiError) {
            const { message, code } = apiErrorMessage(error)
            this.pushNotification('error', errorMessage(message, code), false)
        },
        pushFatalApiError(error: ApiError) {
            this.error = true
            const { message, code } = apiErrorMessage(error)
            this.pushNotification('error', errorMessage(message, code), true)
        },
        pushNotification(type: 'info' | 'success' | 'error', message: string, persistent: boolean) {
            const id = this.nextNotificationId++
            this.notifications.push({ type, message, persistent, id })
            if (!persistent) {
                setTimeout(() => {
                    this.notifications = this.notifications.filter(
                        n => n.id !== id,
                    )
                }, 8 * 1000)
            }
        },
    },
})
