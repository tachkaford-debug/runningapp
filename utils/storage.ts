/**
 * Утилиты для работы с AsyncStorage
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { handleAsyncStorageError } from './errorHandler';

export const getItem = async <T>(key: string): Promise<T | null> => {
  try {
    const value = await AsyncStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    handleAsyncStorageError(error);
    return null;
  }
};

export const setItem = async <T>(key: string, value: T): Promise<boolean> => {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    handleAsyncStorageError(error);
    return false;
  }
};

export const removeItem = async (key: string): Promise<boolean> => {
  try {
    await AsyncStorage.removeItem(key);
    return true;
  } catch (error) {
    handleAsyncStorageError(error);
    return false;
  }
};
