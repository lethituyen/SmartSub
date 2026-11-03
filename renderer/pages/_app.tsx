import React from 'react';
import type { AppProps } from 'next/app';
import { appWithTranslation } from 'next-i18next';
import Layout from '@/components/Layout';
import ErrorBoundary from '@/components/ErrorBoundary';
import { getStaticPaths, makeStaticProperties } from '../lib/get-static';
import { ThemeProvider } from 'next-themes';
import { NavigationGuardProvider } from '@/context/NavigationGuardContext';
import { AssistantProvider } from '@/context/AssistantContext';
import { useDubbingDraftCleanup } from '../hooks/useDubbingDraftCleanup';

import '../styles/globals.css';
import { UpdateNotification } from '@/components/UpdateNotification';
import { AppExitModal } from '@/components/AppExitModal';

if (typeof window !== 'undefined' && !window.ipc) {
  window.ipc = {
    proofreadDraft: {
      read: () => ({ success: false, error: 'NO_ELECTRON' } as any),
      write: () => ({ success: false, error: 'NO_ELECTRON' } as any),
    },
    send: () => {},
    invoke: async (channel: string) => {
      if (channel === 'getSettings') return { language: 'vi' };
      if (channel === 'getUserConfig') return {};
      if (channel === 'getSystemInfo') return { platform: 'win32', arch: 'x64' };
      if (channel === 'getAsrProviders') return [];
      if (channel === 'getTranslationProviders') return [];
      if (channel === 'getTempDir') return '';
      return null;
    },
    getPathForFile: (file: File) => (file as any).path || file.name,
    on: () => () => {},
    platform: 'win32',
  } as any;
}

function MyApp({ Component, pageProps }: AppProps) {
  useDubbingDraftCleanup();
  return (
    <ErrorBoundary>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <NavigationGuardProvider>
          <AssistantProvider>
            <Layout {...pageProps}>
              <Component {...pageProps} />
              <UpdateNotification />
              <AppExitModal />
            </Layout>
          </AssistantProvider>
        </NavigationGuardProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default appWithTranslation(MyApp);

export const getStaticProps = makeStaticProperties(['common']);

export { getStaticPaths };
