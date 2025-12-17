// Enkel men visuelt imponerende fyrverkeri-animasjon
class SimpleFireworks {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        
        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.rockets = [];
        this.running = false;
        this.autoLaunchInterval = null;
        
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }
    
    resize() {
        if (!this.canvas) return;
        this.canvas.width = this.canvas.offsetWidth;
        this.canvas.height = this.canvas.offsetHeight;
        this.width = this.canvas.width;
        this.height = this.canvas.height;
    }
    
    start() {
        if (this.running) return;
        this.running = true;
        this.animate();
        
        // Auto-launch fyrverkeri hvert 800ms
        this.autoLaunchInterval = setInterval(() => {
            if (this.running) {
                this.launchRocket();
            }
        }, 650);
    }
    
    stop() {
        this.running = false;
        if (this.autoLaunchInterval) {
            clearInterval(this.autoLaunchInterval);
            this.autoLaunchInterval = null;
        }
    }
    
    launchRocket() {
        const x = Math.random() * this.width;
        const targetY = Math.random() * this.height * 0.4 + this.height * 0.1;
        const color = this.randomColor();
        
        this.rockets.push({
            x: x,
            y: this.height,
            targetY: targetY,
            speedY: -8 - Math.random() * 4,
            color: color,
            trail: []
        });
    }
    
    randomColor() {
        const colors = [
            '#ff0043', // Red
            '#14fc56', // Green
            '#1e7fff', // Blue
            '#e60aff', // Purple
            '#ffbf36', // Gold
            '#ffffff'  // White
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }
    
    explode(x, y, color) {
        const particleCount = 60 + Math.random() * 40;
        
        for (let i = 0; i < particleCount; i++) {
            const angle = (Math.PI * 2 * i) / particleCount;
            const speed = 2 + Math.random() * 4;
            
            this.particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1,
                decay: 0.01 + Math.random() * 0.01,
                color: color,
                size: 2 + Math.random() * 2
            });
        }
        
        // Add some sparkles
        for (let i = 0; i < 20; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1 + Math.random() * 2;
            
            this.particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1,
                decay: 0.02 + Math.random() * 0.02,
                color: '#ffffff',
                size: 1 + Math.random()
            });
        }
    }
    
    animate() {
        if (!this.running) return;
        
        // Semi-transparent black for trail effect
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        // Update and draw rockets
        for (let i = this.rockets.length - 1; i >= 0; i--) {
            const rocket = this.rockets[i];
            
            rocket.y += rocket.speedY;
            rocket.speedY += 0.1; // gravity
            
            // Draw rocket trail
            this.ctx.beginPath();
            this.ctx.strokeStyle = rocket.color;
            this.ctx.lineWidth = 2;
            this.ctx.moveTo(rocket.x, rocket.y);
            this.ctx.lineTo(rocket.x, rocket.y - 10);
            this.ctx.stroke();
            
            // Check if reached target height
            if (rocket.y <= rocket.targetY || rocket.speedY > 0) {
                this.explode(rocket.x, rocket.y, rocket.color);
                this.rockets.splice(i, 1);
            }
        }
        
        // Update and draw particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.05; // gravity
            p.vx *= 0.99; // air resistance
            p.vy *= 0.99;
            p.life -= p.decay;
            
            if (p.life <= 0) {
                this.particles.splice(i, 1);
                continue;
            }
            
            this.ctx.beginPath();
            this.ctx.fillStyle = p.color;
            this.ctx.globalAlpha = p.life;
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fill();
        }
        
        this.ctx.globalAlpha = 1;
        
        requestAnimationFrame(() => this.animate());
    }
}

// Global instance
window.SimpleFireworks = SimpleFireworks;
