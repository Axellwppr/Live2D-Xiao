// electron.vite.config.ts
import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin, bytecodePlugin } from "electron-vite";
import vue from "@vitejs/plugin-vue";
import vuetify from "vite-plugin-vuetify";
var electron_vite_config_default = defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), bytecodePlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin(), bytecodePlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src")
      }
    },
    plugins: [vue(), vuetify({ autoImport: true })]
  }
});
export {
  electron_vite_config_default as default
};
