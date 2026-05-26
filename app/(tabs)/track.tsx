import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { Colors } from '@/constants/Colors';
import { useColorScheme as useColorSchemeHook } from '@/hooks/useColorScheme';
import { calculateDistance, formatPace, formatTime } from '@/utils/location';
import { getItem, setItem } from '@/utils/storage';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import React, { useEffect, useState } from 'react';
import { Alert, Platform, StatusBar, StyleSheet, Text, View } from 'react-native';

// Условный импорт для react-native-maps
let MapView: any = null;
let Polyline: any = null;
let Marker: any = null;

if (Platform.OS !== 'web') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- conditional native module
  const Maps = require('react-native-maps');
  MapView = Maps.default;
  Polyline = Maps.Polyline;
  Marker = Maps.Marker;
}

const Track = () => {
  const [isTracking, setIsTracking] = useState(false);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number }[]>([]);
  const [time, setTime] = useState(0);
  const [distance, setDistance] = useState(0);
  const [pace, setPace] = useState(0);
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const colorScheme = useColorSchemeHook();
  const colors = Colors[colorScheme ?? 'light'];

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const locationRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeRef = useRef(0);

  // Keep timeRef in sync so location interval can read current time without stale closure
  useEffect(() => { timeRef.current = time; }, [time]);

  // Cleanup on unmount
  useEffect(() => () => { clearIntervals(); }, []);

  const clearIntervals = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (locationRef.current) { clearInterval(locationRef.current); locationRef.current = null; }
  };

  const startIntervals = () => {
    if (timerRef.current || locationRef.current) return; // already running
    timerRef.current = setInterval(() => setTime(t => t + 1), 1000);
    locationRef.current = setInterval(async () => {
      try {
        const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        const newCoord = { latitude: location.coords.latitude, longitude: location.coords.longitude };
        setCurrentLocation(newCoord);
        setCoords(prev => {
          if (!prev.length) return [newCoord];
          const dist = calculateDistance(prev[prev.length - 1], newCoord);
          if (dist <= 5) return prev;
          const next = [...prev, newCoord];
          let total = 0;
          for (let i = 1; i < next.length; i++) total += calculateDistance(next[i - 1], next[i]);
          setDistance(total);
          if (timeRef.current > 0 && total > 0) setPace((timeRef.current / 60) / (total / 1000));
          return next;
        });
      } catch (e) { console.error('Ошибка получения локации:', e); }
    }, 3000);
  };



  const startTracking = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Ошибка', 'Разрешение на геолокацию не получено!');
        return;
      }
      
      // Получаем начальную позицию
      const initialLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      
      const initialCoord = {
        latitude: initialLocation.coords.latitude,
        longitude: initialLocation.coords.longitude,
      };
      
      setCurrentLocation(initialCoord);
      setCoords([initialCoord]);
      setTime(0);
      setDistance(0);
      setPace(0);
      setIsTracking(true);
      startIntervals();
      
      console.log('Трекинг начат:', initialCoord);
    } catch (error) {
      console.error('Ошибка при старте трекинга:', error);
      Alert.alert('Ошибка', 'Не удалось получить вашу позицию. Проверьте настройки геолокации.');
    }
  };

  const stopTracking = async () => {
    setIsTracking(false);
    clearIntervals();
    
    if (coords.length > 0 && distance > 0) {
      const routeData = {
        coords, 
        time, 
        distance,
        date: new Date().toISOString() 
      };
      
      await setItem('lastRoute', routeData);
      
      const existingRoutes = await getItem<typeof routeData[]>('routes') || [];
      existingRoutes.push(routeData);
      await setItem('routes', existingRoutes);
      
      const currentXp = await getItem<number>('xp') || 0;
      const newXp = currentXp + Math.floor(distance / 100);
      await setItem('xp', newXp);
      
      Alert.alert('Успех!', `Тренировка сохранена! +${Math.floor(distance / 100)} XP`);
    }
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
      marginBottom: 20,
    },
    controlContainer: {
      position: 'absolute',
      bottom: 40,
      left: 20,
      right: 20,
    },
    startButton: {
      height: 80,
      borderRadius: 40,
      marginBottom: 16,
    },
    secondaryButtons: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    secondaryButton: {
      flex: 0.48,
      height: 50,
    },
    statusCard: {
      marginBottom: 16,
    },
    statusText: {
      fontSize: 16,
      fontWeight: '600',
      textAlign: 'center',
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
        <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />
        
        <View style={styles.webPlaceholder}>
          <Ionicons name="map-outline" size={64} color={colors.textSecondary} />
          <Text style={styles.webPlaceholderText}>
            Карта доступна только в мобильном приложении{'\n'}
            Используйте Expo Go для полного функционала
          </Text>
        </View>

        <View style={styles.overlay}>
          {/* Статистика */}
          <View style={styles.header}>
            <Card style={styles.statusCard}>
              <Text style={[styles.statusText, { color: colors.text }]}>
                {isTracking ? '🏃‍♂️ Тренировка активна' : 'Готов к тренировке'}
              </Text>
            </Card>
            
            <View style={styles.statsContainer}>
              <StatCard
                title="Время"
                value={formatTime(time)}
                color={colors.primary}
              />
              <StatCard
                title="Дистанция"
                value={(distance / 1000).toFixed(2)}
                unit="км"
                color={colors.secondary}
              />
              <StatCard
                title="Темп"
                value={formatPace(pace)}
                unit="мин/км"
                color={colors.accent}
              />
            </View>
          </View>

          {/* Кнопки управления */}
          <View style={styles.controlContainer}>
            <Button
              title={isTracking ? 'Остановить тренировку' : 'Начать тренировку'}
              onPress={isTracking ? stopTracking : startTracking}
              variant={isTracking ? 'secondary' : 'primary'}
              size="large"
              style={styles.startButton}
            />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />
      
      <MapView
        style={styles.map}
        initialRegion={{
          latitude: currentLocation?.latitude || 55.75,
          longitude: currentLocation?.longitude || 37.62,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
        showsUserLocation={true}
        followsUserLocation={isTracking}
        mapType="standard"
      >
        {coords.length > 1 && (
          <Polyline 
            coordinates={coords} 
            strokeColor={colors.primary} 
            strokeWidth={4} 
          />
        )}
        {currentLocation && (
          <Marker
            coordinate={currentLocation}
            title="Ваша позиция"
          >
            <View style={{
              backgroundColor: colors.primary,
              borderRadius: 8,
              padding: 8,
            }}>
              <Ionicons name="location" size={16} color="white" />
            </View>
          </Marker>
        )}
      </MapView>

      <View style={styles.overlay}>
        {/* Статистика */}
        <View style={styles.header}>
          <Card style={styles.statusCard}>
            <Text style={[styles.statusText, { color: colors.text }]}>
              {isTracking ? '🏃‍♂️ Тренировка активна' : 'Готов к тренировке'}
            </Text>
          </Card>
          
          <View style={styles.statsContainer}>
            <StatCard
              title="Время"
              value={formatTime(time)}
              color={colors.primary}
            />
            <StatCard
              title="Дистанция"
              value={(distance / 1000).toFixed(2)}
              unit="км"
              color={colors.secondary}
            />
            <StatCard
              title="Темп"
              value={formatPace(pace)}
              unit="мин/км"
              color={colors.accent}
            />
          </View>
        </View>

        {/* Кнопки управления */}
        <View style={styles.controlContainer}>
          <Button
            title={isTracking ? 'Остановить тренировку' : 'Начать тренировку'}
            onPress={isTracking ? stopTracking : startTracking}
            variant={isTracking ? 'secondary' : 'primary'}
            size="large"
            style={styles.startButton}
          />
          
          {!isTracking && (
            <View style={styles.secondaryButtons}>
              <Button
                title="История"
                onPress={() => {/* TODO: Открыть историю */}}
                variant="outline"
                style={styles.secondaryButton}
              />
              <Button
                title="Настройки"
                onPress={() => {/* TODO: Открыть настройки */}}
                variant="outline"
                style={styles.secondaryButton}
              />
            </View>
          )}
        </View>
      </View>
    </View>
  );
};

export default Track;