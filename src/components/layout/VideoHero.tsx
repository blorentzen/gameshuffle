"use client";

import React from "react";

interface VideoHeroProps {
  videoSrc?: string;
  videoWebm?: string;
  videoPoster?: string;
  backgroundImage?: string;
  overlayOpacity?: number;
  height?: "full" | "large" | "medium" | "short";
  /** Blend the bottom edge into the page: a soft spotlight glow, a fade, and a
   *  bezier curve masked in the page background so the hero flows into content
   *  instead of ending on a hard line. */
  blend?: boolean;
  children: React.ReactNode;
}

export function VideoHero({
  videoSrc,
  videoWebm,
  videoPoster,
  backgroundImage,
  overlayOpacity = 0.5,
  height = "large",
  blend = false,
  children,
}: VideoHeroProps) {
  const heightMap = {
    full: "100vh",
    large: "50vh",
    medium: "35vh",
    short: "10vh",
  };

  return (
    <header
      className={`video-hero${blend ? " video-hero--blend" : ""}`}
      data-height={height}
      style={{
        position: "relative",
        overflow: "hidden",
        minHeight: heightMap[height],
        display: "flex",
        alignItems: "center",
        color: "var(--text-on-primary)",
        ...(backgroundImage && {
          backgroundImage: `url(${backgroundImage})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }),
      }}
    >
      {videoSrc && (
        <video
          autoPlay
          muted
          loop
          playsInline
          poster={videoPoster}
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: "120%",
            height: "120%",
            objectFit: "cover",
            transform: "translate(-50%, -50%)",
            zIndex: 1,
          }}
        >
          {videoWebm && <source src={videoWebm} type="video/webm" />}
          <source src={videoSrc} type="video/mp4" />
        </video>
      )}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: `rgba(0, 0, 0, ${overlayOpacity})`,
          zIndex: 2,
        }}
      />
      {blend && <div className="video-hero__spotlight" aria-hidden />}
      <div
        className="video-hero__content"
        style={{
          position: "relative",
          zIndex: 10,
          width: "100%",
          padding: height === "short" ? "1.5rem" : "3rem",
        }}
      >
        {children}
      </div>
      {blend && (
        <svg
          className="video-hero__curve"
          viewBox="0 0 1440 120"
          preserveAspectRatio="none"
          aria-hidden
        >
          {/* Asymmetric bezier — a fatter video section on the left sweeping up
              into a thinner one on the right, so the curve reads off-center. */}
          <path d="M0,120 L0,80 C 460,120 980,34 1440,56 L1440,120 Z" />
        </svg>
      )}
    </header>
  );
}
