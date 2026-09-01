import '@testing-library/jest-dom';
import { webcrypto } from 'crypto';

/**
 * Polyfills de APIs del navegador que jsdom no implementa.
 *
 * No son cosméticos: sin ellos el componente explota en el test con un
 * `TypeError` que no tiene nada que ver con lo que se está probando
 * (`window.matchMedia is not a function`), y cuesta bastante darse
 * cuenta de que el problema es el entorno y no el código.
 *
 * Mantine consulta `matchMedia` para los breakpoints y el esquema de
 * color, y `useContador` lo usa para respetar `prefers-reduced-motion`.
 */
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    media: query,
    // Ningún media query matchea: los tests corren en el caso base
    // (sin `prefers-reduced-motion`, breakpoint de escritorio).
    matches: false,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
}

/**
 * `IntersectionObserver` lo usan las animaciones que arrancan al entrar
 * en pantalla. En jsdom no hay viewport ni scroll, así que el stub
 * registra la llamada y nunca dispara: el componente monta y se queda en
 * su estado inicial, que es lo que los tests consultan.
 */
if (!window.IntersectionObserver) {
  window.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  };
}

/** Lo pide `useContador` para animar; en jsdom alcanza con un timer. */
if (!window.requestAnimationFrame) {
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  window.cancelAnimationFrame = (id) => clearTimeout(id);
}

/**
 * WebCrypto y Blob.arrayBuffer. jsdom 20 no trae `crypto.subtle` ni
 * `Blob.arrayBuffer`. En Node reciente el global nativo a veces se cuela
 * y los tests pasan igual; en jsdom (CI) `hashDeArchivo` devolvía `null`
 * y la constancia de firma parecía rota. Se pisa siempre con la
 * implementación de Node: es la misma API que el navegador.
 */
try {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
    writable: true,
  });
} catch {
  // Node 19+ a veces deja `crypto` como getter no configurable.
  if (typeof globalThis.crypto?.subtle?.digest !== 'function') {
    Object.assign(globalThis.crypto, { subtle: webcrypto.subtle });
  }
}
if (typeof Blob !== 'undefined') {
  Blob.prototype.arrayBuffer = function arrayBuffer() {
    return new Promise((resolve, reject) => {
      const lector = new FileReader();
      lector.onload = () => resolve(lector.result);
      lector.onerror = () => reject(lector.error);
      lector.readAsArrayBuffer(this);
    });
  };
}
