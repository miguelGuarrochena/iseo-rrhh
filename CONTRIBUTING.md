# Guía de Contribución

## Flujo de Trabajo

1. **Fork** el repositorio
2. **Crea** una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. **Commit** tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. **Push** a la rama (`git push origin feature/AmazingFeature`)
5. **Abre** un Pull Request

## Estándares de Código

### TypeScript
- Usa tipos explícitos siempre que sea posible
- Evita `any` - usa `unknown` si es necesario
- Interfaces para props de componentes

### Componentes React
- Componentes funcionales con TypeScript
- Props tipadas con interfaces
- Usa hooks de React cuando sea apropiado
- Mantén componentes pequeños y enfocados

### Estilos
- Usa Mantine components como primera opción
- TailwindCSS para utilidades adicionales
- Mantén consistencia con el theme

### Testing
- Escribe tests para nuevos componentes
- Mantén cobertura > 80%
- Tests deben ser descriptivos y claros

## Commits

Usa conventional commits:
- `feat:` nueva característica
- `fix:` corrección de bug
- `docs:` cambios en documentación
- `style:` formateo, punto y coma faltantes, etc.
- `refactor:` refactorización de código
- `test:` agregar tests
- `chore:` actualizar dependencias, etc.

## Pull Requests

- Descripción clara del cambio
- Screenshots si hay cambios visuales
- Tests pasando
- Sin errores de linting
