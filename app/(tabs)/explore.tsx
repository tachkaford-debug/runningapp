import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Colors } from '@/constants/Colors';
import { useColorScheme as useColorSchemeHook } from '@/hooks/useColorScheme';
import { authService } from '@/services/auth.service';
import { territoryService, GridCell } from '@/services/territory.service';
import { formatShortDate, formatTime, formatTimeShort } from '@/utils/location';
import { getItem } from '@/utils/storage';
import React, { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

// Условный импорт для react-native-maps
let MapView: any = null;
let Polygon: any = null;
let Polyline: any = null;

if (Platform.OS !== 'web') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- conditional native module
  const Maps = require('react-native-maps');
  MapView = Maps.default;
  Polygon = Maps.Polygon;
  Polyline = Maps.Polyline;
}

interface VisitedZone {
  latIndex: number;
  lngIndex: number;
  visitCount: number;
  lastVisit: string;
}

interface Route {
  coords: { latitude: number; longitude: number }[];
  time: number;
  distance: number;
  date: string;
}

const INITIAL_REGION = {
  latitude: 55.75,
  longitude: 37.62,
  latitudeDelta: 0.0922,
  longitudeDelta: 0.0421,
};

const Explore = () => {
  const [mapRegion, setMapRegion] = useState(INITIAL_REGION);
  const [territoryCells, setTerritoryCells] = useState<GridCell[]>([]);
  const [visitedZones, setVisitedZones] = useState<VisitedZone[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
  const [stats, setStats] = useState({
    totalDistance: 0,
    totalTime: 0,
    zonesVisited: 0,
    routesCount: 0,
  });
  const colorScheme = useColorSchemeHook();
  const colors = Colors[colorScheme ?? 'light'];

  useEffect(() => {
    const loadData = async () => {
      try {
        const user = await authService.getCurrentUser();
        const cells = await territoryService.getUserCells(user.id);
        setTerritoryCells(cells as any);

        const zones = await getItem<VisitedZone[]>('visitedZones') || [];
        setVisitedZones(zones);
        
        const routesList = await getItem<Route[]>('routes') || [];
        setRoutes(routesList);
        
        const totalDistance = routesList.reduce((sum, route) => sum + route.distance, 0);
        const totalTime = routesList.reduce((sum, route) => sum + route.time, 0);
        
        setStats({
          totalDistance,
          totalTime,
          zonesVisited: zones.length,
          routesCount: routesList.length,
        });
      } catch (error) {
        console.error('Ошибка загрузки данных:', error);
      }
    };
    loadData();
  }, []);

  const getZoneCoords = (zone: VisitedZone) => {
    const zoneSize = 50 / 111000; // 50 м в градусах
    return [
      { latitude: zone.latIndex * zoneSize, longitude: zone.lngIndex * zoneSize },
      { latitude: zone.latIndex * zoneSize, longitude: (zone.lngIndex + 1) * zoneSize },
      { latitude: (zone.latIndex + 1) * zoneSize, longitude: (zone.lngIndex + 1) * zoneSize },
      { latitude: (zone.latIndex + 1) * zoneSize, longitude: zone.lngIndex * zoneSize },
    ];
  };

  const getZoneColor = (visitCount: number) => {
    if (visitCount >= 10) return 'rgba(255, 107, 53, 0.8)'; // primary
    if (visitCount >= 5) return 'rgba(78, 205, 196, 0.6)'; // secondary
    if (visitCount >= 2) return 'rgba(69, 183, 209, 0.4)'; // accent
    return 'rgba(150, 206, 180, 0.3)'; // success
  };



  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    map: {
      flex: 1,
    },
    overlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      pointerEvents: 'box-none',
    },
    header: {
      paddingTop: 60,
      paddingHorizontal: 20,
      paddingBottom: 20,
    },
    statsContainer: {
      flexDirection: 'row',
      marginBottom: 16,
    },
    statCard: {
      flex: 1,
      alignItems: 'center',
      marginHorizontal: 4,
    },
    statValue: {
      fontSize: 18,
      fontWeight: 'bold',
      color: colors.primary,
    },
    statLabel: {
      fontSize: 10,
      color: colors.textSecondary,
      marginTop: 2,
      textAlign: 'center',
    },
    routesContainer: {
      position: 'absolute',
      bottom: 20,
      left: 20,
      right: 20,
      maxHeight: 200,
    },
    routesTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 8,
    },
    routeCard: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
      padding: 12,
    },
    routeCardSelected: {
      borderColor: colors.primary,
      borderWidth: 2,
    },
    routeInfo: {
      flex: 1,
    },
    routeDate: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    routeStats: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    legendContainer: {
      position: 'absolute',
      top: 200,
      right: 20,
      backgroundColor: colors.card,
      borderRadius: 8,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    legendTitle: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 8,
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 4,
    },
    legendColor: {
      width: 12,
      height: 12,
      borderRadius: 6,
      marginRight: 8,
    },
    legendText: {
      fontSize: 10,
      color: colors.textSecondary,
    },
    webPlaceholder: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.backgroundSecondary,
    },
    webPlaceholderText: {
      fontSize: 18,
      color: colors.textSecondary,
      textAlign: 'center',
      marginHorizontal: 20,
    },
  });

  // Для веб-платформы показываем заглушку
  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        <View style={styles.webPlaceholder}>
          <Text style={styles.webPlaceholderText}>
            Карта исследования доступна только в мобильном приложении{'\n'}
            Используйте Expo Go для просмотра посещенных зон
          </Text>
        </View>

        <View style={styles.overlay}>
          {/* Статистика */}
          <View style={styles.header}>
            <View style={styles.statsContainer}>
              <Card style={styles.statCard}>
                <Text style={styles.statValue}>{(stats.totalDistance / 1000).toFixed(1)}</Text>
                <Text style={styles.statLabel}>Всего км</Text>
              </Card>
              <Card style={styles.statCard}>
                <Text style={styles.statValue}>{formatTimeShort(stats.totalTime)}</Text>
                <Text style={styles.statLabel}>Время</Text>
              </Card>
              <Card style={styles.statCard}>
                <Text style={styles.statValue}>{stats.zonesVisited}</Text>
                <Text style={styles.statLabel}>Зон</Text>
              </Card>
              <Card style={styles.statCard}>
                <Text style={styles.statValue}>{stats.routesCount}</Text>
                <Text style={styles.statLabel}>Маршрутов</Text>
              </Card>
            </View>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        initialRegion={INITIAL_REGION}
        onRegionChangeComplete={setMapRegion}
        mapType="standard"
      >

        {/* Отображаем посещенные зоны */}
        {visitedZones.map((zone, index) => (
          <Polygon
            key={index}
            coordinates={getZoneCoords(zone)}
            fillColor={getZoneColor(zone.visitCount)}
            strokeColor={colors.primary}
            strokeWidth={1}
          />
        ))}
        
        {/* Отображаем выбранный маршрут */}
        {selectedRoute && (
          <Polyline
            coordinates={selectedRoute.coords}
            strokeColor={colors.primary}
            strokeWidth={3}
          />
        )}
      </MapView>

      <View style={styles.overlay}>
        {/* Статистика */}
        <View style={styles.header}>
          <View style={styles.statsContainer}>
            <Card style={styles.statCard}>
              <Text style={styles.statValue}>{(stats.totalDistance / 1000).toFixed(1)}</Text>
              <Text style={styles.statLabel}>Всего км</Text>
            </Card>
            <Card style={styles.statCard}>
              <Text style={styles.statValue}>{formatTime(stats.totalTime)}</Text>
              <Text style={styles.statLabel}>Время</Text>
            </Card>
            <Card style={styles.statCard}>
              <Text style={styles.statValue}>{stats.zonesVisited}</Text>
              <Text style={styles.statLabel}>Зон</Text>
            </Card>
            <Card style={styles.statCard}>
              <Text style={styles.statValue}>{stats.routesCount}</Text>
              <Text style={styles.statLabel}>Маршрутов</Text>
            </Card>
          </View>
        </View>

        {/* Легенда: территории по уровню */}
        <View style={styles.legendContainer}>
          <Text style={styles.legendTitle}>Территории (уровень)</Text>

          <View style={styles.legendItem}>
            <View style={[styles.legendColor, { backgroundColor: '#22c55e' }]} />
            <Text style={styles.legendText}>Ур. 1 (1 визит)</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendColor, { backgroundColor: '#3b82f6' }]} />
            <Text style={styles.legendText}>Ур. 2 (3+)</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendColor, { backgroundColor: '#a855f7' }]} />
            <Text style={styles.legendText}>Ур. 3 (10+)</Text>
          </View>
        </View>

        {/* Список маршрутов */}
        {routes.length > 0 && (
          <View style={styles.routesContainer}>
            <Text style={styles.routesTitle}>Ваши маршруты</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {routes.map((route, index) => (
                <Card
                  key={index}
                  style={StyleSheet.flatten([
                    styles.routeCard,
                    selectedRoute === route ? styles.routeCardSelected : null,
                  ])}
                >
                  <View style={styles.routeInfo}>
                    <Text style={styles.routeDate}>
                      {formatShortDate(route.date)}
                    </Text>
                    <Text style={styles.routeStats}>
                      {(route.distance / 1000).toFixed(2)} км • {formatTimeShort(route.time)}
                    </Text>
                  </View>
                  <Button
                    title={selectedRoute === route ? "Скрыть" : "Показать"}
                    onPress={() => setSelectedRoute(selectedRoute === route ? null : route)}
                    variant="outline"
                    size="small"
                  />
                </Card>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    </View>
  );
};

export default Explore;