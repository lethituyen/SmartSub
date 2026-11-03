import { ASR_JIANYING, type AsrProvider } from '../../types/asrProvider';
import { store } from './store';
import { assertProviderList } from '../../types/providerPersistence';

export const DEFAULT_JIANYING_PROVIDER: AsrProvider = {
  id: 'jianying_default',
  name: 'JianYing / CapCut (剪映)',
  type: ASR_JIANYING,
  models: 'jianying-default',
  requestTimeoutSec: 300,
  concurrency: 2,
};

/**
 * 云端听写（在线 ASR）服务商实例的读写管理。
 *
 * 剪映（JianYing）为内置免费免凭据 ASR，默认提供一个开箱即用实例；
 * 其他商用云 ASR 实例需用户自行配置凭据。
 */
export function getAsrProviders(): AsrProvider[] {
  const stored = store.get('asrProviders');
  let providers = stored === undefined ? [] : stored;
  assertProviderList(providers);
  if (!providers.some((p) => p.type === ASR_JIANYING)) {
    providers = [...providers, DEFAULT_JIANYING_PROVIDER];
    store.set('asrProviders', providers);
  }
  return providers;
}

export function setAsrProviders(providers: AsrProvider[]): void {
  assertProviderList(providers);
  store.set('asrProviders', providers);
}

export function getAsrProviderById(
  id: string | undefined,
): AsrProvider | undefined {
  if (!id) return undefined;
  return getAsrProviders().find((p) => p.id === id);
}
