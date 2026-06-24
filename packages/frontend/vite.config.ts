import { fileURLToPath, URL } from 'node:url'

import { defineConfig, type PluginOption } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { VitePWA } from 'vite-plugin-pwa'

import {
    DEFAULT_BRANDING,
    substituteMarkers,
} from '@dance-videos/shared/branding'

// apply default branding in dev (`serve`)
function brandingDev(): PluginOption {
    return {
        name: 'branding-dev',
        apply: 'serve', // do NOT apply on builds, the built files get substituted by the backend
        transformIndexHtml(html) {
            return substituteMarkers(html, DEFAULT_BRANDING, '')
        },
        configureServer(server) {
            server.middlewares.use('/branding-info', (_req, res) => {
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify(DEFAULT_BRANDING.runtime))
            })
        },
    }
}

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        vue(),
        vueDevTools(),
        brandingDev(),
        VitePWA({
            registerType: 'autoUpdate',

            // Manifest Icons can be overridden by /branding/, which means they shouldn't be precached,
            // otherwise changing the branding on an already-deployed instance would not update them.
            //
            // The default (true) would re-add them to the precache despite the workbox.globIgnores.
            //
            // Instead, the icons in /branding/ are runtime-cached by the rule below
            includeManifestIcons: false,

            manifest: {
                name: 'App',
                short_name: 'App',
                start_url: '/',
                background_color: '#121212',
                theme_color: '#000000',
                icons: [
                    {
                        src: '/branding/icon-192x192.png',
                        sizes: '192x192',
                        type: 'image/png',
                    },
                    {
                        src: '/branding/icon-512x512.png',
                        sizes: '512x512',
                        type: 'image/png',
                    },
                ],
            },
            workbox: {
                clientsClaim: true,
                skipWaiting: true,

                // index.html is personalized dynamically by branding by the backend, so it shouldn't be precached,
                // otherwise changing the branding on an already-deployed instance would not update it.
                //
                // For this reason we exclude html from globPatterns, we drop the default
                // navigateFallback, and navigations go network-first (fresh online,
                // last-cached shell offline).
                //
                // /branding/* is excluded from precache too: the baked defaults live
                // there and precaching them by URL would mask a per-site override served
                // at the same path. Branding is instead runtime-cached below (the
                // /branding-info payload, the /branding/* assets, and the Google fonts),
                // so an offline launch still renders the last-seen branded shell.
                globPatterns: ['**/*.{js,css,ico,png,jpg,svg}'],
                globIgnores: ['**/branding/**'],
                navigateFallback: undefined,
                runtimeCaching: [
                    {
                        urlPattern: ({ request }) =>
                            request.mode === 'navigate',
                        handler: 'NetworkFirst',
                        options: {
                            cacheName: 'app-shell',
                            networkTimeoutSeconds: 3,
                            cacheableResponse: { statuses: [200] },
                        },
                    },
                    {
                        urlPattern: ({ url }) =>
                            url.pathname === '/branding-info',
                        handler: 'NetworkFirst',
                        options: {
                            cacheName: 'branding-info',
                            networkTimeoutSeconds: 3,
                            cacheableResponse: { statuses: [200] },
                        },
                    },
                    {
                        urlPattern: ({ url }) =>
                            url.pathname.startsWith('/branding/'),
                        handler: 'NetworkFirst',
                        options: {
                            cacheName: 'branding-assets',
                            networkTimeoutSeconds: 3,
                            expiration: {
                                maxEntries: 64,
                                maxAgeSeconds: 60 * 60 * 24 * 30,
                            },
                            cacheableResponse: { statuses: [200] },
                        },
                    },
                    {
                        urlPattern: ({ url }) =>
                            url.origin === 'https://fonts.googleapis.com',
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'google-fonts-stylesheets',
                            expiration: {
                                maxEntries: 8,
                                maxAgeSeconds: 60 * 60 * 24 * 365,
                            },
                            cacheableResponse: { statuses: [0, 200] },
                        },
                    },
                    {
                        urlPattern: ({ url }) =>
                            url.origin === 'https://fonts.gstatic.com',
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'google-fonts-webfonts',
                            expiration: {
                                maxEntries: 16,
                                maxAgeSeconds: 60 * 60 * 24 * 365,
                            },
                            cacheableResponse: { statuses: [0, 200] },
                        },
                    },
                ],
            },
        }),
    ],
    server: {
        proxy: {
            '/api': {
                target: 'http://localhost:3000',
                changeOrigin: true,
            },
        },
    },
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
})
