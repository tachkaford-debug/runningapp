import { authService } from '@/services/auth.service';
import { HighlightedCell, territoryService } from '@/services/territory.service';
import { WorkoutSaveResult, workoutService } from '@/services/workout.service';
import { getItem, setItem } from '@/utils/storage';
import * as Location from 'expo-location';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, Animated, Dimensions, Platform,
  ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';

const { width } = Dimensions.get('window');

let MapView: any = null;
let Polyline: any = null;
let Polygon: any = null;
let Circle: any = null;
let PROVIDER_GOOGLE: any = null;
if (Platform.OS !== 'web') {
  const Maps = require('react-native-maps');
  MapView = Maps.default;
  Polyline = Maps.Polyline;
  Polygon = Maps.Polygon;
  Circle = Maps.Circle;
  PROVIDER_GOOGLE = Maps.PROVIDER_GOOGLE;
}

const C = {
  bg: '#0D0D0D', card: '#1A1A1A', border: '#2A2A2A',
  text: '#FFFFFF', sub: '#888888', muted: '#444444',
  accent: '#C8FF00', red: '#FF453A',
};

const CELL_SIZE = 0.00045;
const LAST_LOC_KEY = 'last_known_location';
const GPS_ACCURACY_THRESHOLD = 30; // meters — ideal
const GPS_RELAXED_THRESHOLD = 50;  // meters — accepted after timeout
const GPS_TIMEOUT_MS = 8000;       // ms before relaxing accuracy requirement
const MAX_OLD_CELLS = 120;

function cellColor(count: number): string {
  if (count >= 8) return 'rgba(147,51,234,0.5)';
  if (count >= 4) return 'rgba(59,130,246,0.5)';
  if (count >= 2) return 'rgba(34,197,94,0.5)';
  return 'rgba(187,247,208,0.5)';
}

function highlightFill(priority: HighlightedCell['priority'], opacity: number): string {
  const a = (priority === 'high' ? 0.28 : priority === 'medium' ? 0.16 : 0.08) * opacity;
  return `rgba(200,255,0,${a.toFixed(2)})`;
}

function highlightStroke(priority: HighlightedCell['priority'], opacity: number): string {
  const a = (priority === 'high' ? 0.7 : priority === 'medium' ? 0.4 : 0.2) * opacity;
  return `rgba(200,255,0,${a.toFixed(2)})`;
}

