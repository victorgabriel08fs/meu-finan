"use client";

import { forgetDevice } from "@/components/push/device";
import { authClient } from "@/lib/auth-client";

/**
 * Signs out and leaves for `path` with a full page load, not a client
 * navigation, so nothing this account left in memory (forms, stores, pages
 * the router keeps mounted) reaches whoever signs in next. Resolves false
 * when the sign-out was refused or the device is offline (the session is
 * still here); the caller tells the person.
 */
export async function signOutTo(path: string): Promise<boolean> {
  // This device stops receiving the notifications of the person leaving.
  await forgetDevice();
  try {
    const { error } = await authClient.signOut();
    if (!error) {
      window.location.replace(path);
      return true;
    }
  } catch {
    // Offline: the session is still here, like a refused sign-out.
  }
  return false;
}
