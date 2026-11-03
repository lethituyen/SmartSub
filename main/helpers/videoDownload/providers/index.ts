import type { ShortDramaSeries } from '../../../../types/shortDrama';
import type { ShortDramaProvider, ShortDramaPlayInfo } from './types';
import { UniversalAggregator } from './universalAggregator';
import { HongguoProvider } from './hongguoProvider';
import { Duanju84Provider } from './duanju84Provider';
import { HemaProvider } from './hemaProvider';
import { DuanjuDaquanProvider } from './duanjuDaquanProvider';
import { DusheProvider } from './dusheProvider';
import { Niuniu28Provider } from './niuniu28Provider';
import { XingyaProvider } from './xingyaProvider';
import { QimaoProvider } from './qimaoProvider';
import { KuaishouProvider } from './kuaishouProvider';
import { XiguaProvider } from './xiguaProvider';
import { DouyinProvider } from './douyinProvider';
import { GenericWebProvider } from './genericProvider';
import { TitleTranslator } from '../shortDrama/titleTranslator';

export * from './types';
export { UniversalAggregator } from './universalAggregator';
export { HongguoProvider } from './hongguoProvider';
export { Duanju84Provider } from './duanju84Provider';
export { HemaProvider } from './hemaProvider';
export { DuanjuDaquanProvider } from './duanjuDaquanProvider';
export { DusheProvider } from './dusheProvider';
export { Niuniu28Provider } from './niuniu28Provider';
export { XingyaProvider } from './xingyaProvider';
export { QimaoProvider } from './qimaoProvider';
export { KuaishouProvider } from './kuaishouProvider';
export { XiguaProvider } from './xiguaProvider';
export { DouyinProvider } from './douyinProvider';
export { GenericWebProvider } from './genericProvider';

export const PROVIDERS: ShortDramaProvider[] = [
  new UniversalAggregator(),
  new HongguoProvider(),
  new Duanju84Provider(),
  new HemaProvider(),
  new DuanjuDaquanProvider(),
  new DusheProvider(),
  new Niuniu28Provider(),
  new XingyaProvider(),
  new KuaishouProvider(),
  new XiguaProvider(),
  new DouyinProvider(),
  new QimaoProvider(),
  new GenericWebProvider(),
];

export function getProvider(id: string): ShortDramaProvider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function detectProvider(input: string, preferredId?: string): ShortDramaProvider {
  if (preferredId && preferredId !== 'auto') {
    const found = getProvider(preferredId);
    if (found) return found;
  }

  for (const p of PROVIDERS) {
    if (p.id !== 'all' && p.canHandle(input)) {
      return p;
    }
  }

  // Fallback to UniversalAggregator or Hongguo
  return PROVIDERS[0];
}

export async function resolveDrama(
  input: string,
  preferredId?: string
): Promise<{ series: ShortDramaSeries; provider: ShortDramaProvider }> {
  const provider = detectProvider(input, preferredId);
  const rawSeries = await provider.resolve(input);
  try {
    const series = TitleTranslator.getInstance().translateSeries(rawSeries);
    return { series, provider };
  } catch {
    return { series: rawSeries, provider };
  }
}

export async function fetchDramaPlayUrl(
  providerId: string,
  vid: string,
  extra?: any
): Promise<ShortDramaPlayInfo | null> {
  const provider = getProvider(providerId) || PROVIDERS[0];
  return provider.fetchPlayUrl(vid, extra);
}
