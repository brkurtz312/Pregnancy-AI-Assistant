import { useEffect, useRef } from "react";
import NetInfo from "@react-native-community/netinfo";

/**
 * Fires `onReconnect` once each time the network transitions from offline
 * (isConnected === false) to online (isConnected === true).
 */
export function useNetReconnect(onReconnect: () => void): void {
  const wasOfflineRef = useRef<boolean>(false);
  const onReconnectRef = useRef(onReconnect);
  onReconnectRef.current = onReconnect;

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const isOnline = state.isConnected === true;
      if (!isOnline) {
        wasOfflineRef.current = true;
      } else if (wasOfflineRef.current) {
        wasOfflineRef.current = false;
        onReconnectRef.current();
      }
    });
    return unsub;
  }, []);
}
