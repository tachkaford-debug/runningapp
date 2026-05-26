import { LeaderboardEntry, leaderboardService } from '@/services/leaderboard.service';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';

const C = {
  bg: '#0D0D0D', card: '#1A1A1A', border: '#2A2A2A',
  text: '#FFFFFF', sub: '#888888', muted: '#444444',
  accent: '#C8FF00', accentDim: 'rgba(200,255,0,0.1)',
  gold: '#FFD700', silver: '#C0C0C0', bronze: '#CD7F32',
};

const MEDAL = ['🥇', '🥈', '🥉'];

export default function LeaderboardScreen() {
  const [entries, setEntries]   = useState<LeaderboardEntry[]>([]);
  const [myRank, setMyRank]     = useState<LeaderboardEntry | null>(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]       = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setError(false);
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 5000)
    );
    try {
      const [lb, rank] = await Promise.race([
        Promise.all([
          leaderboardService.getLeaderboard(),
          leaderboardService.getCurrentUserRank(),
        ]),
        timeout,
      ]);
      setEntries(lb);
      setMyRank(rank);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await leaderboardService.rebuildLeaderboard();
      await load();
    } catch {
      setError(true);
    } finally {
      setRefreshing(false);
    }
  };

  const rankColor = (rank: number) =>
    rank === 1 ? C.gold : rank === 2 ? C.silver : rank === 3 ? C.bronze : C.sub;

  if (loading) {
    return (
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={C.accent} size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ fontSize: 32, marginBottom: 12 }}>📭</Text>
        <Text style={{ color: C.text, fontSize: 16, fontWeight: '700', marginBottom: 6 }}>Нет данных</Text>
        <Text style={{ color: C.sub, fontSize: 13, marginBottom: 24 }}>Нет данных</Text>
        <ActivityIndicator color={C.accent} animating={false} />
      </View>
    );
  }

  return (
    <View style={s.container}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
      >
        {/* Header */}
        <View style={s.header}>
          <Text style={s.title}>Рейтинг</Text>
          <Text style={s.subtitle}>Топ бегунов по дистанции</Text>
        </View>

        {/* My rank card — shown if user is outside top view */}
        {myRank && myRank.rank > 10 && (
          <View style={s.myRankBanner}>
            <Text style={s.myRankLabel}>Ваше место</Text>
            <View style={s.myRankRow}>
              <Text style={s.myRankNum}>#{myRank.rank}</Text>
              <Text style={s.myRankDist}>{myRank.distance} км</Text>
            </View>
          </View>
        )}

        {/* Top 3 podium */}
        {entries.length >= 3 && (
          <View style={s.podium}>
            {/* 2nd */}
            <View style={[s.podiumItem, { marginTop: 24 }]}>
              <Text style={s.podiumMedal}>🥈</Text>
              <Text style={s.podiumName} numberOfLines={1}>{entries[1].username}</Text>
              <Text style={[s.podiumDist, { color: C.silver }]}>{entries[1].distance} км</Text>
              <View style={[s.podiumBar, { height: 60, backgroundColor: C.silver + '33' }]} />
            </View>
            {/* 1st */}
            <View style={s.podiumItem}>
              <Text style={s.podiumMedal}>🥇</Text>
              <Text style={s.podiumName} numberOfLines={1}>{entries[0].username}</Text>
              <Text style={[s.podiumDist, { color: C.gold }]}>{entries[0].distance} км</Text>
              <View style={[s.podiumBar, { height: 80, backgroundColor: C.gold + '33' }]} />
            </View>
            {/* 3rd */}
            <View style={[s.podiumItem, { marginTop: 40 }]}>
              <Text style={s.podiumMedal}>🥉</Text>
              <Text style={s.podiumName} numberOfLines={1}>{entries[2].username}</Text>
              <Text style={[s.podiumDist, { color: C.bronze }]}>{entries[2].distance} км</Text>
              <View style={[s.podiumBar, { height: 44, backgroundColor: C.bronze + '33' }]} />
            </View>
          </View>
        )}

        {/* Full list */}
        <View style={s.list}>
          {entries.length === 0 ? (
            <View style={s.empty}>
              <Text style={s.emptyIcon}>🏃</Text>
              <Text style={s.emptyText}>Пока нет данных</Text>
              <Text style={s.emptySub}>Завершите тренировку, чтобы попасть в рейтинг</Text>
            </View>
          ) : (
            entries.map(e => (
              <View key={e.user_id} style={[s.row, e.is_current_user && s.rowMe]}>
                {/* Rank */}
                <View style={s.rankWrap}>
                  {e.rank <= 3
                    ? <Text style={s.rankMedal}>{MEDAL[e.rank - 1]}</Text>
                    : <Text style={[s.rankNum, { color: rankColor(e.rank) }]}>#{e.rank}</Text>
                  }
                </View>

                {/* Avatar placeholder */}
                <View style={[s.avatar, e.is_current_user && s.avatarMe]}>
                  <Text style={s.avatarLetter}>
                    {e.username.charAt(0).toUpperCase()}
                  </Text>
                </View>

                {/* Name + distance */}
                <View style={s.rowBody}>
                  <Text style={[s.rowName, e.is_current_user && { color: C.accent }]} numberOfLines={1}>
                    {e.username}{e.is_current_user ? ' (вы)' : ''}
                  </Text>
                  <Text style={s.rowDist}>{e.distance} км</Text>
                </View>

                {/* Trend icon placeholder */}
                <Ionicons name="trending-up" size={16} color={C.muted} />
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { paddingTop: 64, paddingHorizontal: 24, paddingBottom: 20, backgroundColor: '#111' },
  title: { fontSize: 28, fontWeight: '800', color: C.text },
  subtitle: { fontSize: 14, color: C.sub, marginTop: 4 },
  myRankBanner: {
    marginHorizontal: 24, marginTop: 16,
    backgroundColor: C.accentDim, borderRadius: 16,
    borderWidth: 1, borderColor: C.accent + '40',
    padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  myRankLabel: { fontSize: 13, color: C.sub },
  myRankRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  myRankNum: { fontSize: 22, fontWeight: '800', color: C.accent },
  myRankDist: { fontSize: 15, color: C.text, fontWeight: '600' },
  podium: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end',
    paddingHorizontal: 24, paddingTop: 24, paddingBottom: 8, gap: 8,
  },
  podiumItem: { flex: 1, alignItems: 'center' },
  podiumMedal: { fontSize: 28, marginBottom: 6 },
  podiumName: { fontSize: 12, fontWeight: '700', color: C.text, marginBottom: 2, textAlign: 'center' },
  podiumDist: { fontSize: 13, fontWeight: '800', marginBottom: 6 },
  podiumBar: { width: '100%', borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  list: { paddingHorizontal: 24, paddingTop: 16 },
  empty: { alignItems: 'center', paddingVertical: 48 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 17, fontWeight: '700', color: C.text, marginBottom: 6 },
  emptySub: { fontSize: 13, color: C.sub, textAlign: 'center' },
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.card, borderRadius: 14,
    padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: C.border,
  },
  rowMe: { borderColor: C.accent + '60', backgroundColor: C.accentDim },
  rankWrap: { width: 36, alignItems: 'center' },
  rankMedal: { fontSize: 20 },
  rankNum: { fontSize: 14, fontWeight: '800' },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#2A2A2A',
    alignItems: 'center', justifyContent: 'center',
    marginHorizontal: 12,
  },
  avatarMe: { backgroundColor: C.accent + '33', borderWidth: 1, borderColor: C.accent },
  avatarLetter: { fontSize: 16, fontWeight: '800', color: C.text },
  rowBody: { flex: 1 },
  rowName: { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 2 },
  rowDist: { fontSize: 12, color: C.sub },
});
