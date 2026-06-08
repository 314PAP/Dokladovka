/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useGoogleAuth } from './hooks/useGoogleAuth';
import { usePersistentData } from './hooks/usePersistentData';
import { DocumentItem, Receipt } from './types/index';
import WelcomeSection from './components/WelcomeSection';
import SelectionSection from './components/SelectionSection';
import ReceiptsSection from './components/ReceiptsSection';
import DocumentSection from './components/DocumentSection';
import GoogleSettings from './components/GoogleSettings';

export default function App() {
  // UI state
  const [darkMode, setDarkMode] = useLocalStorage('dokladovka-dark-mode', false);
  const [userApiKey, setUserApiKey] = useLocalStorage('dokladovka-user-api-key', '');
  const [selectedPreviewImage, setSelectedPreviewImage] = React.useState<string | null>(null);

  // Auth state
  const {
    activeSection,
    googleAccounts,
    googleUser,
    googleClientId,
    setGoogleClientId,
    isCloudSyncing,
    activeAccountIndex,
    setActiveAccountIndex,
    startGoogleLogin,
    handleLogout,
    setActiveSection,
    setGoogleAccounts,
  } = useGoogleAuth();

  const { data: receipts, setData: setReceipts } =
    usePersistentData<Receipt>({
      key: 'smart-receipts',
      backendEndpoint: '/api/db/receipts',
    });

  const { data: documents, setData: setDocuments } =
    usePersistentData<DocumentItem>({
      key: 'smart-documents',
      backendEndpoint: '/api/db/documents',
    });

  // Apply dark mode
  React.useEffect(() => {
    try {
      if (darkMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    } catch (e) {
      console.error(e);
    }
  }, [darkMode]);

  // Render sections
  if (activeSection === 'welcome') {
    return (
      <WelcomeSection
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode(!darkMode)}
        googleClientId={googleClientId}
        googleAccounts={googleAccounts}
        activeAccountIndex={activeAccountIndex}
        onSelectAccount={setActiveAccountIndex}
        onLoginWithGoogle={startGoogleLogin}
        onNavigate={setActiveSection}
      />
    );
  }

  if (activeSection === 'selection') {
    return (
      <SelectionSection
        googleUser={googleUser}
        googleAccounts={googleAccounts}
        activeAccountIndex={activeAccountIndex}
        googleClientId={googleClientId}
        isCloudSyncing={isCloudSyncing}
        onNavigate={setActiveSection}
        onLogout={handleLogout}
        onAddGoogleAccount={startGoogleLogin}
        onSelectAccount={setActiveAccountIndex}
      />
    );
  }

  if (activeSection === 'receipts') {
    return (
      <ReceiptsSection
        onBack={() => setActiveSection('selection')}
        userApiKey={userApiKey}
        googleAccessToken={googleAccounts[activeAccountIndex]?.accessToken || null}
        googleUser={googleUser}
        receipts={receipts}
        setReceipts={setReceipts}
      />
    );
  }

  if (activeSection === 'documents') {
    return (
      <DocumentSection
        onBack={() => setActiveSection('selection')}
        onPreviewImage={setSelectedPreviewImage}
        googleAccessToken={googleAccounts[activeAccountIndex]?.accessToken || null}
        googleUser={googleUser}
        userApiKey={userApiKey}
        documents={documents}
        setDocuments={setDocuments}
      />
    );
  }

  if (activeSection === 'settings') {
    return (
      <GoogleSettings
        apiKey={userApiKey}
        setApiKey={setUserApiKey}
        clientId={googleClientId}
        setClientId={setGoogleClientId}
        googleUser={googleUser}
        setGoogleUser={(user) => localStorage.setItem('dokladovka-google-user', JSON.stringify(user))}
        accessToken={googleAccounts[activeAccountIndex]?.accessToken || null}
        setAccessToken={(token) => {
          const accounts = localStorage.getItem('dokladovka-google-accounts');
          const parsed = accounts ? JSON.parse(accounts) : [];
          if (parsed[activeAccountIndex]) {
            parsed[activeAccountIndex].accessToken = token;
            localStorage.setItem('dokladovka-google-accounts', JSON.stringify(parsed));
          }
        }}
        googleAccounts={googleAccounts}
        setGoogleAccounts={setGoogleAccounts}
        activeAccountIndex={activeAccountIndex}
        setActiveAccountIndex={setActiveAccountIndex}
        onBack={() => setActiveSection('selection')}
      />
    );
  }

  return (
    <ReceiptsSection
      onBack={() => setActiveSection('selection')}
      receipts={receipts}
      setReceipts={setReceipts}
      userApiKey={userApiKey}
      googleAccessToken={googleAccounts[activeAccountIndex]?.accessToken || null}
      googleUser={googleUser}
    />
  );
}