#!/usr/bin/env node

/**
 * Скрипт проверки готовности проекта к деплою
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Проверка готовности к деплою...\n');

let hasErrors = false;
let hasWarnings = false;

// Проверка 1: package.json существует
console.log('✓ Проверка package.json...');
if (!fs.existsSync('package.json')) {
  console.error('❌ package.json не найден!');
  hasErrors = true;
} else {
  console.log('  ✓ package.json найден');
}

// Проверка 2: app.json существует и настроен
console.log('\n✓ Проверка app.json...');
if (!fs.existsSync('app.json')) {
  console.error('❌ app.json не найден!');
  hasErrors = true;
} else {
  const appJson = JSON.parse(fs.readFileSync('app.json', 'utf8'));
  console.log('  ✓ app.json найден');
  
  if (appJson.expo?.web?.bundler === 'metro') {
    console.log('  ✓ Bundler настроен на metro');
  } else {
    console.warn('  ⚠️  Bundler не настроен на metro');
    hasWarnings = true;
  }
  
  if (appJson.expo?.web?.output === 'static') {
    console.log('  ✓ Output настроен на static');
  } else {
    console.warn('  ⚠️  Output не настроен на static');
    hasWarnings = true;
  }
}

// Проверка 3: node_modules установлены
console.log('\n✓ Проверка зависимостей...');
if (!fs.existsSync('node_modules')) {
  console.error('❌ node_modules не найдены! Запустите: npm install');
  hasErrors = true;
} else {
  console.log('  ✓ node_modules установлены');
}

// Проверка 4: Конфигурация деплоя
console.log('\n✓ Проверка конфигурации деплоя...');
const hasVercel = fs.existsSync('vercel.json');
const hasNetlify = fs.existsSync('netlify.toml');

if (hasVercel) {
  console.log('  ✓ vercel.json найден');
}
if (hasNetlify) {
  console.log('  ✓ netlify.toml найден');
}
if (!hasVercel && !hasNetlify) {
  console.warn('  ⚠️  Конфигурация деплоя не найдена');
  hasWarnings = true;
}

// Проверка 5: Критические файлы
console.log('\n✓ Проверка критических файлов...');
const criticalFiles = [
  'app/_layout.tsx',
  'app/(tabs)/_layout.tsx',
  'app/(tabs)/index.tsx',
];

criticalFiles.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`  ✓ ${file} найден`);
  } else {
    console.error(`  ❌ ${file} не найден!`);
    hasErrors = true;
  }
});

// Проверка 6: .gitignore
console.log('\n✓ Проверка .gitignore...');
if (fs.existsSync('.gitignore')) {
  const gitignore = fs.readFileSync('.gitignore', 'utf8');
  if (gitignore.includes('node_modules')) {
    console.log('  ✓ .gitignore настроен правильно');
  } else {
    console.warn('  ⚠️  node_modules не в .gitignore');
    hasWarnings = true;
  }
} else {
  console.warn('  ⚠️  .gitignore не найден');
  hasWarnings = true;
}

// Итоги
console.log('\n' + '='.repeat(50));
if (hasErrors) {
  console.error('\n❌ Проект НЕ готов к деплою!');
  console.error('Исправьте ошибки выше перед деплоем.\n');
  process.exit(1);
} else if (hasWarnings) {
  console.warn('\n⚠️  Проект готов к деплою, но есть предупреждения.');
  console.warn('Рекомендуется исправить их для лучшего результата.\n');
  process.exit(0);
} else {
  console.log('\n✅ Проект полностью готов к деплою!');
  console.log('\nДля деплоя выполните:');
  console.log('  npm run build:web      # Сборка проекта');
  console.log('  npm run deploy:vercel  # Деплой на Vercel');
  console.log('  npm run deploy:netlify # Деплой на Netlify\n');
  process.exit(0);
}
