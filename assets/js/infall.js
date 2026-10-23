/* Populate once: CSS carries the stars, including inside animated clones. */
(() => {
  const count = 36;
  const radii = [1, 0.74, 0.5, 0.27, 0.1];
  const turns = [0, 0.45, 1.05, 1.85, 2.85];

  function populate() {
    document.querySelectorAll(".black-hole__scene").forEach((scene) => {
      if (scene.querySelector(".black-hole__particles")) return;
      const field = document.createElement("div");
      field.className = "black-hole__particles";
      field.setAttribute("aria-hidden", "true");

      for (let index = 0; index < count; index++) {
        const particle = document.createElement("span");
        particle.className = "black-hole__particle";
        const star = document.createElement("i");
        particle.appendChild(star);

        // The golden angle spreads trajectories around the full silhouette.
        const angle = index * 2.3999632297;
        const radius = 47 + ((index * 17) % 15);
        const duration = 7.4 + ((index * 17) % 65) / 10;
        const curl = 0.85 + ((index * 7) % 8) / 20;
        const points = radii.map((factor, step) => {
          return {
            radius: radius * factor,
            angle: angle + turns[step] * curl,
          };
        });

        points.forEach((point, step) => {
          const next = points[Math.min(step + 1, points.length - 1)];
          const previous = points[Math.max(step - 1, 0)];
          const direction = Math.atan2(
            point.radius * (next.angle - previous.angle),
            next.radius - previous.radius,
          );
          particle.style.setProperty(`--infall-r${step}`, `${point.radius.toFixed(3)}cqw`);
          particle.style.setProperty(`--infall-orbit${step}`, `${point.angle.toFixed(4)}rad`);
          particle.style.setProperty(`--infall-a${step}`, `${direction.toFixed(4)}rad`);
        });

        particle.style.setProperty("--infall-duration", `${duration.toFixed(1)}s`);
        particle.style.setProperty("--infall-delay", `${(-duration * ((index * 0.6180339887) % 1)).toFixed(3)}s`);
        particle.style.setProperty("--infall-size", `${(0.9 + ((index * 11) % 13) / 10).toFixed(2)}px`);
        particle.style.setProperty("--infall-tail", `${7 + ((index * 7) % 16)}px`);
        field.appendChild(particle);
      }

      scene.insertBefore(field, scene.querySelector(".black-hole__disk"));
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", populate, { once: true });
  } else {
    populate();
  }
})();
