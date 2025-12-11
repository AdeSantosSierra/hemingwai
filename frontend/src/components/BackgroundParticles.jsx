import React, { useEffect, useRef } from 'react';

const BackgroundParticles = () => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let animationFrameId;
    let particles = [];
    
    // Configuración
    const GRID_SIZE = 60; // Debe coincidir con el background-size del CSS
    const PARTICLE_COUNT = 4; // Cantidad de partículas
    const PARTICLE_COLOR = '#d2d209'; // Lima
    const SPEED = 0.5; // Velocidad de movimiento
    const TRAIL_LENGTH = 300; // Longitud de la estela

    // Ajustar tamaño del canvas
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // Clase Partícula
    class Particle {
      constructor() {
        this.reset();
        // Iniciar en una posición aleatoria ya avanzada para no verlas nacer todas juntas
        this.trail = [];
      }

      reset() {
        // Alinear a la rejilla
        const cols = Math.ceil(canvas.width / GRID_SIZE);
        const rows = Math.ceil(canvas.height / GRID_SIZE);

        this.x = Math.floor(Math.random() * cols) * GRID_SIZE;
        this.y = Math.floor(Math.random() * rows) * GRID_SIZE;

        // Decidir dirección (Horizontal o Vertical)
        if (Math.random() > 0.5) {
          this.vx = Math.random() > 0.5 ? SPEED : -SPEED;
          this.vy = 0;
        } else {
          this.vx = 0;
          this.vy = Math.random() > 0.5 ? SPEED : -SPEED;
        }

        this.trail = [];
        this.life = 1.0;
      }

      update() {
        // Guardar posición actual para la estela
        this.trail.push({ x: this.x, y: this.y });
        if (this.trail.length > TRAIL_LENGTH) {
          this.trail.shift();
        }

        // Mover
        this.x += this.vx;
        this.y += this.vy;

        // Reset si sale de la pantalla
        if (
          this.x < -GRID_SIZE ||
          this.x > canvas.width + GRID_SIZE ||
          this.y < -GRID_SIZE ||
          this.y > canvas.height + GRID_SIZE
        ) {
          this.reset();
        }

        // Opcional: Cambio de dirección aleatorio en intersecciones
        // Verificar si estamos exactamente en una intersección
        if (this.x % GRID_SIZE === 0 && this.y % GRID_SIZE === 0) {
           if (Math.random() < 0.2) { // 20% de probabilidad de girar
             if (this.vx !== 0) {
               // Venía horizontal, cambiar a vertical
               this.vx = 0;
               this.vy = Math.random() > 0.5 ? SPEED : -SPEED;
             } else {
               // Venía vertical, cambiar a horizontal
               this.vy = 0;
               this.vx = Math.random() > 0.5 ? SPEED : -SPEED;
             }
           }
        }
      }

      draw(ctx) {
        if (this.trail.length < 2) return;

        ctx.beginPath();
        // Dibujar la estela
        for (let i = 0; i < this.trail.length - 1; i++) {
          const point = this.trail[i];
          const nextPoint = this.trail[i + 1];
          
          // Opacidad basada en qué tan antiguo es el punto en la estela
          const alpha = (i / this.trail.length) * 0.6; // Max opacidad 0.6
          
          ctx.beginPath();
          ctx.moveTo(point.x, point.y);
          ctx.lineTo(nextPoint.x, nextPoint.y);
          ctx.strokeStyle = `rgba(210, 210, 9, ${alpha})`; // #d2d209 en RGB
          ctx.lineWidth = 2;
          ctx.lineCap = 'round';
          ctx.stroke();
        }

        // Dibujar la cabeza (punto brillante)
        ctx.fillStyle = PARTICLE_COLOR;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Inicializar partículas
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push(new Particle());
    }

    // Loop de animación
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach((p) => {
        p.update();
        p.draw(ctx);
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-[1]"
      style={{ width: '100%', height: '100%' }}
    />
  );
};

export default BackgroundParticles;
