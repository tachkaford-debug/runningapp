# 📱 Как запустить на iPhone 15 Pro

## ✅ ГОТОВО! Проект обновлён до SDK 54

Dev server запущен и готов к работе с вашим iPhone!

## ⚡ Быстрый старт (Expo Go)

1. **Установите Expo Go** из App Store на iPhone (если ещё не установлен)
2. **Подключите iPhone и компьютер к одной Wi-Fi сети**
3. **Отсканируйте QR-код** выше в терминале через Expo Go
4. Приложение загрузится на iPhone

## ⚠️ Важно: react-native-maps

**Expo Go не поддерживает react-native-maps!** 

Карта будет показывать заглушку с текстом:
> "Карта доступна только в мобильном приложении. Используйте Expo Go для полного функционала"

### Чтобы карта работала, нужен Development Build:

```bash
# 1. Установите EAS CLI
npm install -g eas-cli

# 2. Войдите в аккаунт
eas login

# 3. Настройте проект
eas build:configure

# 4. Создайте development build
eas build --profile development --platform ios

# 5. Установите приложение на iPhone по ссылке
# 6. Запустите dev server
npx expo start --dev-client
```

## 🔧 Что было исправлено

✅ **Обновлён проект с SDK 53 до SDK 54** (совместимо с Expo Go на iPhone)
✅ Обновлены все пакеты до совместимых версий
✅ Добавлен metro.config.js для работы с нативными модулями
✅ Исправлены импорты в track.tsx, explore.tsx, index.tsx
✅ Добавлен bundleIdentifier для iOS
✅ Dev server запущен на порту 8083

## 📊 Текущий статус

```
✅ Metro Bundler: Работает
✅ SDK: 54.0.0
✅ Порт: 8083
✅ URL: exp://192.168.0.133:8083
✅ Web: http://localhost:8083
```

## 🐛 Если что-то не работает

### Не видно QR-кода в терминале?
Он показан выше! Просто отсканируйте его в Expo Go

### iPhone не видит сервер?
```bash
npx expo start --tunnel
```

### Нужно перезагрузить приложение?
Нажмите `r` в терминале

### Очистить кэш?
```bash
npx expo start --clear
```

### Ошибка "Project is incompatible"?
Уже исправлено! Проект обновлён до SDK 54
