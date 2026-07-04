/**
 * Ubicación aproximada del dispositivo al fichar. Best-effort: si el
 * usuario no da permiso o falla, devuelve undefined (el fichaje igual se
 * registra, solo que sin coordenadas).
 */
export const obtenerUbicacion = (): Promise<
  { lat: number; lng: number } | undefined
> =>
  new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(undefined);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(undefined),
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
    );
  });
