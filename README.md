# ISEO RH 🚀

**Organizá tu empresa y tu equipo con nuestro servicio de Recursos Humanos**

ISEO RH es una landing page moderna y profesional para un servicio de gestión de recursos humanos, diseñada específicamente para pequeñas y medianas empresas sin departamento formal de RRHH.

## 🎯 Características

- ✅ **Next.js 14** con TypeScript
- ✅ **Mantine UI** para componentes modernos y accesibles
- ✅ **TailwindCSS** para estilos utilitarios
- ✅ **Framer Motion** para animaciones suaves
- ✅ **Jest + React Testing Library** con cobertura completa de tests
- ✅ **ESLint + Prettier** configurados para calidad de código
- ✅ **Diseño responsive** mobile-first
- ✅ **SEO optimizado** con meta tags
- ✅ **Logo SVG personalizado** con diseño moderno

## 📋 Requisitos Previos

- Node.js >= 18.0.0
- npm >= 9.0.0 o yarn >= 1.22.0

## 🚀 Instalación

1. **Clonar el repositorio** (o usar el proyecto existente)

```bash
cd rrhh
```

2. **Instalar dependencias**

```bash
npm install
# o
yarn install
```

3. **Ejecutar el servidor de desarrollo**

```bash
npm run dev
# o
yarn dev
```

4. **Abrir el navegador**

Visita [http://localhost:3000](http://localhost:3000) para ver la aplicación.

## 🧪 Testing

### Ejecutar tests en modo watch

```bash
npm test
# o
yarn test
```

### Ejecutar tests en modo CI

```bash
npm run test:ci
# o
yarn test:ci
```

Los tests cubren:

- ✅ Renderizado de componentes
- ✅ Comportamiento de props
- ✅ Validación de formularios
- ✅ Accesibilidad (ARIA labels, roles)
- ✅ Interacciones de usuario

## 🎨 Estructura del Proyecto

```
rrhh/
├── public/
│   └── logo.svg              # Logo de ISEO RH
├── src/
│   ├── components/           # Componentes React reutilizables
│   │   ├── Header.tsx
│   │   ├── HeroSection.tsx
│   │   ├── FeaturesSection.tsx
│   │   ├── AboutSection.tsx
│   │   ├── ContactSection.tsx
│   │   ├── Footer.tsx
│   │   ├── Logo.tsx
│   │   └── index.ts
│   ├── pages/                # Páginas de Next.js
│   │   ├── _app.tsx
│   │   ├── _document.tsx
│   │   └── index.tsx
│   ├── styles/               # Estilos globales
│   │   └── globals.css
│   ├── tests/                # Tests unitarios
│   │   ├── HeroSection.test.tsx
│   │   ├── ContactSection.test.tsx
│   │   ├── FeaturesSection.test.tsx
│   │   ├── Header.test.tsx
│   │   ├── Footer.test.tsx
│   │   └── Logo.test.tsx
│   └── theme/                # Configuración de Mantine
│       └── theme.ts
├── .eslintrc.json            # Configuración ESLint
├── .prettierrc               # Configuración Prettier
├── jest.config.js            # Configuración Jest
├── jest.setup.js             # Setup de Jest
├── next.config.js            # Configuración Next.js
├── postcss.config.js         # Configuración PostCSS
├── tailwind.config.js        # Configuración Tailwind
├── tsconfig.json             # Configuración TypeScript
└── package.json              # Dependencias y scripts
```

## 🎨 Secciones de la Landing Page

### 1. **Header**

- Logo de ISEO RH
- Navegación sticky con scroll suave
- Botón CTA destacado

### 2. **Hero Section**

- Título principal con gradiente
- Subtítulo descriptivo
- Call-to-action prominente

### 3. **Features Section**

- 4 tarjetas con características principales:
  - Automatiza Procesos
  - Reduce Costos
  - Mejora la Comunicación
  - Analítica en Tiempo Real
- Iconos de Tabler Icons
- Animaciones al hacer scroll

### 4. **About Section**

- Información sobre ISEO RH
- Diseño en dos columnas
- Beneficios destacados

### 5. **Contact Section**

- Formulario de contacto con validación
- Campos: Nombre, Email, Empresa, Mensaje
- Validación en tiempo real con Mantine Form
- Mensaje de confirmación

### 6. **Footer**

- Logo y descripción
- Enlaces de navegación
- Enlaces legales
- Copyright dinámico

## 🎨 Paleta de Colores

- **Primario**: `#228be6` (Blue 600)
- **Secundario**: `#1864ab` (Blue 900)
- **Fondo**: Blanco, Grises neutros
- **Acentos**: Gradientes azules

## 📱 Responsive Design

El diseño es completamente responsive con breakpoints:

- **xs**: 36em (576px)
- **sm**: 48em (768px)
- **md**: 62em (992px)
- **lg**: 75em (1200px)
- **xl**: 88em (1408px)

## 🔧 Scripts Disponibles

```bash
# Desarrollo
npm run dev          # Inicia servidor de desarrollo

# Producción
npm run build        # Construye la aplicación para producción
npm run start        # Inicia servidor de producción

# Calidad de código
npm run lint         # Ejecuta ESLint
npm run format       # Formatea código con Prettier

# Testing
npm test             # Ejecuta tests en modo watch
npm run test:ci      # Ejecuta tests en modo CI
```

## 🌐 SEO

La aplicación incluye:

- Meta tags optimizados
- Título y descripción personalizados
- Open Graph tags (preparado para redes sociales)
- Viewport configuration
- Theme color

## 🎯 Mejores Prácticas Implementadas

- ✅ TypeScript estricto
- ✅ Componentes funcionales con hooks
- ✅ Separación de concerns
- ✅ Código limpio y mantenible
- ✅ Tests comprehensivos
- ✅ Accesibilidad (a11y)
- ✅ Performance optimizado
- ✅ SEO friendly

## 🚀 Deploy

### Vercel (Recomendado)

```bash
# Instalar Vercel CLI
npm i -g vercel

# Deploy
vercel
```

### Otros proveedores

```bash
# Build de producción
npm run build

# Los archivos estáticos estarán en .next/
```

## 📝 Licencia

Este proyecto es privado y confidencial.

## 👨‍💻 Autor

Desarrollado para ISEO RH - Organizá tu empresa y tu equipo

---

**¿Necesitas ayuda?** Contacta a contacto@talentoplus.com
