import { sendJson } from './admin-api.js';

const logoutButton = document.querySelector('[data-logout]');

async function handleLogout() {
  logoutButton.disabled = true;

  try {
    const { redirectTo } = await sendJson('/api/auth/logout', 'POST', {});
    window.location.assign(redirectTo);
  } catch {
    logoutButton.disabled = false;
  }
}

logoutButton?.addEventListener('click', handleLogout);
