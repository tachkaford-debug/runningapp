/**
 * Утилиты для работы с геолокацией
 */

export interface Coordinate {
  latitude: number;
  longitude: number;
}

/**
 * Вычисляет расстояние между двумя координатами (формула Haversine)
 * @returns расстояние в метрах
 */
export const calculateDistance = (coord1: Coordinate, coord2: Coordinate): number => {
  const R = 6371e3; // Радиус Земли в метрах
  const φ1 = (coord1.latitude * Math.PI) / 180;
  const φ2 = (coord2.latitude * Math.PI) / 180;
  const Δφ = ((coord2.latitude - coord1.latitude) * Math.PI) / 180;
  const Δλ = ((coord2.longitude - coord1.longitude) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

/**
 * Форматирует время в читаемый формат
 */
export const formatTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Форматирует время в короткий формат (для статистики)
 */
export const formatTimeShort = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}ч ${minutes}м`;
  }
  return `${minutes}м`;
};

/**
 * Форматирует темп (мин/км)
 */
export const formatPace = (paceInMinutes: number): string => {
  if (paceInMinutes === 0 || !isFinite(paceInMinutes)) return '--:--';
  const minutes = Math.floor(paceInMinutes);
  const seconds = Math.floor((paceInMinutes - minutes) * 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

/**
 * Форматирует дату
 */
export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
};

/**
 * Форматирует короткую дату
 */
export const formatShortDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
  });
};
