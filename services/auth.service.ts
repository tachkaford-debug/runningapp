/**
 * Локальная авторизация через AsyncStorage (без сервера)
 * Данные хранятся на устройстве. Когда настроите Supabase — замените на реальный клиент.
 */
import { getItem, removeItem, setItem } from '@/utils/storage';
import { deviceUserService } from './device-user.service';

interface LocalUser {
  id: string;
  numeric_id: number;   // 4–8 digit unique number, starts at 1000
  email: string;
  full_name: string;
  created_at: string;
}

interface LocalSession {
  user: LocalUser;
  token: string;
}

const USERS_KEY = 'local_users';
const SESSION_KEY = 'local_session';
const NUMERIC_ID_KEY = 'numeric_id_counter';

const getUsers = async (): Promise<Record<string, { password: string; user: LocalUser }>> => {
  return (await getItem<any>(USERS_KEY)) || {};
};

/** Returns next unique numeric_id, starting at 1000, incrementing forever */
const nextNumericId = async (): Promise<number> => {
  const current = (await getItem<number>(NUMERIC_ID_KEY)) ?? 999;
  const next = current + 1;
  await setItem(NUMERIC_ID_KEY, next);
  return next;
};

export const authService = {
  async signUp(email: string, password: string, fullName: string) {
    const users = await getUsers();
    const key = email.toLowerCase();

    if (users[key]) {
      throw new Error('Пользователь с таким email уже существует');
    }

    const numeric_id = await nextNumericId();
    const user: LocalUser = {
      id: `user_${Date.now()}`,
      numeric_id,
      email: key,
      full_name: fullName,
      created_at: new Date().toISOString(),
    };

    users[key] = { password, user };
    await setItem(USERS_KEY, users);
    await setItem('user_name', fullName);

    // Auto-login after registration
    const session: LocalSession = { user, token: `token_${Date.now()}` };
    await setItem(SESSION_KEY, session);

    return { user, session };
  },

  async signIn(email: string, password: string) {
    const users = await getUsers();
    const key = email.toLowerCase();
    const record = users[key];

    if (!record) {
      throw new Error('Пользователь не найден');
    }
    if (record.password !== password) {
      throw new Error('Неверный пароль');
    }

    const session: LocalSession = { user: record.user, token: `token_${Date.now()}` };
    await setItem(SESSION_KEY, session);
    await setItem('user_name', record.user.full_name);

    return { user: record.user, session };
  },

  async signOut() {
    await removeItem(SESSION_KEY);
  },

  async getCurrentUser(): Promise<LocalUser> {
    const session = await getItem<LocalSession>(SESSION_KEY);
    if (session?.user) return session.user;
    // No account session — return persistent device identity
    const id = await deviceUserService.getUserId();
    return { id, numeric_id: 0, email: '', full_name: 'Гость', created_at: '' };
  },

  async getSession(): Promise<LocalSession | null> {
    return getItem<LocalSession>(SESSION_KEY);
  },

  async resetPassword(_email: string) {
    // В локальном режиме сброс пароля не поддерживается
    throw new Error('Сброс пароля недоступен в офлайн-режиме');
  },
};
