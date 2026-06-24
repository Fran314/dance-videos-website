import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import CourseView from '../views/CourseView.vue'
import LoginView from '@/views/LoginView.vue'
import AdminView from '@/views/admin/AdminView.vue'
import AdminUsersView from '@/views/admin/AdminUsersView.vue'
import AdminCoursesView from '@/views/admin/AdminCoursesView.vue'

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
        {
            path: '/',
            name: 'home',
            component: HomeView,
        },
        {
            path: '/course/:courseId([0-9a-f]{8})',
            name: 'course',
            component: CourseView,
        },
        {
            path: '/login',
            name: 'login',
            component: LoginView,
        },
        {
            path: '/admin',
            name: 'admin',
            component: AdminView,
        },
        {
            path: '/admin/users',
            name: 'admin-users',
            component: AdminUsersView,
        },
        {
            path: '/admin/courses',
            name: 'admin-courses',
            component: AdminCoursesView,
        },
        {
            path: '/:pathMatch(.*)*',
            redirect: '/',
        },
    ],
    scrollBehavior(_to, _from, savedPosition) {
        return savedPosition ?? { top: 0 }
    },
})

export default router
