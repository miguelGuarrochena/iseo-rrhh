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
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  });

/** Distancia en metros entre dos coordenadas (fórmula de Haversine). */
export const distanciaMetros = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number => {
  const R = 6371000; // radio terrestre en metros
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)));
};
