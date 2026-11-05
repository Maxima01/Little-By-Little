import AsyncStorage from '@react-native-async-storage/async-storage';
import { AESEncryptionKey, AESSealedData, aesDecryptAsync, aesEncryptAsync } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const keyOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

// Feature: SecureStore key names use only permitted characters, including for loopback project hosts.
function deviceKeyName(key: string): string {
  const encoded = Array.from(new TextEncoder().encode(key), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `novel-auth-v1.${encoded}`;
}

// Feature: bind native Auth storage to the device while accommodating sessions larger than a keychain item.
export const nativeAuthStorage = {
  async getItem(key: string): Promise<string | null> {
    // A pre-upgrade or restored plaintext session must sign in again before it can be used.
    await AsyncStorage.removeItem(key);
    const encrypted = await AsyncStorage.getItem(`${key}.sealed-v1`);
    if (encrypted === null) return null;

    const savedKey = await SecureStore.getItemAsync(deviceKeyName(key), keyOptions);
    if (savedKey === null) {
      await AsyncStorage.removeItem(`${key}.sealed-v1`);
      return null;
    }
    try {
      const encryptionKey = await AESEncryptionKey.import(savedKey, 'hex');
      const plaintext = await aesDecryptAsync(AESSealedData.fromCombined(encrypted), encryptionKey);
      return new TextDecoder('utf-8', { fatal: true }).decode(plaintext);
    } catch {
      // Restored or corrupted ciphertext cannot initialize a login session.
      await nativeAuthStorage.removeItem(key);
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    await AsyncStorage.removeItem(key);
    const keyName = deviceKeyName(key);
    const savedKey = await SecureStore.getItemAsync(keyName, keyOptions);
    const encryptionKey = savedKey === null ? await AESEncryptionKey.generate() : await AESEncryptionKey.import(savedKey, 'hex');
    const sealed = await aesEncryptAsync(new TextEncoder().encode(value), encryptionKey);
    if (savedKey === null) await SecureStore.setItemAsync(keyName, await encryptionKey.encoded('hex'), keyOptions);
    await AsyncStorage.setItem(`${key}.sealed-v1`, await sealed.combined('base64'));
  },

  async removeItem(key: string): Promise<void> {
    // Remove the key first so an interrupted logout leaves only unusable ciphertext.
    await SecureStore.deleteItemAsync(deviceKeyName(key), keyOptions);
    await AsyncStorage.multiRemove([key, `${key}.sealed-v1`]);
  },
};
