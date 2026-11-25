const sidebar = document.querySelector('.sidebar');

if (sidebar) {
  const toggle = document.createElement('button');
  const icon = document.createElement('span');

  sidebar.id = 'adminSidebar';
  toggle.type = 'button';
  toggle.className = 'sidebar-toggle';
  toggle.setAttribute('aria-controls', sidebar.id);
  toggle.append(icon);

  for (let index = 0; index < 3; index += 1) {
    const line = document.createElement('span');
    line.className = 'sidebar-toggle__line';
    line.setAttribute('aria-hidden', 'true');
    icon.append(line);
  }

  document.body.append(toggle);

  function setCollapsed(collapsed) {
    document.body.classList.toggle('admin-layout--sidebar-collapsed', collapsed);
    sidebar.inert = collapsed;
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.setAttribute('aria-label', collapsed ? 'Show admin navigation' : 'Hide admin navigation');
  }

  toggle.addEventListener('click', () => {
    setCollapsed(!document.body.classList.contains('admin-layout--sidebar-collapsed'));
  });

  setCollapsed(window.matchMedia('(max-width: 760px)').matches);
}
