"use client";

import { useState } from "react";
import { Carousel } from "@empac/cascadeds";

/**
 * CDS `Carousel` that auto-advances on a visible timer until the first
 * user interaction, then stops for good.
 *
 * CDS's own autoplay only pauses on hover and keeps running after
 * arrow/dot clicks — there's no "stop on interaction" flag — so this
 * wrapper supplies it. The autoplay timer never dispatches pointer/
 * keyboard events, so a captured pointerdown / navigation keydown can
 * only come from the user; on the first one we flip autoplay off.
 *
 * The progress bar is a CSS animation keyed to the current slide index
 * (reset on each `onSlideChange`) so it visibly counts down to the next
 * advance, pauses on hover (matching CDS), and disappears once stopped.
 */

type CarouselProps = React.ComponentProps<typeof Carousel>;

type AutoplayCarouselProps = Omit<
  CarouselProps,
  "autoplay" | "autoplayInterval" | "pauseOnHover" | "onSlideChange"
> & {
  /** Auto-advance interval in ms (default 5000). */
  interval?: number;
};

const NAV_KEYS = new Set(["ArrowLeft", "ArrowRight", "Home", "End", "Enter", " "]);

export function AutoplayCarousel({
  interval = 5000,
  children,
  ...carouselProps
}: AutoplayCarouselProps) {
  const [interacted, setInteracted] = useState(false);
  const [slide, setSlide] = useState(0);

  const stop = () => {
    if (!interacted) setInteracted(true);
  };

  return (
    <div
      className={`autoplay-carousel${!interacted ? " autoplay-carousel--playing" : ""}`}
      onPointerDownCapture={stop}
      onKeyDownCapture={(e) => {
        if (NAV_KEYS.has(e.key)) stop();
      }}
    >
      {/* Progress bar sits ABOVE the cards so it never overlaps or shifts
          the bottom pagination row. */}
      {!interacted ? (
        <div className="autoplay-carousel__timer" aria-hidden="true">
          <div
            key={slide}
            className="autoplay-carousel__timer-fill"
            style={{ animationDuration: `${interval}ms` }}
          />
        </div>
      ) : null}
      <Carousel
        {...carouselProps}
        autoplay={!interacted}
        autoplayInterval={interval}
        pauseOnHover
        onSlideChange={setSlide}
      >
        {children}
      </Carousel>
    </div>
  );
}
