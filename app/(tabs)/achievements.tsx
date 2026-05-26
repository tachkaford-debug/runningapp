import { achievementsService, AchievementWithStatus, RARITY_COLOR } from '@/services/achievements.service';
import { Medal, medalsService, NewMedalInput } from '@/services/medals.service';
import { statsService, UserStats } from '@/services/stats.service';
import { Workout, workoutService } from '@/services/workout.service';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert, Animated, Dimensions, FlatList, Modal,
  RefreshControl, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';

const { width: SW, height: SH } = Dimensions.get('window');

const C = {
  bg: '#0D0D0D', card: '#1A1A1A', card2: '#222',
  border: '#2A2A2A', text: '#FFF', sub: '#888', muted: '#444',
  accent: '#C8FF00', accentDim: 'rgba(200,255,0,0.12)',
  gold: '#FFD700', silver: '#C0C0C0', bronze: '#CD7F32',
};

const STATUS_COLOR: Record<string, string> = {
  pending: '#FF9F0A', approved: '#C8FF00', rejected: '#FF453A',
};
const STATUS_LABEL: Record<string, string> = {
  pending: 'На проверке', approved: 'Подтверждено', rejected: 'Отклонено',
};

function fmtDuration(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}
function fmtPace(p: number) {
  if (!p) return '--:--';
  const m = Math.floor(p);
  const s = Math.round((p - m) * 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Mini bar chart (last 7 days) ──────────────────────────────────────────────
function MiniBarChart({ workouts }: { workouts: Workout[] }) {
  const bars = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const key = d.toISOString().slice(0, 10);
    return workouts.filter(w => w.created_at.slice(0, 10) === key)
      .reduce((sum, w) => sum + w.distance_km, 0);
  });
  const max = Math.max(...bars, 1);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 36 }}>
      {bars.map((v, i) => (
        <View key={i} style={{
          flex: 1, borderRadius: 3,
          height: Math.max(3, (v / max) * 36),
          backgroundColor: v > 0 ? C.accent : C.border,
        }} />
      ))}
    </View>
  );
}

