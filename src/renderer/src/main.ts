import { createApp } from 'vue'
import vuetify from '../plugins/vuetify'
import App from './App.vue'
import '@mdi/font/css/materialdesignicons.css' // Ensure you are using css-loader

createApp(App).use(vuetify).mount('#app')

declare global {
    interface Window {
        hijackedMode: any,
        hijackedMouse: any,
        character: number
    }
}