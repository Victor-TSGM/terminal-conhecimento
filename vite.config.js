import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: 'https://github.com/Victor-TSGM/terminal-conhecimento.git', // INSIRA O NOME DO SEU REPOSITÓRIO AQUI
})