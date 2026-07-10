type SecureLogoutDependencies = {
  clearLocalAuthentication: () => void;
  notifyOtherTabs: () => void;
  navigateAway: () => void;
  logoutBackend: () => Promise<void>;
  signOutIdentityProvider: () => Promise<void>;
};

export async function performSecureLogout(dependencies: SecureLogoutDependencies) {
  dependencies.clearLocalAuthentication();
  dependencies.notifyOtherTabs();
  dependencies.navigateAway();

  await Promise.allSettled([dependencies.logoutBackend(), dependencies.signOutIdentityProvider()]);
}
