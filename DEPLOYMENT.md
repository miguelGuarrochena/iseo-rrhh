# 🚀 Guía de Deployment - Talento+

## Verificación Pre-Deployment

Antes de hacer deploy, asegúrate de que:

```bash
# 1. Todas las dependencias están instaladas
npm install

# 2. El proyecto compila sin errores
npm run build

# 3. Los tests pasan
npm run test:ci

# 4. No hay errores de linting
npm run lint
```

## Deployment en Vercel (Recomendado)

Vercel es la plataforma recomendada para proyectos Next.js.

### Opción 1: Deploy con Vercel CLI

```bash
# Instalar Vercel CLI globalmente
npm i -g vercel

# Login en Vercel
vercel login

# Deploy a producción
vercel --prod
```

### Opción 2: Deploy con GitHub

1. Sube tu código a GitHub
2. Ve a [vercel.com](https://vercel.com)
3. Click en "Import Project"
4. Selecciona tu repositorio
5. Vercel detectará automáticamente Next.js
6. Click en "Deploy"

### Configuración de Vercel

No se requiere configuración adicional. Vercel detectará automáticamente:
- Framework: Next.js
- Build Command: `npm run build`
- Output Directory: `.next`
- Install Command: `npm install`

## Deployment en Netlify

```bash
# 1. Instalar Netlify CLI
npm install -g netlify-cli

# 2. Login
netlify login

# 3. Inicializar
netlify init

# 4. Deploy
netlify deploy --prod
```

### Configuración de Netlify

Crea un archivo `netlify.toml` en la raíz:

```toml
[build]
  command = "npm run build"
  publish = ".next"

[[plugins]]
  package = "@netlify/plugin-nextjs"
```

## Deployment en Servidor Propio

### Usando PM2

```bash
# 1. Build de producción
npm run build

# 2. Instalar PM2
npm install -g pm2

# 3. Iniciar con PM2
pm2 start npm --name "talento-plus" -- start

# 4. Guardar configuración
pm2 save

# 5. Configurar inicio automático
pm2 startup
```

### Usando Docker

Crea un `Dockerfile`:

```dockerfile
FROM node:18-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:18-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
```

Construir y ejecutar:

```bash
docker build -t talento-plus .
docker run -p 3000:3000 talento-plus
```

## Variables de Entorno

Si necesitas configurar variables de entorno en producción:

### Vercel
1. Ve a Project Settings → Environment Variables
2. Agrega las variables necesarias

### Netlify
1. Ve a Site Settings → Build & Deploy → Environment
2. Agrega las variables necesarias

### Servidor Propio
Crea un archivo `.env.production`:

```bash
NEXT_PUBLIC_SITE_URL=https://tudominio.com
```

## Optimizaciones de Producción

### 1. Análisis de Bundle

```bash
# Instalar analizador
npm install --save-dev @next/bundle-analyzer

# Agregar a next.config.js
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

module.exports = withBundleAnalyzer(nextConfig)

# Ejecutar análisis
ANALYZE=true npm run build
```

### 2. Configurar CDN

Si usas un CDN, configura en `next.config.js`:

```javascript
module.exports = {
  assetPrefix: 'https://cdn.tudominio.com',
}
```

### 3. Habilitar Compresión

Vercel y Netlify lo hacen automáticamente. Para servidor propio:

```bash
npm install compression
```

## Monitoreo Post-Deployment

### Verificar que todo funciona

```bash
# Verificar que el sitio carga
curl -I https://tudominio.com

# Verificar tiempo de respuesta
curl -o /dev/null -s -w 'Total: %{time_total}s\n' https://tudominio.com
```

### Métricas a monitorear

- **Performance**: Lighthouse score > 90
- **SEO**: Lighthouse SEO score > 90
- **Accessibility**: Lighthouse a11y score > 90
- **Uptime**: 99.9%
- **Response Time**: < 2s

## Rollback

### Vercel
```bash
# Ver deployments
vercel ls

# Promover un deployment anterior
vercel promote [deployment-url]
```

### Netlify
```bash
# Ver deployments
netlify deploy:list

# Restaurar deployment anterior
netlify deploy:restore [deploy-id]
```

## Checklist Final

Antes de considerar el deployment completo:

- [ ] El sitio carga correctamente en producción
- [ ] Todas las secciones son visibles
- [ ] El formulario de contacto funciona
- [ ] La navegación funciona correctamente
- [ ] El sitio es responsive en móvil
- [ ] No hay errores en la consola del navegador
- [ ] Los meta tags SEO están correctos
- [ ] El sitio pasa las pruebas de Lighthouse
- [ ] SSL/HTTPS está configurado
- [ ] El dominio personalizado está configurado (si aplica)

## Soporte

Para problemas de deployment:
- Vercel: https://vercel.com/support
- Netlify: https://www.netlify.com/support/
- Next.js: https://nextjs.org/docs

---

**¡Deployment exitoso!** 🎉
