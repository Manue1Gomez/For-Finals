import { enableDialogDismiss } from './ui.js';
import { initClientList } from './client-list.js';
import { initWorkshopStudents } from './workshop-students.js';

const STUDENTS_HASH = '#students';

const tabs = [...document.querySelectorAll('[data-tab]')];
const panels = {
  clients: document.getElementById('clientsPanel'),
  students: document.getElementById('studentsPanel'),
};
const studentTabCount = document.getElementById('studentTabCount');

function selectTab(name, { focus = false } = {}) {
  tabs.forEach((tab) => {
    const isActive = tab.dataset.tab === name;

    tab.classList.toggle('page-tab--active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
    tab.tabIndex = isActive ? 0 : -1;
    panels[tab.dataset.tab].hidden = !isActive;

    if (isActive && focus) tab.focus();
  });

  history.replaceState(null, '', name === 'students' ? STUDENTS_HASH : window.location.pathname);
}

function handleTabKeydown(event) {
  const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
  if (!step) return;

  const index = tabs.indexOf(event.currentTarget);
  const next = tabs[(index + step + tabs.length) % tabs.length];

  selectTab(next.dataset.tab, { focus: true });
}

tabs.forEach((tab) => {
  tab.addEventListener('click', () => selectTab(tab.dataset.tab));
  tab.addEventListener('keydown', handleTabKeydown);
});

enableDialogDismiss();

initClientList();
initWorkshopStudents({
  onCountChange: (count) => {
    studentTabCount.textContent = count;
  },
});

if (window.location.hash === STUDENTS_HASH) selectTab('students');
