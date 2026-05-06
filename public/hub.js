// Hub landing logic — show profile, allow name editing, route to games.
(function () {
  const $ = id => document.getElementById(id);

  const nameEl    = $('profile-name');
  const chipsEl   = $('profile-chips');
  const avatarEl  = $('profile-avatar');
  const editBtn   = $('profile-edit');
  const dialog    = $('name-dialog');
  const dialogIn  = $('name-dialog-input');
  const saveBtn   = $('name-dialog-save');
  const cancelBtn = $('name-dialog-cancel');

  function render() {
    const p = Profile.get();
    if (p.name) {
      nameEl.textContent   = p.name;
      avatarEl.textContent = (p.name[0] || '?').toUpperCase();
      editBtn.title        = 'Change name';
    } else {
      nameEl.textContent   = 'Set name';
      avatarEl.textContent = '?';
    }
    chipsEl.textContent = p.chips.toLocaleString();
  }

  function openDialog() {
    dialogIn.value = Profile.get().name || '';
    dialog.classList.remove('hidden');
    setTimeout(() => dialogIn.focus(), 50);
  }

  function closeDialog() { dialog.classList.add('hidden'); }

  function saveName() {
    const name = dialogIn.value.trim().slice(0, 20);
    if (!name) return;
    Profile.update({ name });
    closeDialog();
    render();
  }

  // Block disabled cards from navigating + nudge name first
  document.querySelectorAll('.game-card').forEach(card => {
    card.addEventListener('click', e => {
      if (card.classList.contains('disabled')) {
        e.preventDefault();
        return;
      }
      // Soft warn if no name set; let them go either way
      const p = Profile.get();
      if (!p.name) {
        e.preventDefault();
        openDialog();
      }
    });
  });

  editBtn.addEventListener('click', openDialog);
  // Tap whole chip if name not set yet
  $('profile-chip').addEventListener('click', e => {
    if (e.target === editBtn || e.target.closest('button')) return;
    if (!Profile.get().name) openDialog();
  });

  saveBtn.addEventListener('click', saveName);
  cancelBtn.addEventListener('click', closeDialog);
  dialogIn.addEventListener('keydown', e => {
    if (e.key === 'Enter') saveName();
    if (e.key === 'Escape') closeDialog();
  });
  dialog.addEventListener('click', e => { if (e.target === dialog) closeDialog(); });

  render();

  // First-time visitor → prompt for a name
  if (!Profile.get().name) openDialog();
})();
