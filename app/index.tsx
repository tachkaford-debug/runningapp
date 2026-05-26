import { authService } from '@/services/auth.service';
import { getItem } from '@/utils/storage';
import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

export default function Index() {
  const [route, setRoute] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const onboardingDone = await getItem<boolean>('onboarding_done');
      if (!onboardingDone) {
        setRoute('/onboarding');
        return;
      }
      const session = await authService.getSession();
      setRoute(session ? '/(tabs)/profile' : '/auth/login');
    })();
  }, []);

  if (!route) {
    return <View style={{ flex: 1, backgroundColor: '#0D0D0D' }} />;
  }

  return <Redirect href={route as any} />;
}
