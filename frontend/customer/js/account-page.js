import { postJson } from './api.js';
import { loadCustomer } from './session.js';

const LOGIN_PAGE = 'login.html';

export async function startAccountPage() {
  const customer = await loadCustomer();

  if (!customer) {
    window.location.replace(LOGIN_PAGE);
    return null;
  }

  document.getElementById('accountName').textContent = `${customer.firstName} ${customer.lastName}`;
  document.getElementById('logoutButton').addEventListener('click', logout);

  return customer;
}

async function logout({ currentTarget }) {
  currentTarget.disabled = true;

  try {
    const { ok, data } = await postJson('/api/auth/logout', {});

    if (ok) {
      window.location.assign(data.redirectTo);
      return;
    }
  } catch {
    currentTarget.disabled = false;
    return;
  }

  currentTarget.disabled = false;
}
