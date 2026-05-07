import type { ReactNode } from 'react';
import { RainbowKitProvider, lightTheme } from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@rainbow-me/rainbowkit/styles.css';
import { wagmiConfig } from '../../lib/wagmi';

const queryClient = new QueryClient();

// Curve-2021 brutalist palette — sharp borders, paper bg, UA blue / yellow
// accent. Retunes RainbowKit's modal + default ConnectButton chrome to
// match the rest of the app. The HomeDocument status-bar wallet pill
// uses ConnectButton.Custom for a tighter fit, but secondary surfaces
// (e.g. ProveAge / Rotate flows) still render the default chrome and
// pick up these tokens.
const curveTheme = lightTheme({
  accentColor: '#0057B7',          // UA blue
  accentColorForeground: '#FFD700',// UA yellow
  borderRadius: 'none',
  fontStack: 'system',
});
curveTheme.colors.modalBackground = '#f4f0e0';
curveTheme.colors.modalText = '#1a1a1a';
curveTheme.colors.modalTextSecondary = '#6b6558';
curveTheme.colors.modalBorder = '#1a1a1a';
curveTheme.colors.actionButtonBorder = '#1a1a1a';
curveTheme.colors.actionButtonBorderMobile = '#1a1a1a';
curveTheme.colors.actionButtonSecondaryBackground = '#FFD700';
curveTheme.colors.connectButtonBackground = '#FFD700';
curveTheme.colors.connectButtonBackgroundError = '#f3c5c5';
curveTheme.colors.connectButtonInnerBackground = '#FFD700';
curveTheme.colors.connectButtonText = '#1a1a1a';
curveTheme.colors.connectButtonTextError = '#1a1a1a';
curveTheme.colors.profileForeground = '#f4f0e0';
curveTheme.colors.profileAction = '#FFD700';
curveTheme.colors.profileActionHover = '#FFE94D';
curveTheme.colors.menuItemBackground = '#f4f0e0';
curveTheme.colors.closeButton = '#1a1a1a';
curveTheme.colors.closeButtonBackground = '#FFD700';
curveTheme.colors.standby = '#FFD700';
curveTheme.fonts.body =
  '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
curveTheme.radii.modal = '0px';
curveTheme.radii.modalMobile = '0px';
curveTheme.radii.connectButton = '0px';
curveTheme.radii.menuButton = '0px';
curveTheme.radii.actionButton = '0px';
curveTheme.shadows.connectButton = '3px 3px 0 #1a1a1a';
curveTheme.shadows.dialog = '6px 6px 0 #1a1a1a';
curveTheme.shadows.profileDetailsAction = '2px 2px 0 #1a1a1a';
curveTheme.shadows.selectedOption = '2px 2px 0 #1a1a1a';
curveTheme.shadows.selectedWallet = '2px 2px 0 #1a1a1a';
curveTheme.shadows.walletLogo = 'none';

const appInfo = {
  appName: 'zkqes',
  learnMoreUrl: 'https://zkqes.org',
  disclaimer: ({ Text }: { Text: React.FC<{ children: ReactNode }> }) => (
    <Text>The signature originates with your wallet.</Text>
  ),
};

export function WalletProvider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={curveTheme} appInfo={appInfo}>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
