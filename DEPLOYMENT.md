# 🚀 Руководство по деплою FitnessApp

## Варианты деплоя

### 1. 🌐 Веб-версия (Рекомендуется для первой версии)

#### Вариант A: Vercel (Самый простой)

**Преимущества:**
- Бесплатный хостинг
- Автоматический деплой из Git
- CDN и SSL из коробки
- Простая настройка

**Шаги:**

1. **Подготовка проекта**
   ```bash
   npm install
   ```

2. **Создайте аккаунт на Vercel**
   - Перейдите на https://vercel.com
   - Зарегистрируйтесь через GitHub

3. **Деплой через Vercel CLI**
   ```bash
   npm install -g vercel
   vercel login
   vercel
   ```

4. **Или через GitHub**
   - Загрузите проект на GitHub
   - Импортируйте репозиторий в Vercel
   - Vercel автоматически определит Expo проект
   - Нажмите Deploy

**Настройки для Vercel:**
- Build Command: `npx expo export -p web`
- Output Directory: `dist`
- Install Command: `npm install`

#### Вариант B: Netlify

**Преимущества:**
- Бесплатный хостинг
- Простой интерфейс
- Хорошая документация

**Шаги:**

1. **Создайте файл netlify.toml**
   ```toml
   [build]
     command = "npx expo export -p web"
     publish = "dist"

   [[redirects]]
     from = "/*"
     to = "/index.html"
     status = 200
   ```

2. **Деплой**
   - Зарегистрируйтесь на https://netlify.com
   - Подключите GitHub репозиторий
   - Netlify автоматически задеплоит проект

#### Вариант C: GitHub Pages

**Преимущества:**
- Полностью бесплатно
- Интеграция с GitHub

**Шаги:**

1. **Установите gh-pages**
   ```bash
   npm install --save-dev gh-pages
   ```

2. **Добавьте в package.json**
   ```json
   {
     "scripts": {
       "predeploy": "npx expo export -p web",
       "deploy": "gh-pages -d dist"
     },
     "homepage": "https://[username].github.io/[repo-name]"
   }
   ```

3. **Деплой**
   ```bash
   npm run deploy
   ```

### 2. 📱 Мобильная версия

#### Expo Go (Для тестирования)

**Шаги:**
```bash
npm start
```
Сканируйте QR-код в Expo Go приложении

#### EAS Build (Production)

**Преимущества:**
- Официальный способ от Expo
- Поддержка iOS и Android
- Автоматическая сборка

**Шаги:**

1. **Установите EAS CLI**
   ```bash
   npm install -g eas-cli
   eas login
   ```

2. **Настройте проект**
   ```bash
   eas build:configure
   ```

3. **Создайте сборку**
   ```bash
   # Android
   eas build --platform android --profile preview

   # iOS (требуется Apple Developer аккаунт)
   eas build --platform ios --profile preview
   ```

4. **Опубликуйте в сторы**
   ```bash
   eas submit --platform android
   eas submit --platform ios
   ```

### 3. 🐳 Docker (Для продвинутых)

**Создайте Dockerfile:**
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npx expo export -p web

FROM nginx:alpine
COPY --from=0 /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**Деплой:**
```bash
docker build -t fitnessapp .
docker run -p 80:80 fitnessapp
```

## 🔧 Подготовка к деплою

### Обязательные шаги:

1. **Проверьте зависимости**
   ```bash
   npm install
   ```

2. **Проверьте сборку**
   ```bash
   npx expo export -p web
   ```

3. **Тестирование локально**
   ```bash
   npm run web
   ```

4. **Проверьте app.json**
   - Убедитесь, что `web.bundler` установлен в `"metro"`
   - Проверьте `web.output` установлен в `"static"`

### Рекомендации:

1. **Оптимизация**
   - Минимизируйте изображения
   - Используйте lazy loading
   - Включите кэширование

2. **SEO**
   - Добавьте meta теги
   - Настройте robots.txt
   - Добавьте sitemap.xml

3. **Аналитика**
   - Подключите Google Analytics
   - Настройте error tracking (Sentry)

## 📊 Мониторинг

После деплоя рекомендуется настроить:

1. **Uptime мониторинг** - UptimeRobot
2. **Error tracking** - Sentry
3. **Analytics** - Google Analytics или Mixpanel
4. **Performance** - Lighthouse CI

## 🎯 Рекомендация для первой версии

**Используйте Vercel для веб-версии:**

1. Быстрый деплой (5 минут)
2. Бесплатный хостинг
3. Автоматические обновления
4. Хорошая производительность

**Команды:**
```bash
# Установка Vercel CLI
npm install -g vercel

# Логин
vercel login

# Деплой
vercel

# Production деплой
vercel --prod
```

После успешного деплоя вы получите URL вида:
`https://fitnessapp-xxx.vercel.app`

## 🔐 Переменные окружения

Если в будущем добавите бэкенд, создайте `.env`:

```env
EXPO_PUBLIC_API_URL=https://api.example.com
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_KEY=your_supabase_key
```

В Vercel добавьте их через Settings → Environment Variables

## 📝 Чеклист перед деплоем

- [ ] Все зависимости установлены
- [ ] Проект собирается без ошибок
- [ ] Тесты пройдены (если есть)
- [ ] Удалены console.log
- [ ] Обновлен README.md
- [ ] Настроены переменные окружения
- [ ] Проверена производительность
- [ ] Протестирована на разных устройствах

## 🆘 Troubleshooting

**Проблема:** Ошибка при сборке
**Решение:** Очистите кэш
```bash
npx expo start -c
rm -rf node_modules
npm install
```

**Проблема:** Белый экран после деплоя
**Решение:** Проверьте пути к ресурсам и настройки роутинга

**Проблема:** Медленная загрузка
**Решение:** Оптимизируйте изображения и включите code splitting

---

**Удачи с деплоем! 🚀**
