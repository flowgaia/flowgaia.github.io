/**
 * tabs.js — Tab bar navigation.
 *
 * Switches between the four main panels (#panel-albums, #panel-playlist,
 * #panel-queue, #panel-downloaded) by toggling the `hidden` class.
 * Persists the last active tab to localStorage so it survives page reloads.
 */

const STORAGE_KEY = 'activeTab';

function activateTab(tabs, panels, target) {
  tabs.forEach((t) => t.classList.remove('active'));
  panels.forEach((p) => p.classList.add('hidden'));

  const tab = [...tabs].find((t) => t.dataset.tab === target);
  if (tab) tab.classList.add('active');

  const panel = document.getElementById(`panel-${target}`);
  if (panel) panel.classList.remove('hidden');
}

export function initTabs() {
  const tabs = document.querySelectorAll('#tab-bar .tab');
  const panels = document.querySelectorAll('.panel');

  // Restore the last active tab, falling back to 'albums'.
  // Validate against known tabs so a stale or corrupt localStorage value
  // cannot produce a blank screen.
  const validTabs = new Set([...tabs].map((t) => t.dataset.tab).filter(Boolean));
  const saved = localStorage.getItem(STORAGE_KEY) ?? 'albums';
  activateTab(tabs, panels, validTabs.has(saved) ? saved : 'albums');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      if (!target) return;

      activateTab(tabs, panels, target);
      localStorage.setItem(STORAGE_KEY, target);
    });
  });
}
