import './sidebar.js';
import { sendJson } from './admin-api.js';
import { confirmLogout } from '../../shared/js/logout-confirmation.js';

const logoutButton = document.querySelector('[data-logout]');

async function handleLogout() {
  if (!await confirmLogout()) return;

  logoutButton.disabled = true;

  try {
    const { redirectTo } = await sendJson('/api/auth/logout', 'POST', {});
    window.location.assign(redirectTo);
  } catch {
    logoutButton.disabled = false;
  }
}

logoutButton?.addEventListener('click', handleLogout);
