(() => {
  const overlay = document.getElementById("winner-overlay");
  const portrait = document.getElementById("winner-portrait");
  const canvas = document.getElementById("confetti");
  const context = canvas.getContext("2d");
  let signature = null, rotation = null, frame = null;

  function stop() {
    clearInterval(rotation);
    rotation = null;
    cancelAnimationFrame(frame);
    frame = null;
    context.clearRect(0, 0, canvas.width, canvas.height);
    [...overlay.getAnimations(), ...overlay.querySelector(".winner-content").getAnimations({ subtree: true })]
      .forEach((animation) => animation.cancel());
  }

  function confetti() {
    const colors = ["#ffdc78", "#fff1be", "#ffffff", "#60d7ed", "#dba549"];
    const particles = Array.from({ length: 330 }, (_, index) => {
      const burst = index < 200;
      const left = index % 2 === 0;
      return {
        x: burst ? (left ? 30 : 1570) : Math.random() * 1600,
        y: burst ? 900 : -30 - Math.random() * 500,
        vx: burst ? (left ? 1 : -1) * (180 + Math.random() * 680) : (Math.random() - 0.5) * 100,
        vy: burst ? -650 - Math.random() * 580 : 50 + Math.random() * 100,
        angle: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 12,
        size: 6 + Math.random() * 8,
        color: colors[index % colors.length],
        delay: burst ? Math.random() * 0.4 : 0.7 + Math.random() * 3.5,
      };
    });
    const started = performance.now();
    let previous = started;
    function draw(now) {
      const elapsed = (now - started) / 1000;
      const dt = Math.min((now - previous) / 1000, 0.04);
      previous = now;
      context.clearRect(0, 0, 1600, 900);
      context.globalAlpha = Math.min(1, Math.max(0, 11 - elapsed));
      for (const p of particles) {
        if (elapsed < p.delay || p.y > 940) continue;
        p.vy += 270 * dt;
        p.vx *= Math.exp(-0.18 * dt);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.angle += p.spin * dt;
        context.save();
        context.translate(p.x, p.y);
        context.rotate(p.angle);
        context.fillStyle = p.color;
        context.fillRect(-p.size / 2, -p.size / 4, p.size, Math.cos(elapsed * 5 + p.angle) * p.size * 0.6);
        context.restore();
      }
      context.globalAlpha = 1;
      if (elapsed < 11) frame = requestAnimationFrame(draw);
      else {
        context.clearRect(0, 0, 1600, 900);
        frame = null;
      }
    }
    frame = requestAnimationFrame(draw);
  }

  function show(group, index, count, motion) {
    portrait.replaceChildren();
    if (group.imageUrl) {
      const image = document.createElement("img");
      image.src = group.imageUrl;
      image.alt = "";
      portrait.append(image);
    } else {
      portrait.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><path d="M8 3h8v7a4 4 0 0 1-8 0ZM8 5H4v3a4 4 0 0 0 4 4M16 5h4v3a4 4 0 0 1-4 4M12 14v7M8 21h8"/></svg>';
    }
    document.getElementById("winner-label").textContent = count > 1 ? "Delt førsteplass" : "Vinner";
    const name = document.getElementById("winner-name");
    name.textContent = group.name;
    name.style.fontSize = group.name.length > 60 ? "40px" : group.name.length > 35 ? "50px" : "68px";
    document.getElementById("winner-points").textContent = group.points;
    const counter = document.getElementById("winner-counter");
    counter.hidden = count === 1;
    counter.textContent = `${index + 1} av ${count}`;
    overlay.dataset.winnerId = group.id;
    if (motion) {
      for (const animation of overlay.querySelector(".winner-content").getAnimations({ subtree: true }))
        animation.cancel();
      portrait.animate([
        { opacity: 0, transform: "translateY(35px) scale(.72) rotate(-5deg)" },
        { opacity: 1, transform: "translateY(0) scale(1.04) rotate(1deg)", offset: 0.72 },
        { opacity: 1, transform: "translateY(0) scale(1) rotate(0)" },
      ], { duration: 1100, easing: "cubic-bezier(.22,1,.36,1)" });
      for (const [index, element] of [...overlay.querySelectorAll(".winner-label,.winner-name,.winner-score,.winner-counter")].entries())
        element.animate([
          { opacity: 0, transform: "translateY(20px)" },
          { opacity: 1, transform: "translateY(0)" },
        ], { duration: 800, delay: index * 130, fill: "backwards", easing: "ease-out" });
    }
  }

  window.winnerFinale = {
    render(doc, active, motion) {
      const eligible = doc.groups.filter((group) => group.name.trim());
      const highest = Math.max(...eligible.map((group) => group.points));
      const winners = eligible.filter((group) => group.points === highest);
      active = active && winners.length > 0;
      document.getElementById("stage").classList.toggle("winner-active", active);
      overlay.hidden = !active;
      const next = active ? JSON.stringify([doc.id, motion, winners.map(({ id, name, points, image }) => [id, name, points, image])]) : null;
      if (next === signature) return;
      signature = next;
      stop();
      if (!active) return;
      let index = 0;
      show(winners[0], index, winners.length, motion);
      if (motion) {
        overlay.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 450, easing: "ease-out" });
        confetti();
      }
      if (winners.length > 1)
        rotation = setInterval(() => {
          index = (index + 1) % winners.length;
          show(winners[index], index, winners.length, motion);
        }, 6000);
    },
  };
  addEventListener("pagehide", stop);
})();