function calculateDistance(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const R = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos((a.latitude * Math.PI) / 180) *
      Math.cos((b.latitude * Math.PI) / 180) *
      sinDLng * sinDLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function smoothLocation(
  prev: { latitude: number; longitude: number },
  next: { latitude: number; longitude: number },
  alpha = 0.2
): { latitude: number; longitude: number } {
  return {
    latitude: prev.latitude + (next.latitude - prev.latitude) * alpha,
    longitude: prev.longitude + (next.longitude - prev.longitude) * alpha,
  };
}

type RawCell = { lat_index: number; lng_index: number; capture_count: number; is_new?: boolean };

function limitCells<T extends RawCell>(cells: T[]): T[] {
  const newCells = cells.filter(c => c.is_new);
  const oldCells = cells
    .filter(c => !c.is_new)
    .sort((a, b) => b.capture_count - a.capture_count)
    .slice(0, MAX_OLD_CELLS);
  return [...newCells, ...oldCells];
}

function mergeCells(
  cells: RawCell[]
): Array<{ coords: { latitude: number; longitude: number }[]; capture_count: number }> {
  if (cells.length === 0) return [];
  const cellMap = new Map<string, RawCell>();
  for (const c of cells) cellMap.set(`${c.lat_index}_${c.lng_index}`, c);
  const visited = new Set<string>();
  const out: Array<{ coords: { latitude: number; longitude: number }[]; capture_count: number }> = [];

  for (const cell of cells) {
    const startKey = `${cell.lat_index}_${cell.lng_index}`;
    if (visited.has(startKey)) continue;
    const queue: RawCell[] = [cell];
    const component = new Set<string>();
    visited.add(startKey);
    let maxCount = 0;
    const bfsLimit = cellMap.size + 1;

    while (queue.length > 0 && component.size < bfsLimit) {
      const cur = queue.shift()!;
      component.add(`${cur.lat_index}_${cur.lng_index}`);
      if (cur.capture_count > maxCount) maxCount = cur.capture_count;
      for (const [dl, dj] of [[1,0],[-1,0],[0,1],[0,-1]] as [number,number][]) {
        const nk = `${cur.lat_index + dl}_${cur.lng_index + dj}`;
        if (!visited.has(nk) && cellMap.has(nk)) {
          visited.add(nk);
          queue.push(cellMap.get(nk)!);
        }
      }
    }

    type Pt = [number, number];
    const edgeMap = new Map<string, [Pt, Pt]>();
    const addEdge = (a: Pt, b: Pt) => {
      const rev = `${b[0]},${b[1]}|${a[0]},${a[1]}`;
      if (edgeMap.has(rev)) edgeMap.delete(rev);
      else edgeMap.set(`${a[0]},${a[1]}|${b[0]},${b[1]}`, [a, b]);
    };

    for (const ck of component) {
      const [r, cc] = ck.split('_').map(Number);
      if (!component.has(`${r - 1}_${cc}`)) addEdge([r, cc], [r, cc + 1]);
      if (!component.has(`${r}_${cc + 1}`)) addEdge([r, cc + 1], [r + 1, cc + 1]);
      if (!component.has(`${r + 1}_${cc}`)) addEdge([r + 1, cc + 1], [r + 1, cc]);
      if (!component.has(`${r}_${cc - 1}`)) addEdge([r + 1, cc], [r, cc]);
    }

    const adj = new Map<string, Pt[]>();
    for (const [a, b] of edgeMap.values()) {
      const ka = `${a[0]},${a[1]}`, kb = `${b[0]},${b[1]}`;
      if (!adj.has(ka)) adj.set(ka, []);
      if (!adj.has(kb)) adj.set(kb, []);
      adj.get(ka)!.push(b);
      adj.get(kb)!.push(a);
    }

    const firstEntry = edgeMap.values().next().value;
    if (!firstEntry) continue;
    const startPt = firstEntry[0] as Pt;
    const ring: Pt[] = [startPt];
    const used = new Set<string>();
    let cur = startPt;
    const maxIter = edgeMap.size * 2 + 4; // safety cap: each edge traversed at most twice

    for (let iter = 0; iter < maxIter; iter++) {
      const next = (adj.get(`${cur[0]},${cur[1]}`) ?? []).find((n: Pt) => {
        const k1 = `${cur[0]},${cur[1]}|${n[0]},${n[1]}`;
        const k2 = `${n[0]},${n[1]}|${cur[0]},${cur[1]}`;
        return !used.has(k1) && !used.has(k2);
      });
      if (!next) break;
      used.add(`${cur[0]},${cur[1]}|${next[0]},${next[1]}`);
      if (next[0] === startPt[0] && next[1] === startPt[1]) break;
      ring.push(next);
      cur = next;
    }

    out.push({
      coords: ring.map(([r, c]) => ({ latitude: r * CELL_SIZE, longitude: c * CELL_SIZE })),
      capture_count: maxCount,
    });
  }
  return out;
}

const fmt = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

const fmtPace = (p: number) => {
  if (!p || p <= 0 || p > 30) return '--:--';
  return `${Math.floor(p)}:${String(Math.round((p - Math.floor(p)) * 60)).padStart(2, '0')}`;
};

type Screen = 'start' | 'countdown' | 'running' | 'paused' | 'panel' | 'segments';
type SummaryStep = 'loading' | 'route' | 'territory' | 'stats';
export default function RunScreen() {
  const [screen, setScreen] = useState<Screen>('start');
  const [countdown, setCountdown] = useState<number | string>(3);
  const [time, setTime] = useState(0);
  const [distance, setDistance] = useState(0);
  const [pace, setPace] = useState(0);
  const [calories, setCalories] = useState(0);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number }[]>([]);
  const [currentLoc, setCurrentLoc] = useState<{ latitude: number; longitude: number } | null>(null);
  const [autopause, setAutopause] = useState(false);
  const [audioComm, setAudioComm] = useState(false);
  const [lockScreen, setLockScreen] = useState(false);
  const [summary, setSummary] = useState<WorkoutSaveResult | null>(null);
  const [summaryStep, setSummaryStep] = useState<SummaryStep>('loading');
  const [visibleCoords, setVisibleCoords] = useState<{ latitude: number; longitude: number }[]>([]);
  const [mergedCells, setMergedCells] = useState<Array<{ coords: { latitude: number; longitude: number }[]; capture_count: number }>>([]);
  const [highlightedCells, setHighlightedCells] = useState<HighlightedCell[]>([]);
  const [pulseOpacity, setPulseOpacity] = useState(0.7);
  const [gpsReady, setGpsReady] = useState(false);
  const [gpsWarning, setGpsWarning] = useState(false);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [autoFollow, setAutoFollow] = useState(true);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const cameraIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoFollowRef = useRef(true);
  const gpsStartTimeRef = useRef<number>(Date.now());

  const countdownAnim = useRef(new Animated.Value(1)).current;
  const holdAnim = useRef(new Animated.Value(0)).current;
  const cellsOpacity = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0.3)).current;
  const holdRef = useRef<ReturnType<typeof Animated.timing> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const trailTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<Date | null>(null);
  const isRunningRef = useRef(false);
  const mapRef = useRef<any>(null);
  const smoothedLocRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const lastCameraLocRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const pointBufferRef = useRef<{ latitude: number; longitude: number }[]>([]);
  const interpQueueRef = useRef<{ latitude: number; longitude: number }[]>([]);
  const lastRenderedRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const rawCoordsRef = useRef<{ latitude: number; longitude: number }[]>([]);
  const weightRef = useRef<number>(70); // kg, loaded from profile

  useEffect(() => {
    getItem<{ weight?: string }>('user_profile').then(p => {
      const w = parseFloat(p?.weight ?? '');
      if (!isNaN(w) && w > 0) weightRef.current = w;
    });
  }, []);

  useEffect(() => {
    const id = pulseAnim.addListener(({ value }: { value: number }) => setPulseOpacity(value));
    return () => pulseAnim.removeListener(id);
  }, [pulseAnim]);

  useEffect(() => {
    let cancelled = false;
    gpsStartTimeRef.current = Date.now();

    (async () => {
      // Immediately use last known location so map renders right away
      const lastLoc = await getItem<{ latitude: number; longitude: number }>(LAST_LOC_KEY);
      if (lastLoc && !cancelled) {
        setCurrentLoc(lastLoc);
        console.log('[GPS] Loaded last known location from storage');
      }

      // Request foreground permissions — on iOS this triggers precise location prompt
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || cancelled) return;

      // iOS: check if precise location is enabled (accuracy authorization)
      if (Platform.OS === 'ios') {
        try {
          const { ios } = await Location.getProviderStatusAsync() as any;
          // accuracyAuthorization: 'full' = precise, 'reduced' = approximate
          if (ios?.accuracyAuthorization === 'reduced') {
            Alert.alert(
              'Точная геопозиция отключена',
              'Включите точную геопозицию в Настройки → Конфиденциальность → Службы геолокации → приложение → Точная геопозиция.',
              [{ text: 'OK' }]
            );
          }
        } catch {}
      }

      // 8s timeout: relax threshold and unblock UI
      const timeoutId = setTimeout(() => {
        if (!cancelled) {
          console.log('[GPS] Timeout — relaxing accuracy threshold to 50m');
          setGpsWarning(true);
          setGpsReady(true);
        }
      }, GPS_TIMEOUT_MS);

      // Use BestForNavigation for highest possible accuracy on iOS
      watchRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 2000,
          distanceInterval: 5,
        },
        (loc) => {
          if (cancelled) return;
          const { latitude, longitude, accuracy } = loc.coords;
          const acc = accuracy ?? 999;
          const elapsed = Date.now() - gpsStartTimeRef.current;
          const threshold = elapsed >= GPS_TIMEOUT_MS ? GPS_RELAXED_THRESHOLD : GPS_ACCURACY_THRESHOLD;

          console.log(`[GPS] accuracy=${acc.toFixed(1)}m elapsed=${elapsed}ms threshold=${threshold}m`);
          setGpsAccuracy(Math.round(acc));

          const coord = { latitude, longitude };
          setCurrentLoc(coord);
          setItem(LAST_LOC_KEY, coord);

          if (acc <= threshold) {
            clearTimeout(timeoutId);
            setGpsReady(true);
            if (acc <= GPS_ACCURACY_THRESHOLD) setGpsWarning(false);
          } else {
            console.log(`[GPS] Weak signal — accuracy ${acc.toFixed(1)}m > ${threshold}m`);
          }
        }
      );

      return () => clearTimeout(timeoutId);
    })();

    return () => {
      cancelled = true;
      watchRef.current?.remove();
      stopTracking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (screen !== 'start' || !currentLoc) return;
    let cancelled = false;
    (async () => {
      try {
        const user = await authService.getCurrentUser();
        const userId = user?.id ?? 'anonymous';
        const cells = await territoryService.getHighlightedCells(userId, currentLoc.latitude, currentLoc.longitude);
        if (!cancelled) {
          setHighlightedCells(cells);
          const pulse = () => {
            Animated.sequence([
              Animated.timing(pulseAnim, { toValue: 1.0, duration: 1200, useNativeDriver: true }),
              Animated.timing(pulseAnim, { toValue: 0.3, duration: 1200, useNativeDriver: true }),
            ]).start(({ finished }: { finished: boolean }) => { if (finished && !cancelled) pulse(); });
          };
          pulse();
        }
      } catch {}
    })();
    return () => { cancelled = true; pulseAnim.stopAnimation(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, currentLoc]);

  const startCountdown = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Нет доступа к геолокации'); return; }
    setScreen('countdown');
    const steps: (number | string)[] = [3, 2, 1, 'GO'];
    let i = 0;
    const tick = () => {
      setCountdown(steps[i]);
      countdownAnim.setValue(1.5);
      Animated.spring(countdownAnim, { toValue: 1, useNativeDriver: true, friction: 4 }).start();
      i++;
      if (i < steps.length) setTimeout(tick, 800);
      else setTimeout(() => beginRun(), 400);
    };
    tick();
  };

  const handleMapInteraction = () => {
    autoFollowRef.current = false;
    setAutoFollow(false);
    if (cameraIdleTimerRef.current) clearTimeout(cameraIdleTimerRef.current);
    cameraIdleTimerRef.current = setTimeout(() => {
      autoFollowRef.current = true;
      setAutoFollow(true);
    }, 5000);
  };

  const beginRun = () => {
    setTime(0); setDistance(0); setPace(0); setCalories(0);
    setCoords(currentLoc ? [currentLoc] : []);
    rawCoordsRef.current = currentLoc ? [currentLoc] : [];
    lastRenderedRef.current = currentLoc ?? null;
    interpQueueRef.current = [];
    startTimeRef.current = new Date();
    isRunningRef.current = true;
    autoFollowRef.current = true;
    setAutoFollow(true);
    setScreen('running');
    startTracking();
  };

  const startTracking = async () => {
    timerRef.current = setInterval(() => setTime((t: number) => t + 1), 1000);
    smoothedLocRef.current = null;
    lastCameraLocRef.current = null;
    pointBufferRef.current = [];

    // Trail interval: drain interpolated queue, push 2 points per tick to coords
    trailTimerRef.current = setInterval(() => {
      if (interpQueueRef.current.length === 0) return;
      const batch = interpQueueRef.current.splice(0, 2);
      setCoords((prev: { latitude: number; longitude: number }[]) => {
        const next = [...prev, ...batch];
        return next.length > 1000 ? next.slice(-1000) : next;
      });
    }, 50);

    watchRef.current?.remove();
    watchRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 2000, distanceInterval: 5 },
      (loc) => {
        if (!isRunningRef.current) return;
        const { latitude, longitude, accuracy } = loc.coords;
        if ((accuracy ?? 999) > GPS_ACCURACY_THRESHOLD) {
          console.log(`[GPS run] Rejected — accuracy ${accuracy?.toFixed(1)}m > ${GPS_ACCURACY_THRESHOLD}m`);
          return;
        }
        const raw = { latitude, longitude };

        // Smooth position
        const smoothed = smoothedLocRef.current
          ? smoothLocation(smoothedLocRef.current, raw, 0.2)
          : raw;
        smoothedLocRef.current = smoothed;
        setCurrentLoc(smoothed);
        setItem(LAST_LOC_KEY, smoothed);

        // Camera — only when moved > 10m and auto-follow is on
        const camDist = lastCameraLocRef.current
          ? calculateDistance(lastCameraLocRef.current, smoothed)
          : 999;
        if (camDist >= 10 && mapRef.current && autoFollowRef.current) {
          lastCameraLocRef.current = smoothed;
          mapRef.current.animateCamera({ center: smoothed, zoom: 16 }, { duration: 600 });
        }

        // Buffer 2 points before processing
        pointBufferRef.current.push(smoothed);
        if (pointBufferRef.current.length < 2) return;
        const buffered = pointBufferRef.current.shift()!;

        // Ignore if < 5m from last rendered point
        const lastPt = lastRenderedRef.current;
        if (lastPt && calculateDistance(lastPt, buffered) < 5) return;

        // Track raw coords for accurate distance/pace stats
        rawCoordsRef.current.push(buffered);
        const raw2 = rawCoordsRef.current;
        let totalDist = 0;
        for (let j = 1; j < raw2.length; j++) totalDist += calculateDistance(raw2[j - 1], raw2[j]);
        setDistance(totalDist);
        setTime((t: number) => {
          if (t > 0 && totalDist > 0) {
            setPace((t / 60) / (totalDist / 1000));
            setCalories(Math.round((totalDist / 1000) * weightRef.current * 1.036));
          }
          return t;
        });

        // Generate interpolated points between last rendered and new point
        const from = lastRenderedRef.current ?? buffered;
        lastRenderedRef.current = buffered;
        for (let step = 1; step <= 5; step++) {
          const t = step / 5;
          interpQueueRef.current.push({
            latitude: from.latitude + (buffered.latitude - from.latitude) * t,
            longitude: from.longitude + (buffered.longitude - from.longitude) * t,
          });
        }
      }
    );
  };

  const stopTracking = () => {
    isRunningRef.current = false;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (trailTimerRef.current) { clearInterval(trailTimerRef.current); trailTimerRef.current = null; }
    // Flush remaining interpolated points
    if (interpQueueRef.current.length > 0) {
      const flush = interpQueueRef.current.splice(0);
      setCoords((prev: { latitude: number; longitude: number }[]) => {
        const next = [...prev, ...flush];
        return next.length > 1000 ? next.slice(-1000) : next;
      });
    }
    watchRef.current?.remove();
    watchRef.current = null;
  };

  const pauseRun = () => { stopTracking(); setScreen('paused'); };
  const resumeRun = () => { isRunningRef.current = true; setScreen('running'); startTracking(); };

  const startHold = () => {
    holdAnim.setValue(0);
    holdRef.current = Animated.timing(holdAnim, { toValue: 1, duration: 1800, useNativeDriver: false });
    holdRef.current.start(({ finished }: { finished: boolean }) => { if (finished) endRun(); });
  };
  const cancelHold = () => {
    holdRef.current?.stop();
    Animated.timing(holdAnim, { toValue: 0, duration: 200, useNativeDriver: false }).start();
  };

  const endRun = async () => {
    stopTracking();
    if (distance < 100) { resetRun(); return; }
    setSummaryStep('loading'); setSummary(null); setVisibleCoords([]); setMergedCells([]);
    cellsOpacity.setValue(0);
    const finalCoords = [...coords];
    try {
      const result = await workoutService.saveWorkout({
        distance_km: distance / 1000,
        duration_seconds: time,
        avg_pace: pace,
        calories,
        gps_track: finalCoords.map(c => ({ lat: c.latitude, lng: c.longitude })),
      });
      setMergedCells(mergeCells(limitCells(result.territory.cells)));
      setSummary(result);
      setSummaryStep('route');
      const total = finalCoords.length;
      const chunkSize = Math.max(1, Math.floor(total / 20));
      let idx = 0;
      const drawNextChunk = () => {
        idx += chunkSize;
        setVisibleCoords(finalCoords.slice(0, Math.min(idx, total)));
        if (idx < total) {
          Animated.timing(new Animated.Value(0), { toValue: 1, duration: 30, useNativeDriver: true })
            .start(() => drawNextChunk());
        } else {
          setSummaryStep('territory');
          cellsOpacity.setValue(0);
          Animated.timing(cellsOpacity, { toValue: 1, duration: 600, useNativeDriver: true })
            .start(({ finished }: { finished: boolean }) => { if (finished) setSummaryStep('stats'); });
        }
      };
      Animated.timing(new Animated.Value(0), { toValue: 1, duration: 400, useNativeDriver: true })
        .start(() => drawNextChunk());
    } catch {
      Alert.alert('Тренировка завершена!', `${(distance / 1000).toFixed(2)} км · ${fmt(time)}`, [
        { text: 'OK', onPress: resetRun },
      ]);
    }
  };

  const resetRun = () => {
    setSummary(null); setSummaryStep('loading'); setVisibleCoords([]); setMergedCells([]);
    cellsOpacity.setValue(0); setScreen('start');
    setTime(0); setDistance(0); setPace(0); setCalories(0);
    setCoords([]); startTimeRef.current = null;
  };

  // (swipe handlers removed — panel/segments open via buttons)
  // Summary screen
  if (summaryStep !== 'loading' && summary) {
    const t = summary.territory;
    return (
      <View style={s.container}>
        <View style={s.mapContainer}>
          {MapView && (
            <MapView
              style={StyleSheet.absoluteFillObject}
              provider={PROVIDER_GOOGLE}
              initialRegion={
                visibleCoords.length
                  ? { latitude: visibleCoords[0].latitude, longitude: visibleCoords[0].longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 }
                  : { latitude: 55.75, longitude: 37.61, latitudeDelta: 0.01, longitudeDelta: 0.01 }
              }
              customMapStyle={darkMapStyle}
            >
              {visibleCoords.length > 1 && (
                <Polyline coordinates={visibleCoords} strokeColor={C.accent} strokeWidth={3} />
              )}
              <Animated.View style={{ opacity: cellsOpacity }}>
                {mergedCells.map((mc, i) => (
                  <Polygon
                    key={i}
                    coordinates={mc.coords}
                    fillColor={cellColor(mc.capture_count)}
                    strokeColor="rgba(200,255,0,0.4)"
                    strokeWidth={1}
                  />
                ))}
              </Animated.View>
            </MapView>
          )}
        </View>

        {summaryStep === 'stats' && (
          <ScrollView style={s.summarySheet} contentContainerStyle={{ paddingBottom: 40 }}>
            <Text style={s.summaryMsg}>{t.primary_message}</Text>
            <View style={s.heroRow}>
              <Text style={s.heroNum}>+{t.new_cells_count}</Text>
              <Text style={s.heroLabel}>новых зон захвачено</Text>
            </View>
            <View style={s.statsRow}>
              <Text style={s.statSub}>повторных: {t.revisited_cells_count}</Text>
              <Text style={s.statSub}>XP: +{t.xp_gained}</Text>
            </View>
            <View style={s.statsGrid}>
              <View style={s.statBox}>
                <Text style={s.statVal}>{summary.workout.distance_km.toFixed(2)}</Text>
                <Text style={s.statLbl}>км</Text>
              </View>
              <View style={s.statBox}>
                <Text style={s.statVal}>{fmt(summary.workout.duration_seconds)}</Text>
                <Text style={s.statLbl}>время</Text>
              </View>
              <View style={s.statBox}>
                <Text style={s.statVal}>{fmtPace(summary.workout.avg_pace)}</Text>
                <Text style={s.statLbl}>темп</Text>
              </View>
              <View style={s.statBox}>
                <Text style={s.statVal}>{summary.workout.calories}</Text>
                <Text style={s.statLbl}>ккал</Text>
              </View>
            </View>
            {t.district_progress.filter(d => d.changed).map(d => (
              <View key={d.district_id} style={s.districtCard}>
                <Text style={s.districtName}>{d.name}</Text>
                <View style={s.progressBar}>
                  <View style={[s.progressFill, { width: `${d.percent}%` as any }]} />
                </View>
                <Text style={s.districtPct}>Ты исследовал {d.percent}% района «{d.name}»</Text>
                <Text style={s.districtLeader}>{d.district_leader}</Text>
              </View>
            ))}
            <View style={s.nextReward}>
              <Text style={s.nextRewardText}>
                До следующей награды: {t.next_reward.cells_needed} зон → +{t.next_reward.bonus_xp} XP
              </Text>
            </View>
            <TouchableOpacity style={s.btnPrimary} onPress={resetRun}>
              <Text style={s.btnPrimaryText}>Готово</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {summaryStep !== 'stats' && (
          <View style={s.summaryLoading}>
            <Text style={s.summaryLoadingText}>
              {summaryStep === 'route' ? 'Рисуем маршрут...' : 'Считаем территорию...'}
            </Text>
          </View>
        )}
      </View>
    );
  }

  // Countdown screen
  if (screen === 'countdown') {
    return (
      <View style={[s.container, s.center]}>
        <Animated.Text style={[s.countdownNum, { transform: [{ scale: countdownAnim }] }]}>
          {countdown}
        </Animated.Text>
      </View>
    );
  }

  // Paused screen
  if (screen === 'paused') {
    return (
      <View style={[s.container, s.center]}>
        <View style={s.pausedSheet}>
          <Text style={s.pausedTitle}>Пауза</Text>
          <View style={s.statsGrid}>
            <View style={s.statBox}><Text style={s.statVal}>{(distance / 1000).toFixed(2)}</Text><Text style={s.statLbl}>км</Text></View>
            <View style={s.statBox}><Text style={s.statVal}>{fmt(time)}</Text><Text style={s.statLbl}>время</Text></View>
            <View style={s.statBox}><Text style={s.statVal}>{fmtPace(pace)}</Text><Text style={s.statLbl}>темп</Text></View>
            <View style={s.statBox}><Text style={s.statVal}>{calories}</Text><Text style={s.statLbl}>ккал</Text></View>
          </View>
          <TouchableOpacity style={s.btnPrimary} onPress={resumeRun}>
            <Text style={s.btnPrimaryText}>Продолжить</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.pauseBtnEnd} onPress={endRun}>
            <Text style={s.btnSecondaryText}>Завершить</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Panel screen (swipe right)
  if (screen === 'panel') {
    return (
      <View style={s.container}>
        <View style={s.panelHeader}>
          <TouchableOpacity onPress={() => setScreen('running')}>
            <Text style={s.backBtn}>← Назад</Text>
          </TouchableOpacity>
          <Text style={s.panelTitle}>Настройки</Text>
        </View>
        <View style={s.panelRow}>
          <Text style={s.panelLabel}>Автопауза</Text>
          <TouchableOpacity style={[s.toggle, autopause && s.toggleOn]} onPress={() => setAutopause((v: boolean) => !v)}>
            <Text style={s.toggleText}>{autopause ? 'Вкл' : 'Выкл'}</Text>
          </TouchableOpacity>
        </View>
        <View style={s.panelRow}>
          <Text style={s.panelLabel}>Голосовые подсказки</Text>
          <TouchableOpacity style={[s.toggle, audioComm && s.toggleOn]} onPress={() => setAudioComm((v: boolean) => !v)}>
            <Text style={s.toggleText}>{audioComm ? 'Вкл' : 'Выкл'}</Text>
          </TouchableOpacity>
        </View>
        <View style={s.panelRow}>
          <Text style={s.panelLabel}>Блокировка экрана</Text>
          <TouchableOpacity style={[s.toggle, lockScreen && s.toggleOn]} onPress={() => setLockScreen((v: boolean) => !v)}>
            <Text style={s.toggleText}>{lockScreen ? 'Вкл' : 'Выкл'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Segments screen (swipe left)
  if (screen === 'segments') {
    return (
      <View style={s.container}>
        <View style={s.panelHeader}>
          <TouchableOpacity onPress={() => setScreen('running')}>
            <Text style={s.backBtn}>← Назад</Text>
          </TouchableOpacity>
          <Text style={s.panelTitle}>Сегменты</Text>
        </View>
        <View style={[s.center, { flex: 1 }]}>
          <Text style={s.subText}>Данные сегментов появятся после пробежки</Text>
        </View>
      </View>
    );
  }
  // Running screen
  if (screen === 'running') {
    const tailCoords = coords.slice(-15);
    const bodyCoords = coords.length > 15 ? coords.slice(0, coords.length - 14) : [];
    return (
      <View style={s.container}>
        <View style={s.mapContainer}>
          {MapView && currentLoc && (
            <MapView
              ref={mapRef}
              style={StyleSheet.absoluteFillObject}
              provider={PROVIDER_GOOGLE}
              initialRegion={{
                latitude: currentLoc.latitude,
                longitude: currentLoc.longitude,
                latitudeDelta: 0.005,
                longitudeDelta: 0.005,
              }}
              customMapStyle={darkMapStyle}
              showsUserLocation={true}
              followsUserLocation={false}
              pitchEnabled={false}
              rotateEnabled={false}
              onPanDrag={handleMapInteraction}
            >
              {/* Shadow */}
              {coords.length > 1 && (
                <Polyline coordinates={coords} strokeColor="rgba(0,0,0,0.5)" strokeWidth={8} lineCap="round" lineJoin="round" />
              )}
              {/* Body — dimmer */}
              {bodyCoords.length > 1 && (
                <Polyline coordinates={bodyCoords} strokeColor="rgba(200,255,0,0.55)" strokeWidth={5} lineCap="round" lineJoin="round" />
              )}
              {/* Live tail — bright */}
              {tailCoords.length > 1 && (
                <Polyline coordinates={tailCoords} strokeColor={C.accent} strokeWidth={5} lineCap="round" lineJoin="round" />
              )}
              {Circle && (
                <>
                  <Circle center={currentLoc} radius={12} fillColor="rgba(200,255,0,0.18)" strokeColor="rgba(200,255,0,0.35)" strokeWidth={1} />
                  <Circle center={currentLoc} radius={6} fillColor={C.accent} strokeColor="#0D0D0D" strokeWidth={2} />
                </>
              )}
            </MapView>
          )}
          {!autoFollow && (
            <View style={s.followBadge}>
              <Text style={s.followBadgeText}>● следование отключено</Text>
            </View>
          )}
        </View>
        <View style={s.runHud}>
          <View style={s.statsGrid}>
            <View style={s.statBox}><Text style={s.statVal}>{(distance / 1000).toFixed(2)}</Text><Text style={s.statLbl}>км</Text></View>
            <View style={s.statBox}><Text style={s.statVal}>{fmt(time)}</Text><Text style={s.statLbl}>время</Text></View>
            <View style={s.statBox}><Text style={s.statVal}>{fmtPace(pace)}</Text><Text style={s.statLbl}>темп</Text></View>
            <View style={s.statBox}><Text style={s.statVal}>{calories}</Text><Text style={s.statLbl}>ккал</Text></View>
          </View>
          <View style={s.runControls}>
            <TouchableOpacity style={s.hudIconBtn} onPress={() => setScreen('panel')}>
              <Text style={s.hudIconText}>⚙</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.btnSecondary} onPress={pauseRun}>
              <Text style={s.btnSecondaryText}>Пауза</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.hudIconBtn} onPress={() => setScreen('segments')}>
              <Text style={s.hudIconText}>📊</Text>
            </TouchableOpacity>
            <Animated.View style={[s.holdBtn, {
              borderColor: holdAnim.interpolate({ inputRange: [0, 1], outputRange: [C.red, '#FF0000'] }),
            }]}>
              <TouchableOpacity onPressIn={startHold} onPressOut={cancelHold} style={s.holdBtnInner}>
                <Text style={s.holdBtnText}>{'Держи\nдля стопа'}</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </View>
      </View>
    );
  }

  // Start screen
  return (
    <View style={s.container}>
      <View style={s.mapContainer}>
        {MapView && currentLoc && (
          <MapView
            style={StyleSheet.absoluteFillObject}
            provider={PROVIDER_GOOGLE}
            initialRegion={{
              latitude: currentLoc.latitude,
              longitude: currentLoc.longitude,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            }}
            customMapStyle={darkMapStyle}
            showsUserLocation
          >
            {highlightedCells.map((hc, i) => {
              const lat = hc.lat_index * CELL_SIZE;
              const lng = hc.lng_index * CELL_SIZE;
              return (
                <Polygon
                  key={i}
                  coordinates={[
                    { latitude: lat, longitude: lng },
                    { latitude: lat + CELL_SIZE, longitude: lng },
                    { latitude: lat + CELL_SIZE, longitude: lng + CELL_SIZE },
                    { latitude: lat, longitude: lng + CELL_SIZE },
                  ]}
                  fillColor={highlightFill(hc.priority, pulseOpacity)}
                  strokeColor={highlightStroke(hc.priority, pulseOpacity)}
                  strokeWidth={1}
                />
              );
            })}
          </MapView>
        )}
        {/* GPS status badge */}
        {!gpsReady && (
          <View style={s.gpsBadge}>
            <Text style={s.gpsBadgeText}>
              {gpsAccuracy != null ? `⌖ Точность: ${gpsAccuracy}м` : "⌖ Определяем местоположение..."}
            </Text>
          </View>
        )}
        {gpsReady && gpsWarning && (
          <View style={[s.gpsBadge, s.gpsBadgeWarn]}>
            <Text style={s.gpsBadgeText}>⚠ Слабый сигнал GPS{gpsAccuracy != null ? ` · ${gpsAccuracy}м` : ""}</Text>
          </View>
        )}
        {gpsReady && !gpsWarning && gpsAccuracy != null && (
          <View style={[s.gpsBadge, s.gpsBadgeGood]}>
            <Text style={[s.gpsBadgeText, { color: "#C8FF00" }]}>✓ Точность: {gpsAccuracy}м</Text>
          </View>
        )}
      </View>
      <View style={s.startSheet}>
        <TouchableOpacity style={s.btnStart} onPress={startCountdown} activeOpacity={0.8}>
          <Text style={s.btnStartText}>Начать пробежку</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#0D0D0D' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#444444' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0D0D0D' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1A1A1A' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#2A2A2A' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0A0A1A' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D0D' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mapContainer: { flex: 1 },
  startSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 24, paddingBottom: 40,
    backgroundColor: 'rgba(13,13,13,0.92)',
    alignItems: 'center',
  },
  btnStart: {
    backgroundColor: '#C8FF00', borderRadius: 20,
    paddingVertical: 26, alignItems: 'center',
    width: '100%', maxWidth: 480,
  },
  btnStartText: { color: '#0D0D0D', fontSize: 22, fontWeight: '700' },
  countdownNum: { fontSize: 120, fontWeight: '900', color: '#C8FF00' },
  runHud: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(13,13,13,0.92)', padding: 16, paddingBottom: 36,
  },
  runControls: { flexDirection: 'row', gap: 12, marginTop: 12 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statBox: {
    flex: 1, minWidth: (width - 64) / 2,
    backgroundColor: '#1A1A1A', borderRadius: 12,
    padding: 12, alignItems: 'center',
  },
  statVal: { fontSize: 28, fontWeight: '700', color: '#FFFFFF' },
  statLbl: { fontSize: 12, color: '#888888', marginTop: 2 },
  btnPrimary: {
    backgroundColor: '#C8FF00', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginTop: 16, width: '100%',
  },
  btnPrimaryText: { color: '#0D0D0D', fontSize: 16, fontWeight: '700' },
  btnSecondary: {
    flex: 1, backgroundColor: '#1A1A1A', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
    borderWidth: 1, borderColor: '#2A2A2A',
  },
  btnSecondaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  holdBtn: { flex: 1, borderRadius: 14, borderWidth: 2, overflow: 'hidden' },
  holdBtnInner: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 16 },
  holdBtnText: { color: '#FF453A', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  pausedTitle: { fontSize: 36, fontWeight: '800', color: '#FFFFFF', marginBottom: 24 },
  pausedSheet: {
    width: '100%', paddingHorizontal: 24, paddingVertical: 32,
    backgroundColor: '#111', borderRadius: 24,
    marginHorizontal: 24,
  },
  pauseBtnEnd: {
    backgroundColor: '#1A1A1A', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginTop: 12,
    borderWidth: 1, borderColor: '#2A2A2A', width: '100%',
  },
  panelHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    padding: 16, paddingTop: 56, borderBottomWidth: 1, borderBottomColor: '#2A2A2A',
  },
  panelTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  backBtn: { fontSize: 16, color: '#C8FF00' },
  panelRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#2A2A2A',
  },
  panelLabel: { fontSize: 16, color: '#FFFFFF' },
  toggle: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 20, backgroundColor: '#1A1A1A',
    borderWidth: 1, borderColor: '#2A2A2A',
  },
  toggleOn: { backgroundColor: '#C8FF00' },
  toggleText: { color: '#FFFFFF', fontWeight: '600' },
  subText: { color: '#888888', fontSize: 14 },
  summarySheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    maxHeight: '55%', backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20,
  },
  summaryMsg: { fontSize: 15, color: '#FFFFFF', marginBottom: 16, lineHeight: 22 },
  heroRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 4 },
  heroNum: { fontSize: 72, fontWeight: '900', color: '#C8FF00', lineHeight: 80 },
  heroLabel: { fontSize: 16, color: '#888888' },
  statsRow: { flexDirection: 'row', gap: 16, marginBottom: 16 },
  statSub: { fontSize: 13, color: '#888888' },
  districtCard: {
    backgroundColor: '#0D0D0D', borderRadius: 12,
    padding: 12, marginTop: 8,
    borderWidth: 1, borderColor: '#2A2A2A',
  },
  districtName: { fontSize: 14, fontWeight: '700', color: '#FFFFFF', marginBottom: 6 },
  progressBar: {
    height: 6, backgroundColor: '#444444',
    borderRadius: 3, overflow: 'hidden', marginBottom: 4,
  },
  progressFill: { height: '100%', backgroundColor: '#C8FF00', borderRadius: 3 },
  districtPct: { fontSize: 12, color: '#888888', marginTop: 2 },
  districtLeader: { fontSize: 12, color: '#C8FF00', marginTop: 2 },
  nextReward: {
    backgroundColor: '#0D0D0D', borderRadius: 12,
    padding: 12, marginTop: 12,
    borderWidth: 1, borderColor: '#2A2A2A',
  },
  nextRewardText: { fontSize: 13, color: '#888888' },
  summaryLoading: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 24, alignItems: 'center',
    backgroundColor: 'rgba(13,13,13,0.85)',
  },
  summaryLoadingText: { color: '#888888', fontSize: 14 },
  gpsBadge: {
    position: 'absolute', top: 12, alignSelf: 'center',
    backgroundColor: 'rgba(13,13,13,0.82)', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 6,
    borderWidth: 1, borderColor: '#2A2A2A',
    zIndex: 10,
  },
  gpsBadgeWarn: { borderColor: '#FF9500' },
  gpsBadgeGood: { borderColor: '#C8FF00' },
  gpsBadgeText: { color: '#888888', fontSize: 12 },
  followBadge: {
    position: 'absolute', top: 12, alignSelf: 'center',
    backgroundColor: 'rgba(13,13,13,0.82)', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 5,
    borderWidth: 1, borderColor: '#2A2A2A',
  },
  followBadgeText: { color: '#888888', fontSize: 11 },
  hudIconBtn: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: '#1A1A1A', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#2A2A2A',
  },
  hudIconText: { fontSize: 20 },
});