import { useEffect } from "react";

export default function useLandingEffects({ setNavStuck }) {
  useEffect(() => {
    let navIsStuck = window.scrollY > 50;
    let scrollFrame = 0;
    setNavStuck(navIsStuck);

    // Generous rootMargin so elements animate in smoothly BEFORE user reaches them
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.01, rootMargin: "250px 0px 250px 0px" },
    );

    const observeNewReveals = () => {
      document.querySelectorAll(".reveal:not(.observed)").forEach((element) => {
        element.classList.add("observed");
        // If element is already anywhere in or near the viewport, reveal immediately
        const rect = element.getBoundingClientRect();
        if (rect.top < window.innerHeight + 250 && rect.bottom > -100) {
          element.classList.add("visible");
        } else {
          revealObserver.observe(element);
        }
      });
    };

    observeNewReveals();

    const mutationObserver = new MutationObserver(observeNewReveals);
    mutationObserver.observe(document.body, { childList: true, subtree: true });

    // Fallback: Reveal all elements after 1s so nothing ever remains invisible/black
    const fallbackTimer = setTimeout(() => {
      document.querySelectorAll(".reveal:not(.visible)").forEach((element) => {
        element.classList.add("visible");
      });
    }, 1000);

    const onScroll = () => {
      if (scrollFrame) return;

      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = 0;
        const nextStuck = window.scrollY > 50;

        if (nextStuck !== navIsStuck) {
          navIsStuck = nextStuck;
          setNavStuck(nextStuck);
        }
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(scrollFrame);
      clearTimeout(fallbackTimer);
      revealObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [setNavStuck]);
}
