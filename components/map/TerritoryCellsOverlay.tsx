/**
 * Renders territory grid cells as colored polygons on the map.
 * Uses vector-friendly single Polygon per cell; color by level (green/blue/purple).
 */
import React, { useMemo } from 'react';
import { Platform } from 'react-native';
import {
  getCellLevel,
  cellToPolygonCoordinates,
  TERRITORY_LEVEL_COLORS,
  GridCell,
} from '@/services/api/territory.api';

let Polygon: any = null;
if (Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- conditional native module
    const Maps = require('react-native-maps');
    Polygon = Maps.Polygon;
  } catch {
    // no maps
  }
}

interface TerritoryCellsOverlayProps {
  cells: GridCell[];
  strokeColor?: string;
  strokeWidth?: number;
}

export function TerritoryCellsOverlay({
  cells,
  strokeColor = 'rgba(0,0,0,0.15)',
  strokeWidth = 0.5,
}: TerritoryCellsOverlayProps) {
  const polygons = useMemo(() => {
    if (!Polygon || !cells.length) return null;
    return cells.map((cell) => {
      const level = getCellLevel(cell.capture_count);
      const fillColor = TERRITORY_LEVEL_COLORS[level];
      const coordinates = cellToPolygonCoordinates(cell.lat_index, cell.lng_index);
      return (
        <Polygon
          key={cell.id}
          coordinates={coordinates}
          fillColor={fillColor}
          strokeColor={strokeColor}
          strokeWidth={strokeWidth}
        />
      );
    });
  }, [cells, strokeColor, strokeWidth]);

  if (!Polygon || !polygons) return null;
  return <>{polygons}</>;
}
