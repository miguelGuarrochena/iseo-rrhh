# 🚀 Quick Start Guide - Talento+

## Instalación Rápida

### 1. Instalar Dependencias

```bash
npm install
```

o si prefieres yarn:

```bash
yarn install
```

### 2. Ejecutar en Desarrollo

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

### 3. Ejecutar Tests

```bash
npm test
```

## ✅ Checklist de Verificación

Después de la instalación, verifica que todo funcione:

- [ ] El servidor de desarrollo inicia sin errores
- [ ] La página carga en http://localhost:3000
- [ ] El logo "Talento+" se muestra correctamente
- [ ] Todas las secciones son visibles (Hero, Features, About, Contact, Footer)
- [ ] La navegación funciona (scroll suave)
- [ ] El formulario de contacto valida correctamente
- [ ] Los tests pasan sin errores

## 🎨 Personalización Rápida

### Cambiar Colores

Edita `src/theme/theme.ts`:

```typescript
primaryColor: 'blue', // Cambia a 'green', 'red', etc.
```

### Modificar Contenido

Los textos están en español en cada componente:

- `src/components/HeroSection.tsx` - Título y subtítulo principal
- `src/components/FeaturesSection.tsx` - Características
- `src/components/AboutSection.tsx` - Información de la empresa
- `src/components/ContactSection.tsx` - Formulario

### Cambiar Logo

Reemplaza `public/logo.svg` con tu propio logo.

## 📦 Build para Producción

```bash
npm run build
npm run start
```

## 🐛 Solución de Problemas

### Error: Cannot find module

```bash
rm -rf node_modules package-lock.json
npm install
```

### Puerto 3000 en uso

```bash
PORT=3001 npm run dev
```

### Tests fallan

Asegúrate de que todas las dependencias estén instaladas:

```bash
npm install --save-dev @testing-library/jest-dom @testing-library/react
```

## 📚 Recursos

- [Next.js Documentation](https://nextjs.org/docs)
- [Mantine UI](https://mantine.dev/)
- [TailwindCSS](https://tailwindcss.com/)
- [Framer Motion](https://www.framer.com/motion/)

## 🆘 Ayuda

¿Problemas? Revisa el `README.md` completo o contacta al equipo de desarrollo.
