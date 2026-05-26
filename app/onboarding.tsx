import { setItem } from '@/utils/storage';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
    Dimensions,
    FlatList,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

const { width } = Dimensions.get('window');

const SLIDES = [
  {
    id: '1',
    title: 'Отслеживай\nмаршруты',
    subtitle: 'GPS-трекинг, статистика в реальном времени и история пробежек — всё в одном месте.',
    emoji: '🏃',
  },
  {
    id: '2',
    title: 'Достигай\nцелей',
    subtitle: 'Ставь недельные цели, зарабатывай достижения и повышай уровень.',
    emoji: '🏆',
  },
  {
    id: '3',
    title: 'Будь\nпостоянным',
    subtitle: 'Строй серии, отслеживай прогресс и становись лучшей версией себя.',
    emoji: '🔥',
  },
];

const BG = '#0E2A2A';
const CARD_BG = '#163535';
const ACCENT = '#C8FF00';

export default function OnboardingScreen() {
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const router = useRouter();

  const handleNext = async () => {
    if (activeIndex < SLIDES.length - 1) {
      const next = activeIndex + 1;
      flatListRef.current?.scrollToIndex({ index: next });
      setActiveIndex(next);
    } else {
      await setItem('onboarding_done', true);
      router.replace('/auth/login');
    }
  };

  const handleSkip = async () => {
    await setItem('onboarding_done', true);
    router.replace('/auth/login');
  };

  const renderSlide = ({ item }: { item: typeof SLIDES[0] }) => (
    <View style={styles.slide}>
      <View style={styles.illustrationContainer}>
        <View style={styles.blob} />
        <View style={styles.emojiContainer}>
          <Text style={styles.emoji}>{item.emoji}</Text>
        </View>
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.subtitle}>{item.subtitle}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />

      <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
        <Text style={styles.skipText}>Пропустить</Text>
      </TouchableOpacity>

      <FlatList
        ref={flatListRef}
        data={SLIDES}
        renderItem={renderSlide}
        keyExtractor={item => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={false}
        style={styles.flatList}
      />

      <View style={styles.bottom}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === activeIndex && styles.dotActive]} />
          ))}
        </View>

        <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
          <Ionicons
            name={activeIndex === SLIDES.length - 1 ? 'checkmark' : 'arrow-forward'}
            size={28}
            color="#0D0D0D"
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  skipButton: {
    position: 'absolute',
    top: 60,
    right: 24,
    zIndex: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  skipText: {
    color: '#7A9A9A',
    fontSize: 16,
    fontWeight: '500',
  },
  flatList: {
    flex: 1,
  },
  slide: {
    width,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  illustrationContainer: {
    width: width * 0.7,
    height: width * 0.7,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 48,
  },
  blob: {
    position: 'absolute',
    width: width * 0.65,
    height: width * 0.65,
    backgroundColor: CARD_BG,
    borderTopLeftRadius: width * 0.5,
    borderTopRightRadius: width * 0.3,
    borderBottomLeftRadius: width * 0.3,
    borderBottomRightRadius: width * 0.5,
  },
  emojiContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#1E4040',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 64,
  },
  textContainer: {
    alignItems: 'center',
  },
  title: {
    fontSize: 40,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 48,
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: '#7A9A9A',
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 16,
  },
  bottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 32,
    paddingBottom: 48,
    paddingTop: 24,
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2A4A4A',
  },
  dotActive: {
    width: 24,
    backgroundColor: ACCENT,
  },
  nextButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
});
