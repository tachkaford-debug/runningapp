import { authService } from '@/services/auth.service';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const C = {
  bg: '#0E2A2A',
  card: '#163535',
  border: '#1E4040',
  text: '#FFFFFF',
  sub: '#7A9A9A',
  muted: '#4A7070',
  accent: '#C8FF00',
  input: '#0A2020',
};

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const router = useRouter();

  const handleLogin = async () => {
    if (!email || !password) { Alert.alert('Заполните все поля'); return; }
    setLoading(true);
    try {
      await authService.signIn(email, password);
      router.replace('/(tabs)/profile');
    } catch (e: any) {
      Alert.alert('Ошибка входа', e.message || 'Проверьте данные');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

        {/* Logo */}
        <View style={s.logoWrap}>
          <View style={s.logo}>
            <Ionicons name="walk" size={36} color="#0D0D0D" />
          </View>
          <Text style={s.appName}>RunTrack</Text>
        </View>

        {/* Title */}
        <Text style={s.title}>Добро{'\n'}пожаловать</Text>
        <Text style={s.subtitle}>Войдите, чтобы продолжить</Text>

        {/* Form */}
        <View style={s.form}>
          <View style={s.inputWrap}>
            <Ionicons name="mail-outline" size={18} color={C.muted} style={s.inputIcon} />
            <TextInput
              style={s.input}
              placeholder="Email"
              placeholderTextColor={C.muted}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
          </View>

          <View style={s.inputWrap}>
            <Ionicons name="lock-closed-outline" size={18} color={C.muted} style={s.inputIcon} />
            <TextInput
              style={[s.input, { flex: 1 }]}
              placeholder="Пароль"
              placeholderTextColor={C.muted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPass}
              autoComplete="password"
            />
            <TouchableOpacity onPress={() => setShowPass(p => !p)} style={s.eyeBtn}>
              <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={18} color={C.muted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Login button */}
        <TouchableOpacity style={[s.btn, loading && s.btnDisabled]} onPress={handleLogin} disabled={loading}>
          <Text style={s.btnText}>{loading ? 'Вход...' : 'Войти'}</Text>
        </TouchableOpacity>

        {/* Divider */}
        <View style={s.divider}>
          <View style={s.divLine} />
          <Text style={s.divText}>или</Text>
          <View style={s.divLine} />
        </View>

        {/* Signup */}
        <View style={s.signupRow}>
          <Text style={s.signupText}>Нет аккаунта? </Text>
          <TouchableOpacity onPress={() => router.push('/auth/signup')}>
            <Text style={s.signupLink}>Зарегистрироваться</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scroll: { flexGrow: 1, padding: 28, paddingTop: 80 },
  logoWrap: { flexDirection: 'row', alignItems: 'center', marginBottom: 48, gap: 12 },
  logo: { width: 52, height: 52, borderRadius: 16, backgroundColor: '#C8FF00', alignItems: 'center', justifyContent: 'center' },
  appName: { fontSize: 22, fontWeight: '800', color: C.text, letterSpacing: -0.5 },
  title: { fontSize: 44, fontWeight: '800', color: C.text, lineHeight: 50, marginBottom: 12, letterSpacing: -1 },
  subtitle: { fontSize: 16, color: C.sub, marginBottom: 40 },
  form: { gap: 14, marginBottom: 8 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.input, borderRadius: 14, borderWidth: 1, borderColor: C.border, paddingHorizontal: 16, height: 56 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 16, color: C.text },
  eyeBtn: { padding: 4 },
  btn: { height: 56, backgroundColor: '#C8FF00', borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginTop: 28, shadowColor: '#C8FF00', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 6 },
  btnDisabled: { opacity: 0.6 },
  btnText: { fontSize: 17, fontWeight: '700', color: '#0D0D0D' },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 28 },
  divLine: { flex: 1, height: 1, backgroundColor: C.border },
  divText: { marginHorizontal: 16, fontSize: 14, color: C.muted },
  signupRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  signupText: { fontSize: 15, color: C.sub },
  signupLink: { fontSize: 15, color: '#C8FF00', fontWeight: '700' },
});
