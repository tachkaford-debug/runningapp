import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from './Card';

interface StatCardProps {
  title: string;
  value: string | number;
  unit?: string;
  icon?: string;
  color?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  unit,
  icon,
  color,
}) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  return (
    <Card style={styles.statCard}>
      <View style={styles.statContent}>
        <Text style={[styles.title, { color: colors.textSecondary }]}>
          {title}
        </Text>
        <View style={styles.valueContainer}>
          <Text style={[styles.value, { color: color || colors.text }]}>
            {value}
          </Text>
          {unit && (
            <Text style={[styles.unit, { color: colors.textSecondary }]}>
              {unit}
            </Text>
          )}
        </View>
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  statCard: {
    flex: 1,
    marginHorizontal: 4,
  },
  statContent: {
    alignItems: 'center',
  },
  title: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
    textAlign: 'center',
  },
  valueContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  value: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  unit: {
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 2,
  },
}); 