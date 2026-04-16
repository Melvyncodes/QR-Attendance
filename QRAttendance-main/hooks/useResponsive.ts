import { useEffect, useState } from 'react';
import { Dimensions } from 'react-native';

export function useResponsive() {
  const [dimensions, setDimensions] = useState(() => {
    const { width, height } = Dimensions.get('window');
    return { width, height, isWeb: width > 768, isLandscape: width > height };
  });

  useEffect(() => {
    const handler = ({ window }: { window: { width: number; height: number } }) => {
      setDimensions({
        width: window.width,
        height: window.height,
        isWeb: window.width > 768,
        isLandscape: window.width > window.height,
      });
    };

    const subscription = Dimensions.addEventListener('change', handler);
    return () => subscription.remove();
  }, []);

  return dimensions;
}
