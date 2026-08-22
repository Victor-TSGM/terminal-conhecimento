import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/terminal-conhecimento/', // INSIRA O NOME DO SEU REPOSITÓRIO AQUI
})