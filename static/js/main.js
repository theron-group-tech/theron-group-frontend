// Theron Group - Main JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Header hide/show on scroll
    let lastScrollTop = 0;
    const header = document.querySelector('.main-header');
    
    window.addEventListener('scroll', function() {
        let scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        
        if (scrollTop > lastScrollTop && scrollTop > 100) {
            // Scrolling down
            header.classList.add('hidden');
        } else {
            // Scrolling up
            header.classList.remove('hidden');
        }
        lastScrollTop = scrollTop;
    });
    
    // Mobile Navigation
    const mobileToggle = document.querySelector('.mobile-toggle');
    const navMenu = document.querySelector('.nav-menu');
    
    if (mobileToggle) {
        mobileToggle.addEventListener('click', function() {
            navMenu.classList.toggle('active');
            
            const spans = this.querySelectorAll('span');
            if (navMenu.classList.contains('active')) {
                spans[0].style.transform = 'rotate(45deg) translate(8px, 8px)';
                spans[1].style.opacity = '0';
                spans[2].style.transform = 'rotate(-45deg) translate(8px, -8px)';
            } else {
                spans[0].style.transform = 'none';
                spans[1].style.opacity = '1';
                spans[2].style.transform = 'none';
            }
        });
    }
    
    // Close mobile menu when clicking a link
    const navLinks = document.querySelectorAll('.nav-menu a');
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            navMenu.classList.remove('active');
            if (mobileToggle) {
                const spans = mobileToggle.querySelectorAll('span');
                spans[0].style.transform = 'none';
                spans[1].style.opacity = '1';
                spans[2].style.transform = 'none';
            }
        });
    });
    
    // Back to Top Button
    const backToTop = document.querySelector('.back-to-top');
    
    if (backToTop) {
        window.addEventListener('scroll', () => {
            if (window.pageYOffset > 300) {
                backToTop.classList.add('visible');
            } else {
                backToTop.classList.remove('visible');
            }
        });
        
        backToTop.addEventListener('click', () => {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }
    
    // Smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                const headerHeight = document.querySelector('.main-header')?.offsetHeight || 80;
                const targetPosition = targetElement.offsetTop - headerHeight;
                
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
    
    // Contact form submission to WhatsApp
    const contactForms = document.querySelectorAll('.contact-form');
    contactForms.forEach(form => {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Get form data
            const formData = new FormData(this);
            const companyPage = document.querySelector('meta[name="company"]')?.content || 'Theron Group';
            
            // Build message
            let message = `*Contato via Site - ${companyPage}*\n\n`;
            
            for (let [key, value] of formData.entries()) {
                if (value && value.trim() !== '') {
                    const fieldName = key.charAt(0).toUpperCase() + key.slice(1);
                    message += `*${fieldName}:* ${value}\n`;
                }
            }
            
            message += `\n---\n`;
            message += `Mensagem enviada através do site do ${companyPage}`;
            
            // Encode message for URL
            const encodedMessage = encodeURIComponent(message);
            
            // Get WhatsApp number based on company
            let whatsappNumber = '';
            if (companyPage === 'Theron Group') {
                whatsappNumber = '5511999999999'; // Número geral do grupo
            } else if (companyPage === 'Theron Capital') {
                whatsappNumber = '5511975947115';
            } else if (companyPage === 'TheronSeg') {
                whatsappNumber = '5511963892705';
            } else if (companyPage === 'Theron Tour') {
                whatsappNumber = '5511944958172';
            }
            
            // Open WhatsApp
            window.open(`https://wa.me/${whatsappNumber}?text=${encodedMessage}`, '_blank');
            
            // Reset form
            this.reset();
        });
    });
    
    // Update copyright year
    const copyrightElements = document.querySelectorAll('.copyright');
    const currentYear = new Date().getFullYear();
    
    copyrightElements.forEach(element => {
        if (element.innerHTML.includes('2025')) {
            element.innerHTML = element.innerHTML.replace('2025', currentYear);
        }
    });
    
    // Animate elements on scroll (STAGGERED)
    const animateOnScroll = function() {
        const elements = document.querySelectorAll('.company-card, .service-card, .plan-card, .package-card');
        
        elements.forEach((element, index) => {
            const elementPosition = element.getBoundingClientRect().top;
            const screenPosition = window.innerHeight / 1.2;
            
            if (elementPosition < screenPosition && !element.classList.contains('animated')) {
                // Staggered delay based on position within visible group
                const parent = element.parentElement;
                const siblings = Array.from(parent.children).filter(el => 
                    el.classList.contains('company-card') || 
                    el.classList.contains('service-card') || 
                    el.classList.contains('plan-card') || 
                    el.classList.contains('package-card')
                );
                const siblingIndex = siblings.indexOf(element);
                const delay = siblingIndex * 0.15;
                
                element.style.transitionDelay = delay + 's';
                element.style.opacity = '1';
                element.style.transform = 'translateY(0)';
                element.classList.add('animated');
            }
        });
    };
    
    // Initialize animation states
    const elementsToAnimate = document.querySelectorAll('.company-card, .service-card, .plan-card, .package-card');
    elementsToAnimate.forEach(element => {
        element.style.opacity = '0';
        element.style.transform = 'translateY(30px)';
        element.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    });
    
    window.addEventListener('scroll', animateOnScroll);
    animateOnScroll();

    // ===== ANIMATED COUNTER FOR STATS =====
    const animateCounters = function() {
        const statNumbers = document.querySelectorAll('.stat-number');
        
        statNumbers.forEach(stat => {
            if (stat.classList.contains('counted')) return;
            
            const rect = stat.getBoundingClientRect();
            if (rect.top < window.innerHeight && rect.bottom > 0) {
                stat.classList.add('counted');
                
                const text = stat.textContent.trim();
                // Extract number and suffix (e.g., "39+" -> 39, "+")
                const match = text.match(/^(\d+)(.*)$/);
                if (match) {
                    const target = parseInt(match[1]);
                    const suffix = match[2] || '';
                    const duration = 2000;
                    const startTime = performance.now();
                    
                    const updateCounter = (currentTime) => {
                        const elapsed = currentTime - startTime;
                        const progress = Math.min(elapsed / duration, 1);
                        
                        // Ease out cubic
                        const eased = 1 - Math.pow(1 - progress, 3);
                        const current = Math.floor(eased * target);
                        
                        stat.textContent = current + suffix;
                        
                        if (progress < 1) {
                            requestAnimationFrame(updateCounter);
                        } else {
                            stat.textContent = target + suffix;
                        }
                    };
                    
                    requestAnimationFrame(updateCounter);
                }
            }
        });
    };
    
    window.addEventListener('scroll', animateCounters);
    animateCounters();

    // ===== PARALLAX EFFECT ON HERO =====
    const heroSection = document.querySelector('.hero-section');
    if (heroSection) {
        window.addEventListener('scroll', function() {
            const scrolled = window.pageYOffset;
            const heroHeight = heroSection.offsetHeight;
            
            if (scrolled < heroHeight) {
                const heroBg = heroSection.querySelector('::before') || heroSection;
                heroSection.style.setProperty('--parallax-offset', (scrolled * 0.4) + 'px');
            }
        });
        
        // Apply parallax via CSS custom property
        const style = document.createElement('style');
        style.textContent = `
            .hero-section::before {
                transform: translateY(var(--parallax-offset, 0));
            }
        `;
        document.head.appendChild(style);
    }

    // ===== BUTTON RIPPLE EFFECT =====
    const rippleButtons = document.querySelectorAll('.btn, .btn-card, .btn-service, .btn-plan, .btn-package');
    rippleButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            const ripple = document.createElement('span');
            ripple.classList.add('ripple');
            
            const rect = this.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            
            ripple.style.width = ripple.style.height = size + 'px';
            ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
            ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
            
            this.appendChild(ripple);
            
            ripple.addEventListener('animationend', function() {
                ripple.remove();
            });
        });
    });
});