// ── Reusable bottom sheet ─────────────────────────────────────────────────────
function Sheet({ visible, onClose, title, children, height = SH * 0.82 }: {
  visible: boolean; onClose: () => void; title: string;
  children: React.ReactNode; height?: number;
}) {
  const anim = useRef(new Animated.Value(SH)).current;
  useEffect(() => {
    Animated.spring(anim, {
      toValue: visible ? 0 : SH,
      useNativeDriver: true, tension: 65, friction: 11,
    }).start();
  }, [visible]);

  if (!visible) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <TouchableOpacity style={ms.backdrop} activeOpacity={1} onPress={onClose} />
      <Animated.View style={[ms.sheet, { height, transform: [{ translateY: anim }] }]}>
        <View style={ms.handle} />
        <View style={ms.sheetHeader}>
          <Text style={ms.sheetTitle}>{title}</Text>
          <TouchableOpacity onPress={onClose} style={ms.closeBtn}>
            <Ionicons name="close" size={20} color={C.sub} />
          </TouchableOpacity>
        </View>
        {children}
      </Animated.View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function AchievementsScreen() {
  const router = useRouter();
  const [stats, setStats]               = useState<UserStats | null>(null);
  const [workouts, setWorkouts]         = useState<Workout[]>([]);
  const [achievements, setAchievements] = useState<AchievementWithStatus[]>([]);
  const [medals, setMedals]             = useState<Medal[]>([]);  const [refreshing, setRefreshing]     = useState(false);
  const [sheet, setSheet]               = useState<'runs' | 'medals' | 'achievements' | null>(null);
  const [medalForm, setMedalForm]       = useState<NewMedalInput>({ event_name: '', place: '', event_date: '', proof_image_url: '' });
  const [savingMedal, setSavingMedal]   = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const [s, w, a, m] = await Promise.all([
        statsService.getUserStats(),
        workoutService.getUserWorkouts(1000),
        achievementsService.getUserAchievements(),
        medalsService.getUserMedals()
      ]);
      setStats(s); setWorkouts(w); setAchievements(a);
      setMedals(m);
    } catch {
      setStats({ total_distance: 0, total_calories: 0, total_runs: 0, total_duration: 0, best_pace: 0, best_distance: 0, current_streak: 0 });
    }
  };

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const saveMedal = async () => {
    if (!medalForm.event_name.trim() || !medalForm.place.trim() || !medalForm.event_date.trim()) {
      Alert.alert('Заполните поля', 'Название, место и дата обязательны.');
      return;
    }
    setSavingMedal(true);
    try {
      await medalsService.addMedal(medalForm);
      const m = await medalsService.getUserMedals();
      setMedals(m);
      setMedalForm({ event_name: '', place: '', event_date: '', proof_image_url: '' });
      setSheet(null);
    } catch { Alert.alert('Ошибка', 'Не удалось сохранить.'); }
    finally { setSavingMedal(false); }
  };

  const totalDist     = stats?.total_distance || 0;
  const level         = Math.floor(totalDist / 10) + 1;
  const xpPct         = Math.floor(((totalDist % 10) / 10) * 100);  const unlockedCount = achievements.filter(a => a.unlocked).length;
  const CARD_W        = (SW - 48 - 12) / 2;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
      >
        {/* ── HEADER ── */}
        <View style={s.header}>
          <Text style={s.pageTitle}>Витрина достижений</Text>
          <View style={s.rankRow}>
            <View style={s.pentagon}>
              <Text style={s.pentagonNum}>{stats?.total_runs ?? '—'}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 16 }}>
              <Text style={s.levelLabel}>Уровень {level}</Text>
              <View style={s.levelBarTrack}>
                <View style={[s.levelBarFill, { width: `${xpPct}%` }]} />
              </View>
              <Text style={s.levelSub}>{xpPct}% до ур. {level + 1}</Text>
            </View>
          </View>
        </View>

        {/* ── 2×2 GRID ── */}
        <View style={s.grid}>

          {/* Пробежки */}
          <TouchableOpacity style={[s.card, { width: CARD_W }]} activeOpacity={0.75} onPress={() => setSheet('runs')}>
            <MiniBarChart workouts={workouts} />
            <View style={{ marginTop: 10 }}>
              <Text style={s.cardBig}>{totalDist.toFixed(1)} <Text style={s.cardUnit}>км</Text></Text>
              <Text style={s.cardBig}>{(stats?.total_calories ?? 0).toLocaleString()} <Text style={s.cardUnit}>ккал</Text></Text>
            </View>
            <Text style={s.cardLabel}>Пробежки</Text>
          </TouchableOpacity>

          {/* Медали */}
          <TouchableOpacity style={[s.card, { width: CARD_W }]} activeOpacity={0.75} onPress={() => setSheet('medals')}>
            <View style={s.medalDots}>
              {medals.length === 0
                ? <Text style={s.emptyHint}>Нет медалей</Text>
                : medals.slice(0, 6).map((m, i) => (
                    <View key={i} style={[s.medalDot, { backgroundColor: STATUS_COLOR[m.verification_status] + '44' }]}>
                      <Text style={{ fontSize: 18 }}>🏅</Text>
                    </View>
                  ))
              }
            </View>
            <Text style={s.cardLabel}>Мои медали</Text>
          </TouchableOpacity>

          {/* Лидерборд */}
          <TouchableOpacity style={[s.card, { width: CARD_W }]} activeOpacity={0.75} onPress={() => router.push('/(tabs)/leaderboard')}>
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ fontSize: 32 }}>🏆</Text>
              <Text style={{ color: C.sub, fontSize: 12, marginTop: 8, textAlign: 'center' }}>Смотреть рейтинг</Text>
            </View>
            <Text style={s.cardLabel}>Лидерборд</Text>
          </TouchableOpacity>

          {/* Ачивки */}
          <TouchableOpacity style={[s.card, { width: CARD_W }]} activeOpacity={0.75} onPress={() => setSheet('achievements')}>
            <View style={s.achGrid}>
              {achievements.slice(0, 6).map((a, i) => (
                <Text key={i} style={{ fontSize: 20, opacity: a.unlocked ? 1 : 0.25 }}>{a.icon}</Text>
              ))}
            </View>
            <Text style={s.cardLabel}>Ачивки {unlockedCount}/{achievements.length}</Text>
          </TouchableOpacity>

        </View>
      </ScrollView>

      {/* ══ SHEET: ПРОБЕЖКИ ══ */}
      <Sheet visible={sheet === 'runs'} onClose={() => setSheet(null)} title="Все пробежки">
        <FlatList
          data={workouts}
          keyExtractor={w => w.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 48 }}>
              <Text style={{ fontSize: 40 }}>🏃</Text>
              <Text style={{ color: C.sub, marginTop: 12 }}>Нет пробежек</Text>
            </View>
          }
          renderItem={({ item: w }) => (
            <View style={ms.runRow}>
              <View style={{ flex: 1 }}>
                <Text style={ms.runDist}>{w.distance_km.toFixed(2)} км</Text>
                <Text style={ms.runDate}>{fmtDate(w.created_at)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <Text style={ms.runMeta}>{fmtDuration(w.duration_seconds)}</Text>
                <Text style={ms.runMeta}>{fmtPace(w.avg_pace)} /км</Text>
                <Text style={ms.runMeta}>{w.calories} ккал</Text>
              </View>
            </View>
          )}
        />
      </Sheet>

      {/* ══ SHEET: МЕДАЛИ ══ */}
      <Sheet visible={sheet === 'medals'} onClose={() => setSheet(null)} title="Мои медали" height={SH * 0.9}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          <Text style={ms.inputLabel}>Название события *</Text>
          <TextInput style={ms.input} placeholder="Moscow Marathon 2024" placeholderTextColor={C.muted}
            value={medalForm.event_name} onChangeText={v => setMedalForm(f => ({ ...f, event_name: v }))} />
          <Text style={ms.inputLabel}>Место / результат *</Text>
          <TextInput style={ms.input} placeholder="Финишёр, 1-е место…" placeholderTextColor={C.muted}
            value={medalForm.place} onChangeText={v => setMedalForm(f => ({ ...f, place: v }))} />
          <Text style={ms.inputLabel}>Дата * (ГГГГ-ММ-ДД)</Text>
          <TextInput style={ms.input} placeholder="2024-09-22" placeholderTextColor={C.muted}
            value={medalForm.event_date} onChangeText={v => setMedalForm(f => ({ ...f, event_date: v }))}
            keyboardType="numbers-and-punctuation" />
          <Text style={ms.inputLabel}>Фото (ссылка, необязательно)</Text>
          <TextInput style={ms.input} placeholder="https://..." placeholderTextColor={C.muted}
            value={medalForm.proof_image_url} onChangeText={v => setMedalForm(f => ({ ...f, proof_image_url: v }))}
            autoCapitalize="none" />
          <TouchableOpacity style={[ms.saveBtn, savingMedal && { opacity: 0.6 }]} onPress={saveMedal} disabled={savingMedal}>
            <Text style={ms.saveBtnText}>{savingMedal ? 'Сохранение...' : '+ Добавить медаль'}</Text>
          </TouchableOpacity>

          {medals.map(m => (
            <View key={m.id} style={ms.medalRow}>
              <Text style={{ fontSize: 26, marginRight: 12 }}>🏅</Text>
              <View style={{ flex: 1 }}>
                <Text style={ms.medalName}>{m.event_name}</Text>
                <Text style={ms.medalMeta}>{m.place} · {m.event_date}</Text>
                <Text style={[ms.medalStatus, { color: STATUS_COLOR[m.verification_status] }]}>
                  {STATUS_LABEL[m.verification_status]}
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>
      </Sheet>

      {/* ══ SHEET: АЧИВКИ ══ */}
      <Sheet visible={sheet === 'achievements'} onClose={() => setSheet(null)} title="Достижения">
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          {(['common', 'rare', 'epic', 'legendary'] as const).map(rarity => {
            const group = achievements.filter(a => a.rarity === rarity);
            if (!group.length) return null;
            const rarityColor = RARITY_COLOR[rarity];
            const rarityLabel: Record<string, string> = {
              common: 'Обычные', rare: 'Редкие', epic: 'Эпические', legendary: 'Легендарные',
            };
            return (
              <View key={rarity}>
                <View style={ms.rarityHeader}>
                  <View style={[ms.rarityDot, { backgroundColor: rarityColor }]} />
                  <Text style={[ms.rarityTitle, { color: rarityColor }]}>{rarityLabel[rarity]}</Text>
                </View>
                {group.map(a => {
                  const pct = Math.round(a.progress_pct * 100);
                  return (
                    <View key={a.id} style={[ms.achRow, a.unlocked && { borderColor: rarityColor + '88', backgroundColor: rarityColor + '0D' }]}>
                      <View style={[ms.achIcon, { backgroundColor: rarityColor + '22' }]}>
                        <Text style={{ fontSize: 24, opacity: a.locked ? 0.3 : 1 }}>{a.locked ? '🔒' : a.icon}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                          <Text style={[ms.achTitle, a.locked && { color: C.sub }]}>{a.title}</Text>
                          {a.unlocked
                            ? <Ionicons name="checkmark-circle" size={18} color={rarityColor} />
                            : <Text style={[ms.achPct, { color: rarityColor }]}>{pct}%</Text>
                          }
                        </View>
                        <Text style={ms.achDesc}>{a.locked ? 'Разблокируйте предыдущий уровень' : a.description}</Text>
                        <Text style={ms.achReward}>+{a.xp_reward} XP</Text>
                        {!a.unlocked && !a.locked && (
                          <>
                            <View style={ms.achBar}>
                              <View style={[ms.achBarFill, { width: `${pct}%`, backgroundColor: rarityColor }]} />
                            </View>
                            <Text style={ms.achProgress}>{a.progress_current} / {a.progress_target}</Text>
                          </>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            );
          })}
        </ScrollView>
      </Sheet>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  header: { paddingTop: 60, paddingHorizontal: 24, paddingBottom: 20, backgroundColor: '#111' },
  pageTitle: { fontSize: 28, fontWeight: '800', color: '#FFFFFF', marginBottom: 20 },
  rankRow: { flexDirection: 'row', alignItems: 'center' },
  pentagon: {
    width: 64, height: 64, backgroundColor: C.accent,
    borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    // approximate pentagon with large border-radius
    transform: [{ rotate: '0deg' }],
  },
  pentagonNum: { fontSize: 26, fontWeight: '900', color: '#0D0D0D' },
  levelLabel: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 8 },
  levelBarTrack: { height: 6, backgroundColor: C.border, borderRadius: 3, overflow: 'hidden', marginBottom: 6 },
  levelBarFill: { height: '100%', backgroundColor: C.accent, borderRadius: 3 },
  levelSub: { fontSize: 12, color: C.sub },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 24, paddingTop: 20 },
  card: {
    backgroundColor: C.card, borderRadius: 20, padding: 16,
    borderWidth: 1, borderColor: C.border,
    minHeight: 160, justifyContent: 'space-between',
  },
  cardBig: { fontSize: 22, fontWeight: '800', color: C.text, lineHeight: 28 },
  cardUnit: { fontSize: 13, fontWeight: '400', color: C.sub },
  cardLabel: { fontSize: 12, fontWeight: '700', color: C.sub, marginTop: 10, letterSpacing: 0.5 },
  medalDots: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, flex: 1, alignContent: 'flex-start' },
  medalDot: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  emptyHint: { fontSize: 12, color: C.muted, fontStyle: 'italic' },
  lbRank: { fontSize: 14, fontWeight: '800', color: C.sub, width: 20 },
  lbName: { fontSize: 13, fontWeight: '600', color: C.text, flex: 1 },
  achGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, flex: 1, alignContent: 'flex-start' },
});

const ms = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.65)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#161616', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 12,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#333', alignSelf: 'center', marginBottom: 14 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: C.text },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' },
  // runs
  runRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.card, borderRadius: 14, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: C.border,
  },
  runDist: { fontSize: 18, fontWeight: '800', color: C.text, marginBottom: 2 },
  runDate: { fontSize: 12, color: C.sub },
  runMeta: { fontSize: 12, color: C.sub },
  // medals
  inputLabel: { fontSize: 13, color: C.sub, marginBottom: 6, marginTop: 14 },
  input: {
    backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, color: C.text,
  },
  saveBtn: { backgroundColor: C.accent, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 20, marginBottom: 24 },
  saveBtnText: { fontSize: 15, fontWeight: '800', color: '#0D0D0D' },
  medalRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.card, borderRadius: 14, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: C.border,
  },
  medalName: { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 2 },
  medalMeta: { fontSize: 12, color: C.sub, marginBottom: 4 },
  medalStatus: { fontSize: 11, fontWeight: '700' },
  // leaderboard
  lbRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.card, borderRadius: 14, padding: 12,
    marginBottom: 8, borderWidth: 1, borderColor: C.border, gap: 10,
  },
  lbRowMe: { borderColor: C.accent + '60', backgroundColor: C.accentDim },
  lbRankNum: { fontSize: 14, fontWeight: '800', color: C.sub, width: 32 },
  lbAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#2A2A2A', alignItems: 'center', justifyContent: 'center',
  },
  lbName: { flex: 1, fontSize: 14, fontWeight: '600', color: C.text },
  lbDist: { fontSize: 13, fontWeight: '700', color: C.sub },
  // achievements
  achRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: C.card, borderRadius: 14, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: C.border,
    gap: 12,
  },
  achRowDone: { borderColor: C.accent + '55' },
  achRowLocked: { opacity: 0.4 },
  rarityHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, marginBottom: 8 },
  rarityDot: { width: 8, height: 8, borderRadius: 4 },
  rarityTitle: { fontSize: 13, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  achIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center' },
  achTitle: { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 2 },
  achDesc: { fontSize: 12, color: C.sub, marginBottom: 4 },
  achReward: { fontSize: 12, color: C.accent, fontWeight: '600' },
  achRarity: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  achProgress: { fontSize: 11, color: C.sub, marginTop: 2, textAlign: 'right' },
  achPct: { fontSize: 12, color: C.muted },
  achBar: { height: 4, backgroundColor: C.border, borderRadius: 2, overflow: 'hidden' },
  achBarFill: { height: '100%', backgroundColor: C.accent, borderRadius: 2 },
});
