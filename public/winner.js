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
      .filter((animation) => !(animation instanceof CSSAnimation))
      .forEach((animation) => animation.cancel());
  }

  function confetti() {
    // Match the canvas to the stage, which is wider or taller than 1600 × 900 on other screen formats.
    canvas.width = canvas.offsetWidth || 1600;
    canvas.height = canvas.offsetHeight || 900;
    const width = canvas.width, height = canvas.height;
    const colors = ["#ffdc78", "#fff1be", "#ffffff", "#60d7ed", "#dba549"];
    const particles = Array.from({ length: 330 }, (_, index) => {
      const burst = index < 200;
      const left = index % 2 === 0;
      return {
        x: burst ? (left ? 30 : width - 30) : Math.random() * width,
        y: burst ? height : -30 - Math.random() * 500,
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
      context.clearRect(0, 0, width, height);
      context.globalAlpha = Math.min(1, Math.max(0, 11 - elapsed));
      for (const p of particles) {
        if (elapsed < p.delay || p.y > height + 40) continue;
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
        context.clearRect(0, 0, width, height);
        frame = null;
      }
    }
    frame = requestAnimationFrame(draw);
  }

  function fillPortrait(element, group, motion) {
    element.replaceChildren();
    const imageUrl = (!motion && group.imageStillUrl) || group.imageUrl;
    if (imageUrl) {
      const image = document.createElement("img");
      image.src = imageUrl;
      image.alt = "";
      element.append(image);
    } else {
      element.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><path d="M8 3h8v7a4 4 0 0 1-8 0ZM8 5H4v3a4 4 0 0 0 4 4M16 5h4v3a4 4 0 0 1-4 4M12 14v7M8 21h8"/></svg>';
    }
  }

  function show(group, index, count, motion) {
    fillPortrait(portrait, group, motion);
    document.getElementById("winner-label").textContent = count > 1 ? "Delt førsteplass" : "Vinner";
    const name = document.getElementById("winner-name");
    name.textContent = group.name;
    name.style.fontSize = group.name.length > 65 ? "32px" : group.name.length > 40 ? "38px" : group.name.length > 22 ? "48px" : "68px";
    document.getElementById("winner-points").textContent = formatScore(group.points);
    const counter = document.getElementById("winner-counter");
    counter.hidden = count === 1;
    counter.textContent = `${index + 1} av ${count}`;
    overlay.dataset.winnerId = group.id;
    if (motion) {
      for (const animation of document.getElementById("winner-main").getAnimations({ subtree: true }))
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

  function showSide(element, groups, index, motion) {
    element.hidden = groups.length === 0;
    if (!groups.length) {
      delete element.dataset.groupId;
      return;
    }
    const group = groups[index];
    element.dataset.groupId = group.id;
    fillPortrait(element.querySelector(".podium-portrait"), group, motion);
    element.querySelector(".podium-label").textContent =
      `${groups.length > 1 ? "Delt " : ""}${element.dataset.place}. plass`;
    const name = element.querySelector(".podium-name");
    name.textContent = group.name;
    name.style.fontSize = group.name.length > 50 ? "26px" : group.name.length > 25 ? "32px" : "40px";
    element.querySelector(".podium-points").textContent = formatScore(group.points);
    const counter = element.querySelector(".podium-counter");
    counter.hidden = groups.length < 2;
    counter.textContent = `${index + 1} av ${groups.length}`;
    if (motion)
      element.animate([
        { opacity: 0, transform: "translateY(30px)" },
        { opacity: 1, transform: "translateY(0)" },
      ], { duration: 900, delay: 450, fill: "backwards", easing: "cubic-bezier(.22,1,.36,1)" });
  }

  window.winnerFinale = {
    render(doc, active, motion) {
      const eligible = doc.groups.filter((group) => group.name.trim()).sort((a, b) => b.points - a.points);
      const places = [[], [], []];
      let rank = 1;
      eligible.forEach((group, index) => {
        // Shared places consume their positions: two winners are followed by third place.
        if (index && group.points !== eligible[index - 1].points) rank = index + 1;
        if (rank <= 3) places[rank - 1].push(group);
      });
      const [winners, second, third] = places;
      active = active && winners.length > 0;
      document.getElementById("stage").classList.toggle("winner-active", active);
      overlay.hidden = !active;
      const next = active ? JSON.stringify([doc.id, motion, places.map((groups) => groups.map(({ id, name, points, image, imageStill }) => [id, name, points, image, imageStill]))]) : null;
      if (next === signature) return;
      signature = next;
      stop();
      if (!active) return;
      let index = 0;
      show(winners[0], index, winners.length, motion);
      const silver = document.getElementById("podium-second");
      const bronze = document.getElementById("podium-third");
      showSide(silver, second, 0, motion);
      showSide(bronze, third, 0, motion);
      if (motion) {
        overlay.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 450, easing: "ease-out" });
        confetti();
      }
      if (places.some((groups) => groups.length > 1))
        rotation = setInterval(() => {
          index++;
          if (winners.length > 1)
            show(winners[index % winners.length], index % winners.length, winners.length, motion);
          if (second.length > 1) showSide(silver, second, index % second.length, motion);
          if (third.length > 1) showSide(bronze, third, index % third.length, motion);
        }, 6000);
    },
  };
  addEventListener("pagehide", stop);
})();
