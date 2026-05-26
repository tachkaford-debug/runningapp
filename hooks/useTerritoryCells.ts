/**
 * Load territory grid cells for the current map viewport.
 * Debounces requests (default 300ms) when region changes to avoid spamming the API.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getMapCells,
  GridCell,
  MapBounds,
} from '@/services/api/territory.api';

export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

function regionToBounds(region: MapRegion): MapBounds {
  return {
    north: region.latitude + region.latitudeDelta / 2,
    south: region.latitude - region.latitudeDelta / 2,
    east: region.longitude + region.longitudeDelta / 2,
    west: region.longitude - region.longitudeDelta / 2,
  };
}

const DEFAULT_DEBOUNCE_MS = 300;

export function useTerritoryCells(
  region: MapRegion | null,
  debounceMs: number = DEFAULT_DEBOUNCE_MS
): { cells: GridCell[]; loading: boolean } {
  const [cells, setCells] = useState<GridCell[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBoundsRef = useRef<string | null>(null);

  const fetchCells = useCallback(async (bounds: MapBounds) => {
    const key = `${bounds.north.toFixed(5)}_${bounds.south.toFixed(5)}_${bounds.east.toFixed(5)}_${bounds.west.toFixed(5)}`;
    if (lastBoundsRef.current === key) return;
    lastBoundsRef.current = key;
    setLoading(true);
    try {
      const data = await getMapCells(bounds);
      setCells(data);
    } catch (e) {
      setCells([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!region) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      fetchCells(regionToBounds(region));
    }, debounceMs);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [
    region?.latitude,
    region?.longitude,
    region?.latitudeDelta,
    region?.longitudeDelta,
    debounceMs,
    fetchCells,
  ]);

  return { cells, loading };
}
