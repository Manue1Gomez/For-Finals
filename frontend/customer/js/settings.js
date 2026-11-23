import { getJson, postJson, putJson } from './api.js';
import { startAccountPage } from './account-page.js';
import {
  clearErrorOnInput,
  clearFormErrors,
  setSubmitting,
  showAlert,
  showFieldErrors,
  showNetworkError,
  showServerError,
} from './form-helpers.js';

const API_BASE = '/api/customer';

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const displayName = document.getElementById('displayName');

const profileForm = document.getElementById('profileForm');
const profileSuccess = document.getElementById('profileSuccess');
const profileError = document.getElementById('profileError');
const saveProfile = document.getElementById('saveProfile');

const passwordForm = document.getElementById('passwordForm');
const passwordSuccess = document.getElementById('passwordSuccess');
const passwordError = document.getElementById('passwordError');
const updatePasswordBtn = document.getElementById('updatePassword');

// ─── Profile form ─────────────────────────────────────────────────────────────

async function loadProfile() {
  try {
    const { ok, data } = await getJson(`${API_BASE}/profile`);

    if (!ok) return;

    const p = data.profile;
    profileForm.elements.firstName.value = p.firstName ?? '';
    profileForm.elements.lastName.value = p.lastName ?? '';
    profileForm.elements.email.value = p.email ?? '';
    profileForm.elements.contactNumber.value = p.contactNumber ?? '';
    displayName.textContent = `${p.firstName} ${p.lastName}`;
  } catch {
    // Non-fatal — form just starts empty
  }
}

function findProfileErrors(values) {
  const errors = {};
  if (!values.firstName?.trim()) errors.firstName = 'First name is required.';
  if (!values.lastName?.trim()) errors.lastName = 'Last name is required.';
  if (!values.email?.trim()) errors.email = 'Email address is required.';
  if (!values.contactNumber?.trim()) errors.contactNumber = 'Contact number is required.';
  return errors;
}

profileForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearFormErrors(profileForm, profileError);
  profileSuccess.hidden = true;

  const values = Object.fromEntries(new FormData(profileForm));
  if (showFieldErrors(profileForm, findProfileErrors(values))) return;

  setSubmitting(saveProfile, true);

  try {
    const response = await putJson(`${API_BASE}/profile`, values);

    if (response.ok) {
      const { firstName, lastName } = response.data.profile ?? values;
      displayName.textContent = `${firstName} ${lastName}`;
      document.getElementById('accountName').textContent = `${firstName} ${lastName}`;
      showAlert(profileSuccess, 'Changes saved successfully.');
    } else {
      showServerError(profileForm, profileError, response);
    }
  } catch {
    showNetworkError(profileError);
  }

  setSubmitting(saveProfile, false);
});

// ─── Password form ────────────────────────────────────────────────────────────

function findPasswordErrors({ currentPassword, newPassword, confirmPassword }) {
  const errors = {};
  if (!currentPassword) errors.currentPassword = 'Current password is required.';
  if (!newPassword) errors.newPassword = 'New password is required.';
  if (!confirmPassword) errors.confirmPassword = 'Please confirm your new password.';
  if (!errors.newPassword && !errors.confirmPassword && newPassword !== confirmPassword) {
    errors.confirmPassword = 'Passwords do not match.';
  }
  return errors;
}

passwordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearFormErrors(passwordForm, passwordError);
  passwordSuccess.hidden = true;

  const values = Object.fromEntries(new FormData(passwordForm));
  if (showFieldErrors(passwordForm, findPasswordErrors(values))) return;

  setSubmitting(updatePasswordBtn, true);

  try {
    const response = await postJson(`${API_BASE}/profile/password`, values);

    if (response.ok) {
      passwordForm.reset();
      showAlert(passwordSuccess, 'Password updated successfully.');
    } else {
      showServerError(passwordForm, passwordError, response);
    }
  } catch {
    showNetworkError(passwordError);
  }

  setSubmitting(updatePasswordBtn, false);
});

clearErrorOnInput(profileForm);
clearErrorOnInput(passwordForm);

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  const customer = await startAccountPage();
  if (!customer) return;

  await loadProfile();
}

init();
