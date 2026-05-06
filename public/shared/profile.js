// Shared player profile — persisted in localStorage across all games.
(function () {
  const KEY = 'gamehub.profile.v1';

  function uuid() {
    if (window.crypto?.randomUUID) return crypto.randomUUID();
    return 'p-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const p = JSON.parse(raw);
      if (!p.id || typeof p.id !== 'string')        p.id = uuid();
      if (typeof p.name !== 'string')               p.name = '';
      if (typeof p.chips !== 'number' || isNaN(p.chips)) p.chips = 1000;
      return p;
    } catch { return null; }
  }

  function save(p) {
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {}
  }

  function get() {
    let p = load();
    if (!p) {
      p = { id: uuid(), name: '', chips: 1000 };
      save(p);
    }
    return p;
  }

  function update(patch) {
    const p = get();
    Object.assign(p, patch);
    save(p);
    return p;
  }

  function setChips(n) { return update({ chips: Math.max(0, Math.floor(n)) }); }
  function addChips(delta) { const p = get(); return setChips(p.chips + delta); }
  function reset() { localStorage.removeItem(KEY); return get(); }

  window.Profile = { get, update, setChips, addChips, reset };
})();
