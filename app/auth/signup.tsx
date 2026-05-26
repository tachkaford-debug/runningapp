import { authService } from '@/services/auth.service';
import { setItem } from '@/utils/storage';
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

export default function SignUpScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSignUp = async () => {
    if (!name || !email || !password || !confirm) { Alert.alert('Заполните все поля'); return; }
    if (password !== confirm) { Alert.alert('Пароли не совпадают'); return; }
    if (password.length < 6) { Alert.alert('Пароль минимум 6 символов'); return; }

    setLoading(true);
    try {
      await authService.signUp(email, password, name);
      await setItem('user_name', name);
      router.replace('/(tabs)/profile');
    } catch (e: any) {
      Alert.alert('Ошибка', e.message || 'Попробуйте снова');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <TouchableOpacity style={s.back} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={22} color={C.sub} />
      </TouchableOpacity>

      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <Text style={s.title}>Создать{'\n'}аккаунт</Text>
        <Text style={s.subtitle}>Начните свой путь к здоровью</Text>

        <View style={s.form}>
          {[
            { label: 'Имя', value: name, set: setName, icon: 'person-outline', placeholder: 'Ваше имя', type: 'default' as const },
            { label: 'Email', value: email, set: setEmail, icon: 'mail-outline', placeholder: 'your@email.com', type: 'email-address' as const },
            { label: 'Пароль', value: password, set: setPassword, icon: 'lock-closed-outline', placeholder: 'Минимум 6 символов', secure: true },
            { label: 'Подтвердите пароль', value: confirm, set: setConfirm, icon: 'lock-closed-outline', placeholder: 'Повторите пароль', secure: true },
          ].map((f, i) => (
            <View key={i}>
              <Text style={s.label}>{f.label}</Text>
              <View style={s.inputWrap}>
                <Ionicons name={f.icon as any} size={18} color={C.muted} style={s.inputIcon} />
                <TextInput
                  style={s.input}
                  placeholder={f.placeholder}
                  placeholderTextColor={C.muted}
                  value={f.value}
                  onChangeText={f.set}
                  secureTextEntry={f.secure}
                  keyboardType={f.type}
                  autoCapitalize={f.type === 'email-address' ? 'none' : 'words'}
                />
              </View>
            </View>
          ))}
        </View>

        <TouchableOpacity style={[s.btn, loading && s.btnDisabled]} onPress={handleSignUp} disabled={loading}>
          <Text style={s.btnText}>{loading ? 'Регистрация...' : 'Зарегистрироваться'}</Text>
        </TouchableOpacity>

        <View style={s.loginRow}>
          <Text style={s.loginText}>Уже есть аккаунт? </Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={s.loginLink}>Войти</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  back: { position: 'absolute', top: Platform.OS === 'ios' ? 56 : 36, left: 24, zIndex: 10, width: 40, height: 40, borderRadius: 20, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  scroll: { flexGrow: 1, padding: 28, paddingTop: 100 },
  title: { fontSize: 44, fontWeight: '800', color: C.text, lineHeight: 50, marginBottom: 12, letterSpacing: -1 },
  subtitle: { fontSize: 16, color: C.sub, marginBottom: 36 },
  form: { gap: 16, marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '600', color: C.sub, marginBottom: 8 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.input, borderRadius: 14, borderWidth: 1, borderColor: C.border, paddingHorizontal: 16, height: 56 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 16, color: C.text },
  btn: { height: 56, backgroundColor: '#C8FF00', borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginTop: 28, shadowColor: '#C8FF00', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 6 },
  btnDisabled: { opacity: 0.6 },
  btnText: { fontSize: 17, fontWeight: '700', color: '#0D0D0D' },
  loginRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 24 },
  loginText: { fontSize: 15, color: C.sub },
  loginLink: { fontSize: 15, color: '#C8FF00', fontWeight: '700' },
});
