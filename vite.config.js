import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Google 登入/登出會導回 /booking (無結尾斜線)，但開發伺服器只認 /booking/，這裡補上轉址
// (網址中的 #id_token=... 會由瀏覽器自動帶到轉址後的頁面)
const redirectBaseWithoutSlash = () => {
  const redirect = (req, res, next) => {
    if (req.url === '/booking' || req.url.startsWith('/booking?')) {
      res.writeHead(302, { Location: '/booking/' + req.url.slice('/booking'.length) })
      res.end()
      return
    }
    next()
  }
  return {
    name: 'redirect-base-without-slash',
    configureServer(server) { server.middlewares.use(redirect) },
    configurePreviewServer(server) { server.middlewares.use(redirect) },
  }
}

export default defineConfig({
  plugins: [react(), redirectBaseWithoutSlash()],
  base: '/booking/',
})
