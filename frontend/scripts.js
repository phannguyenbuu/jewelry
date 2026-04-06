// Simple interactions for the rollpage
document.addEventListener('DOMContentLoaded', () => {
  // Smooth scroll for internal anchors (if any)
  const links = document.querySelectorAll('a[href^="#"]');
  links.forEach(a => {
    a.addEventListener('click', (e) => {
      const target = document.querySelector(a.getAttribute('href'));
      if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth' }); }
    });
  });
});
