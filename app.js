const navButtons = document.querySelectorAll('.nav-links button');
const sections = document.querySelectorAll('.section');
const hint = document.getElementById('hint');

const showSection = (id) => {
  sections.forEach((s) => {
    if (s.id === id) {
      s.classList.remove('exit');
      s.classList.add('active');
    } else if (s.classList.contains('active')) {
      s.classList.remove('active');
      s.classList.add('exit');
      setTimeout(() => s.classList.remove('exit'), 450);
    }
  });
  navButtons.forEach((b) => {
    b.classList.toggle('active', b.dataset.target === id);
  });
};

navButtons.forEach((btn) => {
  btn.addEventListener('click', () => showSection(btn.dataset.target));
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const anyActive = document.querySelector('.section.active');
    if (anyActive) {
      anyActive.classList.remove('active');
      anyActive.classList.add('exit');
      setTimeout(() => anyActive.classList.remove('exit'), 450);
      navButtons.forEach((b) => b.classList.remove('active'));
    } else {
      showSection('about');
    }
  }
});

showSection('about');

if (!localStorage.getItem('hint-dismissed')) {
  setTimeout(() => {
    hint?.classList.add('hidden');
    localStorage.setItem('hint-dismissed', '1');
  }, 6000);
} else {
  hint?.classList.add('hidden');
}
