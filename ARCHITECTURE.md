# 🏗️ Arquitectura del Proyecto - Talento+

## Diagrama de Componentes

```
┌─────────────────────────────────────────────────────────┐
│                     index.tsx (Main Page)                │
└─────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Header     │    │ HeroSection  │    │FeaturesSection│
│              │    │              │    │              │
│ - Logo       │    │ - Title      │    │ - 4 Cards    │
│ - Navigation │    │ - Subtitle   │    │ - Icons      │
│ - CTA Button │    │ - CTA        │    │ - Animation  │
└──────────────┘    └──────────────┘    └──────────────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│AboutSection  │    │ContactSection│    │   Footer     │
│              │    │              │    │              │
│ - 2 Columns  │    │ - Form       │    │ - Links      │
│ - Text       │    │ - Validation │    │ - Copyright  │
│ - Stats      │    │ - Submit     │    │ - Logo       │
└──────────────┘    └──────────────┘    └──────────────┘
```

## Flujo de Datos

```
┌─────────────────────────────────────────────────────────┐
│                    _app.tsx                              │
│  - MantineProvider (Theme)                               │
│  - Global Styles                                         │
│  - Meta Tags                                             │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                  index.tsx (Page)                        │
│  - Imports all sections                                  │
│  - Renders in order                                      │
└─────────────────────────────────────────────────────────┘
                            │
            ┌───────────────┼───────────────┐
            ▼               ▼               ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │  Components  │ │    Theme     │ │   Styles     │
    │              │ │              │ │              │
    │ - Reusable   │ │ - Colors     │ │ - Globals    │
    │ - Typed      │ │ - Fonts      │ │ - Tailwind   │
    │ - Tested     │ │ - Spacing    │ │ - Mantine    │
    └──────────────┘ └──────────────┘ └──────────────┘
```

## Estructura de Carpetas Detallada

```
rrhh/
│
├── 📁 public/                      # Archivos estáticos
│   ├── logo.svg                    # Logo SVG de Talento+
│   └── favicon.ico                 # Favicon del sitio
│
├── 📁 src/                         # Código fuente
│   │
│   ├── 📁 components/              # Componentes React
│   │   ├── Header.tsx              # Navegación principal
│   │   ├── HeroSection.tsx         # Sección hero
│   │   ├── FeaturesSection.tsx     # Características
│   │   ├── AboutSection.tsx        # Sobre nosotros
│   │   ├── ContactSection.tsx      # Formulario contacto
│   │   ├── Footer.tsx              # Pie de página
│   │   ├── Logo.tsx                # Componente logo
│   │   └── index.ts                # Barrel export
│   │
│   ├── 📁 pages/                   # Páginas Next.js
│   │   ├── _app.tsx                # App wrapper
│   │   ├── _document.tsx           # HTML document
│   │   └── index.tsx               # Página principal
│   │
│   ├── 📁 styles/                  # Estilos globales
│   │   └── globals.css             # CSS global + Tailwind
│   │
│   ├── 📁 tests/                   # Tests unitarios
│   │   ├── Header.test.tsx
│   │   ├── HeroSection.test.tsx
│   │   ├── FeaturesSection.test.tsx
│   │   ├── AboutSection.test.tsx
│   │   ├── ContactSection.test.tsx
│   │   ├── Footer.test.tsx
│   │   └── Logo.test.tsx
│   │
│   └── 📁 theme/                   # Configuración tema
│       └── theme.ts                # Mantine theme
│
├── 📄 Configuration Files
│   ├── .eslintrc.json              # ESLint config
│   ├── .prettierrc                 # Prettier config
│   ├── jest.config.js              # Jest config
│   ├── jest.setup.js               # Jest setup
│   ├── next.config.js              # Next.js config
│   ├── postcss.config.js           # PostCSS config
│   ├── tailwind.config.js          # Tailwind config
│   └── tsconfig.json               # TypeScript config
│
├── 📄 Documentation
│   ├── README.md                   # Documentación principal
│   ├── QUICKSTART.md               # Guía inicio rápido
│   ├── PROJECT_SUMMARY.md          # Resumen técnico
│   ├── DEPLOYMENT.md               # Guía deployment
│   ├── CONTRIBUTING.md             # Guía contribución
│   ├── ARCHITECTURE.md             # Este archivo
│   └── STATUS.md                   # Estado del proyecto
│
└── 📄 package.json                 # Dependencias y scripts
```

## Tecnologías y Responsabilidades

### Frontend Framework

```
Next.js 14
├── Server-Side Rendering (SSR)
├── Static Site Generation (SSG)
├── API Routes (preparado)
├── Image Optimization
└── Code Splitting automático
```

### UI Libraries

```
Mantine UI 7.3.2
├── Container, Grid, Stack
├── Button, Title, Text
├── Card, Group
├── TextInput, Textarea
├── Form con validación
└── Hooks (@mantine/hooks)

TailwindCSS 3.4.0
├── Utility classes
├── Responsive design
├── Custom colors
└── Complementa Mantine
```

### Animaciones

```
Framer Motion 10.16.16
├── Scroll animations
├── Fade in/out
├── Slide transitions
└── Viewport detection
```

### Testing

```
Jest 29.7.0
├── Test runner
├── Mocking
├── Coverage reports
└── Snapshot testing

React Testing Library 14.1.2
├── Component testing
├── User interactions
├── Accessibility testing
└── DOM queries
```

