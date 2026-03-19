/**
 * tabs.js — Tab bar navigation.
 *
 * Switches between the four main panels (#panel-albums, #panel-playlist,
 * #panel-queue, #panel-downloaded) by toggling the `active` class.
 */

export function initTabs() {
  const tabs = document.querySelectorAll('#tab-bar .tab');
  const panels = document.querySelectorAll('.panel');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      if (!target) return;

      // Deactivate all tabs; hide all panels
      tabs.forEach((t) => t.classList.remove('active'));
      panels.forEach((p) => p.classList.add('hidden'));

      // Activate selected tab; show target panel
      tab.classList.add('active');
      const panel = document.getElementById(`panel-${target}`);
      if (panel) panel.classList.remove('hidden');
    });
  });
}
