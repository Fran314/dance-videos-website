import './assets/main.scss'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { loadBranding } from './branding'

const pinia = createPinia()

const app = createApp(App)

app.use(router)
app.use(pinia)

void loadBranding()
app.mount('#app')