### Code Quality

```
TypeScript 5.3.3
├── Type safety
├── Interfaces
├── Strict mode
└── IntelliSense

ESLint 8.56.0
├── Code linting
├── Best practices
├── TypeScript rules
└── Next.js rules

Prettier 3.1.1
├── Code formatting
├── Consistent style
├── Auto-fix
└── Pre-commit hooks (opcional)
```

## Patrones de Diseño Utilizados

### 1. Component Composition

```typescript
// Componentes pequeños y enfocados
<Header />
<HeroSection />
<FeaturesSection />
<AboutSection />
<ContactSection />
<Footer />
```

### 2. Props Interface Pattern

```typescript
interface LogoProps {
  width?: number;
  height?: number;
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({ width, height, className }) => {
  // ...
};
```

### 3. Barrel Exports

```typescript
// src/components/index.ts
export { Header } from './Header';
export { HeroSection } from './HeroSection';
// ...
```

### 4. Custom Hooks (Mantine)

```typescript
import { useForm } from '@mantine/form';

const form = useForm({
  initialValues: { ... },
  validate: { ... }
});
```

### 5. Theme Provider Pattern

```typescript
<MantineProvider theme={theme}>
  <Component {...pageProps} />
</MantineProvider>
```

## Flujo de Navegación

```
Usuario llega al sitio
        │
        ▼
┌─────────────────┐
│   Header        │ ← Sticky, siempre visible
│   - Logo        │
│   - Nav buttons │
└─────────────────┘
        │
        ▼
┌─────────────────┐
│  Hero Section   │ ← Primera impresión
│  - Título       │
│  - CTA          │
└─────────────────┘
        │
        ▼
┌─────────────────┐
│  Features       │ ← Beneficios clave
│  - 4 cards      │
└─────────────────┘
        │
        ▼
┌─────────────────┐
│  About          │ ← Información empresa
│  - Descripción  │
└─────────────────┘
        │
        ▼
┌─────────────────┐
│  Contact Form   │ ← Conversión
│  - Formulario   │
│  - Validación   │
└─────────────────┘
        │
        ▼
┌─────────────────┐
│  Footer         │ ← Enlaces adicionales
│  - Links        │
│  - Copyright    │
└─────────────────┘
```

## Responsive Design Strategy

```
Mobile First Approach

┌─────────────────────────────────────────────────────┐
│  xs (< 576px)                                       │
│  ┌─────────────────────────────────────────────┐   │
│  │  Stack vertical                             │   │
│  │  - 1 columna                                │   │
│  │  - Padding reducido                         │   │
│  │  - Texto más pequeño                        │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│  sm (576px - 768px)                                 │
│  ┌─────────────────────────────────────────────┐   │
│  │  - 2 columnas en features                   │   │
│  │  - Padding medio                            │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│  md+ (> 768px)                                      │
│  ┌─────────────────────────────────────────────┐   │
│  │  - 4 columnas en features                   │   │
│  │  - 2 columnas en about/contact              │   │
│  │  - Padding completo                         │   │
│  │  - Texto tamaño completo                    │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

## Performance Optimizations

### 1. Next.js Optimizations

- ✅ Automatic code splitting
- ✅ Image optimization (preparado)
- ✅ Font optimization
- ✅ Static generation donde posible

### 2. Bundle Size

- ✅ Tree shaking automático
- ✅ Mantine optimizePackageImports
- ✅ Dynamic imports (preparado)

### 3. Rendering

- ✅ Server-side rendering
- ✅ Static generation
- ✅ Incremental static regeneration (preparado)

## Security Considerations

### 1. Form Validation

- ✅ Client-side validation con Mantine Form
- ⏳ Server-side validation (cuando se implemente backend)
- ✅ XSS protection (React automático)

### 2. Dependencies

- ✅ No vulnerabilities encontradas
- ✅ Dependencias actualizadas
- ✅ Package lock file

### 3. Environment Variables

- ✅ .env.example proporcionado
- ✅ .gitignore configurado
- ✅ NEXT*PUBLIC* prefix para variables públicas

## Extensibilidad

### Agregar Nueva Sección

```typescript
// 1. Crear componente
src / components / NewSection.tsx;

// 2. Exportar en barrel
src / components / index.ts;

// 3. Agregar a página
src / pages / index.tsx;

// 4. Crear tests
src / tests / NewSection.test.tsx;
```

### Agregar Nueva Página

```typescript
// 1. Crear archivo en pages
src / pages / nueva - pagina.tsx;

// 2. Usar layout existente
import { Header, Footer } from '@/components';

// 3. Agregar navegación
// Actualizar Header.tsx con nuevo link
```

### Integrar API

```typescript
// 1. Crear API route
src / pages / api / contact.ts;

// 2. Actualizar formulario
// ContactSection.tsx - cambiar console.log por fetch
```

## Conclusión

Esta arquitectura proporciona:

- ✅ **Escalabilidad**: Fácil agregar nuevos componentes
- ✅ **Mantenibilidad**: Código limpio y organizado
- ✅ **Testabilidad**: Tests comprehensivos
- ✅ **Performance**: Optimizaciones de Next.js
- ✅ **Developer Experience**: TypeScript + ESLint + Prettier
- ✅ **User Experience**: Responsive + Animaciones + Accesibilidad

---

**Arquitectura diseñada para producción y crecimiento futuro.**
