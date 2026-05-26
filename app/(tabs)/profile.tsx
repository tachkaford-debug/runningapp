import { authService } from '@/services/auth.service';
import { getItem, removeItem, setItem } from '@/utils/storage';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

const C = {
  bg: '#0D0D0D',
  card: '#1A1A1A',
  border: '#2A2A2A',
  text: '#FFFFFF',
  sub: '#888888',
  muted: '#444444',
  accent: '#C8FF00',
  accentDim: 'rgba(200,255,0,0.1)',
  red: '#FF453A',
  redDim: 'rgba(255,69,58,0.12)',
};

interface ProfileData {
  name: string;
  weight: string;
  height: string;
  gender: string;
  age: string;
  fitnessLevel: string;
  goal: string;
}

const GENDERS = ['Мужской', 'Женский', 'Другой'];
const FITNESS_LEVELS = ['Начинающий', 'Средний', 'Продвинутый'];
const GOALS = ['Похудение', 'Выносливость', 'Скорость', 'Марафон', 'Здоровье'];

export default function SettingsScreen() {
  const [profile, setProfile] = useState<ProfileData>({
    name: '', weight: '', height: '', gender: '', age: '', fitnessLevel: '', goal: '',
  });
  const [editingProfile, setEditingProfile] = useState(false);
  const [subscription] = useState('Free');
  const [numericId, setNumericId] = useState<number | null>(null);
  const [userId, setUserId] = useState<string>('');
  const router = useRouter();

  useEffect(() => { loadProfile(); }, []);

  const loadProfile = async () => {
    const saved = await getItem<ProfileData>('user_profile');
    const name = await getItem<string>('user_name');
    if (saved) setProfile(saved);
    else if (name) setProfile(p => ({ ...p, name }));
    try {
      const user = await authService.getCurrentUser();
      if (user.numeric_id) setNumericId(user.numeric_id);
      setUserId(user.id);
    } catch {}
  };

  // Display string for the user ID badge
  const idDisplay = numericId ? `#${numericId}` : userId ? `#${userId.slice(0, 8).toUpperCase()}` : null;
  const idCopyValue = numericId ? `#${numericId}` : userId ?? '';

  const copyId = async () => {
    if (!idCopyValue) return;
    await Clipboard.setStringAsync(idCopyValue);
    Alert.alert('Скопировано', idCopyValue);
  };

  const saveProfile = async () => {
    await setItem('user_profile', profile);
    await setItem('user_name', profile.name);
    setEditingProfile(false);
  };

  const handleLogout = () => {
    Alert.alert('Выйти из аккаунта?', '', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Выйти', style: 'destructive', onPress: async () => {
          await authService.signOut();
          await setItem('onboarding_done', false);
          router.replace('/onboarding');
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Удалить аккаунт?',
      'Все данные будут удалены безвозвратно.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить', style: 'destructive', onPress: async () => {
            await authService.signOut();
            await removeItem('user_profile');
            await removeItem('user_stats');
            await removeItem('user_name');
            await setItem('onboarding_done', false);
            router.replace('/onboarding');
          },
        },
      ]
    );
  };

  const initials = profile.name ? profile.name.charAt(0).toUpperCase() : '?';

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 60 }}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Настройки</Text>
        <View style={s.avatarRow}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{initials}</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 16 }}>
            <View style={s.nameRow}>
              <Text style={s.userName}>{profile.name || 'Пользователь'}</Text>
              {idDisplay && (
                <TouchableOpacity style={s.idBadge} onPress={copyId} activeOpacity={0.7}>
                  <Text style={s.idLabel}>ID: </Text>
                  <Text style={s.idText}>{idDisplay}</Text>
                  <Ionicons name="copy-outline" size={11} color="#C8FF00" style={{ marginLeft: 3 }} />
                </TouchableOpacity>
              )}
            </View>
            <View style={s.planBadge}>
              <Text style={s.planText}>{subscription}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Profile section */}
      <Section title="Профиль бегуна">
        {editingProfile ? (
          <View style={s.editForm}>
            <Field label="Имя" value={profile.name} onChange={v => setProfile(p => ({ ...p, name: v }))} placeholder="Ваше имя" />
            <Field label="Вес (кг)" value={profile.weight} onChange={v => setProfile(p => ({ ...p, weight: v }))} placeholder="70" keyboard="numeric" />
            <Field label="Рост (см)" value={profile.height} onChange={v => setProfile(p => ({ ...p, height: v }))} placeholder="175" keyboard="numeric" />
            <Field label="Возраст" value={profile.age} onChange={v => setProfile(p => ({ ...p, age: v }))} placeholder="25" keyboard="numeric" />

            <Text style={s.fieldLabel}>Пол</Text>
            <View style={s.chips}>
              {GENDERS.map(g => (
                <TouchableOpacity key={g} style={[s.chip, profile.gender === g && s.chipActive]} onPress={() => setProfile(p => ({ ...p, gender: g }))}>
                  <Text style={[s.chipText, profile.gender === g && s.chipTextActive]}>{g}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.fieldLabel}>Уровень подготовки</Text>
            <View style={s.chips}>
              {FITNESS_LEVELS.map(f => (
                <TouchableOpacity key={f} style={[s.chip, profile.fitnessLevel === f && s.chipActive]} onPress={() => setProfile(p => ({ ...p, fitnessLevel: f }))}>
                  <Text style={[s.chipText, profile.fitnessLevel === f && s.chipTextActive]}>{f}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.fieldLabel}>Цель</Text>
            <View style={s.chips}>
              {GOALS.map(g => (
                <TouchableOpacity key={g} style={[s.chip, profile.goal === g && s.chipActive]} onPress={() => setProfile(p => ({ ...p, goal: g }))}>
                  <Text style={[s.chipText, profile.goal === g && s.chipTextActive]}>{g}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={s.editButtons}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setEditingProfile(false)}>
                <Text style={s.cancelBtnText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.saveBtn} onPress={saveProfile}>
                <Text style={s.saveBtnText}>Сохранить</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            <ProfileRow icon="person-outline" label="Имя" value={profile.name || 'Не указано'} />
            <ProfileRow icon="barbell-outline" label="Вес" value={profile.weight ? `${profile.weight} кг` : 'Не указано'} />
            <ProfileRow icon="resize-outline" label="Рост" value={profile.height ? `${profile.height} см` : 'Не указано'} />
            <ProfileRow icon="calendar-outline" label="Возраст" value={profile.age || 'Не указано'} />
            <ProfileRow icon="body-outline" label="Пол" value={profile.gender || 'Не указано'} />
            <ProfileRow icon="fitness-outline" label="Уровень" value={profile.fitnessLevel || 'Не указано'} />
            <ProfileRow icon="flag-outline" label="Цель" value={profile.goal || 'Не указано'} last />
            <TouchableOpacity style={s.editProfileBtn} onPress={() => setEditingProfile(true)}>
              <Ionicons name="pencil-outline" size={16} color={C.accent} />
              <Text style={s.editProfileBtnText}>Редактировать профиль</Text>
            </TouchableOpacity>
          </>
        )}
      </Section>

      {/* Subscription */}
      <Section title="Подписка">
        <View style={s.subCard}>
          <View style={s.subLeft}>
            <Text style={s.subPlan}>Free Plan</Text>
            <Text style={s.subDesc}>Базовый трекинг и статистика</Text>
          </View>
          <View style={s.subBadge}>
            <Text style={s.subBadgeText}>FREE</Text>
          </View>
        </View>
        <MenuItem icon="star-outline" label="Upgrade to Pro" onPress={() => Alert.alert('Скоро', 'Pro-версия в разработке')} accent />
        <MenuItem icon="card-outline" label="Управление подпиской" onPress={() => Alert.alert('Скоро', 'Управление подпиской в разработке')} last />
      </Section>

      {/* Devices */}
      <Section title="Устройства">
        <MenuItem icon="watch-outline" label="Часы" sublabel="Интеграция со смарт-часами" onPress={() => Alert.alert('Скоро', 'Интеграция с часами в разработке')} last />
      </Section>

      {/* Privacy */}
      <Section title="Конфиденциальность">
        <MenuItem icon="shield-checkmark-outline" label="Политика конфиденциальности" onPress={() => Alert.alert('Политика', 'Откроется в браузере')} />
        <MenuItem icon="document-text-outline" label="Условия использования" onPress={() => Alert.alert('Условия', 'Откроется в браузере')} />
        <MenuItem icon="lock-closed-outline" label="Разрешения данных" onPress={() => Alert.alert('Разрешения', 'Управление разрешениями')} last />
      </Section>

      {/* Support */}
      <Section title="Поддержка">
        <MenuItem icon="help-circle-outline" label="Центр помощи" onPress={() => Alert.alert('Помощь', 'Откроется в браузере')} />
        <MenuItem icon="chatbubble-outline" label="Написать в поддержку" onPress={() => Alert.alert('Поддержка', 'support@runtrack.app')} />
        <MenuItem icon="list-outline" label="FAQ" onPress={() => Alert.alert('FAQ', 'Откроется в браузере')} last />
      </Section>

      {/* Logout */}
      <View style={s.logoutSection}>
        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color={C.red} />
          <Text style={s.logoutText}>Выйти из аккаунта</Text>
        </TouchableOpacity>
      </View>

      {/* Delete account */}
      <TouchableOpacity style={s.deleteBtn} onPress={handleDeleteAccount}>
        <Text style={s.deleteText}>Удалить аккаунт</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// Sub-components
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.sectionCard}>{children}</View>
    </View>
  );
}

function MenuItem({ icon, label, sublabel, onPress, accent, last }: {
  icon: string; label: string; sublabel?: string; onPress: () => void; accent?: boolean; last?: boolean;
}) {
  return (
    <TouchableOpacity style={[s.menuItem, !last && s.menuItemBorder]} onPress={onPress}>
      <View style={[s.menuIcon, accent && s.menuIconAccent]}>
        <Ionicons name={icon as any} size={18} color={accent ? C.accent : C.sub} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.menuLabel, accent && { color: C.accent }]}>{label}</Text>
        {sublabel && <Text style={s.menuSublabel}>{sublabel}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={16} color={C.muted} />
    </TouchableOpacity>
  );
}

function ProfileRow({ icon, label, value, last }: { icon: string; label: string; value: string; last?: boolean }) {
  return (
    <View style={[s.menuItem, !last && s.menuItemBorder]}>
      <View style={s.menuIcon}>
        <Ionicons name={icon as any} size={18} color={C.sub} />
      </View>
      <Text style={s.menuLabel}>{label}</Text>
      <Text style={s.profileValue}>{value}</Text>
    </View>
  );
}

function Field({ label, value, onChange, placeholder, keyboard }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; keyboard?: any;
}) {
  return (
    <View style={s.fieldWrap}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        style={s.fieldInput}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={C.muted}
        keyboardType={keyboard || 'default'}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { paddingTop: 64, paddingHorizontal: 24, paddingBottom: 28, backgroundColor: '#111' },
  headerTitle: { fontSize: 28, fontWeight: '800', color: C.text, marginBottom: 24 },
  avatarRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: C.accentDim, borderWidth: 2, borderColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 26, fontWeight: '800', color: C.accent },
  userName: { fontSize: 20, fontWeight: '700', color: C.text },
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flex: 1 },
  planBadge: { alignSelf: 'flex-start', backgroundColor: C.card, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1, borderColor: C.border, marginTop: 6 },
  planText: { fontSize: 12, color: C.sub, fontWeight: '600' },
  idBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(200,255,0,0.08)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(200,255,0,0.25)' },
  idLabel: { fontSize: 11, color: C.sub, fontWeight: '600' },
  idRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  idText: { fontSize: 12, color: C.accent, fontWeight: '700', letterSpacing: 0.5 },
  section: { paddingHorizontal: 24, paddingTop: 24 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: C.sub, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  sectionCard: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  menuIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#222', alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  menuIconAccent: { backgroundColor: C.accentDim },
  menuLabel: { flex: 1, fontSize: 15, color: C.text, fontWeight: '500' },
  menuSublabel: { fontSize: 12, color: C.sub, marginTop: 2 },
  profileValue: { fontSize: 14, color: C.sub },
  editProfileBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderTopWidth: 1, borderTopColor: C.border },
  editProfileBtnText: { fontSize: 14, color: C.accent, fontWeight: '600' },
  editForm: { padding: 16, gap: 4 },
  fieldWrap: { marginBottom: 14 },
  fieldLabel: { fontSize: 12, color: C.sub, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldInput: { backgroundColor: '#111', borderRadius: 10, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, height: 46, fontSize: 15, color: C.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#222', borderWidth: 1, borderColor: C.border },
  chipActive: { backgroundColor: C.accentDim, borderColor: C.accent },
  chipText: { fontSize: 13, color: C.sub, fontWeight: '500' },
  chipTextActive: { color: C.accent },
  editButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, height: 44, borderRadius: 22, backgroundColor: '#222', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
  cancelBtnText: { fontSize: 15, color: C.sub, fontWeight: '600' },
  saveBtn: { flex: 1, height: 44, borderRadius: 22, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { fontSize: 15, color: '#0D0D0D', fontWeight: '700' },
  subCard: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  subLeft: { flex: 1 },
  subPlan: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 2 },
  subDesc: { fontSize: 13, color: C.sub },
  subBadge: { backgroundColor: '#222', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: C.border },
  subBadgeText: { fontSize: 11, color: C.sub, fontWeight: '700', letterSpacing: 1 },
  logoutSection: { paddingHorizontal: 24, paddingTop: 28 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: C.redDim, borderRadius: 14, height: 52, borderWidth: 1, borderColor: C.red + '40' },
  logoutText: { fontSize: 16, color: C.red, fontWeight: '600' },
  deleteBtn: { alignItems: 'center', paddingTop: 20, paddingBottom: 8 },
  deleteText: { fontSize: 13, color: C.muted, textDecorationLine: 'underline' },
});
